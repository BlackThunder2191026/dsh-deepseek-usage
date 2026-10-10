/**
 * Install-time guard for dsh-deepseek-usage.
 *
 * Runs as the `prepare` script so a Git install verifies its payload before the
 * profile tries to mount it. Two things make this script worth its own file
 * rather than an inline `node -e`:
 *
 * 1. Paths are resolved from the script's own location, never `process.cwd()`.
 *    `prepare` runs under whatever working directory the package manager chose,
 *    so a relative `lib/index.js` check fails on a perfectly good checkout.
 * 2. It reports what it found, which turns "the plugin does nothing" into a
 *    readable install-time message.
 *
 * There is no build step: this package ships its host half and its browser half
 * as hand-written ESM under `lib/`, and `files` includes that directory.
 *
 * Usage: node tools/prepare.mjs
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Payload the loader and the client-module scanner both require. */
const REQUIRED = [
  ['lib/index.js', 'host half (loaded by the cordis Loader)'],
  ['lib/client.js', 'browser half (served as the client bundle)'],
  ['cordis.patch.yml', 'bundle layer (inserts the plugin row)'],
  ['package.json', 'manifest carrying dsh.bundle and dsh.client'],
]

const problems = []
for (const [relative, purpose] of REQUIRED) {
  const path = join(packageRoot, relative)
  if (!existsSync(path)) {
    problems.push(`${relative} is missing (${purpose})`)
    continue
  }
  if (statSync(path).size === 0) problems.push(`${relative} is empty (${purpose})`)
}

// The manifest must still declare both halves, or dsh will mount nothing.
const manifestPath = join(packageRoot, 'package.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest?.dsh?.bundle?.patch === undefined) problems.push('package.json declares no dsh.bundle.patch')
  if (manifest?.dsh?.client?.platform !== 'web') problems.push('package.json does not declare dsh.client.platform = "web"')
  if (manifest?.exports?.['./client'] === undefined) problems.push('package.json exports no "./client"')
}

if (problems.length > 0) {
  console.error('dsh-deepseek-usage: refusing to install an incomplete package:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('Re-install from a full checkout, or use the published tarball instead.')
  process.exit(1)
}

// Report the package's own name rather than a literal: this message is the
// first thing an install prints, so a stale name here would mislead the reader
// about which package just landed.
const selfName = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).name : 'this package'
console.log(`${selfName}: host + client halves and manifest present; nothing to build.`)
console.log('Next: restart dsh so the Loader mounts the new row.')
