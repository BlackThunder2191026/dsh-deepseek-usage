/**
 * Verify a packed tarball's name consistency and publishability.
 *
 * The three-name contract is the whole point: package.json `name`, the bundle
 * patch row `name`, and the id the client bundle registers itself under must be
 * the same string. Any disagreement either stops the plugin mounting or leaves
 * the browser half silently unloaded.
 *
 * Usage: node tools/verify-package.mjs <extracted-package-dir>
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) {
  console.error('usage: node tools/verify-package.mjs <extracted-package-dir>')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

const patchName = /^\s*name:\s*['"]?([^'"\n#]+?)['"]?\s*$/m.exec(patch)?.[1]
const idBlock = /__ModuleLoader__\.load\(\{([\s\S]*?)\bfactory:/.exec(client)?.[1]
const registeredId = idBlock === undefined ? undefined : /id:\s*"([^"]+)"/.exec(idBlock)?.[1]

const findings = []
if (patchName !== manifest.name) findings.push(`patch row name "${patchName}" != package name "${manifest.name}"`)
if (registeredId !== manifest.name) findings.push(`client module id "${registeredId}" != package name "${manifest.name}"`)
if (manifest.private === true) findings.push('private: true blocks publishing, which is the only way the plugin market can install it')
if (manifest.publishConfig?.access !== 'public') findings.push('publishConfig.access is not "public"; a scoped package would publish as restricted')

console.log(`  package.json name : ${manifest.name}`)
console.log(`  patch row name    : ${patchName}`)
console.log(`  client module id  : ${registeredId}`)
console.log(`  version           : ${manifest.version}`)
console.log(`  private / access  : ${manifest.private} / ${manifest.publishConfig?.access}`)
console.log(`  files declared    : ${(manifest.files ?? []).join(', ')}`)

if (findings.length > 0) {
  console.log('\nfindings:')
  for (const finding of findings) console.log(`  - ${finding}`)
  process.exit(1)
}
console.log('\npackage OK: three names agree and the package is publishable')
