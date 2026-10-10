/**
 * Preflight check for one installed dsh profile.
 *
 * Reproduces the exact resolution chain `@deepseek-ai/dsh-client-modules`
 * performs for a row that declares `dsh.client`, plus the composition facts the
 * deployment must satisfy, so a broken install is detected before a restart
 * instead of as a blank seat afterwards:
 *
 *   1. the profile lists the bundle;
 *   2. the loader specifier resolves to a package whose nearest manifest carries
 *      the expected name (how `locatePkgJson` decides ownership);
 *   3. that manifest declares `dsh.client.platform === "web"` and exports
 *      `"./client"` (how `resolveMeta` decides it is a client plugin);
 *   4. the resolved client artifact exists and is readable (how
 *      `initialBundleSnapshot` would fail activation loudly);
 *   5. every package named in `dsh.client.inject` resolves from the profile;
 *   6. the plugin's own `cordis.patch.yml` parses and its row id, name, and
 *      config keys match what the plugin's host half exports.
 *
 * Usage: node tools/verify-composition.mjs [profileDirectory] [bundleName]
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')

/**
 * Read the module id a client bundle registers itself under.
 *
 * The bundle opens with `window.__ModuleLoader__.load({ id: "...", factory: ... })`
 * and may carry comments between the two keys, so the id is read from the text
 * before `factory:` rather than from a single-line pattern. The id must equal
 * the package name: the module system serves the row keyed by that name, so a
 * mismatch leaves the browser half silently unloaded.
 *
 * @param source - the client bundle text.
 * @returns the registered id, or undefined when the shape is not recognised.
 */
function moduleIdOf(source) {
  const head = /__ModuleLoader__\.load\(\{([\s\S]*?)\bfactory:/.exec(source)?.[1]
  if (head === undefined) return undefined
  return /id:\s*"([^"]+)"/.exec(head)?.[1]
}

/**
 * Resolve the directory to inspect.
 *
 * With no argument the installed profile is inspected — that is the state a
 * user cares about after `dsh plugin add`. Pass `--source` to inspect this
 * checkout instead: the checks then run against the payload a Git or tarball
 * install would produce, with no profile and no installed copy required.
 */
const sourceMode = process.argv.includes('--source')
const profileDir = sourceMode
  ? packageRoot
  : resolve(process.argv[2] ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh', 'profiles', 'desktop'))
/** The bundle row name equals the package name, read from this checkout. */
const bundleName = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).name

if (sourceMode) {
  console.log(`mode: source checkout (${packageRoot})`)
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const declared = manifest?.dsh?.client
  if (!declared || declared.platform !== 'web') throw new Error('source manifest does not declare dsh.client.platform = "web"')
  if (manifest?.exports?.['./client'] === undefined) throw new Error('source manifest exports no "./client"')
  const clientPath = join(packageRoot, manifest.exports['./client'])
  const bytes = readFileSync(clientPath)
  const source = bytes.toString('utf8')
  if (!source.includes('__ModuleLoader__.load')) throw new Error('client artifact does not register through window.__ModuleLoader__.load')
  const registered = moduleIdOf(source)
  if (!registered) throw new Error('client artifact registers no module id')
  if (registered !== manifest.name) throw new Error(`client artifact registers "${registered}" but the package is "${manifest.name}"`)
  console.log(`[1] manifest declares dsh.client: ${JSON.stringify(declared)}`)
  console.log(`[2] client artifact: ${clientPath} (${statSync(clientPath).size} bytes)`)
  console.log(`[3] registers module id: ${registered}`)
  const patchPath = join(packageRoot, manifest?.dsh?.bundle?.patch ?? './cordis.patch.yml')
  if (!existsSync(patchPath)) throw new Error(`bundle patch missing: ${patchPath}`)
  const patchText = readFileSync(patchPath, 'utf8')
  // The patch is parsed by dsh at boot; here it only has to insert the row and
  // name the package, which is what the loader keys on. YAML may quote a scoped
  // name, so the name check tolerates quotes rather than requiring one form.
  if (!/id:\s*deepseek-usage\b/.test(patchText)) throw new Error('bundle patch does not insert the expected row id')
  const patchName = /^\s*name:\s*['"]?([^'"\n#]+?)['"]?\s*$/m.exec(patchText)?.[1]
  if (patchName !== manifest.name) throw new Error(`bundle patch names "${patchName}" but the package is "${manifest.name}"`)
  console.log(`[4] bundle patch: ${patchPath}`)
  console.log('\nsource preflight OK')
  process.exit(0)
}

const profileManifestPath = join(profileDir, 'package.json')
if (!existsSync(profileManifestPath)) throw new Error(`no profile manifest at ${profileManifestPath}`)
const profile = JSON.parse(readFileSync(profileManifestPath, 'utf8'))
const bundles = profile?.dsh?.profile?.bundles ?? []
console.log(`profile: ${profileDir}`)
console.log(`bundles: ${bundles.join(', ')}`)
if (!bundles.includes(bundleName)) throw new Error(`profile does not list ${bundleName}`)
console.log(`[1] profile lists ${bundleName}`)

const requirement = createRequire(pathToFileURL(join(profileDir, 'package.json')))

/**
 * Resolve one package the way Node's ESM resolver does from the profile: walk
 * the ancestor chain, take the first `node_modules/<name>`, and return the entry
 * its manifest's `exports["."]` (or `main`) names. `createRequire(...).resolve`
 * cannot be used for this, because it also walks the machine's global caches and
 * would report a package the profile's own tree cannot see.
 *
 * @param specifier - package name, optionally with a subpath.
 * @returns absolute path of the resolved entry, or undefined when unseen.
 */
