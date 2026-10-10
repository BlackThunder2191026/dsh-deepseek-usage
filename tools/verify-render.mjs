/**
 * Data-driven render test for the browser half.
 *
 * `verify-client.mjs` proves the bundle loads and its seats register. This
 * script proves both seats render the REAL payload shape, by executing the
 * bundle against a stub React that keeps a hook state per component instance
 * exactly like React does (state survives, effects run once) and a stub host
 * route serving a priced Turn.
 *
 * Usage: node tools/verify-render.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createServer } from 'node:http'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

/**
 * The exact `turns[turn]` shape the host route serves.
 *
 * Priced from the official CNY table for a Flash Turn at peak:
 * 196882/1e6*2 + 1251840/1e6*0.04 + 20902/1e6*8 = 0.6111 CNY.
 */
const STUB_TURN = {
  turn: 7,
  model: 'deepseek-flash',
  amount: 0.6111,
  rate: 'peak',
  steps: 7,
  tokens: {
    input: 1448722,
    uncachedInput: 196882,
    cacheHit: 1251840,
    cacheWrite: 0,
    output: 20902,
    reasoning: 4096,
    total: 1469624,
  },
  rates: { hit: 0.04, miss: 2, output: 8 },
}

const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'application/json')
  response.end(
    JSON.stringify({
      ok: true,
      currency: 'CNY',
      symbol: '¥',
      balance: {
        ok: true,
        isAvailable: true,
        currency: 'CNY',
        totalBalance: 10,
        toppedUpBalance: 10,
        grantedBalance: 0,
        at: Date.now(),
      },
      sessionId: 'session-stub',
      turns: { 7: STUB_TURN },
      serverTime: Date.now(),
    }),
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
console.log(`stub route: ${origin}`)

/** Flatten a rendered element tree into its text content. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object') return textOf(node.children)
  return ''
}

/** Depth-first search for the first rendered node matching a predicate. */
function findFirst(node, match) {
  if (node === null || node === undefined || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findFirst(child, match)
      if (found) return found
    }
    return undefined
  }
  if (match(node)) return node
  return findFirst(node.children, match)
}

const loads = []
globalThis.window = {
  __ModuleLoader__: { load: (record) => loads.push(record) },
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  innerHeight: 900,
}
globalThis.document = {
  visibilityState: 'visible',
  head: { appendChild: () => {} },
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ dataset: {}, remove: () => {} }),
}

/**
 * Minimal hook runtime: one state vector per mounted component instance.
 *
 * A component instance is identified by the component function plus the props
 * object it was first rendered with, which is stable for a given seat. State
 * survives draws; effects run once unless their dependency list changes.
 */
const instances = new Map()
let current = null

function runtimeFor(key) {
  if (!instances.has(key)) instances.set(key, { state: [], effects: [], cursor: 0, deps: [], dirty: false })
  return instances.get(key)
}

/**
 * Render one component instance.
 *
 * The instance key is the component plus the props that React itself would use
 * to decide "same seat or a new one": the sidebar's posture and the Turn a tail
 * belongs to. Including the Turn matters — a tail for Turn 7 and a tail for
 * Turn 3 are two mounted instances, each with its own state and its own effect.
 * The Turn's *shape* is deliberately not part of the key, so the same Turn
 * rendered through a different owner currency reuses one instance.
 */
function renderComponent(component, props) {
  const turn = props.turn && typeof props.turn === 'object' ? (props.turn.turn ?? 'unknown') : props.turn
  const key = `${component.name || 'anonymous'}#${props.wide === true ? 'wide' : props.wide === false ? 'rail' : `t${turn}`}`
  const instance = runtimeFor(key)
  instance.cursor = 0
  instance.effects = []
  current = instance
  const tree = component(props)
  for (const effect of instance.effects) effect()
  instance.effects = []
  current = null
  return { tree, instance, key }
}

/** Draw one seat and return its text, letting pending fetches settle. */
async function draw(component, props, passes = 6) {
  let result
  for (let pass = 0; pass < passes; pass += 1) {
    result = renderComponent(component, props)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return { ...result, text: textOf(result.tree).replace(/\s+/g, ' ').trim() }
}

const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.length > 1 ? children : children[0],
  }),
  useState: (initial) => {
    const instance = current
    const index = instance.cursor++
    if (!(index in instance.state)) instance.state[index] = typeof initial === 'function' ? initial() : initial
    const set = (next) => {
      instance.state[index] = typeof next === 'function' ? next(instance.state[index]) : next
    }
    return [instance.state[index], set]
  },
  useEffect: (effect, deps) => {
    const instance = current
    const index = instance.cursor++
    const previous = instance.deps[index]
    const changed = !previous || !deps || deps.some((value, at) => !Object.is(value, previous[at]))
    instance.deps[index] = deps
    if (changed) instance.effects.push(effect)
  },
  useRef: (initial) => {
    const instance = current
    const index = instance.cursor++
    if (!(index in instance.state)) instance.state[index] = { current: initial }
    return instance.state[index]
  },
  useCallback: (fn) => {
    current.cursor++
    return fn
  },
  useMemo: (fn) => {
    current.cursor++
    return fn()
  },
}

