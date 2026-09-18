# FC 项目总约定

本项目用于采集足球与FC27资讯、研究FC27市场，并生成一个日期化日报与固定汇总站点。`apps/`只放四个业务任务（另有 2026-09-16 拆出的传奇/英雄卡监控任务，复用 market 引擎），`shared/`保存可被各任务和 WorkBuddy 共同调用的配置与代码，`automation/`只负责编排和运行状态，`reports/`只保存最终产物。项目已从 DuMate 迁移到 WorkBuddy，发布统一走 WorkBuddy 站点发布能力。

进入子目录工作前继续读取该目录最近的 `AGENTS.md`；子目录规则补充本文件。不要把共享实现复制到多个任务，先判断能否放入 `shared/`。

## 浏览器强制规则（所有任务每次执行必须读取）

凡任务需要浏览器，一律通过 **Web Access（浏览器自动化）技能**完成：CDP Proxy(:3456) 直连**独立调试 profile Chrome**（`Chrome-FC-Debug`，端口 9333，零授权弹框）。这是本项目**唯一**可用且被授权的浏览器通道。

> **2026-09-18 起**：采集通道已从「日常 Chrome + chrome://inspect 开关模式」切换到「独立调试 profile」（零弹框）。原因：开关模式每建立一条 DevTools 连接就弹一次「要允许远程调试吗？」，无人值守自动化任务无法点弹框 → 阻塞约 30 秒后失败。独立 profile 彻底免弹框。详见下文「独立调试 profile」一节。

### 不要再使用「Chrome 插件 / extension 模式」

Chrome 里那个 WorkBuddy 扩展（`ajnnogdfpilbhkeggdjlcokgglijmdde` v0.2.3）**永远连不上，属产品侧缺口**：它唯一的传输是 `chrome.runtime.connectNative("com.workbuddy.extension")`，而 WorkBuddy 桌面端 v5.5.6 并未实现该 native messaging 宿主（逐字节扫描 `app.asar` 后 `connectNative` / `NativeMessaging` / `com.workbuddy.extension` / 扩展 ID 命中数全为 0；三个浏览器的 `NativeMessagingHosts/` 里只有 ChatGPT 的宿主）。该扩展已在用户机器上**禁用**。不要再为它做任何排查、注册或配置，不要再把「插件未连接」当作本项目的失败原因。

### 前置自检（每次采集前必跑，唯一判据）

```bash
node automation/browser-triage.mjs      # 只读 + 有界自愈；exit 0 才继续
```

`browser-triage.mjs` 是**有界**的（健康约 1 秒，失败最坏约 85 秒）：内部先跑 check-deps（预算 40s）→ 失败时执行 `open -a "Google Chrome"` 一次 → 再复测一次 → 仍失败即判定需人工介入。

**不要把 `check-deps.mjs` 当第一判据**：它失败时固定耗时约 2m17s；2026-09-18 07/08/09 三轮小时任务因反复复跑它 + 反复重启代理，每轮空耗约 7 分钟且结论不变。

| 分诊结论 | 含义 | 处置 |
|---|---|---|
| `OK` | 通道可用（独立 profile 9333） | 继续采集 |
| `OK_RECOVERED` | 经「拉起独立 profile」自愈后恢复 | 继续采集，并在最终回复注明本轮发生了自愈 |
| `TOGGLE_OFF` | 独立 profile（9333）无监听，被回收/退出 | `node automation/start-debug-profile.mjs` 拉起（零弹框，无需人工） |
| `CHANNEL_UNSERVING` | 独立 profile 已监听但通道不可用，自愈无效 | `node automation/start-debug-profile.mjs --restart` 重启；本轮 `failed` 留证 |
| `CONFIG_MISSING`（退出码 2） | `config.env` 的 `WEB_ACCESS_BROWSER` 为空 | 固化为 `chrome` |

### 故障判定红线（2026-09-18 实测定案，务必遵守）

**唯一可用性判据是 `browser-triage.mjs` 的退出码**（内部封装 check-deps；独立 profile 9333 下 `triage OK` = 通道健康）。三条红线（违反即重犯 07/08/09 三轮的 7 分钟空转）：

1. **不得用 `check-deps.mjs` 当第一判据或反复复跑**（失败时每轮固定约 2m17s，结论不变）。
2. **不得 `pkill -f cdp-proxy.mjs` 后反复重试**（实测 4 个独立代理实例同样失败，无效且打断健康代理；仅 `browser-triage --allow-proxy-restart` 允许重启一次）。
3. **不得 kill / 重启用户日常 Chrome**（会中断用户会话）；独立调试 profile Chrome 可以重启（不影响日常 Chrome，零弹框）。不得用旧日期或 FC26 快照填充当日结果。

> 旧「开关模式」（日常 Chrome + chrome://inspect，端口 9222）已废弃：其 `/json/version`、`/json/list`、`/` 返回裸 404 属正常表现、不是故障；带 URL 的 `open -a "Google Chrome" chrome://inspect/...` 返回 `-10820` 完全空转；每次新建 DevTools 连接都弹「要允许远程调试吗？」且授权无法持久化（Chrome 官方 won't-fix，chrome-devtools-mcp #825）。**这些概念在独立 profile 架构下不再适用，仅供排查「误回退到开关模式」时参照，不得据此写诊断。**

### 独立调试 profile（2026-09-18 已定案启用，无人值守零弹框）

彻底免弹框的唯一已知路径已**正式启用**：用**非默认** `--user-data-dir` + `--remote-debugging-port=9333` 启动独立调试 profile（社区实测零弹窗）。相关坑：Chrome 136+ 在默认 user-data-dir 下**静默忽略**该 flag；Chrome 147+ **不再**为自定义 profile 写 `DevToolsActivePort`（所以代理发现走 `CDP_DEBUG_PORT` 环境变量直连 + `/json/version` 取 wsPath，见下）。

