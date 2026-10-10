/**
 * dsh-deepseek-usage — host half.
 *
 * Owns two facts the browser cannot obtain on its own:
 *
 * 1. The DeepSeek account balance, read from `GET /user/balance` with the
 *    credential resolved through `ctx.credentials` (the key never reaches the
 *    browser).
 * 2. The exact per-Turn token accounting of every Session, folded from the
 *    durable session log with the same replay the shipped token meter uses and
 *    priced by a configurable CNY rate table, so a Turn's cost and the remaining
 *    balance are the same unit with no conversion in between.
 *
 * Both are served from one same-origin JSON route so the browser half stays a
 * pure presentation plugin with no credential of its own.
 *
 * @module dsh-deepseek-usage
 */

/** Plugin display name; also the cordis loader row id this package expects. */
export const name = 'deepseek-usage'

/**
 * Services this plugin needs. `credentials` is optional by design (the API key
 * may simply live in the environment) and `webServer` is required because the
 * browser half has no other transport.
 */
export const inject = ['webServer']

/** Route prefix owned by this package. */
const ROUTE_PREFIX = '/deepseek-usage'

/**
 * CNY per 1,000,000 tokens, straight from the official Chinese pricing page
 * (<https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>).
 *
 * The Chinese table is the authoritative one for a CNY account, and it is NOT
 * a fixed conversion of the English USD table: 0.02/0.003 = 6.6667 for Flash
 * while 0.15/0.022 = 6.8182 for Pro. Deriving CNY from USD would therefore
 * invent a rate the vendor never published, so no conversion happens anywhere
 * in this plugin — every amount is CNY end to end.
 */
const DEFAULT_MODELS = {
  'deepseek-flash': {
    hit: { peak: 0.04, offPeak: 0.02 },
    miss: { peak: 2, offPeak: 1 },
    output: { peak: 8, offPeak: 4 },
  },
  'deepseek-v4-pro': {
    hit: { peak: 0.3, offPeak: 0.15 },
    miss: { peak: 9, offPeak: 4.5 },
    output: { peak: 27, offPeak: 13.5 },
  },
}

const DEFAULTS = {
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  baseURL: 'https://api.deepseek.com',
  currency: 'CNY',
  balanceTtlMs: 30000,
  models: DEFAULT_MODELS,
  defaultModel: 'deepseek-flash',
  money: { digitsLarge: 2, digitsSmall: 4 },
  /** Upper bound on the amount of Turns returned in one summary. */
  maxTurns: 300,
}

/** How long a computed Session cost table stays valid, in milliseconds. */
const TURN_CACHE_TTL_MS = 5000

const MONEY = { CNY: '¥', USD: '$' }

/** Deep merge one level of the price table, keeping unmentioned models. */
function mergeModels(base, override) {
  const out = {}
  for (const key of new Set([...Object.keys(base), ...Object.keys(override ?? {})])) {
    out[key] = { ...(base[key] ?? {}), ...(override?.[key] ?? {}) }
  }
  return out
}

/** Merge raw loader config over the shipped defaults. */
function resolveConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {}
  return {
    ...DEFAULTS,
    ...config,
    models: mergeModels(DEFAULT_MODELS, config.models),
    money: { ...DEFAULTS.money, ...(config.money ?? {}) },
  }
}

/**
 * Whether an instant falls in DeepSeek's published peak window.
 *
 * The official windows are Beijing time Monday–Friday 09:00–12:00 and
 * 14:00–18:00, excluding Chinese public holidays; everything else, weekends and
 * holidays included, is off-peak at half price. Beijing is UTC+8 with no
 * daylight saving, so the windows are 01:00–04:00 and 06:00–10:00 UTC —
 * comparing UTC hours keeps the decision independent of the host's timezone.
 *
 * @param time - epoch milliseconds of the Turn.
 * @returns whether peak pricing applies.
 */
export function isPeakHour(time) {
  const date = new Date(time)
  const day = date.getUTCDay()
  if (day === 0 || day === 6) return false
  const hour = date.getUTCHours()
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10)
}

