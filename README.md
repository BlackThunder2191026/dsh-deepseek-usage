# dsh-deepseek-usage

一个 DeepSeek Harness (dsh) 插件，做两件事：

1. **侧边栏余额**：在左下角「设置」旁边实时显示 DeepSeek 账户余额（默认每 60 秒刷新；点击可展开充值余额 / 赠送余额并手动刷新；侧栏收窄成图标栏时显示为彩色状态点）。
2. **每轮对话花费**：在每一轮对话底部的信息栏里额外显示**这一轮花了多少钱**，点击可展开三列明细（项目 / tokens / 单价）。

> 只适用于**官方 DeepSeek（`deepseek-official`）** 且在**带 Web 界面的 profile**（`desktop` 或 `web`）里使用。用其他 provider 时余额读不到、也不该按 DeepSeek 价目计价。

## 关于安装入口（曾踩过的坑）

部分第三方桌面客户端内置的「插件市场」有一条硬性边界：**只接受 `包名@精确版本` 这种 npm 目标**，`github:` 源、`file:` 路径、裸包名一律拒绝。遇到这种客户端时，市场的报错大致是：

> 这个桌面客户端只能安装已发布到 npm 的插件，而该插件仅提供 GitHub 源，因此装不了——这是客户端的安装边界，不是插件或市场的问题。可以改用普通 dsh web 安装，或请插件作者发布 npm 包。

**本插件现已发布到 npm**（`@blackthunder2191026/dsh-deepseek-usage`），因此这条边界不再是问题：用「方式一」或「方式二」都能装。如果市场仍报上面的错，说明你用的市场缓存了旧目录，或你点的是插件的 GitHub 条目而不是 npm 条目。

## 环境要求

| 项目 | 要求 |
|---|---|
| 操作系统 | Windows / macOS / Linux 均可（本插件不含平台相关代码，未使用任何平台专有 API） |
| dsh | 带 Web 界面的 profile（官方桌面版或 `dsh web`）；headless / SDK profile 没有 webserver，插件不会生效 |
| Node.js | ≥ 22.19（宿主读取余额用 `fetch` 与 `AbortSignal.timeout`） |
| DeepSeek 凭据 | 官方 provider 的 API Key，存在 `~/.dsh/.credentials.yaml` 的 `DEEPSEEK_API_KEY`，或同名环境变量 |
| 依赖 | **零运行时依赖**：host 半不 import 任何包，client 半只向 dsh 的模块表要 `react` |

## 安装

包名是 **`@blackthunder2191026/dsh-deepseek-usage`**（带 scope，因为 npm 上 `dsh-deepseek-usage` 已被无关项目占用）。

### 方式一：命令行从 npm 安装（推荐）

```sh
npx @deepseek-ai/dsh plugin --profile desktop add @blackthunder2191026/dsh-deepseek-usage
```

**装完重启 dsh。**

### 方式二：从图形插件市场安装

市场只会把 `包名@精确版本` 交给客户端，所以本插件**发布到 npm 之后**可以从市场一键安装——在市场的搜索框里找 `dsh-deepseek-usage`，或直接粘贴上面的完整包名。

> 如果你在市场里看到过「只能安装已发布到 npm 的插件，而该插件仅提供 GitHub 源」这样的提示，说明你用的是**本插件还没有 npm 版本时**的市场状态，或者你点的是插件的 GitHub 条目。请改用方式一，或先确认版本。

### 方式三：从 GitHub 源码安装（无需 npm）

```sh
npx @deepseek-ai/dsh plugin --profile desktop add github:BlackThunder2191026/dsh-deepseek-usage
```

pnpm 默认会拦截 Git 依赖的构建脚本。本插件**没有任何编译步骤**，但仍带一个 `prepare` 安装钩子（`tools/prepare.mjs`）用于完整性检查；若安装时被拦下，按提示在该 profile 的 `pnpm-workspace.yaml` 里加上：

```yaml
allowBuilds:
  '@blackthunder2191026/dsh-deepseek-usage': true
```

> ⚠️ `allowBuilds` 表示**允许该包的安装脚本在你的机器上执行**。本插件的钩子只做一件事：检查四个关键文件存在且非空，缺任何一个就拒绝安装——它不编译、不下载、不访问网络。**授权前请先读一遍 `tools/prepare.mjs`。** 想更稳妥可锁定 commit：`github:BlackThunder2191026/dsh-deepseek-usage#<sha>`。

### 方式四：从 Releases 下载 tarball（无需 Git、无需 npm、无需授权脚本）