**当前通道架构**（与旧的「开关模式」完全不同）：

| 项 | 值 |
|---|---|
| 采集浏览器 | 独立调试 profile（`~/Library/Application Support/Google/Chrome-FC-Debug`），端口 **9333** |
| 启动方式 | `node automation/start-debug-profile.mjs`（`spawn detached` 常驻；**不要用 `nohup &` 或 `run_in_background`，会被沙箱回收**） |
| 代理发现 | `config.env` 的 `CDP_DEBUG_PORT=9333`；`check-deps.mjs` 读它跳过 toggle 发现，`cdp-proxy.mjs` 直连 9333 并从 `/json/version` 取浏览器级 wsPath |
| 授权弹框 | **无**（独立 profile 不触发「要允许远程调试吗？」） |
| 保活 | `cdp-proxy.mjs` 内置 `Browser.getVersion` 心跳（`CDP_KEEPALIVE_INTERVAL` 默认 60s），维持 WS 长连接 |

**红线（新）**：
1. **日常 Chrome 不再作为采集通道**——它若开着 `chrome://inspect` 开关仍会占 9222 并弹框，建议用户手动取消勾选该开关（不影响采集，采集走 9333 独立 profile）。
2. **独立 profile 是唯一采集通道**，不得回退到开关模式（会弹框）。
3. 独立 profile 无日常登录态——**FUTBIN/X 等站点需在独立 profile 里重新登录一次**（用户手动完成）。
4. `start-debug-profile.mjs` 是独立 profile 的唯一启动入口；`browser-triage.mjs` 在独立 profile 模式下自愈动作 = 拉起独立 profile（而非「激活日常 Chrome」）。

> **已定案（2026-09-18 12:10）**——用户确认「自动化任务无人值守，弹框没人点会失败」。
> 采用**独立调试 profile** 方案（候选③），彻底零弹框。用户负责在独立 profile 手动登录 FUTBIN/X。
> 候选②「自动点允许助手」未采用（需辅助功能权限 + 安全影响）。

### 禁止的入口（一律不调用、不探测）

`dumate-browser-cli`、`automation/browser-env.sh`、`DUMATE_*` 环境变量、`127.0.0.1:19228` relay、`127.0.0.1:19222`（旧 `--user-data-dir` 独立 profile 端口，**已废弃**，现独立 profile 用 9333）、`agent-browser`、内置浏览器（IAB）、未登录浏览器、临时浏览器。这些项目的缺失**不能**作为浏览器失败证据。旧 DuMate 适配脚本只作历史兼容。

**唯一例外**：上述「独立调试 profile」（`Chrome-FC-Debug` + 9333）是**已批准的采集通道**，不属于「禁止的新建 profile」。

### 失败处置

通道本身不可用、或实际来源页无法打开/读取时，才把对应采集步骤标为 `failed`/`partial` 并留证（记录尝试的 URL、打开时间、错误摘要）。**不得**回退到上述禁止通道，**不得**用旧日期、FC26 或其他来源的旧快照填充当日结果。失败页面必须明确区分「采集失败」与「本日无数据」。纯本地合并任务不得为了「检查」而打开任何浏览器。

> 自检与修复流程详见本文件上方步骤；历史探针技能 `fc-browser-channel-check` 已作废，**不要调用**（它调用的 `dumate-browser-cli` 等入口都在禁止清单里）。

### 来源页取数失败 ≠ 通道故障（2026-09-18 实测定案，务必区分）

**先看 `browser-triage.mjs` 的结论再定性**：它报 `OK`（`checkDepsExit=0` 且 `proxy: ready`、9333 有监听）时，浏览器通道就是健康的，此时来源页采不到数据（如 FUTBIN 热门榜 0 卡、`/27/players` 403、进化榜价格单元格未渲染）**属来源页侧临时拦截/渲染延迟，不是浏览器问题**，不要因此去重启代理、重启 Chrome 或折腾调试开关。

- **FUTBIN 分钟级滚动拦截的典型形态**（2026-09-18 13 点 market-hourly 实测）：通道 `OK`，但 `/27/popular` 两次导航（含 45 秒退避重试）都在等待窗口内未出现卡片元素、0 卡采到。这是**临时形态**，脚本内置退避重试已穷尽后如实留证即可；下个整点重跑通常自动恢复（14 点重跑首轮即成功 250 张）。
- **正确处置**：留证（`hourly-<HH>-failed.json`）后保留上次有效结果，等下一轮自动恢复；**不要**为「修复浏览器」去动代理、Chrome、profile 或禁止入口。只有 `browser-triage` 本身报 `TOGGLE_OFF` / `CHANNEL_UNSERVING` / `CONFIG_MISSING` 才按上方分诊表处置通道。
- **判别口诀**：`triage OK` = 通道健康、问题在来源页（临时、等下轮）；`triage 非 OK` = 通道问题、按分诊表修复通道。

## FUTBIN 平台口径强制规则（市场监控 / 传奇英雄监控 每次采集必须遵守）

**FUTBIN 只提供 Console（PS / Xbox 合并）与 PC 两个市场口径，不存在「Xbox 独立」「PS 独立」第三档平台。两个平台都必须采集，缺一不可。**

### 页面结构（2026-09-16 实机核验）