/** True for a safe non-negative integer. */
function isCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Normalize one `assistant/message` usage record. */
function normalizeUsage(usage) {
  if (!usage || !isCount(usage.inputTokens) || !isCount(usage.outputTokens)) return undefined
  const cacheRead = isCount(usage.cacheReadTokens) ? usage.cacheReadTokens : 0
  const cacheWrite = isCount(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0
  const reasoning = isCount(usage.reasoningTokens) ? usage.reasoningTokens : 0
  if (usage.cacheReadTokens !== undefined && !isCount(usage.cacheReadTokens)) return undefined
  if (usage.cacheWriteTokens !== undefined && !isCount(usage.cacheWriteTokens)) return undefined
  return {
    cacheMiss: usage.inputTokens,
    cacheHit: cacheRead,
    cacheWrite,
    output: usage.outputTokens,
    reasoning,
  }
}

/**
 * Price one Turn's token buckets, in CNY.
 *
 * `write` is charged at the cache-miss rate: DeepSeek bills a cache write as
 * ordinary input, which is the conservative reading of its published table. The
 * official Chinese table lists exactly three buckets — 缓存命中输入,
 * 缓存未命中输入, 输出 — and nothing else, so no conversion or exchange rate
 * participates in this computation.
 *
 * @param usage - `{ miss, hit, write, output }`, every member a token count.
 * @returns `{ amount, rate, rates }`, or undefined without a usable model row.
 */
function priceUsage(usage, model, time, config, modelId) {
  const row = config.models[model] ?? config.models[config.defaultModel]
  if (!row) return undefined
  const rate = isPeakHour(time) ? 'peak' : 'offPeak'
  const price = (bucket) => {
    const entry = row[bucket]
    if (!entry) return 0
    const value = entry[rate]
    return typeof value === 'number' ? value : 0
  }
  const bucketed = (bucket, count) => (count / 1e6) * price(bucket)
  const amount = bucketed('miss', usage.miss) + bucketed('hit', usage.hit + usage.write) + bucketed('output', usage.output)
  const digits = amount >= 1 ? config.money.digitsLarge : config.money.digitsSmall
  return {
    amount: round(amount, digits + 2),
    rate,
    model: modelId,
    rates: { hit: price('hit'), miss: price('miss'), output: price('output') },
  }
}

/** Round to a fixed number of decimals. */
function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Fold one Session's durable log into a per-Turn cost table.
 *
 * The fold mirrors `deriveTurnTokenUsage` from `@deepseek-ai/dsh-token-meter`:
 * a Turn is priced only when its complete lifecycle is present, so an open or
 * malformed Turn reports no cost rather than a guessed one. It is reimplemented
 * here because the published fold returns a whole-Turn aggregate without the
 * per-attempt route needed to price mixed-model Sessions.
 *
 * @param events - the Session's events in log order.
 * @param config - resolved plugin config.
 * @returns Turns keyed by Turn number, ascending.
 */
export function computeTurnCosts(events, config) {
  const open = new Map()
  const done = new Map()
  let turn = null
  let model = config.defaultModel
  let step = null

  const closeAttempt = (sample) => {
    if (turn === null) return
    const entry = open.get(turn) ?? {
      turn,
      model,
      cacheMiss: 0,
      cacheHit: 0,
      cacheWrite: 0,
      output: 0,
      reasoning: 0,
      steps: 0,
      startTime: null,
    }
    if (sample) {
      entry.cacheMiss += sample.cacheMiss
      entry.cacheHit += sample.cacheHit
      entry.cacheWrite += sample.cacheWrite
      entry.output += sample.output
      entry.reasoning += sample.reasoning
    }
    entry.model = model
    open.set(turn, entry)
  }

  for (const event of events) {
    const data = event.data
    switch (event.type) {
      case 'request/header': {
        const config_ = data?.header?.config
        if (config_ && typeof config_.model === 'string' && config_.model.length > 0) model = config_.model
        break
      }
      case 'turn/start': {
        turn = data.turn
        step = null
        if (!open.has(turn)) {
          open.set(turn, {
            turn,
            model,
            cacheMiss: 0,
            cacheHit: 0,
            cacheWrite: 0,
            output: 0,
            reasoning: 0,
            steps: 0,
            startTime: event.time ?? null,
          })
        }
        break
      }
      case 'step/start': {
        if (data.turn !== turn) break
        const entry = open.get(turn) ?? { turn, model, cacheMiss: 0, cacheHit: 0, cacheWrite: 0, output: 0, reasoning: 0, steps: 0, startTime: event.time ?? null }
        entry.steps += 1
        open.set(turn, entry)
        step = data.step
        break
      }
      case 'assistant/message': {
        if (turn === null || data.turn !== turn) break
        const entry = open.get(turn)
        if (entry) entry.endTime = event.time ?? null
        closeAttempt(normalizeUsage(data.usage))
        step = null
        break
      }
      case 'turn/end': {
        if (turn === null || data.turn !== turn) break
        const entry = open.get(turn)
        if (entry) {
          entry.endTime = event.time ?? entry.endTime ?? null
          done.set(turn, entry)
        }
        open.delete(turn)
        turn = null
        step = null
        break
      }
      default:
        break
    }
    void step
  }

  const turns = {}
  for (const [key, entry] of [...done.entries()].sort((a, b) => a[0] - b[0])) {
    const buckets = {
      miss: entry.cacheMiss,
      hit: entry.cacheHit,
      write: entry.cacheWrite,
      output: entry.output,
      reasoning: entry.reasoning,
    }
    const priced = priceUsage(buckets, entry.model, entry.endTime ?? entry.startTime ?? Date.now(), config, entry.model)
    if (!priced) continue
    turns[String(key)] = {
      turn: key,
      model: entry.model,
      amount: priced.amount,
      rate: priced.rate,
      steps: entry.steps,
      tokens: {
        input: buckets.miss + buckets.hit + buckets.write,
        uncachedInput: buckets.miss,
        cacheHit: buckets.hit,
        cacheWrite: buckets.write,
        output: buckets.output,
        reasoning: buckets.reasoning,
        total: buckets.miss + buckets.hit + buckets.write + buckets.output,
      },
      rates: priced.rates,
    }
  }
  return turns
}

/**
 * Install the host half.
 * @param ctx - the owning cordis context.
 * @param rawConfig - the loader row's config.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  /** Cost tables by Session id, plus the mark that a Session may have moved. */
  const sessions = new Map()
  /** Last diagnostic per Session id, exposed only through the debug query. */
  const diagnostics = new Map()
  let balanceCache = { at: 0, value: null }

  /** Resolve the API key: plugin config env var first, then the harness store. */
  async function resolveApiKey() {
    const fromEnv = process.env[config.apiKeyEnv]
    if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
    const credentials = ctx.get('credentials')
    if (!credentials) return null
    try {
      const resolved = await credentials.resolve(config.apiKeyEnv)
      return resolved && typeof resolved.value === 'string' && resolved.value.length > 0 ? resolved.value : null
    } catch {
      return null
    }
  }

  /** Read the account balance, honoring the configured cache window. */
  async function readBalance(force) {
    const now = Date.now()
    if (!force && balanceCache.value && now - balanceCache.at < config.balanceTtlMs) return balanceCache.value
    const apiKey = await resolveApiKey()
    if (!apiKey) {
      balanceCache = { at: now, value: { ok: false, error: `no credential: set ${config.apiKeyEnv}` } }
      return balanceCache.value
    }
    try {
      const response = await fetch(`${config.baseURL.replace(/\/$/, '')}/user/balance`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        balanceCache = { at: now, value: { ok: false, error: `HTTP ${response.status}` } }
        return balanceCache.value
      }
      const body = await response.json()
      const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
      const picked = infos.find((info) => info?.currency === config.currency) ?? infos[0]
      balanceCache = {
        at: now,
        value: {
          ok: true,
          isAvailable: body?.is_available !== false,
          currency: picked?.currency ?? config.currency,
          totalBalance: Number(picked?.total_balance ?? 0),
          toppedUpBalance: Number(picked?.topped_up_balance ?? 0),
          grantedBalance: Number(picked?.granted_balance ?? 0),
          at: now,
        },
      }
    } catch (error) {
      balanceCache = { at: now, value: { ok: false, error: error instanceof Error ? error.message : String(error) } }
    }
    return balanceCache.value
  }

  const agents = ctx.get('agents')
  const sessionStore = ctx.get('sessions')

  /** Find one live Session, preferring the agent registry that owns it. */
  function findSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
    const agent = agents?.get(sessionId)
    if (agent?.session) return agent.session
    const direct = sessionStore?.get(sessionId)
    if (direct) return direct
    // The two registries can disagree on the exact id spelling (a `SessionTarget`
    // may arrive branded or aliased); a list scan is the safe fallback.
    const listed = sessionStore?.list?.() ?? []
    return listed.find((session) => session.id === sessionId || String(session.id) === sessionId)
  }

  /**
   * Cost table for one Session.
   * @param force - ignore the TTL cache and refold the durable log.
   */
  function readTurns(sessionId, force) {
    const entry = sessions.get(sessionId) ?? { cache: null, at: 0 }
    const fresh = entry.cache && !entry.dirty && Date.now() - entry.at < TURN_CACHE_TTL_MS
    if (!force && fresh) return entry.cache
    const session = findSession(sessionId)
    if (!session) {
      diagnostics.set(sessionId, { reason: 'session not found', agents: Boolean(agents), store: Boolean(sessionStore) })
      return entry.cache ?? {}
    }
    let events
    try {
      events = session.snapshotEvents()
    } catch (error) {
      diagnostics.set(sessionId, { reason: `snapshotEvents failed: ${error instanceof Error ? error.message : String(error)}` })
      return entry.cache ?? {}
    }
    const turns = computeTurnCosts(events, config)
    diagnostics.set(sessionId, { reason: 'ok', events: events.length, turns: Object.keys(turns).length })
    const keys = Object.keys(turns).map(Number).sort((a, b) => b - a)
    const bounded = {}
    for (const key of keys.slice(0, config.maxTurns)) bounded[String(key)] = turns[String(key)]
    sessions.set(sessionId, { cache: bounded, at: Date.now(), dirty: false })
    return bounded
  }

  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'turn/end' && event?.type !== 'assistant/message') return
    const id = session?.id
    if (typeof id !== 'string') return
    const entry = sessions.get(id) ?? { cache: null, at: 0 }
    entry.dirty = true
    sessions.set(id, entry)
  })

  ctx.effect(
    () => () => {
      sessions.clear()
    },
    'deepseek-usage: session cost cache',
  )

  /** Answer one same-origin JSON request from the browser half. */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const send = (status, payload) => {
      const body = JSON.stringify(payload)
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(body)
    }
    if (url.pathname === `${ROUTE_PREFIX}/summary`) {
      const sessionId = url.searchParams.get('sessionId')
      const force = url.searchParams.get('refresh') === '1'
      const balance = await readBalance(force)
      const turns = sessionId ? readTurns(sessionId, force) : {}
      send(200, {
        ok: true,
        currency: config.currency,
        symbol: MONEY[config.currency] ?? '',
        // Every amount this route serves is already in `currency`; no exchange
        // rate is involved, so none is published.
        showBalance: true,
        balance,
        sessionId: sessionId ?? null,
        turns,
        serverTime: Date.now(),
        // `?debug=1` reports why a Session produced no priced Turns; it names
        // only the requested Session and never leaks a credential.
        debug:
          url.searchParams.get('debug') === '1'
            ? {
                agentsService: Boolean(agents),
                sessionsService: Boolean(sessionStore),
                diagnostics: sessionId ? (diagnostics.get(sessionId) ?? null) : null,
              }
            : undefined,
      })
      return
    }
    send(404, { ok: false, error: 'not found' })
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          Promise.resolve(handle(req, res)).catch((error) => {
            if (!res.headersSent) res.statusCode = 500
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
          })
        },
      }),
    'deepseek-usage: summary route',
  )
}

export default { name, inject, apply }

/** Exported for the offline pricing check only. */
export { priceUsage, round }
