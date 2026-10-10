/**
 * Pre-publish self-check for this repository.
 *
 * Public repositories are forever, and the two things that leak most often are
 * machine-specific paths and personal identifiers. This script walks the
 * package tree (skipping what `.gitignore` excludes), scans every text file for
 * leak shapes, and then verifies the metadata a published package needs.
 *
 * It deliberately uses no `git` subprocess and no shell: it must run on any
 * machine, including one where Git is not on PATH.
 *
 * Usage: node tools/selfcheck.mjs
 * Exit code is non-zero on any blocking finding, so it can gate a release.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The account these files are published under; anything else is a finding. */
const EXPECTED_OWNER = 'BlackThunder2191026'
const EXPECTED_REPO = 'dsh-deepseek-usage'

/** Directories that are never part of the published source. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.plugin-manager', '.idea', '.vscode'])

/** Extensions worth reading as text; anything else is skipped as binary. */
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md', '.txt', '.ts', '.html', '.css', ''])

/** Patterns whose presence in a published file is a leak, not a style issue. */
const LEAK_PATTERNS = [
  [/[A-Za-z]:\\Users\\[^\\\s"']+/g, 'absolute Windows user path'],
  [/\/Users\/[A-Za-z0-9._-]+\//g, 'absolute macOS user path'],
  [/\/home\/[A-Za-z0-9._-]+\//g, 'absolute Linux home path'],
  [/sk-[A-Za-z0-9]{16,}/g, 'credential-shaped secret'],
  [/gh[pousr]_[A-Za-z0-9]{16,}/g, 'GitHub token'],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/g, 'bearer token'],
  [/api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]{16,}["']/gi, 'inline API key'],
  [/DEEPSEEK_API_KEY\s*[:=]\s*["']?sk-/g, 'inline DeepSeek key'],
]

/**
 * This file has to name the patterns it forbids, so it would always match
 * itself; it is the one exemption.
 */
const SELF = relative(packageRoot, fileURLToPath(import.meta.url)).replace(/\\/g, '/')

/** Required metadata for a linkable public package. */
const REQUIRED_METADATA = ['name', 'version', 'description', 'license', 'repository', 'homepage', 'bugs', 'author']

/** Collect every publishable text file under the package root. */
function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectFiles(path, out)
      continue
    }
    if (!entry.isFile()) continue
    if (!TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue
    out.push(path)
  }
  return out
}

const files = collectFiles(packageRoot).map((path) => relative(packageRoot, path).replace(/\\/g, '/')).sort()
const findings = []
const notes = []

for (const relativePath of files) {
  if (relativePath === SELF) continue
  const lines = readFileSync(join(packageRoot, relativePath), 'utf8').split('\n')
  for (const [pattern, label] of LEAK_PATTERNS) {
    for (const [index, line] of lines.entries()) {
      const matches = line.match(pattern)
      if (matches) findings.push(`${relativePath}:${index + 1}: ${label} -> ${matches[0].slice(0, 60)}`)
    }
  }
}

// A placeholder that survived into the published README is a defect: the
// documented install command would point at somebody else's account. Only the
// literal placeholder forms count — prose about an "owner" prop is not one.
const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8')
for (const [index, line] of readme.split('\n').entries()) {
  if (/\bOWNER\b/.test(line)) findings.push(`README.md:${index + 1}: unresolved OWNER placeholder -> ${line.trim()}`)
  if (/<你的用户名>|<your-username>|<owner>/i.test(line)) {
    findings.push(`README.md:${index + 1}: unresolved owner placeholder -> ${line.trim()}`)
  }
}
if (!readme.includes(EXPECTED_OWNER)) findings.push(`README.md never mentions the publishing account ${EXPECTED_OWNER}`)

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
for (const key of REQUIRED_METADATA) {
  if (manifest[key] === undefined) findings.push(`package.json: missing "${key}"`)
}

// The names dsh keys on must agree, or the plugin mounts nothing.
//
// The row `name` is read with a YAML-tolerant pattern rather than a single
// literal: a scoped package name is conventionally quoted in YAML, so the check
// must accept both `name: x` and `name: 'x'`, and it must not build a RegExp out
// of the name (a scope separator would change its meaning).
const patch = readFileSync(join(packageRoot, 'cordis.patch.yml'), 'utf8')
const patchName = /^\s*name:\s*['"]?([^'"\n#]+?)['"]?\s*$/m.exec(patch)?.[1]
if (patchName === undefined) findings.push('cordis.patch.yml declares no row name')
else if (patchName !== manifest.name) {
  findings.push(`cordis.patch.yml names "${patchName}" but the package is "${manifest.name}"`)
}
if (!patch.includes('id: deepseek-usage')) findings.push('cordis.patch.yml does not insert the expected row id')

// The client bundle registers itself under the package name; the module system
// serves the row keyed by that name, so a mismatch leaves the browser half
// silently unloaded instead of failing loudly. The id may be preceded by
// comments, so scan for the first `id:` string literal instead of anchoring.
const clientSource = readFileSync(join(packageRoot, manifest.exports?.['./client'] ?? 'lib/client.js'), 'utf8')
const moduleIdBlock = /__ModuleLoader__\.load\(\{([\s\S]*?)\bfactory:/.exec(clientSource)?.[1]
const registeredId = moduleIdBlock === undefined ? undefined : /id:\s*"([^"]+)"/.exec(moduleIdBlock)?.[1]
if (registeredId === undefined) findings.push('client bundle registers no module id')
else if (registeredId !== manifest.name) {
  findings.push(`client bundle registers "${registeredId}" but the package is "${manifest.name}"`)
}

// Generated output must never be tracked: a Git install builds from source.
if (files.some((path) => path.startsWith('dist/'))) findings.push('a dist/ artifact is present; it must stay out of the published tree')

if (manifest.private !== true) {
  notes.push('package.json has private: false — this package is publishable; run npm publish only when intended')
}
if (manifest.repository?.url?.includes(EXPECTED_OWNER) === false) {
  findings.push(`package.json repository does not point at ${EXPECTED_OWNER}/${EXPECTED_REPO}`)
}

console.log(`scanned ${files.length} files for ${EXPECTED_OWNER}/${EXPECTED_REPO}`)
if (notes.length > 0) {
  console.log('\nnotes:')
  for (const note of notes) console.log(`  - ${note}`)
}
if (findings.length > 0) {
  console.log('\nblocking findings:')
  for (const finding of findings) console.log(`  - ${finding}`)
  console.error('\nself-check FAILED')
  process.exit(1)
}
console.log('\nself-check OK: no leaked paths or secrets, metadata complete')