| 要素 | 实测结果 |
|---|---|
| 每行价格单元格 | `td.table-price.platform-ps-only`（Console）与 `td.table-price.platform-pc-only`（PC）**同时存在于同一行 DOM** |
| 平台按钮 | `form.desktop-platform-change-form` 内 `button value="ps"`（文案 Console）/ `button value="pc"`（文案 PC） |
| 按钮行为 | **纯前端显隐切换**：默认 Console 单元格 `display:table-cell`、PC 为 `display:none`；点击后互换。**不刷新页面、不改 URL、不重新取数** |
| `td.table-item-score` | 开服前**估值列**（IS），**不是**平台成交价 |
| 开服日 | `launchDate = 2026-09-25`。**开服前两平台价是否全为 0 不是恒定前提**（2026-09-17 实测已推翻）：FUTBIN 会在正式开服前开始对部分卡滚动更新平台价，此时 `market.json` 的 `priceBasis` 变为 `partial-live`（当日 750 人中 Console 有价 207、PC 有价 206；仍为 0 的按占位处理、页面标「估值」）。**每次以当日实测的 `priceBasis` 为准，不要照抄「均为 0」**；无论哪种口径都仍不计算日环比与累计涨跌（昨日基线全 0 时无可比值）。 |

### 采集规则

1. **一次打开列表页即可同时读到两个平台价** —— 直接从 DOM 分别读两个价格单元格。不要为切换平台重复导航，不要截图后肉眼读数。
2. **不要依赖 URL 查询参数分平台**：`ps_price=` / `pc_price=` 在开服前筛选失效；`rarity=` / `version=` 被服务端忽略（实测 `?rarity=icon`、`?rarity=hero`、`?version=icons` 返回同一批默认列表；`?version=base_icon` / `?version=heroes` 直接导航返回 0 行空表，属站内 JS 状态依赖，**不要走这条路线**）。**但 `page` 翻页参数在会话建立后有效**（2026-09-17 实测，每页 30 行、评分降序）。Icon / Hero 名单的最可靠判据是页面 `td.table-name` 的版本标签（`Icon` / `Base Heroes` / `Debut Icon`），配全量列表翻页 + 台账比对归属。
3. **分别落库**：市场任务写 `players[].psPrice`（Console）/ `players[].pcPrice`（PC）；传奇英雄任务写逐卡 `platforms.console` / `platforms.pc`（`{price, valid}`）。**不得只采 Console 漏 PC，也不得用一个平台价顶替另一个**；某平台确无数据时如实留空。
4. 顶层 `platform` 写 `"console+pc"`，**不要**再用 `"cross"` 当平台名（`cross` 只是原始抓取里 Console 的别名）。
5. 价格 < 1000 视为占位值（`valid=false`）；开服前 `priceBasis=listing-estimate`，**不得**把估值当成交价，**不得**计算日环比与累计涨跌。
6. 渲染侧已就绪：`render-market-overview.mjs` / `render-market-report.mjs` / `render-market-icons.mjs` 都会为每个平台输出独立价格单元格并在页顶生成 Console / PC 切换按钮；采集侧只要把两个平台价如实写进 JSON 即自动生效，**不要手改 HTML**。

## 中文译名强制规则（市场监控 / 进化专栏 / 传奇英雄监控 每次生成必须遵守）

**站点面向中文读者，球员名一律「英文原名 + 中文译名」并列输出，不允许整页只有英文。** 译名走**持久词库 + 每日自动注入**，不要在渲染器里硬编码、也不要手改 HTML。

- 词库：`apps/market/engine/data/players/name-zh-supplement-fc27.json` 的 `mappings`（键 = FUTBIN slug，值 = 中文）。**只增不改，禁止删改既有条目，禁止写入空字符串占位**（空值会被「先到先得」逻辑视为已存在，导致该名永久失配）。
- 注入器：`node apps/market/engine/scripts/apply-market-name-zh.mjs D`（市场默认注入 `automation/runs/D/market/market.json`）；进化专栏加 `--file automation/runs/D/evolution/evolution.json`。它合并 6 个译名来源，按 **URL 全名 slug → 姓名 slug** 匹配，就地写 `nameZh`，并把未命中清单写到 `automation/runs/D/market/work/missing-name-zh.json`。
- **每个任务负责把自己当日未命中清单译完**（在预算内），追加到词库后重跑注入器直到 `未命中 0`。无法确定汉字的名字保留英文并记入 `missing`，不得猜测填充。
- 渲染侧已就绪（**不要手改 HTML**）：`render-market-overview.mjs` / `render-market-report.mjs` / `render-evolution.mjs` 输出 `<span class="zh">`；`render-icons-heroes.mjs` 输出「中文名 + `<span class="en">`英文名」。扫描页内嵌 JSON 带 `nameZh`，搜索框同时匹配中英文。
- **资讯（news）同理必须全中文**：每条推文都要有完整中文译文，由执行 AI 写入 `apps/news/data/translations-D.json`（键 = 推文 ID），`generate_report.mjs` 优先取该文件。**旧的 DuMate 千帆代理 / `apps/news/.api_key` 通道已废弃**，不要依赖；提交前 `reports/daily/D/news.html` 的「待翻译」计数必须为 0。

## 球员头像强制规则（市场概览 / 市场扫描 / 进化专栏 / 传奇英雄监控 每次生成必须遵守）

**站点上所有出现球员姓名的表格，姓名单元格前必须带头像。** 头像由**渲染器自动解析 + 合并期内联**，不要在 HTML 里手写图片路径，也不要内联 base64 到渲染器输出里。

### 头像键与图片库

