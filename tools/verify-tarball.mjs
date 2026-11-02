#!/usr/bin/env node
/**
 * 校验打包好的 tarball：三个名字是否一致、内容是否与当前源码相同。
 *
 * 用途：发布前确认 dist 里的 tgz 就是当前源码的产物。只按文件名看，
 * 分辨不出一份过期的旧产物。
 *
 * 用法：node tools/verify-tarball.mjs [tarball 路径]
 *       省略路径时自动取 dist/ 下与 package.json 版本匹配的那一个；
 *       没有就跳过并返回 0，因为克隆仓库的人手上本来就没有 dist。
 *
 * 自己解 tar，不依赖 tar 命令，也不写任何临时文件。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const tarballName = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
let tarballPath = process.argv[2];
if (!tarballPath) {
  const dist = join(ROOT, 'dist');
  let names = [];
  try {
    names = readdirSync(dist);
  } catch {
    names = [];
  }
  if (!names.includes(tarballName)) {
    // 还没打包时不应该让 `npm run verify` 失败：克隆仓库的人手上就是没有 dist。
    console.log(`skip: dist/${tarballName} 不存在，尚未打包`);
    console.log('      需要校验已打包产物时先运行：npm run release');
    process.exit(0);
  }
  tarballPath = join(dist, tarballName);
}

let raw;
try {
  raw = readFileSync(tarballPath);
} catch (error) {
  console.error(`error: 读不到 tarball：${tarballPath}`);
  console.error(`       ${error.code ?? error.message}`);
  process.exit(1);
}

/** 极简 tar 解析：只处理 npm 生成的普通文件条目。 */
const entries = new Map();
{
  const buf = gunzipSync(raw);
  let offset = 0;
  let pendingLongName = null;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const str = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim();
    const name = pendingLongName ?? str(0, 100);
    pendingLongName = null;
    const size = parseInt(str(124, 12) || '0', 8);
    const prefix = str(345, 155);
    const type = str(156, 1);
    const full = prefix ? `${prefix}/${name}` : name;
    const dataStart = offset + 512;
    if (type === 'L') {
      pendingLongName = buf.subarray(dataStart, dataStart + size).toString('utf8').replace(/\0.*$/, '');
    } else if (type === '' || type === '0') {
      entries.set(full, buf.subarray(dataStart, dataStart + size));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
}

if (entries.size === 0) {
  console.error('error: 没解析出任何文件条目，tarball 可能损坏');
  process.exit(1);
}

const get = (relative) => entries.get(`package/${relative}`);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const text = (relative) => {
  const buffer = get(relative);
  if (!buffer) throw new Error(`tarball 里缺少 ${relative}`);
  return buffer.toString('utf8');
};

const manifest = JSON.parse(text('package.json'));
const patch = text('cordis.patch.yml');
const client = text('lib/client.js');

const patchName = /^\s*name:\s*['"]?([^'"\n#]+?)['"]?\s*$/m.exec(patch)?.[1];
const idBlock = /__ModuleLoader__\.load\(\{([\s\S]*?)\bfactory:/.exec(client)?.[1];
const registeredId = idBlock === undefined ? undefined : /id:\s*"([^"]+)"/.exec(idBlock)?.[1];

console.log(`tarball           : ${tarballPath}`);
console.log(`bytes / sha1      : ${raw.length} / ${createHash('sha1').update(raw).digest('hex')}`);
console.log(`sha256            : ${createHash('sha256').update(raw).digest('hex')}`);
console.log(`integrity         : sha512-${createHash('sha512').update(raw).digest('base64')}`);
console.log('');
console.log(`package.json name : ${manifest.name}`);
console.log(`patch row name    : ${patchName}`);
console.log(`client module id  : ${registeredId}`);
console.log(`version / private : ${manifest.version} / ${manifest.private}`);
console.log(`files in tarball  : ${[...entries.keys()].map((k) => k.replace(/^package\//, '')).sort().join(', ')}`);
console.log('');

const findings = [];
if (patchName !== manifest.name) findings.push(`patch row name "${patchName}" != package name "${manifest.name}"`);
if (registeredId !== manifest.name) findings.push(`client module id "${registeredId}" != package name "${manifest.name}"`);
if (manifest.name !== pkg.name) findings.push(`tarball 内包名 "${manifest.name}" != 工作区 package.json 的 "${pkg.name}"`);
if (manifest.version !== pkg.version) findings.push(`tarball 版本 "${manifest.version}" != 工作区版本 "${pkg.version}"`);
if (manifest.private === true) findings.push('private: true 会导致无法发布');
if (manifest.publishConfig?.access !== 'public') findings.push('publishConfig.access 不是 "public"');

/**
 * package.json 不能按字节比：npm 打包时必然删掉 prepare / prepack 这两个生命周期
 * 脚本（避免安装时被执行），并按自己的顺序重排键，所以两者永远不同。这里比对象，
 * 剔除这两个键后按键名排序递归比较，避免把「键序不同」误报成内容不同。
 */
const STRIPPED_SCRIPTS = ['prepare', 'prepack'];
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
const normalize = (value) => {
  const copy = JSON.parse(JSON.stringify(value));
  if (copy.scripts) {
    for (const key of STRIPPED_SCRIPTS) delete copy.scripts[key];
    if (Object.keys(copy.scripts).length === 0) delete copy.scripts;
  }
  return copy;
};

console.log('与当前源码比对：');
for (const relative of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
  const inTarball = get(relative);
  if (!inTarball) {
    findings.push(`tarball 里缺少 ${relative}`);
    console.log(`  缺失       ${relative}`);
    continue;
  }
  let onDisk;
  try {
    onDisk = readFileSync(join(ROOT, relative));
  } catch {
    findings.push(`工作区缺少 ${relative}`);
    console.log(`  工作区缺失 ${relative}`);
    continue;
  }
  const same = sha256(inTarball) === sha256(onDisk);
  if (!same) findings.push(`${relative} 与工作区不一致（tarball 是旧产物，需重新打包）`);
  console.log(`  ${same ? '一致      ' : '不一致    '} ${relative}`);
}

{
  const inTarball = JSON.parse(text('package.json'));
  const onDisk = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const stripped = STRIPPED_SCRIPTS.filter(
    (key) => onDisk.scripts?.[key] !== undefined && inTarball.scripts?.[key] === undefined,
  );
  const same = canonical(normalize(inTarball)) === canonical(normalize(onDisk));
  if (!same) findings.push('package.json 除生命周期脚本外仍有差异（tarball 是旧产物，需重新打包）');
  const note = stripped.length > 0 ? `（npm 打包时移除 ${stripped.join(' / ')}，属正常）` : '';
  console.log(`  ${same ? '一致      ' : '不一致    '} package.json ${note}`);
}

if (findings.length > 0) {
  console.log('\nfindings:');
  for (const finding of findings) console.log(`  - ${finding}`);
  process.exit(1);
}
console.log('\ntarball OK: 三个名字一致、内容与当前源码完全相同');
