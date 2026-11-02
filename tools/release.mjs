#!/usr/bin/env node
/**
 * 生成可直接交付的发布文件夹 release/。
 *
 * 内容：
 *   release/<name>-<version>.tgz   插件本体
 *   release/安装说明.md            这一版的安装与排错说明（含真实校验值）
 *
 * 为什么要有这一步：交付物需要「一个文件夹就够」，但 tarball 本身对非开发者不友好。
 * 校验值必须由脚本现算——手抄的哈希过一版就失效。
 *
 * 用法：npm run release
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const tarballName = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
const dist = join(ROOT, 'dist');
const release = join(ROOT, 'release');

console.log(`打包 ${pkg.name}@${pkg.version}`);

/**
 * 定位 npm 的 CLI 入口。
 *
 * 不要直接 spawn `npm.cmd`：Node 出于安全修复（CVE-2024-27980）已不再允许
 * 不带 shell 地执行 .cmd 批处理，会抛 spawnSync EINVAL。改成用当前 node
 * 执行 npm 自己的 .js 入口，既避开批处理，也不再依赖 PATH 里有没有 npm。
 */
const findNpmCli = () => {
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // 换下一个候选
    }
  }
  return null;
};

const npmCli = findNpmCli();
if (!npmCli) {
  console.error('error: 找不到 npm 的 CLI 入口，无法打包');
  process.exit(1);
}

// 1. npm 自己打一次包，确保产物就是 npm 会发布的那一份。
mkdirSync(dist, { recursive: true });
const packArgs = [npmCli, 'pack', '--pack-destination', dist];
// 受限环境（如沙箱）里默认缓存目录不可写时，用 NPM_CONFIG_CACHE 指到别处。
if (process.env.NPM_CONFIG_CACHE) packArgs.push('--cache', process.env.NPM_CONFIG_CACHE);
execFileSync(process.execPath, packArgs, { cwd: ROOT, stdio: 'ignore' });

const tarballPath = join(dist, tarballName);
const bytes = readFileSync(tarballPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const sha1 = createHash('sha1').update(bytes).digest('hex');
console.log(`  ${tarballName}  ${(bytes.length / 1024).toFixed(1)} kB`);
console.log(`  SHA256 ${sha256}`);
console.log(`  SHA1   ${sha1}`);

// 2. 组装交付文件夹。每次重建，避免残留上一个版本的 tgz 造成误解。
rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });
copyFileSync(tarballPath, join(release, tarballName));

const notes = `# dsh-deepseek-usage ${pkg.version} — 发布包

在 DeepSeek Harness 侧边栏显示 DeepSeek 账户余额，并在**每一轮对话底部**显示该轮花费。

本文件夹里的 \`${tarballName}\` 就是完整插件。

---

## 一、安装

### 方式 A：直接装这个文件（不依赖网络上的包，最稳）

在存放本 tgz 的目录里执行：

\`\`\`
npx @deepseek-ai/dsh plugin --profile desktop add ./${tarballName}
\`\`\`

\`--profile desktop\` 改成你实际用的 profile 名（官方桌面版就是 \`desktop\`；\`dsh web\` 用你自己的那个名字）。

### 方式 B：从 npm 装

\`\`\`
npx @deepseek-ai/dsh plugin --profile desktop add ${pkg.name}
\`\`\`

### 装完必须重启 dsh

不重启插件不会被加载，界面上不会出现任何东西。

---

## 二、从旧版本升级的必做一步

如果你之前装过**不带 scope** 的旧包（名字是 \`dsh-deepseek-usage\`），先把它移除，否则侧边栏会出现两套余额栏：

\`\`\`
npx @deepseek-ai/dsh plugin --profile desktop remove dsh-deepseek-usage
\`\`\`

---

## 三、前置要求

| 要求 | 说明 |
|---|---|
| 带 Web 界面的 profile | 官方桌面版，或 \`dsh web\` |
| 提供商 | 只支持 \`deepseek-official\`，且已配好 API Key |
| Node.js | ${pkg.engines?.node ?? '>=22.19'} |

插件零运行时依赖、无构建步骤，源码即产物；API Key 只在 Host 侧读取，不会下发到浏览器。

---

## 四、验证安装成功

重启后侧边栏底部应出现余额条目，点开可见余额明细；任意一轮对话结束后，该轮底部会出现「本轮花费」。

---

## 五、排错

| 现象 | 原因与处理 |
|---|---|
| 侧边栏没有余额 | 没重启 dsh；或 profile 不是 Web 类型 |
| 有余额但没有每轮花费 | 该轮还没结束（只对已结束的轮次计价）；或 provider 不是 \`deepseek-official\` |
| 出现两套余额栏 | 旧的 \`dsh-deepseek-usage\` 还在，按第二节移除 |
| 余额显示不出来 | 没配 \`DEEPSEEK_API_KEY\`，或 key 无效/欠费 |

---

## 六、计费口径

- token 数据取自会话日志里 provider 真实上报的 usage，不是插件自己估算
- token 价目表取自官方中文定价页，单位**元 / 百万 tokens**，与余额同币种，**插件内没有任何汇率换算**
- 高峰时段为北京时间周一至周五 09:00–12:00、14:00–18:00；其余时段（含周末）为低谷，费率减半
- **搜索/抓取自 2026-11-01 00:00 起按次计费**：Search 与 Fetch 各 5 元 / 1,000 次成功请求。插件按会话日志里可见的 DeepSeek 搜索请求计数，计入本轮花费
- 一次搜索请求内部可能执行多次原生搜索（上限 5），故该项偏低估；当前抓取未走该计费端点，未计入
- 中国法定节假日无法自动识别，那几天会按高峰计算（偏高）
- 只对**已结束**的轮次计价

---

## 七、文件校验

\`\`\`
SHA256   ${sha256}
SHA1     ${sha1}
\`\`\`

Windows 上核对：

\`\`\`
certutil -hashfile ${tarballName} SHA256
\`\`\`
`;

writeFileSync(join(release, '安装说明.md'), notes, 'utf8');

console.log(`\nrelease/ 已生成：`);
console.log(`  ${tarballName}`);
console.log(`  安装说明.md`);