- 图片库：`shared/data/fc27/images/<头像键>.png`（160×160 PNG，由 `apps/market/engine/gold/src/download-fc27-images.mjs` 从 `cdn.futbin.com/content/fifa27/img/players/<键>.png` 本地化而来）。
- **头像键 = EA resourceId，不是 FUTBIN 卡页 URL 里的 cardId**（实测：2697 张图与 canonical `resourceId` 交集 2697/2697，与 `cardId` 交集仅 15/2697）。FUTBIN 对没有 EA 头像的球员会给自绘人像，键形如 `p<数字>`（CDN 走 `cdn3.futbin.com`），同样按「文件名 = 头像键」入库。
- 解析与落盘唯一入口：`shared/lib/player-avatar.mjs`
  - `loadAvatarIndex()` / `avatarIndex()`：合并 7 个本地索引源（canonical、detail-v2 原始抓取、EasySBC le83、球员数据库、EasySBC 金价表、player-index、增量补全索引），只收录**本地确实有图**的键。
  - 匹配顺序：**cardId → URL slug → 姓名 → 中文名 → 姓氏词元（多义即放弃）**；任何一步出现多个不同头像键都返回 null，**宁可缺图，不可配错人**。
  - **姓氏词元兜底有双向一致性守卫（2026-09-17 新增，务必保留）**：候选头像键必须与条目在姓名词元上「双向包含任一成立」（条目的全部词元都出现在该键登记过的姓名里，或反过来），两个方向都不成立即视为**同姓不同人**、直接放弃。加这道守卫前，只按「姓」兜底会稳定配错人——实测 `Oh Hoo Sung` 与 `Cho Gue Sung` 被解析到同一张图、`Ethan Mbappé` 命中 Kylian Mbappé、`Micah Richards` 命中 Chris Richards。**任何"提高覆盖率"的放宽都必须以不引入这类错配为前提。**
  - `materializeAvatars(reportDir, keys)`：用系统自带 `sips` 批量缩放到 48×48 并写入 `<reportDir>/assets/players/`（幂等，已存在且比源图新则跳过；sips 不可用时退化为复制原图）。
  - `avatarSrc(key)` → `assets/players/<key>.png`。
- **落盘路径必须是报告目录下的 `assets/players/`**：`merge_daily_report.mjs` 会 `cpSync` 当日 `reports/daily/D/assets` 进隔离目录，`shared/lib/report-assets.mjs#inlineLocalReportImages` 只把以 `assets/` 开头的路径内联成 data URL。写成 `shared/…`、绝对路径或 `data:` 之外的任何形式，合并成单文件站点后都会断链。
  - 该内联函数有**两遍**：第一遍处理 `<img src="assets/…">`；第二遍处理带引号的 `"assets/…"` 字符串——市场扫描页的头像在 `<script type="application/json" id="db-data">` 数据块里，由前端 JS 拼 `<img>`，只有第二遍能覆盖它。改这个函数时两遍都要保留。
- 渲染侧已就绪（**不要手改 HTML**）：`render-market-overview.mjs`、`render-market-report.mjs`、`render-evolution.mjs`、`render-market-icons.mjs`、`render-icons-heroes.mjs` 均在 `.c-name` 单元格输出 `<img class="pimg" loading="lazy">`；解析不到头像的条目**如实不显示图片**，禁止用其他球员的图、FC26 图或占位图顶替。各页头如实标注「球员头像 X/Y」。

### 跨代（FC26）数据一律不配头像（2026-09-17 固化）

`icons-heroes.html` 的「七、FC26 英雄卡参考对比」区**禁止出头像**，`render-icons-heroes.mjs` 里对该区显式返回空。

- 原因：**FC26 的 FUTBIN 卡 ID 与 FC27 头像库不同源**，把 FC26 卡 ID 丢进 FC27 索引会命中「同数值卡 ID」或「同姓」的另一个人。2026-09-17 实测 82 张里至少 6 张配错（Ledley King→Joshua King、Micah Richards→Chris Richards、Jill Scott→Alex Scott、Seydou Doumbia→Kamory Doumbia、Daniele De Rossi→Diego Rossi）。
- 同日对 `backfill-avatar-keys.mjs` 做同类收紧：聚合英雄数据时**排除 `heroes/data/**/fc26/**`**（`readdirJSON(..., full => /\/fc26(\/|$)/.test(full))`），并清理了 `avatar-index.json` 中 59 条**仅由 FC26 英雄卡产生**的跨代 `cardId→头像键` 映射。任何新增数据源接入头像链路前，先确认它的卡 ID 与 FC27 同源。

### 覆盖率与补全

本地卡库只覆盖 gold 榜 + icons 榜（canonical 2961 卡），市场热门榜 / 进化榜里的低评分与特殊版本卡不在其中。**每次生成前后都要用补全脚本把缺口填掉**：

```bash
# 前置：node automation/browser-triage.mjs 必须 exit 0（唯一判据，有界自愈）
node apps/market/engine/scripts/backfill-avatar-keys.mjs D          # 补映射 + 下载缺失头像
node apps/market/engine/scripts/backfill-avatar-keys.mjs D --dry-run # 只看缺口，不碰浏览器
```

- 机制：在用户日常浏览器里打开任一 FUTBIN 页面建立同源会话，对缺口 cardId **同源 `fetch('/27/playerhover/<cardId>')`**，从返回的悬浮卡 HTML 中取 `img/players/<键>.png` 与球员页 slug。**不要**为了补头像逐页打开球员详情页。
- 该接口**有速率限制**：并发 6 时大量 HTTP 429。脚本默认**单并发 + 450ms 间隔**，每批 15 条（必须明显短于 CDP Proxy 的 `Runtime.evaluate` 约 30s 超时），并对 429 退避重试。**不要为了提速调高并发**。
- 产物：`shared/data/fc27/avatar-index.json`（`cardIds`/`slugs` → 头像键，只增不改、原子写）+ 图片下载到 `shared/data/fc27/images/`；失败清单 `images/.failed-backfill.json`，脚本可反复重跑续做。
- 校验口径：补全得到的映射必须与 canonical 交叉校验（同 cardId 的键必须完全一致）。2026-09-17 实测 303/303 一致、0 冲突；出现冲突即说明选择器取错了图，必须停下来修，不得带着冲突数据上线。
- **收紧了兜底匹配后必须重跑补全**：守卫会丢掉一批「只靠姓词元」才命中的条目（它们是同姓风险的来源，其中部分是正确匹配）。正确做法是用权威通道补回——重跑 `backfill-avatar-keys.mjs D` 让缺口 cardId 走 `playerhover` 拿到自己的头像键，而不是放宽守卫。2026-09-17 实测一轮补回 23 条映射 / 22 张图。
- 当日实测覆盖率（2026-09-17，修复后）：`market.html` 50/50 · `market-scan.html` 738/750 · `evolution.html` 487/500 · `icons-heroes.html` 传奇 131/131 + FC27 英雄 48/50（FC26 参考区按上条不配图）。