const moduleTable = { react: React, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null } }
const requireStub = (id) => {
  if (!(id in moduleTable)) throw new Error(`unexpected module request: ${id}`)
  return moduleTable[id]
}

const realFetch = globalThis.fetch
globalThis.fetch = (path, options) => realFetch(new URL(path, origin), options)

new Function('window', 'document', bundle)(globalThis.window, globalThis.document)
const exported = loads[0].factory(requireStub)

const registered = []
exported.apply({
  effect: (callback) => {
    callback()
  },
  on: () => () => {},
  provide: () => () => {},
  get: () => undefined,
  slots: {
    inject: (_key, callback) => {
      callback()
      return () => {}
    },
    register: (descriptor, component) => {
      registered.push({ descriptor, component })
      return () => {}
    },
  },
})

const seat = (id) => {
  const found = registered.find((entry) => entry.descriptor.id === id)
  if (!found) throw new Error(`seat not registered: ${id}`)
  return found.component
}

// --- sidebar balance -------------------------------------------------------
const balance = await draw(seat('deepseek-usage-balance'), { wide: true })
console.log(`sidebar (wide): ${balance.text}`)
if (!balance.text.includes('余额')) throw new Error('sidebar row rendered without its label')
if (!/¥\s?\d/.test(balance.text)) throw new Error(`sidebar row rendered no money: ${balance.text}`)

const rail = await draw(seat('deepseek-usage-balance'), { wide: false })
console.log(`sidebar (rail): ${rail.text || '(icon only)'}`)

// --- per-turn cost --------------------------------------------------------
const tailProps = { turn: 7, seq: 10, sessionId: 'session-stub' }
const tail = await draw(seat('deepseek-usage-turn-cost'), tailProps)
console.log(`turn tail: ${tail.text}`)
if (!tail.text.includes('6111')) throw new Error(`turn tail rendered no amount: ${tail.text}`)
// The row is the cost pill alone: the token summary was deliberately dropped,
// so the arrows must not appear on the collapsed row any more.
for (const arrow of ['↑', '⇢', '↓']) {
  if (tail.text.includes(arrow)) throw new Error(`collapsed row still shows token bucket ${arrow}: ${tail.text}`)
}
if (tail.text.includes('tokens')) throw new Error(`collapsed row still carries a token summary: ${tail.text}`)
// The balance currency is the only money on the row: no USD surface remains.
if (tail.text.includes('$')) throw new Error(`turn tail still shows a USD figure: ${tail.text}`)
if (!tail.text.includes('¥')) throw new Error(`turn tail shows no converted amount: ${tail.text}`)

// The owner currency in this assembly is a TurnLocation object, not a number.
// Rendering the same Turn through that shape must produce the same amount —
// reading the object as a number is what made every Turn look unpriced live.
const locationShape = {
  turn: 7,
  status: 'closed',
  start: { type: 'turn/start', data: { turn: 7 } },
  end: { type: 'turn/end', data: { turn: 7, reason: 'success' } },
  steps: [],
}
const viaLocation = await draw(seat('deepseek-usage-turn-cost'), { ...tailProps, turn: locationShape })
console.log(`turn tail (TurnLocation currency): ${viaLocation.text}`)
if (!viaLocation.text.includes('6111')) {
  throw new Error(`TurnLocation currency did not resolve to the priced Turn: ${viaLocation.text}`)
}

// A TurnLocation without a usable number must report the resolution failure
// rather than fall back to an empty row.
const blankCurrency = await draw(seat('deepseek-usage-turn-cost'), { ...tailProps, turn: { status: 'unknown' } })
console.log(`turn tail (unresolvable currency): ${blankCurrency.text}`)
if (!blankCurrency.text.includes('轮次号解析失败')) {
  throw new Error(`unresolvable Turn currency was not reported: ${blankCurrency.text}`)
}

// An unpriced Turn must say so rather than render an empty row.
const missing = await draw(seat('deepseek-usage-turn-cost'), { ...tailProps, turn: 3 })
console.log(`turn tail (unpriced turn): ${missing.text}`)
if (missing.text.length === 0) throw new Error('unpriced turn rendered nothing')
if (!missing.text.includes('本轮未计价')) throw new Error(`unpriced Turn was not distinguished: ${missing.text}`)

// The full trigger → open path cannot be replayed by this stub (the seat opens
// a disclosure through a state setter between two draws), so the expanded grid
// itself is asserted by `verify-client.mjs`, which renders it with a real
// payload. Here only the wiring is checked: the amount pill must be clickable.
const trigger = findFirst(tail.tree, (node) => node?.type === 'button')
if (!trigger || typeof trigger.props.onClick !== 'function') throw new Error('turn tail rendered no trigger')
console.log('cost trigger wired: true')

server.close()
console.log('\nrender test OK')