每个版本都会在 [Releases](https://github.com/BlackThunder2191026/dsh-deepseek-usage/releases) 附上 `blackthunder2191026-dsh-deepseek-usage-<版本>.tgz`：

```sh
# 下载后在下载目录执行
npx @deepseek-ai/dsh plugin --profile desktop add ./blackthunder2191026-dsh-deepseek-usage-1.0.0.tgz
```

### ⚠️ 从旧版本（不带 scope 的 `dsh-deepseek-usage`）升级

包名换了，dsh 会把它当成**两个不同的插件**，同时装会让界面出现两套余额栏。升级前先移除旧包：

```sh
npx @deepseek-ai/dsh plugin --profile desktop remove dsh-deepseek-usage
npx @deepseek-ai/dsh plugin --profile desktop add @blackthunder2191026/dsh-deepseek-usage
# 然后重启 dsh
```

### 所有方式都要做的一步

**重启 dsh。** 包 manifest、`exports`、profile 的 bundle 列表都不参与热重载；只改 `lib/client.js` 时刷新页面即可，改了 `lib/index.js`（host 半）就必须重启。

## 验证安装是否成功

```sh
# 1) 装之前：包结构自检，不需要 dsh 在运行
npm run verify

# 2) 装好后：profile 里应出现该 bundle，且路由可访问
curl "http://127.0.0.1:<你的端口>/deepseek-usage/summary?debug=1"
```

第 2 步应返回 `{"ok":true,...,"balance":{...}}`，带 `debug=1` 时还会给出折叠诊断（是否找到会话、读了多少事件、算出多少轮）。`debug.diagnostics.reason` 是 `ok` 就说明这条链是通的。

**`npm run verify` 包含三个彼此独立的检查**，都不依赖你的 profile，也不发起网络请求：

| 脚本 | 检查什么 |
|---|---|
| `tools/verify-client.mjs` | 浏览器半能加载、两个 slot 注册成功、展开明细按真实 payload 渲染（含表头、单价、空值占位） |
| `tools/verify-render.mjs` | 用桩路由 + 每实例一套 hook 状态的桩 React，断言两个座位在真实数据下渲染正确（金额、tokens、未计价轮次文案、`TurnLocation` 形状兼容） |
| `tools/verify-composition.mjs --source` | 复刻 dsh 的解析链：manifest 的 `dsh.client` / `exports["./client"]` / 产物里的模块 id / bundle patch 的行 id 三者一致 |

维护者另外还有一条 `npm run selfcheck`：发布前扫描所有文件，检查是否混入本机绝对路径、用户名、疑似密钥，以及 `repository`/`homepage`/`bugs`/`author` 等发布元数据是否齐全。

## 排错

| 现象 | 原因与处理 |
|---|---|
| 图形市场里点安装失败，提示「只能安装已发布到 npm 的插件」 | 该客户端只接受 `包名@精确版本`。用「安装」方式一（npm）或方式四（tarball）；若仍报错，是市场缓存了旧目录 |
| 界面上出现两套余额栏 | 旧的 `dsh-deepseek-usage` 与新的 `@blackthunder2191026/dsh-deepseek-usage` 同时装着。见「从旧版本升级」一节 |
| 侧边栏没有余额行 | 该 profile 没有 webserver 或不是 Web 界面；或 host 半未激活。先看 `?debug=1` 有没有响应 |
| 余额显示不可用 | 没有 `DEEPSEEK_API_KEY`，或你用的不是官方 DeepSeek provider |
| 每轮只显示「本轮进行中，结束后计价」 | 该轮尚未结束（正常）；若显示「本轮未计价（宿主已算到第 N 轮）」则是异常，请反馈那一整行 |
| 启动时报 `declares no dsh.bundle` | 包没装全，或安装链接损坏；重新安装 |
| 安装时报 ENOENT 指向某 tgz | 你删掉了 profile 正在引用的 tarball；重新 `pnpm pack` 并按原路径放回，或重新安装 |
| 改了代码不生效 | host 半需重启 dsh；client 半需刷新页面（强刷 Ctrl+F5） |

## 维护者注：发布与续版

包名是 scope 形式（`@blackthunder2191026/dsh-deepseek-usage`），scope 不会与任何人冲突——npm 上无 scope 的 `dsh-deepseek-usage` 是无关项目，不能用那个名字。

```sh
npm login                     # 首次需浏览器认证
npm publish                   # publishConfig.access=public 已配置，scoped 包也会公开发布
```

**发布前必看**：`package.json` 的 `name`、`cordis.patch.yml` 里行的 `name`、`lib/client.js` 中 `__ModuleLoader__.load({ id })` 这三处必须是**同一个字符串**。任何一处不一致，要么插件根本不挂载，要么浏览器侧静默不加载（表现为侧边栏和对话底部都没有东西，且不报错）。`npm run selfcheck` 与 `npm run verify:package` 都会检查这一点。

续版流程：改 `version` → `npm run verify && npm run selfcheck` → `npm publish` → 打 tag 推 GitHub → 重新 `pnpm pack` 并把新 tgz 传到 Release。

## 计费口径

- 数据来自**会话日志里 provider 真实上报的 usage**（`assistant/message.usage`），不是界面上的估算值。
- 每轮按以下公式计价（价格单位：元 / 百万 tokens）：

  ```
  花费(CNY) = 未命中输入 × miss价
            + (缓存命中输入 + 缓存写入) × hit价
            + 输出 × output价
  ```

  价目表来自**官方中文定价页**（<https://api-docs.deepseek.com/zh-cn/quick_start/pricing/>），单位就是**元 / 百万 tokens**，与余额同币种。缓存写入按未命中价计。

  > 早期版本用的是**英文页的美元表**，再乘一个 `usdToCny`（我当时填 7.1）换成人民币。那是错的：中文页并不是英文页的固定换算——`0.02/0.003 = 6.6667`（Flash）而 `0.15/0.022 = 6.8182`（Pro），是**各自独立定价**。用 7.1 去折美元表，得到的数字官方两边都对不上（实测偏高约 6%）。现在直接采用中文页的元价，**插件里不再有任何汇率**。
- 高峰/低谷自动判断：高峰为**北京时间周一至周五 09:00–12:00 与 14:00–18:00**（即 01:00–04:00 与 06:00–10:00 UTC），其余时段（含周末）为低谷，费率为高峰的一半。中国法定节假日无法自动识别，那几天会按高峰计（偏高）。
- 花费与余额同为人民币，可直接相减；**没有任何汇率换算**。
- **只有已经结束的轮次才计价**（日志里 `turn/end` 已落盘）。进行中的这一轮显示「花费统计中…」，结束后自动出现金额。
- API Key 只在 Host 侧经 `ctx.credentials` 读取（`~/.dsh/.credentials.yaml` 的 `DEEPSEEK_API_KEY`，或同名环境变量），**不会下发到浏览器**；浏览器只请求同源的 `/deepseek-usage/summary`。

## 关于本机 profile 的两点提醒

> **必须重启 dsh 进程**：包 manifest、`exports`、profile bundle 列表都不参与热重载；只有同一路径下 `lib/client.js` 内容变化（配 `tsdown --watch` 之类 watcher）才走 client HMR。
>
> **tarball 方式安装后别删那个 tgz**：profile 的 `package.json` 会用 `file:` 指向它，删了它 pnpm 下次安装会报 ENOENT。

## 改配置

行 id 是 `deepseek-usage`。改配置走 profile 的 `cordis.patch.yml` —— **整段替换，不是深合并**，要重述全部需要的键：

```yaml
- id: deepseek-usage
  name: dsh-deepseek-usage
  config:
    apiKeyEnv: DEEPSEEK_API_KEY   # 凭据引用名，同时作为环境变量名
    baseURL: https://api.deepseek.com
    currency: CNY                 # 余额币种；价目表也用这个币种，不做换算
    balanceTtlMs: 30000           # 余额缓存时长
    defaultModel: deepseek-flash  # 价目表里没有的模型用哪一行
    maxTurns: 300                 # 单次返回的最大轮次数
    models:                       # 元 / 百万 tokens（官方中文定价页）
      deepseek-flash:
        hit:    { peak: 0.04, offPeak: 0.02 }
        miss:   { peak: 2,    offPeak: 1 }
        output: { peak: 8,    offPeak: 4 }
      deepseek-v4-pro:
        hit:    { peak: 0.3,  offPeak: 0.15 }
        miss:   { peak: 9,    offPeak: 4.5 }
        output: { peak: 27,   offPeak: 13.5 }
```

价格随 DeepSeek 官方调整而变，请对照 <https://api-docs.deepseek.com/zh-cn/quick_start/pricing/> 更新 `models`。**注意别用英文页的美元价**——两页不是固定汇率关系。

## 实现结构

| 文件 | 作用 |
|---|---|
| `lib/index.js` | Host 半：`GET /user/balance` 取余额；按会话日志折叠每轮 token 并计价；注册 `GET /deepseek-usage/summary` |
| `lib/client.js` | 浏览器半：手写 `window.__ModuleLoader__.load` 工厂（无构建步骤），注册 `sidebar.footer.action` 与 `conversation.chat.turnTail` 两个 slot |
| `cordis.patch.yml` | bundle 层：插入 `deepseek-usage` 行并带默认配置与价目表 |
| `tools/verify-client.mjs` | 用假 loader / 假 cordis context 跑 client bundle：断言两个 slot 注册、首屏渲染，并把一份价格化的轮次推过展开明细 |
| `tools/verify-render.mjs` | 起一个桩 `/deepseek-usage/summary` 路由 + 每实例一套 hook 状态的桩 React，断言两个座位渲染出真实 payload（金额、tokens、未计价轮次文案） |
| `tools/verify-composition.mjs` | 复刻 `client-modules` 的解析链：profile bundle 列表 → Loader 解析归属 manifest → `dsh.client` 声明与 `./client` 产物 → `inject` 依赖可解析 → patch 行 id/name/config 与 host 导出一致 |
| `tools/verify-turns.mjs` | 解压真实 `.jsonl.zstd` 会话日志（多帧 zstd）并打印逐轮折叠结果 |

Host 半的每轮折叠是 `@deepseek-ai/dsh-token-meter` 里 `deriveTurnTokenUsage` 的等价实现，差别在于它保留每次 attempt 各自的 `provider/model` 路由，因此混合模型的会话也能逐轮正确计价。

## 自检

```sh
pnpm run verify                                    # 三个套件，不需要 dsh 在运行
pnpm run selfcheck                                 # 发布前：泄露与元数据检查
pnpm run verify:package <解压后的 package 目录>     # 三名一致性（package/patch/client）
node tools/verify-turns.mjs "%USERPROFILE%\.dsh\sessions\<workspace>\<session>\session.v4.jsonl.zstd" 5
curl "http://127.0.0.1:<port>/deepseek-usage/summary?debug=1"
```

`?debug=1` 会额外返回折叠诊断（是否找到 Session、读了多少事件、算出多少轮），用于排查某轮为什么没有金额。

浏览器侧的座位契约也已在发布包源码里核对过：`sidebar` 用 `renderSlot("sidebar.footer.action", { wide })` 派发；slot 运行时 `renderEntry` 的 spread 顺序是 `kit → inject 结果 → slot 自己的 props → ownerProps`，所以 `inject: (sessionId) => ({ sessionId })` 拿到的就是该会话 id，而 `turn` 来自 owner props。

## 显示口径：只用余额币种

界面上不出现美元。每轮那一行只有一个金额胶囊：

```
本轮花费 ¥0.6111
```

点开后是三列表格（表头写明每一列是什么）：

```
项目         tokens        单价 / 百万
未命中输入    196,882       ¥2
缓存命中输入  1,251,840     ¥0.04
缓存写入      0             ¥2
输出          20,902        ¥8
其中思考      4,096
模型          deepseek-flash  高峰价
步数          7
```

- 单价直接取自官方中文页，**没有经过任何换算**，就是 `元 / 百万 tokens`；
- token 数按千分位显示；`其中思考` 是输出中属于思考模式的那部分；
- 想改成双币并列或其他排版，只需调整 `TurnBreakdown` 的渲染，`entry.rates`（`{ hit, miss, output }`）与 `entry.tokens` 都由 host 提供。

## 一个已修掉的坑：owner currency 的真实形状

`conversation.chat.turnTail` 的类型声明把 owner 的 `turn` 写成 `number`，但发布包里 `TurnTailNodeView` 实际转发的是它自己节点上的 `TurnLocation` **对象**：

```js
// dsh-client-ui-chat/lib/client.js:6512
const tail = renderSlot("conversation.chat.turnTail", {
  turn, seq: closing?.finalNode.seq ?? data.seq, openFile
})
```

早期版本直接 `data.turns[String(turn)]`，于是键变成 `"[object Object]"`，每一轮都查不到金额、全部显示「本轮进行中」。现在由 `turnNumberOf()` 统一解析（纯数字，或对象上的 `.turn`，或 `turn/start` 事件里兜底取），并把该分支的文案分成「轮次号解析失败」「本轮未计价」「本轮进行中」三种，各自带上解析出的轮次号与已计价轮次列表，便于一眼定位。

这类「类型声明与实际运行时形状不一致」的问题，只能靠回读页面上的诊断文案发现——`tools/verify-render.mjs` 现在会用 `TurnLocation` 形状重渲染同一轮，断言金额与纯数字一致，防止回归。

## 已知边界

- 余额接口不返回 token 明细，因此花费完全由本地价目表推算；DeepSeek 调整价格后需要手动更新配置里的 `models`。
- 中国法定节假日无法自动识别，那几天会被按高峰价计算（偏高）。
- 余额接口返回的币种若与 `currency` 不一致，会退化为接口返回的第一个币种；此时价目表的币种与余额不同，两者不能相减，金额仅作参考。
- 单次返回最多 `maxTurns`（默认 300）轮；更早的轮次不在响应里，会退化为「本轮进行中」提示。
- 单次返回最多 `maxTurns`（默认 300）轮；更早的轮次不在响应里，会退化为「本轮进行中」提示。