## 传奇卡价格区间与「传奇卡研究」强制口径（2026-09-17 新增）

`Price Range`（最低价-最高价）是 FUTBIN 在**开服前唯一持续滚动更新**的行情字段（分钟级），因此单独拆出**每小时**子任务采集，与每日台账解耦。

### 数据链路

| 环节 | 脚本 / 文件 |
|---|---|
| 逐小时采集（131 张，串行限速） | `apps/market/engine/scripts/collect-icon-priceranges.mjs` → `pricerange/latest.json` + `pricerange/hourly/<D>T<HH>.json` |
| 浏览器侧解析片段 | `apps/market/engine/scripts/extract-icon-priceranges.js`（经 CDP Proxy 注入执行） |
| 合并进当日快照 | `record-icons-daily.mjs` 把区间写入逐卡 `priceRange{min,max}` |
| 监控页展示 | `render-market-icons.mjs` 台账新增「最低价」「最高价」两列 + 顶部覆盖统计 |
| 跨代投资研究 | `apps/market/engine/scripts/build-icon-research.mjs` → `reports/daily/D/market-icons-research.html`（站点「传奇/英雄专栏 → 传奇卡研究」子标签，`merge_daily_report.buildIconResearchPanel` 已优先取该文件，无需改接线） |

### 硬约束

1. **价格区间是卡级字段，不是平台级**：同一张卡的 Console 与 PC 价格盒渲染出**完全相同**的区间值（2026-09-17 对 20 张卡批量核验，差异数为 0）。只落一份 min/max 并以 `scope: "card"` 标注，**禁止**拆成「每平台一套区间」，也禁止在页面上按平台切换区间列。平台差异只体现在「当前价」列。
2. **区间不是成交价**：开服日 `launchDate = 2026-09-25` 前为 `listing-estimate` 口径，不得据此计算日环比与累计涨跌；也不得与列表页 `IS`（开服前估值列）混用。
3. **采集必须串行限速**：FUTBIN 在并发 5 时即返回 HTTP 429。脚本按「串行 + 批间隔 + 429/5xx 退避重试」实现，**不要为提高速度改成高并发**。全量 131 张约 4–6 分钟。
4. **投资建议判定必须带有效性判据**：条件 A（FC26 开服价 > FC27 当前价）**只在 FC27 当前价为有效价（≥1000 coins）时参与**。开服前当前价普遍为 0（尚无挂单的占位值），若不加判据，「FC26 开服价 > 0」对每张卡都成立，会把全部卡误判为投资建议——属错误结论，禁止这样实现或表述；无有效价的卡记为「不适用」。条件 B 用区间最高价，是当前唯一有效的对照。
5. **FC26 开服价口径**：取该卡 FC26 开服日（2025-09-18）的 Console（PS/Xbox 合并）均价，即 `icons/data/prices/fc26/base-icons.json` 的 `prices.cross` 首日值；两代卡按 FUTBIN slug 关联，无对照的新卡如实标注，不得用人名模糊匹配凑数。
6. **该子任务不使用 `run-state.mjs`**：其 `begin` 用每日排他锁，同一天第 2 次会被拒（为每日任务设计），套用会让 02:00 之后的每小时运行全部失败。运行记录以 `pricerange/hourly/<D>T<HH>.json` 内的 `collectedAt`/`counts`/`missingItems`/`errors` 为准，不要为该任务新增锁文件。
7. 研究报告必须保留「不构成投资建议」免责声明，并说明历史开服价不代表 FC27 会重演。

执行每日综合报告前读取 `automation/prompts/daily.md`；执行单项时读取对应的 `automation/prompts/{football|news|market|evolution|icons-heroes|icons-pricerange-hourly}.md`。发布规则读取 `automation/prompts/publish.md`。这些文件补充既有调度描述，若用户给出新的明确要求，以用户要求为准。

### WorkBuddy 定时任务（日任务 6 个 + 每小时任务 2 个，Asia/Shanghai）

日任务自 2026-09-18 起按 5 分钟错开发起，避免同一分钟并发触发进入排队；汇总发布排在全部上游之后，并在 `coordinate.mjs` 内等待必需快照。权威时刻表见 `shared/config/project.json` 的 `dailySchedule`；改时间必须同步该文件、`automation/schedule-config.json`、本表与 WorkBuddy 侧定时规则。

| 任务 | 时间 | 契约文件 | 产物 |
|---|---|---|---|
| FC·资讯采集 | 03:00 | `prompts/news.md` | `news.html` |
| FC·市场监控 | 03:05 | `prompts/market.md` | `market.html` + `market-scan.html` |
| FC·足球日报 | 03:10 | `prompts/football.md` | `football.html` |
| FC·进化专栏 | 03:15 | `prompts/evolution.md` | `evolution.html` |
| FC·传奇英雄监控 | 03:20 | `prompts/icons-heroes.md` | `icons-heroes.html` |
| FC·汇总发布 | 03:35 | `prompts/daily.md` | `daily-merged/` → 站点（全量） |
| FC·传奇价格区间（每小时） | 每 1 小时 | `prompts/icons-pricerange-hourly.md` | `pricerange/hourly/` + `market-icons-research.html` |
| FC·市场价格关注列表（每小时） | 每 1 小时 | `prompts/market-hourly.md` | `market-watch.html` + 价格快照 + **线上行情重发布** |

