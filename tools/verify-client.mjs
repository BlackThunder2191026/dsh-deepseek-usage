/**
 * Offline smoke test for the browser half.
 *
 * The client bundle is a plain `window.__ModuleLoader__.load({ id, factory })`
 * script, so it can be executed outside a browser: stub the loader and the
 * module table, then materialize the factory with a recording `require`. This
 * checks the wrapper, the CommonJS exports, and that `apply` registers exactly
 * the two Slots against a fake cordis context — the failure modes that would
 * otherwise only surface as a blank seat in the GUI.
 *
 * Usage: node tools/verify-client.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

/**
 * Flatten a rendered element tree into its text content.
 *
 * The stub renderer returns elements rather than DOM, so a function element is
 * invoked here the way React would invoke it; otherwise a nested component's
 * output would never appear in the text.
 */
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node !== 'object') return ''
  if (typeof node.type === 'function') return textOf(node.type(node.props))
  return textOf(node.children)
}

const loads = []
globalThis.window = {
  __ModuleLoader__: {
    load(record) {
      loads.push(record)
    },
  },
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.document = {
  visibilityState: 'visible',
  head: { appendChild: () => {} },
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ dataset: {}, remove: () => {} }),
}

/** React stub: enough for the module body to evaluate without a DOM. */
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
}
const moduleTable = {
  react: React,
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
}

function requireStub(id) {
  if (!(id in moduleTable)) throw new Error(`unexpected module request: ${id}`)
  return moduleTable[id]
}

// The bundle is written for a classic script tag; run it as a function body.
new Function('window', 'document', bundle)(globalThis.window, globalThis.document)

if (loads.length !== 1) throw new Error(`expected exactly one load record, got ${loads.length}`)
const record = loads[0]
// The registered id must equal the package name; read the expectation from the
// manifest so a rename cannot leave this check asserting a stale name.
const manifestName = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).name
if (record.id !== manifestName) throw new Error(`registered id "${record.id}" does not match the package name "${manifestName}"`)
console.log(`module id: ${record.id}`)

const exported = record.factory(requireStub)
console.log(`exports: ${Object.keys(exported).join(', ')}`)
if (typeof exported.apply !== 'function') throw new Error('missing apply export')
if (!Array.isArray(exported.inject)) throw new Error('missing inject export')
console.log(`inject: ${JSON.stringify(exported.inject)}`)

const registrations = []
const effects = []
const injections = []
const ctx = {
  effect: (callback, label) => {
    const disposer = callback()
    effects.push({ label, disposer })
  },
  on: () => () => {},
  provide: () => () => {},
  get: () => undefined,
  slots: {
    inject: (key, callback) => {
      injections.push(key)
      callback()
      return () => {}
    },
    register: (descriptor, component) => {
      registrations.push({ descriptor, component })
      return () => {}
    },
  },
}

exported.apply(ctx)

console.log(`effects: ${effects.map((entry) => entry.label).join(' | ')}`)
console.log(`slot injections: ${JSON.stringify(injections)}`)
for (const { descriptor, component } of registrations) {
  console.log(
    `registered ${descriptor.name} id=${descriptor.id} order=${descriptor.order ?? '-'} component=${component?.name || '(anonymous)'}`,
  )
}

const expected = ['sidebar.footer.action', 'conversation.chat.turnTail']
const names = registrations.map((entry) => entry.descriptor.name)
for (const name of expected) {
  if (!names.includes(name)) throw new Error(`slot not registered: ${name}`)
}
const namespaces = registrations.map((entry) => entry.descriptor.name.split('.').slice(0, 2).join('.'))
void namespaces

// Render every registered component once through the React stub to catch
// crashes in the initial (no data) render path.
for (const { descriptor, component } of registrations) {
  const ownerProps =
    descriptor.name === 'sidebar.footer.action'
      ? { wide: true }
      : { turn: 1, seq: 10, openFile: () => {}, ...(descriptor.inject ? { sessionId: descriptor.inject('session-test') } : {}) }
  const tree = component(ownerProps)
  if (tree === undefined || tree === null) throw new Error(`component returned nothing: ${descriptor.id}`)
  console.log(`rendered ${descriptor.id} -> ${JSON.stringify(tree).slice(0, 140)}…`)
}

// The narrow sidebar posture must render too.
const balance = registrations.find((entry) => entry.descriptor.id === 'deepseek-usage-balance')
const narrow = balance.component({ wide: false })
if (!narrow) throw new Error('narrow sidebar render produced nothing')
console.log('rendered narrow sidebar posture')