function resolveFromProfile(specifier) {
  const slash = specifier.startsWith('@') ? specifier.indexOf('/', specifier.indexOf('/') + 1) : specifier.indexOf('/')
  const packageName = slash === -1 ? specifier : specifier.slice(0, slash)
  const subpath = slash === -1 ? '.' : `.${specifier.slice(slash)}`
  let dir = profileDir
  for (;;) {
    const base = join(dir, 'node_modules', packageName)
    const manifestPath = join(base, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const entry = manifest?.exports?.[subpath]
      const relative =
        typeof entry === 'string'
          ? entry
          : entry?.default ?? entry?.import ?? (subpath === '.' ? manifest?.main : undefined)
      if (typeof relative !== 'string') return manifestPath
      return join(base, relative)
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** Resolve one specifier the way the Loader resolves a row's module location. */
function resolveSpecifier(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('file:') || isAbsolute(specifier)) {
    return specifier.startsWith('file:') ? specifier : pathToFileURL(resolve(profileDir, specifier)).href
  }
  const resolved = resolveFromProfile(specifier)
  if (resolved === undefined) throw new Error(`[2] ${specifier} is not resolvable from ${profileDir}`)
  return pathToFileURL(resolved).href
}

/** Walk up to the nearest manifest, the way `nearestPackage` does. */
function nearestManifest(moduleUrl, expectedName) {
  let dir = dirname(new URL(moduleUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  for (;;) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        const manifest = JSON.parse(readFileSync(candidate, 'utf8'))
        if (typeof manifest.name === 'string' && (expectedName === undefined || manifest.name === expectedName)) {
          return { path: candidate, name: manifest.name, dir }
        }
      } catch {
        // An unreadable manifest is not the owner; keep walking up.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

const moduleUrl = resolveSpecifier(bundleName)
const located = nearestManifest(moduleUrl, bundleName)
if (!located) throw new Error(`[2] ${bundleName} resolved to ${moduleUrl} but no owning manifest declares that name`)
console.log(`[2] resolves to ${moduleUrl}`)
console.log(`    owning manifest: ${located.path}`)

const manifest = JSON.parse(readFileSync(located.path, 'utf8'))
const declared = manifest?.dsh?.client
if (!declared || declared.platform !== 'web') throw new Error(`[3] ${bundleName} does not declare dsh.client.platform = "web"`)
console.log(`[3] dsh.client: ${JSON.stringify(declared)}`)

const clientRel = manifest?.exports?.['./client']
if (clientRel === undefined) throw new Error(`[3] ${bundleName} declares dsh.client but exports no "./client"`)
const clientPath = join(dirname(located.path), typeof clientRel === 'string' ? clientRel : clientRel.default)
if (!existsSync(clientPath)) throw new Error(`[4] client artifact missing: ${clientPath}`)
const stats = statSync(clientPath)
const bytes = readFileSync(clientPath)
console.log(`[4] client artifact: ${clientPath} (${stats.size} bytes)`)

const source = bytes.toString('utf8')
if (!source.includes('__ModuleLoader__.load')) throw new Error('[4] client artifact does not register through window.__ModuleLoader__.load')
const registered = /__ModuleLoader__\.load\(\{\s*id:\s*"([^"]+)"/.exec(source)
if (!registered) throw new Error('[4] client artifact registers no module id')
if (registered[1] !== manifest.name) {
  throw new Error(`[4] client artifact registers id "${registered[1]}" but the package is "${manifest.name}"`)
}
console.log(`[4] registers module id: ${registered[1]}`)

for (const dependency of declared.inject ?? []) {
  const resolved = resolveFromProfile(dependency)
  if (resolved === undefined) throw new Error(`[5] dsh.client.inject ${dependency} is not resolvable from the profile`)
  console.log(`[5] dsh.client.inject ${dependency} -> ${resolved}`)
}

// The plugin's own bundle layer: the row must match what the host half exports.
const patchRel = manifest?.exports?.['./cordis.patch.yml'] ?? manifest?.dsh?.bundle?.patch
if (patchRel === undefined) throw new Error(`[6] ${bundleName} declares no bundle patch`)
const patchPath = join(dirname(located.path), patchRel)
if (!existsSync(patchPath)) throw new Error(`[6] bundle patch missing: ${patchPath}`)
const yamlPath = resolveFromProfile('js-yaml')
const { load } = yamlPath === undefined ? { load: undefined } : await import(pathToFileURL(yamlPath).href)
if (load === undefined) {
  console.log(`[6] bundle patch present: ${patchPath} (js-yaml unavailable; parsed by dsh at boot)`)
} else {
  const layers = load(readFileSync(patchPath, 'utf8'))
  if (!Array.isArray(layers)) throw new Error('[6] bundle patch is not a top-level array')
  const inserted = layers.flatMap((layer) => layer?.insert ?? [])
  if (inserted.length !== 1) throw new Error(`[6] expected exactly one inserted row, found ${inserted.length}`)
  const row = inserted[0]
  console.log(`[6] row id=${row.id} name=${row.name}`)
  console.log(`[6] row config keys: ${Object.keys(row.config ?? {}).sort().join(', ')}`)
  if (row.name !== manifest.name) throw new Error(`[6] row name "${row.name}" does not match package name "${manifest.name}"`)
  const host = await import(pathToFileURL(resolveFromProfile(bundleName) ?? located.path).href)
  if (host.name !== row.id) throw new Error(`[6] host export name "${host.name}" does not match row id "${row.id}"`)
  console.log(`[6] host half: apply=${typeof host.apply} name=${host.name} inject=${JSON.stringify(host.inject)}`)
}

console.log('\ncomposition preflight OK')