**每小时任务的分钟相位不可控**：WorkBuddy 的定时规则不支持在 `HOURLY` 下指定 `BYMINUTE`（该字段会被静默忽略，`nextRunAt` 只按「上次配置更新时间 + 1 小时」计算），因此这两条无法固定到整点或整点后 N 分。两条每小时任务都会写 `current.json`，对它的写入必须幂等：只按 `cardId` 合并自己负责的条目，不得整体覆盖文件、不得删除他人写入的字段。

### 每小时行情任务（`icons-pricerange-hourly` / `market-hourly`）

两者的共同契约，改任一处必须同步另一处；同时凡涉及调度行为或红线（发布、平台口径、run-state、去重）的改动，必须同步两处权威来源：**本文件 + 对应的 `prompts/*.md`**。`automation/task-definitions.json` 的 `bootstrapPrompt` 与 WorkBuddy 侧任务提示词都只做「读取本地契约」的指路，不复制业务规则（2026-09-18 已精简，避免三处副本漂移）。

#### 统一当前行情与禁止重复分析（WorkBuddy 强制口径）

- `apps/market/engine/data/prices/fc27/current.json` 是 FC27 **当前价、热度和卡级价格区间的唯一当前行情源**，主键固定为 `cardId`。市场与传奇采集器只在成功采集后各写一次增量；较旧观测不得覆盖较新观测。
- `market.json`、`pricerange/latest.json`、逐小时/逐日快照只负责名单、采集证据和历史序列。分析当前状态时禁止再次从这些文件复制或推导“当前价”，也禁止为了进化、关注列表、传奇研究分别再次打开 FUTBIN 读取同一价格。
- 关注列表、进化专栏、市场概览/扫描、传奇监控与传奇研究一律按 `cardId` 读取 `current.json`；历史快照只在确实需要计算两个真实观测点之间的变化时读取一次。
- 同一轮采集成功后只运行一次对应分析器；其他模块复用其结构化结果和 `current.json`，不得各自重复计算同一份价格分析。禁止重新生成 `players.json`、`priceRef` 或其他当前价格副本。
- `current.json` 缺失、过期或某卡未命中时如实留空并记录缺失，不得回退 `market.json`、逐日快照、另一平台、FC26 或旧日期顶替。
- 汇总任务只复制 `assets/data/current.json` 并合并页面，不重新采集、不重新计算市场结论；发布必须把该 JSON 与 HTML 一起部署，页面刷新后按 `cardId` 获取最新行情。

- **不改首页、不改版式、不动其他模块、不重跑 `coordinate.mjs`**：页面结构与历史归档仍由「FC·汇总发布」在每日 03:35 更新；`index.html` 与 `archive/D.html` 的重写是它的职责，小时任务重跑合并会造成归档漂移。
- **线上行情资源的重发布由「FC·市场价格关注列表（每小时）」承担**（2026-09-17 用户明确要求「刷新网页即最新」）：该任务在每轮采集、打分、渲染之后，**先用 `FC_PROJECT_ROOT=/Users/wuyanzu/Desktop/FC node apps/portal/merge_daily_report.mjs D` 重合并，再用 WorkBuddy 站点发布能力重新部署 `daily-merged/` 目录**（入口 `index.html`、`updateExistingApp`、`userAskedToPublish`、`domainPrefix=fc27-daily-intel`），更新同一应用「FC27每日情报台」，分享链接 `https://fc27-site.app.workbuddy.host/` 不变；不得新建应用、不得改应用名、不下线旧页。
  - **重合并是必需步骤，不是可选优化**（2026-09-18 追加）：`daily-merged/index.html` 是把当日各栏目 HTML **整体内联**成的单文件产物，第 ⑤ 步渲染出的 `reports/daily/D/market-watch.html` **本身不会被上传**。不重合并，线上关注列表的页头、统计卡、五张榜单与关注分就会冻结在**每日 03:35 合并所消费的那一版**上——2026-09-18 实测冻结在 02:03 的 T02（页头「2 个观测点（01–02 时）· 追踪卡数 782」），而价格因为走客户端 `current.json` 仍是新的，形成「只有价格是活的」这种最易误判的形态。
  - `merge_daily_report.mjs` 是**无锁**合并引擎（实测约 1.6 秒），与带当日排他锁、重复执行直接空转的 `coordinate.mjs` 不同，可每小时安全重跑；它只按 `reports/daily/` 的当日源文件重建 `index.html`、`reports/daily/D/summary.html` 与历史归档，**不写入任何受 `run-state` 快照校验的产物**（`news/football/market/evolution/icons-heroes.html`），因此不影响每日任务的快照校验。`coordinate.mjs` 仍然**不得**由小时任务重跑。
  - 「FC·传奇价格区间（每小时）」自身不发布，其写入 `current.json` 的传奇价与区间最迟在下一个整点随该次重发布上线。
- 重发布后只核对线上 `assets/data/current.json` 可 200 且 `generatedAt` 与本地一致（结果记 `automation/runs/D/market/publish-hourly.json`）；**不得运行 `automation/verify-publication.mjs`**（它会重写 `automation/publish-status-D.json`，那是每日发布任务的权威记录）。该 host 有边缘缓存短时版本漂移，不得凭单次请求不一致判定发布失败，最多重试一次部署后如实记录。
- **防重复站点红线**：若发布能力返回「没有可更新的既有应用」或要求选择/新建应用，立即停止发布步骤并如实回报，**绝不允许新建应用、改应用名或换域名发布**；分享链接 `https://fc27-site.app.workbuddy.host/` 一旦变化即等于丢失原站点。
- **不调用 `run-state.mjs`**：它的 `owner.json` 排他锁是「一天一次」语义，会把当日日任务启动（2026-09-18 起为 03:00）之后的全部每小时运行拒绝。运行记录以逐小时快照文件为准（`<D>T<HH>.json` 内含 `collectedAt` / `counts` / 失败原因）。
- **不重写受 `run-state` 快照校验的产物**：`market-hourly` 只写 `market-scan.html` 与 `market-watch.html`，**不得渲染 `market.html`**（它是 `market` 模块的受校验快照产物）。
- 每个整点**只覆盖当小时**快照，不删改其他小时与历史日期；采不到就如实记失败并保留上次有效结果，不用 FC26 或历史日期填充。