// The owner currency of the Turn tail is a `TurnLocation` object in the shipped
// assembly, so the resolver must read both shapes. This is a pure function and
// the shape mismatch it guards is exactly what broke the live row once.
const turnNumberOf = exported.turnNumberOf
if (typeof turnNumberOf !== 'function') throw new Error('turnNumberOf is not exported for testing')
const currencyCases = [
  [7, 7, 'plain number'],
  [{ turn: 7 }, 7, 'TurnLocation'],
  [{ turn: 7, status: 'closed', steps: [] }, 7, 'closed TurnLocation'],
  [{ status: 'unknown' }, undefined, 'numberless location'],
  [{ start: { data: { turn: 9 } } }, 9, 'start-event fallback'],
  [undefined, undefined, 'absent'],
  [Number.NaN, undefined, 'NaN'],
]
for (const [input, expected, label] of currencyCases) {
  const actual = turnNumberOf(input)
  if (actual !== expected) throw new Error(`turnNumberOf(${label}) => ${String(actual)}, expected ${String(expected)}`)
  console.log(`turnNumberOf(${label}) => ${String(actual)}`)
}

// The expanded per-Turn accounting reads no hooks, so a real payload can be
// pushed through it here: this is the one render path a browser would show but
// this suite otherwise cannot reach.
const TurnBreakdown = exported.TurnBreakdown
if (typeof TurnBreakdown !== 'function') throw new Error('TurnBreakdown is not exported for testing')
const breakdown = TurnBreakdown({
  tokens: { uncachedInput: 196882, cacheHit: 1251840, cacheWrite: 0, output: 20902, reasoning: 4096 },
  // Official CNY rates for a Flash Turn at peak: 2 / 0.04 / 8 per million.
  rates: { hit: 0.04, miss: 2, output: 8 },
  model: 'deepseek-flash',
  rate: 'peak',
  steps: 7,
  symbol: '¥',
})
const breakdownText = textOf(breakdown)
for (const label of ['未命中输入', '缓存命中输入', '缓存写入', '输出', '其中思考', '模型', '步数', '高峰价', 'deepseek-flash']) {
  if (!breakdownText.includes(label)) throw new Error(`breakdown missing ${label}`)
}
// Exact figures are thousands-separated in the rendered text.
for (const formatted of ['196,882', '1,251,840', '4,096', '20,902']) {
  if (!breakdownText.includes(formatted)) throw new Error(`breakdown lost separators: ${formatted}`)
}
// The unit prices are printed exactly as the host served them, in CNY.
for (const price of ['¥2', '¥0.04', '¥8']) {
  if (!breakdownText.includes(price)) throw new Error(`unit price not rendered: ${price} in ${breakdownText}`)
}
if (breakdownText.includes('$')) throw new Error(`breakdown still shows a USD figure: ${breakdownText}`)
if (breakdownText.includes('美元')) throw new Error(`breakdown still mentions USD in its copy: ${breakdownText}`)
// The trailing caption row is gone: it is what pushed the price column out of view.
// The header keeps its own "单价 / 百万" label, so the caption is matched by the
// full-width parenthetical that only the caption used.
if (breakdownText.includes('单价（')) throw new Error(`breakdown still renders a caption row: ${breakdownText}`)
if (breakdownText.includes('折算率')) throw new Error(`breakdown still renders a conversion caption: ${breakdownText}`)
// Each column is named by its own header cell. This suite's React stub returns
// elements rather than DOM, so a nested function component is invoked here the
// way React would invoke it before the cells can be counted.
const renderDeep = (node) => {
  if (Array.isArray(node)) return node.flatMap(renderDeep)
  if (node && typeof node === 'object' && typeof node.type === 'function') return renderDeep(node.type(node.props))
  return [node]
}
const headerCells = renderDeep(breakdown.children).filter((cell) =>
  String(cell?.props?.className ?? '').includes('dsu-head'),
)
if (headerCells.length !== 3) throw new Error(`expected three header cells, found ${headerCells.length}`)
console.log(`header cells: ${headerCells.map((cell) => cell.children).join(' | ')}`)
console.log(`rendered expanded breakdown: ${breakdownText.replace(/\s+/g, ' ').trim().slice(0, 160)}`)

// A payload without rates must still fill every price cell: a blank unit price
// is what the live UI was reported to show, so it is asserted against here.
const noRates = textOf(
  TurnBreakdown({
    tokens: { uncachedInput: 10, cacheHit: 20, cacheWrite: 0, output: 30, reasoning: 0 },
    rates: undefined,
    model: 'deepseek-flash',
    rate: 'offPeak',
    steps: 1,
    symbol: '¥',
  }),
)
const dashes = (noRates.match(/—/g) ?? []).length
if (dashes < 4) throw new Error(`priceless rows did not render their placeholder dashes (${dashes}): ${noRates}`)
console.log(`priceless payload renders ${dashes} explicit dashes`)

console.log('\nclient bundle OK')
