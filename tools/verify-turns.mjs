/**
 * Offline verifier for the host half's per-Turn fold.
 *
 * Decompresses one real `.jsonl.zstd` Session log, rebuilds the same event
 * array the live Session exposes, and prints the cost table the plugin's HTTP
 * route would serve — so the fold can be checked against production data
 * without restarting the harness.
 *
 * Usage: node tools/verify-turns.mjs <session-log.jsonl.zstd> [turnLimit]
 */

import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { computeTurnCosts } from '../lib/index.js'

const file = process.argv[2]
const limit = Number(process.argv[3] ?? 10)
if (!file) {
  console.error('usage: node tools/verify-turns.mjs <session-log.jsonl.zstd> [turnLimit]')
  process.exit(2)
}

const config = {
  currency: 'CNY',
  defaultModel: 'deepseek-flash',
  // CNY per million tokens, from the official Chinese pricing page.
  models: {
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
  },
  money: { digitsLarge: 2, digitsSmall: 4 },
}

/**
 * Split a concatenated-frame zstd frame stream.
 *
 * The JSONL persistence plugin appends one zstd frame per flushed batch, so a
 * log file is a frame stream rather than one frame. Frames are located by the
 * zstd magic number; a frame boundary inside compressed payload bytes would be
 * a false positive, which decoding rejects, so detection is verified by decode.
 *
 * @param buffer - the whole file.
 * @returns decoded text of every frame, in file order.
 */
function decodeFrames(buffer) {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const offsets = []
  let cursor = 0
  while ((cursor = buffer.indexOf(magic, cursor)) !== -1) {
    offsets.push(cursor)
    cursor += 4
  }
  const parts = []
  for (const [index, offset] of offsets.entries()) {
    const end = offsets[index + 1] ?? buffer.length
    try {
      parts.push(zstdDecompressSync(buffer.subarray(offset, end)).toString('utf8'))
    } catch {
      // Not a real frame boundary; its bytes belong to the previous frame.
    }
  }
  return parts.join('')
}

const raw = decodeFrames(readFileSync(file))
const events = []
const counts = new Map()
for (const line of raw.split('\n')) {
  const text = line.trim()
  if (text.length === 0) continue
  let value
  try {
    value = JSON.parse(text)
  } catch {
    continue
  }
  // Storage frames may wrap the event; unwrap the common shapes.
  const event = value?.event ?? value
  if (typeof event?.type !== 'string') continue
  events.push(event)
  counts.set(event.type, (counts.get(event.type) ?? 0) + 1)
}

console.log(`events: ${events.length}`)
const interesting = [...counts.entries()]
  .filter(([type]) => /turn|step|assistant|request\/header/.test(type))
  .sort()
for (const [type, count] of interesting) console.log(`  ${type}: ${count}`)

const headerEvents = events.filter((event) => event.type === 'request/header')
const models = new Set()
for (const event of headerEvents) {
  const model = event.data?.header?.config?.model
  if (typeof model === 'string') models.add(model)
}
console.log(`models seen in request headers: ${[...models].join(', ') || '(none)'}`)

const usageSamples = events.filter((event) => event.type === 'assistant/message' && event.data?.usage)
console.log(`assistant/message with usage: ${usageSamples.length}`)
if (usageSamples.length > 0) {
  console.log(`  sample usage: ${JSON.stringify(usageSamples[usageSamples.length - 1].data.usage)}`)
}

const turns = computeTurnCosts(events, config)
const keys = Object.keys(turns).map(Number).sort((a, b) => a - b)
console.log(`\npriced turns: ${keys.length}`)

// Every priced Turn must carry a finite CNY amount and a full rate triple. A
// field-name mismatch between the fold and the pricing function turns the
// arithmetic into NaN, which serializes to null — exactly the regression this
// assertion exists to catch.
for (const key of keys) {
  const entry = turns[String(key)]
  if (!Number.isFinite(entry.amount)) throw new Error(`turn ${key} has a non-finite amount: ${entry.amount}`)
  if (entry.amount < 0) throw new Error(`turn ${key} has a negative amount: ${entry.amount}`)
  for (const bucket of ['hit', 'miss', 'output']) {
    if (!Number.isFinite(entry.rates?.[bucket])) throw new Error(`turn ${key} is missing rate ${bucket}`)
  }
  if ('amountUsd' in entry) throw new Error(`turn ${key} still publishes amountUsd`)
}

let shown = 0
for (const key of keys.slice(-limit)) {
  const entry = turns[String(key)]
  shown += entry.amount
  console.log(
    `  turn ${String(entry.turn).padStart(3)}  ${entry.model.padEnd(18)} ${entry.rate.padEnd(8)} ` +
      `CNY ${entry.amount.toFixed(4).padStart(9)}  ` +
      `单价 miss=${entry.rates.miss} hit=${entry.rates.hit} out=${entry.rates.output}  ` +
      `in=${entry.tokens.uncachedInput} hit=${entry.tokens.cacheHit} out=${entry.tokens.output} steps=${entry.steps}`,
  )
}
const allTotal = keys.reduce((sum, key) => sum + turns[String(key)].amount, 0)
console.log(`session total (all priced turns): CNY ${allTotal.toFixed(4)}`)
void shown