- **市场监控与传奇英雄监控都必须遵守上方「FUTBIN 平台口径强制规则」**（Console + PC 双平台，缺一不可）；平台要求已写入本文件与各自 `prompts/*.md`，改契约时两处同步。
- 不得新增重复定时任务；启停与改时间只通过 WorkBuddy 的自动化管理，不要在项目里另建调度脚本。

WorkBuddy 读取 `automation/task-definitions.json`：调度器只保存短启动提示，完整任务要求只维护在 `automation/prompts/*.md`。

- 运行开始固定 Asia/Shanghai 日期，并将同一个日期传给所有子任务和合并脚本。
- 新闻浏览器失败只终止新闻步骤，继续其他已启用的子任务。区分没有新闻与采集失败。
- 不清空或重建历史去重数据；同日重跑保留当日内容，写入采用临时文件原子替换。
- 市场任务已由用户明确启用；后续只有用户明确要求才可再次暂停，且不得新增重复定时任务。
- 新闻与榜单必须打开本轮来源核验。缺数据标明缺失，不能改旧报告日期冒充更新。
- 旧 `fix_*.py` 等一次性补丁不是日常执行入口。
- 子任务统一输出到 `reports/daily/D/`，完成后刷新综合页与固定归档入口，再发布到 WorkBuddy。路径以 `shared/config/project.json` 为唯一配置源。结构检查通过不代表数据已核实或已发布。
- 足球日报的积分榜/射手榜/助攻榜是固定必做栏目，逐联赛分别核验、内容互不相同；提交前必须运行 `node automation/verify-football-boards.mjs D`，非 0 退出不得提交 success。
- FC27 资讯采集的媒体**必须分两层取**，这是本模块最容易做错的地方：① `apps/news/extract-timeline.js` 只从 DOM 取推文 ID、链接、作者、时间、正文与 `hasVideo/hasPhoto/hasCard` 标记，**不得在 DOM 里抠图片地址**（后台标签页里 X 只渲染骨架占位符，`[data-testid="tweetPhoto"]` 内没有 `<img>`；视频与链接卡片的图 DOM 里根本不存在）；② `node apps/news/enrich-tweet-media.mjs D` 经 X syndication 接口补齐权威的 `images` / `video`（封面 + mp4 直链 + 时长）/ `card` / `quoted`。**严禁因推文含 video / animated_gif 就丢弃整条推文**。图片落盘是两级：先 curl，失败项自动经浏览器补下（本环境出口代理到 `pbs.twimg.com` 不通，curl 报 SSL 错属预期）；报告里不得出现远程热链。媒体未解析时显示「媒体未解析」，不得写成「原推为纯文本，无配图」。完整规则见 `automation/prompts/news.md` 与 `apps/news/AGENTS.md`。
- FC27 市场每天产出两个并列文件，互不覆盖，均由 `apps/market/engine/scripts/render-market.mjs` 从 `automation/runs/D/market/market.json` 渲染：
  `reports/daily/D/market.html`（**市场概览**，三段式：本周活动卡与周黑 / 价格分层每档 Top50 按 Rating / 热门进化卡）+ `reports/daily/D/market-scan.html`（**市场扫描**，价格维度 × 热门球员维度）。
  站点上以「市场概览 / 市场扫描」子标签切换展示，不得相互覆盖。
  **平台口径必须同时覆盖 Console（PS / Xbox 合并）与 PC 两档**，规则见上方「FUTBIN 平台口径强制规则」；两平台价分别落库到 `players[].psPrice`（Console）/ `players[].pcPrice`（PC），渲染器在页顶给出平台切换按钮。传奇/英雄内容已迁出，见下条。
- **传奇/英雄已从市场任务迁出**（2026-09-16）。`reports/daily/D/icons-heroes.html` 由独立任务「FC27传奇/英雄卡监控」（`automation/prompts/icons-heroes.md`，`automation/task-definitions.json` 的 `icons-heroes`）产出，由 `apps/market/engine/scripts/render-icons-heroes.mjs` 渲染，挂载在「传奇/英雄专栏」的「传奇/英雄监控」子标签。市场任务不再产出 `market-icons.html`，也不再采集/渲染/提交任何传奇、英雄内容。
- **FC27 市场栏目第三个子标签「关注列表」**（2026-09-17 新增）：`reports/daily/D/market-watch.html`，由「FC·市场价格关注列表（每小时）」任务产出。当前行情唯一写入 `apps/market/engine/data/prices/fc27/current.json`；`watchlist.json` 只保存 cardId、评分与理由，不再生成价格副本 `players.json`。市场扫描、关注列表、进化和传奇页面在加载/刷新时按 cardId 读取同一份 current.json。逐小时/daily 文件只作历史序列。评分口径：参考价取两平台有效价的较大者；热度分＝热度分位、价格分＝与同档中位价比、变动分＝两个**真实整点观测**的挂单价变动（与当日开盘基线的单点对比只作展示、不计分）；关注分＝0.45/0.40/0.15 加权，缺项按中性 50 计入并标注。`market-watch.html` 与 `market-scan.html` 同属「当日附属产物」；`market.html` 才是受 `run-state` 快照校验的产物，每小时任务不得重写。
  传奇/英雄的逐日快照由 `apps/market/engine/scripts/record-icons-daily.mjs D` 固化到 `apps/market/engine/icons/data/prices/fc27/daily/<DATE>.json`（逐卡含 `platforms.console` / `platforms.pc` 双平台价，采集规则同上方「FUTBIN 平台口径强制规则」；两平台都必须采，产物页同样带 Console / PC 切换）：一天一份、同日重跑只覆盖当天、原子写入，不删改历史；开服前不计算涨跌，只做台账与记录进度。该快照由「FC·传奇英雄监控」任务驱动。
  「传奇/英雄专栏」的第二个子标签「传奇卡研究」是**跨日期常驻**内容，源文件 `apps/market/engine/icons/reports/fc27-icon-analysis.html`（当日若有 `reports/daily/D/market-icons-research.html` 则优先）。它不是每日产物，重跑分析报告后必须同步覆盖该底稿，否则线上仍是旧版。
- 首页与每日日报共用 `apps/portal/dashboard.mjs` 同一模板；左侧导航固定为「今日总览 / 足球动态 / FC27 资讯 / FC27 市场 / 进化专栏 / 传奇/英雄专栏 / FC26 球员回顾 / 历史日报」八个入口，右侧固定保留「进化专栏」卡片，由后续进化任务写入 `reports/daily/D/evolution.html` 后自动收录，未就绪时显示如实空状态。
- 「传奇/英雄专栏」是左侧导航的独立栏目（`LEGEND_TAB.label = '传奇/英雄专栏'`，面板 id `legend-column`，视图键 `legend`），内含两个子标签：「传奇/英雄监控」（当日产物 `reports/daily/D/icons-heroes.html`，受当日日期校验）与「传奇卡研究」（跨日期常驻底稿，由 `merge_daily_report.mjs` 的 `buildIconResearchPanel(D)` 读入：当日 `reports/daily/D/market-icons-research.html` 优先，否则回退 `apps/market/engine/icons/reports/fc27-icon-analysis.html`）。子标签通过 `subPanels.legend` 挂载；缺稿时显示如实空状态。改版式或调整该栏目时需同步 `apps/portal/dashboard.mjs`、`apps/portal/merge_daily_report.mjs`、`automation/coordinate.mjs`（`optionalPanels` 复制 `icons-heroes.html`）与 `automation/run-state.mjs`（`outputs['icons-heroes']`）。
- 「FC26 球员回顾」是左侧导航的独立栏目（`FC26_TAB.label = 'FC26 球员回顾'`，面板 id `fc26-review-column`，视图键 `fc26`），**离线复盘栏目：只读项目内本地 FC26 数据集，不采集、不联网、不参与任何定时任务**。链路：`node apps/market/engine/scripts/render-fc26-review.mjs` 读 `gold/data/prices/fc26/fc26-first-month.json`（152 张金卡 × 30 天）、`icons/data/prices/fc26/base-icons.json`、`heroes/data/prices/fc26/base-heroes.json`，按能力值（OVR）分 95+ / 90–94 / 88–89 / 86–87 / 84–85 / ≤83 六档聚合，产出 `apps/market/engine/gold/reports/fc26-season-review.html`（4 张手写内联 SVG：价格指数走势、涨跌幅双向条、OVR × 卡池热力矩阵、峰谷时点；**不用 CDN**，保持单文件离线可用）。**逐卡「点开展示」价格曲线**（2026-09-17 追加）：代表球员表与全量明细的每一行都可点开，展开该卡开服首月 30 天逐日价格曲线（Cross 实线 + PC 虚线 + 峰/谷/末标记 + 统计行），全量明细另带按球员名筛选框。实现为**惰性渲染**——渲染时只把 30 个价格点紧凑编码进行上的 `data-curve`（约 0.6 KB/行），点开时才由页内脚本画 SVG；若预渲染 405 张 SVG 会让底稿涨到 1.8 MB+，惰性版整个底稿约 0.54 MB。**踩坑**：`<script>`/`<style>` 是 raw text，`themedPanel` 的 `&`→`&amp;`、`"`→`&quot;` 只是属性层的一次往返编解码，一旦脚本里出现 `"` 或 `&` 就必须确保往返后与原字面量一致；为稳妥，脚本内**一律用单引号**（引号字符用 `String.fromCharCode(39)` 构造），生成的 SVG 属性也用单引号。该底稿是**跨日期常驻**内容（与「传奇卡研究」同类），不参与当日日期校验，存在即收录；`merge_daily_report.mjs` 的 `buildFc26ReviewPanel()` 读入并走 `themedPanel`，缺稿时显示如实空状态。因底稿不在 `reports/daily/` 下，`automation/coordinate.mjs` 的隔离目录准备阶段必须一并 `cpSync` `apps/market/engine/gold/reports/`，否则隔离合并时读不到底稿。能力值口径：优先取 `apps/market/engine/data/players/database/fc26.json` 的 **FC26 rating**（按 slug / 规范化姓名匹配），库内无记录才回退卡池自带 OVR（gold 用 `fc27Rating`、icon/hero 用 `rating`），页面按 `ratingSource` 注明来源。零价与缺失一律忽略（只统计有值的观测日），价格取 Cross 平台口径。**本栏目一律不配球员头像**：FC26 的 `resourceId` 跨代不可信（实测 5/5 同 id 姓名与 canonical 全不符），遵守上方跨代红线。
- 新增或修改脚本时，文件开头必须有中文注释，说明脚本用途、输入和主要输出；Shebang可以位于第一行。
- 临时文件进入 `automation/runs/D/<module>/work/` 或系统临时目录，不得混入源代码、数据库或最终报告目录。
- 修改生成器后运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs`；测试使用隔离数据，禁止拿真实去重文件做破坏性测试。
