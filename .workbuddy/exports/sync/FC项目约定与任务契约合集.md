# FC 项目约定与任务契约合集

> 文档类型：项目知识库条目（由项目内 Markdown 文档按主题合并）
> 生成日期：2026-09-16 14:03
> 来源项目：/Users/wuyanzu/Desktop/FC

本合集收录以下原始文件，按顺序完整保留原文；每个文件之间以 `---` 分隔。

1. `AGENTS.md`
2. `apps/AGENTS.md`
3. `apps/football/AGENTS.md`
4. `apps/news/AGENTS.md`
5. `apps/market/AGENTS.md`
6. `apps/portal/AGENTS.md`
7. `automation/AGENTS.md`
8. `shared/AGENTS.md`
9. `reports/AGENTS.md`
10. `daily-merged/AGENTS.md`
11. `automation/prompts/README.md`
12. `automation/prompts/daily.md`
13. `automation/prompts/football.md`
14. `automation/prompts/news.md`
15. `automation/prompts/market.md`
16. `automation/prompts/evolution.md`
17. `automation/prompts/publish.md`

---

## 附录 1：`AGENTS.md`

# FC 项目总约定

本项目用于采集足球与FC27资讯、研究FC27市场，并生成一个日期化日报与固定汇总站点。`apps/`只放四个业务任务，`shared/`保存可被四任务和 WorkBuddy 共同调用的配置与代码，`automation/`只负责编排和运行状态，`reports/`只保存最终产物。项目已从 DuMate 迁移到 WorkBuddy，发布统一走 WorkBuddy 站点发布能力。

进入子目录工作前继续读取该目录最近的 `AGENTS.md`；子目录规则补充本文件。不要把共享实现复制到多个任务，先判断能否放入 `shared/`。

## 浏览器强制规则（所有任务每次执行必须读取）

凡任务需要浏览器，一律通过 **Web Access（浏览器自动化）技能**完成：CDP Proxy(:3456) 直连**用户日常已登录的 Chrome**，复用现有登录态。这是本项目**唯一**可用且被授权的浏览器通道。

### 不要再使用「Chrome 插件 / extension 模式」

Chrome 里那个 WorkBuddy 扩展（`ajnnogdfpilbhkeggdjlcokgglijmdde` v0.2.3）**永远连不上，属产品侧缺口**：它唯一的传输是 `chrome.runtime.connectNative("com.workbuddy.extension")`，而 WorkBuddy 桌面端 v5.5.6 并未实现该 native messaging 宿主（逐字节扫描 `app.asar` 后 `connectNative` / `NativeMessaging` / `com.workbuddy.extension` / 扩展 ID 命中数全为 0；三个浏览器的 `NativeMessagingHosts/` 里只有 ChatGPT 的宿主）。该扩展已在用户机器上**禁用**。不要再为它做任何排查、注册或配置，不要再把「插件未连接」当作本项目的失败原因。

### 前置自检（每次采集前必跑）

```bash
node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs
```

| 退出码 | 含义 | 处置 |
|---|---|---|
| `0` | 已连接（`browser: ok (Chrome, port 9222)`） | 继续采集 |
| `2` | `config.env` 的 `WEB_ACCESS_BROWSER` 为空 | **无人值守任务会卡在「询问偏好」而失败**；该值必须是 `chrome` |
| `1` | 没有任何浏览器打开远程调试开关 | 见下方「唯一的人工开关」 |

### 唯一的人工开关

用户日常 Chrome 地址栏打开 `chrome://inspect/#remote-debugging`，勾选 **Allow remote debugging for this browser instance**。**Agent 不能代勾**（唯一允许的自动补救是 `open -a "Google Chrome" chrome://inspect/#remote-debugging` 把页面推到前台）。

- 该开关**跨 Chrome 重启持久生效**，持久化位置：`~/Library/Application Support/Google/Chrome/Local State` → `devtools.remote_debugging = {"user-enabled": true}`。
- 开启后 `~/Library/Application Support/Google/Chrome/DevToolsActivePort` 出现（内容 `9222`），Chrome 主进程在 `127.0.0.1:9222` LISTEN。**不需要**用 `--remote-debugging-port` 起新实例。
- **判定坑**：`curl http://127.0.0.1:9222/json/version` 在开关模式下返回空，**不能**用它判定可用性；判据只有 `check-deps.mjs` 退出码 + 实际 `/new` 打开来源页能读到正文。
- `cdp-proxy.mjs` 是长驻进程：只有切换浏览器才需 `pkill -f cdp-proxy.mjs` 再重跑，正常不要主动停（重启后需用户重新授权）。

### 禁止的入口（一律不调用、不探测）

`dumate-browser-cli`、`automation/browser-env.sh`、`DUMATE_*` 环境变量、`127.0.0.1:19228` relay、`127.0.0.1:19222`（`--user-data-dir` 独立 profile，违反规则）、`agent-browser`、内置浏览器（IAB）、未登录浏览器、临时浏览器、新建独立 profile。这些项目的缺失**不能**作为浏览器失败证据。旧 DuMate 适配脚本只作历史兼容。

### 失败处置

通道本身不可用、或实际来源页无法打开/读取时，才把对应采集步骤标为 `failed`/`partial` 并留证（记录尝试的 URL、打开时间、错误摘要）。**不得**回退到上述禁止通道，**不得**用旧日期、FC26 或其他来源的旧快照填充当日结果。失败页面必须明确区分「采集失败」与「本日无数据」。纯本地合并任务不得为了「检查」而打开任何浏览器。

> 自检与修复流程详见技能 `fc-browser-channel-check`。

执行每日综合报告前读取 `automation/prompts/daily.md`；执行单项时读取 `automation/prompts/news.md`、`football.md` 或 `market.md`。发布规则读取 `automation/prompts/publish.md`。这些文件补充既有调度描述，若用户给出新的明确要求，以用户要求为准。

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
- FC27 市场每天产出三个并列文件，互不覆盖，均由 `apps/market/engine/scripts/render-market.mjs` 从 `automation/runs/D/market/market.json`（传奇监控另有逐日快照数据源）渲染：
  `reports/daily/D/market.html`（**市场概览**，四段式：本周活动卡与周黑 / 价格分层每档 Top50 按 Rating / 传奇卡与英雄卡 / 热门进化卡）+ `reports/daily/D/market-scan.html`（**市场扫描**，价格维度 × 热门球员维度）+ `reports/daily/D/market-icons.html`（**传奇监控**，FC27 全部基础传奇卡逐日价格变化台账）。
  站点上以「市场概览 / 市场扫描 / 传奇监控 / 传奇卡研究」子标签切换展示，不得相互覆盖。
  传奇卡的逐日快照由 `apps/market/engine/scripts/record-icons-daily.mjs D` 固化到 `apps/market/engine/icons/data/prices/fc27/daily/<DATE>.json`：一天一份、同日重跑只覆盖当天、原子写入，不删改历史；开服前不计算涨跌，只做台账与记录进度。
  「传奇卡研究」子标签是**跨日期常驻**内容，源文件 `apps/market/engine/icons/reports/fc27-icon-analysis.html`（当日若有 `reports/daily/D/market-icons-research.html` 则优先）。它不是每日产物，重跑分析报告后必须同步覆盖该底稿，否则线上仍是旧版。
- 首页与每日日报共用 `apps/portal/dashboard.mjs` 同一模板；左侧导航固定为「今日总览 / 足球动态 / FC27 资讯 / FC27 市场 / 进化专栏 / 传奇专栏 / 历史日报」七个入口，右侧固定保留「进化专栏」卡片，由后续进化任务写入 `reports/daily/D/evolution.html` 后自动收录，未就绪时显示如实空状态。
- 「传奇专栏」是左侧导航第二个独立栏目（`LEGEND_TAB`，面板 id `legend-column`），承载 FC27 vs FC26 传奇卡对比与投资预测报告：与市场栏「传奇卡研究」子标签**同源同稿**，均由 `merge_daily_report.mjs` 的 `buildIconResearchPanel(D)` 读入（当日 `reports/daily/D/market-icons-research.html` 优先，否则回退 `apps/market/engine/icons/reports/fc27-icon-analysis.html`）。它同样是跨日期常驻内容，不是每日产物，不受当日日期校验约束；缺稿时显示如实空状态。改版式或调整该栏目时需同步 `apps/portal/dashboard.mjs`、`apps/portal/merge_daily_report.mjs`；`automation/coordinate.mjs` 已整体复制 `apps/market/engine/icons/reports/` 进隔离目录，无需额外接线。
- 新增或修改脚本时，文件开头必须有中文注释，说明脚本用途、输入和主要输出；Shebang可以位于第一行。
- 临时文件进入 `automation/runs/D/<module>/work/` 或系统临时目录，不得混入源代码、数据库或最终报告目录。
- 修改生成器后运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs`；测试使用隔离数据，禁止拿真实去重文件做破坏性测试。

---

## 附录 2：`apps/AGENTS.md`

# apps 业务任务约定

本目录只容纳四个独立任务：`football`、`news`、`market`、`portal`。前三项生成内容，`portal`只合并。每个任务必须遵守自己的 `AGENTS.md`，不得直接修改其他任务的数据。

- 共享路径、配置、展示层或通用函数放入 `../shared/`，不在任务之间复制。
- 业务输入保留在所属任务；最终HTML统一写入 `../reports/daily/D/`。
- 临时文件写入 `../automation/runs/D/<module>/work/`，成功后可清理。
- WorkBuddy后续应通过 `shared/config/project.json` 和稳定的数据文件读取结果，不依赖某个任务的内部临时结构。
- 每次执行必须先读取根 `../AGENTS.md` 的“浏览器强制规则”；需要网页时只能通过 `web-access`（浏览器自动化）技能以 CDP 连接用户已登录的日常 Chrome，禁止 IAB、未登录浏览器、临时浏览器和新 profile；也不要再使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。
- 所有脚本开头使用中文说明用途、输入和输出。

---

## 附录 3：`apps/football/AGENTS.md`

# 足球日报任务约定

本目录负责足球比赛、新闻、积分榜、射手榜和助攻榜的当日核验与报告生成。输入来自本轮打开的可靠来源，模板位于 `templates/`，输出固定为 `../../reports/daily/D/football.html`。

- 执行前读取 `../../automation/prompts/football.md`。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；来源核验只走 `web-access` 技能的 CDP 通道（用户日常 Chrome 登录态），不用 IAB、新 profile，也不用 Chrome 插件 / `extension` 模式。
- 积分榜 / 射手榜 / 助攻榜是固定必做三榜，逐联赛分别核验、内容互不相同；提交前**必须**运行 `node ../../automation/verify-football-boards.mjs D`，退出码非 0 不得提交 `success`（修正后重跑；仍不过则提交 `partial` 并在证据中记录未通过项）。
- 不得做「缺数据静默回退英超」之类的兜底；缺失如实标注并提交 `partial`。
- 不用旧比赛结果推算当日完整榜单；缺失必须标注并提交 `partial`。
- `templates/`只保存可复用结构，不保存日期化成品。
- 展示主题由 `../../shared/presentation/`统一维护，本任务不复制主题代码。
- 证据、工作文件和不可变快照写入 `../../automation/runs/D/football/`。

---

## 附录 4：`apps/news/AGENTS.md`

# FC27 资讯采集任务约定

本目录负责从 `sources.txt` 列出的 X（推特）账号采集近 24 小时的 FC27 资讯，过滤、聚类去重、翻译，并生成 `../../reports/daily/D/news.html`。

- 执行前必须完整读取根 `../../AGENTS.md` 与 `../../automation/prompts/news.md`；后者是唯一完整业务契约，本文件补充模块内的实现约束。
- 每次执行先回读根 `../../AGENTS.md` 的「浏览器强制规则」：通过 `web-access`（浏览器自动化）技能以 CDP 直连用户日常 Chrome，复用其 X 登录态。**不使用 Chrome 插件 / `extension` 模式**；`auto_news.sh`、`automation/collect-news.mjs` 是旧入口，不得调用。
- X 是强反爬且依赖登录态的站点，**不得**用 WebSearch / WebFetch / curl 代替浏览器采集。

## 数据流水线（固定四步，不要自创步骤）

| 步骤 | 命令 / 文件 | 职责 |
|---|---|---|
| 1. DOM 抽取 | `extract-timeline.js`（读取后用 Web Access 的 `/eval` 执行） | 只取推文 ID、链接、作者、时间、正文与 `hasVideo/hasPhoto/hasCard` 三个媒体存在标记 |
| 2. 媒体解析 | `node apps/news/enrich-tweet-media.mjs D` | 经 X syndication 接口补齐 `images` / `video` / `card` / `quoted` 与 `mediaResolved` |
| 3. 生成报告 | `node apps/news/generate_report.mjs D` | 过滤、聚类去重、翻译、落盘图片、渲染 `news.html` |
| 4. 提交 | `node ../../automation/run-state.mjs finish news D RUN_ID …` | 见根契约的提交与时限要求 |

第 1 步的产物写入 `data/tweets-D.json` 后立刻进入第 2 步；第 2 步原地原子更新同一个文件，第 3 步以它为准。

### 为什么媒体不能从 DOM 取

X 在后台标签页（`document.visibilityState === 'hidden'`，`requestAnimationFrame` 不推进）只把推文媒体渲染成模糊骨架占位符：实测打开一条 5 图推文的固定链接，`document.querySelectorAll('img').length === 0`，`[data-testid="tweetPhoto"]` 有 6 个但内部没有 `<img>`；执行一次 `Page.captureScreenshot` 强制出帧后 `img` 才从 0 变成 6。链接卡片更彻底，DOM 里既无图也无 href。**因此 DOM 图片既不可靠也不完整，媒体一律以接口为准。**

### 媒体接口

`apps/news/x-media.mjs` 封装 X 公开的 `https://cdn.syndication.twimg.com/tweet-result?id=<推文ID>&token=a`（带常规 UA 即可，**不需要登录态**），返回：

- `mediaDetails[]`：`type` 为 `photo` / `video` / `animated_gif`；`media_url_https` 对视频/动图就是首帧海报；`video_info.variants[]` 提供可下载的 mp4 直链与 `duration_millis`。
- `card.binding_values`：链接卡片缩略图（`player_image_original` / `thumbnail_image_original` 等 IMAGE 键）、`title`、`description`、目标地址。
- `quoted_tweet`：被引用推文（含其自己的配图，必须与主推文分开统计）。
- `created_at`、`text`、`user`。

解析与规范化由纯函数 `normalizeTweetMedia()` / `normalizeCard()` / `collectTweetImageUrls()` 完成，逐条失败写 `mediaResolved: false`，**绝不用其他推文的媒体顶替**，也不因接口为空对象就判定「这条推文没有媒体」。

## 媒体规则

- **不得因推文含 `video` / `animated_gif` 就丢弃整条推文。** 历史脚本 `auto_news.sh` 的 `if (videoEl) continue;` 是「带视频的都截取不到」的直接原因（8 天数据里 506 张图 100% 是 `/media/`，视频缩略图命中数为 0）。带信息量的视频推文照常收录，并在卡片上标注「视频 / 动图 GIF + 时长」与在原推中观看的入口。
- **落盘白名单**：`pbs.twimg.com` 上的 `/media/`（正文配图与视频封面）、`/amplify_video_thumb/`、`/ext_tw_video_thumb/`、`/card_img/`（链接卡片缩略图）都要保存到 `reports/daily/D/assets/news/`。放行规则统一由 `../../shared/lib/report-assets.mjs` 的 `isCacheableXImage()` 判定，**不要再自己写 `/media/` 正则**（历史上只认 `/media/`，导致视频封面与卡片缩略图被静默丢弃）。`originalXImageUrl()` 只对尺寸写在 `name=` 上的路径改写为 `name=orig`；视频缩略图的尺寸写在路径里，硬改会 404。
- **图片下载是两级，不要只看 curl 的结果**：`generate_report.mjs` 先用 curl 直连，失败项自动交给 `fetch-images-browser.mjs` 经用户浏览器（CDP Proxy）补下。本运行环境的出口代理到 `pbs.twimg.com` 不通（直连 `Connection reset`、走代理 `SSL_ERROR_SYSCALL`），因此 **curl 报 SSL 错是预期现象，不代表图片不可获取**。浏览器侧必须以 `https://x.com` 为 origin（该 CDN 的 CORS 只放行 x.com，`about:blank` 取不到图）；没有现成 x.com 标签页时用 `https://x.com/robots.txt` 作轻量宿主，用完只关自己开的那个。
- 浏览器兜底要求 CDP Proxy 在线（采集阶段本就在用）；proxy 不可用导致图片未落盘时，报告至少为 `partial` 并记录未落盘数量。
- 报告优先引用本地资产，**不得只保留远程热链**，也不得用 `onerror` 隐藏加载失败。
- **媒体状态必须诚实**（三态，不得笼统写成「原推为纯文本，无配图」）：
  - `mediaResolved === false` → 「本条推文的媒体信息本轮未能解析，不代表原推没有配图」
  - 有 `hasVideo/hasPhoto/hasCard` 但没取到地址 → 「原推含媒体，本轮未取到媒体地址」
  - 三者皆无 → 「原推为纯文本，无配图」

## 覆盖度与失败判定

- 已知限制（实测）：X 时间线虚拟化 + 后台标签页节流，单个账号通常只渲染 3–7 条，滚到底后 `scrollHeight` 不再增长、无加载指示。这是通道固有限制（历史「好」的日子也只有约 7 条/账号），**不是回归**。
- 24 小时覆盖无法保证 100%。不完整必须如实写入 `missingItems` 并提交 `partial`，**不得**声称已完整覆盖。
- 浏览器失败属于**采集失败**，不得写成「没有新闻」；只有全部来源成功且确实无相关内容时，才可写「本期无新资讯」。
- 访问失败、媒体解析失败、图片落盘失败、翻译失败要分别记录，不能合并成一句「部分失败」。

## 数据与快照纪律

- `data/seen_tweets.json` 是跨日历史去重库：禁止清空、重建或用于破坏性测试。
- 仅 `generate_report.mjs` 可原子更新去重库并保留 `seen_tweets.json.bak`；执行 AI 与临时脚本不得直接改写它。恢复失败时**停止任务**而不是创建空库。
- `data/tweets-D.json` 是当日结构化快照，由 `enrich-tweet-media.mjs` 原地原子更新；该脚本只接受与目标日期一致的快照，拒绝改写其他日期。
- 临时翻译、渲染脚本与 pending 文件进入 `../../automation/runs/D/news/work/`，不得写入项目根或最终报告目录。
- 产物固定为 `../../reports/daily/D/news.html`；同日重跑合并当日已有内容，不因全部推文都见过就覆盖为空。

## 报告内容要求

每张卡片包含：博主、时间、完整中文翻译、可折叠原文、媒体区（配图 / 视频封面 / 链接卡片 / 无图说明，均链接到原推）、原推链接。保留多列网格与移动端单列布局。

翻译服务失败时由执行任务的 AI 完成翻译。「术语替换」和英文混排不算翻译完成；未完成的必须在报告中明确标记「待翻译，请查看原文」，不得伪装成中文。

## 相关文件

- 共享路径与日期逻辑只从 `../../shared/lib/runtime.mjs` 导入；图片命名与内联从 `../../shared/lib/report-assets.mjs` 导入。
- 媒体解析的回归测试在 `../../automation/news-media.test.mjs`（随全套测试一起跑）。

---

## 附录 5：`apps/market/AGENTS.md`

# FC27市场任务约定

本目录负责FC26历史数据库、FC27卡库、价格、活动卡、周黑、进化、传奇卡和英雄卡研究，最终生成 `../../reports/daily/D/market.html`。

- 执行前读取 `../../automation/prompts/market.md` 和 `engine/modules/market-segments.json`。
- 每天产出三个并列文件，互不覆盖，均由渲染器生成，不要手改 HTML 版式：
  1. `market.html` = **市场概览**，四段式固定结构：① 本周活动卡与本周周黑 ② 价格分层（≥100万 / 30-100万 / 10-30万 / 1-10万，每档 Top 50，按 `/27/players` 的 Rating 降序） ③ 传奇卡与英雄卡 ④ 热门进化卡。取数用 `/27/players` 的分档参数：`pc_price=1000000%2B` / `300000-1000000` / `100000-300000` / `10000-100000`。
  2. `market-scan.html` = **市场扫描**，双维度：维度一价格（大卡/中卡/热门卡/适用卡，低于1万另列），维度二热门球员（热门进化卡 `/27/popular/evolutions` 与 价值卡 `/27/popular` 中的非进化卡）。
  3. `market-icons.html` = **传奇监控**，监控 FC27 全部基础传奇卡（Icon，全量 131 张）的逐日价格变化：状态卡、大盘中位价走势、全量台账（评分/位置/六维/金特技/今日价/日环比/累计涨跌/逐卡走势）、逐日快照记录、来源与缺失项。卡库台账在 `icons/data/players/fc27/fc27-icons-playstyles.json`。
  4. 「传奇卡研究」子标签为**跨日期常驻**内容（不是每日产物），底稿在 `engine/icons/reports/fc27-icon-analysis.html`：FC26↔FC27 阵容对照、属性与金特技变化、131 张首月价格预测、投资分档。重跑分析报告后必须同步覆盖该底稿（当日若有 `reports/daily/D/market-icons-research.html` 则优先使用它）。
- 数据统一写入 `../../automation/runs/D/market/market.json`（概览放 `overview`，扫描放顶层），再运行 `node engine/scripts/render-market.mjs D` 一次渲染三份产物；缺失数据由渲染器输出如实空状态。站点上三者以「市场概览 / 市场扫描 / 传奇监控」子标签切换。
- 传奇卡的逐日快照单独保存在 `engine/icons/data/prices/fc27/daily/<DATE>.json`，由 `engine/scripts/record-icons-daily.mjs D` 从当日抓取结果固化：一天一份、同日重跑只覆盖当天、原子写入，禁止删改历史日期；抓取失败时不写入快照。开服前（`launchDate` 之前）FUTBIN 只有列表页占位价，此口径下不计算日环比与累计涨跌。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；FUTBIN 等站点只能通过 `web-access` 技能的 CDP 通道访问用户日常 Chrome，禁止先试 IAB，也不要用 Chrome 插件 / `extension` 模式。
- **FUTBIN 静态路线不存在**：`curl`/WebFetch 请求（含 `/27/popular/evolutions`）返回 **HTTP 403 / 641 B**，必须走浏览器 CDP；实测 `/27/players`、`/27/popular`、`/27/popular/evolutions` 均可正常读取。
- 已知取数限制（实测）：开服前 `pc_price` 三档筛选页（≥100万 / 30–100万 / 10–30万）返回 0 行，是**筛选在开服前失效**而非「无卡」；此类空档必须如实记为缺失，不能据此推断市场无卡，更不能编造价格。
- `engine/data`、`gold/data`、`evolution/data`、`icons/data`、`heroes/data`、`totw/data` 是可复用数据源，不因报告失败而覆盖。
- `engine/output/`只放可重建截图与分析缓存；公众号集成位于 `integrations/wechat/`，不得由日报任务自动发布。
- 进化专栏内容单独写入 `../../reports/daily/D/evolution.html`（可选），由首页右栏收录，不作为 market.html 的一部分。
- Cross与PC价格分开保存；FC26历史不能冒充FC27实时行情。
- 共用查询能力优先进入 `engine/src/player-data.mjs` 或根目录 `../../shared/`，不要为WorkBuddy复制数据库。

---

## 附录 6：`apps/portal/AGENTS.md`

# 汇总入口任务约定

本目录只负责读取三个已完成的当日报告，生成 `../../reports/daily/D/summary.html`，并刷新 `../../daily-merged/index.html`。

- 执行前读取 `../../automation/prompts/daily.md`。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；本任务是纯本地合并，**不打开任何浏览器、不跑浏览器自检**（不启动 IAB、Chrome、CDP Proxy，也不为「检查」而联网）。
- 不采集新闻、足球或市场数据，不修改单项报告内容。
- 缺失板块显示真实空状态，不使用历史数据补齐当天。
- 共享主题位于 `../../shared/presentation/`，固定路径来自 `../../shared/config/project.json`。
- 历史日期倒序生成；固定入口始终可由日期化报告重建。

---

## 附录 7：`automation/AGENTS.md`

# 自动化编排约定

本目录负责四任务的执行契约、单次运行所有权、证据、超时、合并和发布验证，不保存业务数据库。项目已从 DuMate 迁移到 WorkBuddy。

- `prompts/` 是 WorkBuddy 定时任务的入口；路径必须引用优化后的绝对项目位置。
- 所有任务每次执行必须读取根 `../AGENTS.md` 的“浏览器强制规则”；编排提示应明确走 **Web Access（浏览器自动化）技能的 CDP 模式**，不要写 `extension` 或 Chrome 插件。
- 四个采集任务必须在 WorkBuddy 定时任务配置中绑定 `Web Access（浏览器自动化）` 技能，并直接复用用户日常 Chrome 登录态。不得探测或调用 `dumate-browser-cli`、`automation/browser-env.sh`、`DUMATE_*`、`fc-browser-channel-check` 历史探针或 `agent-browser`；连接是否成功只以本轮实际打开来源并读取页面为准，不再按 DuMate 环境缺失判错。
- 采集前先跑 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 2` 表示 `~/.workbuddy/skills/web-access/config.env` 的 `WEB_ACCESS_BROWSER` 未设（无人值守会卡死，必须是 `chrome`）；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选，Agent 不能代勾。
- `prompts/*.md` 是完整提示词；调度器只保存 `task-definitions.json` 的短启动提示，不复制业务规则。
- `runs/D/<module>/` 保存 owner、state、evidence、work 和不可变报告快照。同日重跑必须显式归档旧 attempt，不能静默覆盖。

### 单次运行生命周期（`run-state.mjs`）

```bash
node automation/run-state.mjs begin  <module> D            # 正常启动
node automation/run-state.mjs begin  <module> D --rerun    # 同日重跑（先归档旧 attempt）
node automation/run-state.mjs prepare-rerun <module> D     # 只归档、不启动（排查用）
node automation/run-state.mjs finish <module> D <RUN_ID> <success|partial|failed> <evidence.json>
```

- **同日重跑必须带 `--rerun`**：上一轮的 `owner.json` 会残留 `status:"running"` 锁（脚本用 `openSync(owner.json,'wx')` 抢锁），不带 `--rerun` 的 `begin` 必定返回 `accepted=false`（「本日任务已启动或已完成」）。带 `--rerun` 时先把 `owner.json`/`state.json`/`report.html`/`evidence.json`/`work` 等归档到 `runs/D/<module>/attempts/<旧runId>/`（仅 rename，非破坏性），再开新 run。
- 只有 `state.status === 'running'` 时 `--rerun` 会被拒绝（「当前运行仍在进行」）。
- **提交硬上限是 `startedAt + 20 分钟`**（`deadlineAt` 字段的 15 分钟只是提示）：超时提交 `success`/`partial` 会被「超过提交期限，不接受迟到版本」拒绝。子任务应在第 14 分钟左右收口转 `partial`，宁可覆盖不全也不要超时作废。
- `finish` 对 `success`/`partial` 的强校验：报告 mtime ≥ `startedAt`、HTML 含当日日期并以 `</html>` 结尾、`evidence.sources` 非空、**每个 `openedAt` ≥ `startedAt`**；且 `missingItems` 非空时 `success` 会被自动降级为 `partial`。
- `failed` 也会在条件满足时报存快照（报告 mtime ≥ `startedAt`、含日期、以 `</html>` 结尾、含 FAILED 标记），用于让汇总页展示如实状态。
- 每次运行 `owner.json`、`state.json`、`evidence.json` 是权威记录；`evidence.sources` 只是记录，不能代替实际打开来源。
- `coordinate.mjs` 只读取已完成快照并合并；新闻失败不阻断其他任务。合并成功后 `publish=delegated`，由同一会话用 WorkBuddy 站点发布能力发布 `daily-merged/`。
  - 同日重开：`node automation/coordinate.mjs D --prepare-rerun`（归档上一轮，写到 `runs/D/coordinator-attempts/<时间戳>/`）→ `node automation/coordinate.mjs D --rerun`。
  - **级联规则（重要）**：`available` 只统计 `['football','news','market']` 中**有 `snapshotPath` 且文件存在**的模块（`evolution` 是可选模块，不参与该计数）。三者全都没有快照时 `merge='no_current_snapshot'`、`publish='skipped'` —— 这是**有意设计**，拒绝用空状态页覆盖线上站点。因此「采集全体失败」时汇总发布任务必然 `failed`，它通常**不是独立故障**，排查时先查采集任务的浏览器通道。
  - `coordinator-state.json` 的 `unattendedPublishingVerified` 字段**恒为 `false`**（`coordinate.mjs` 只在初始化时写死该值，之后不再更新），**不代表发布失败**，不要误判。发布的权威记录在 `automation/publish-status-D.json`（由 `verify-publication.mjs` 写入）。
  - 合并脚本在系统临时目录做隔离 stage，并把 `apps/portal/assets/`、`apps/market/engine/icons/reports/` 一并拷入；改动这些常驻内容源时无需额外接线。
- 启用任务失败用 `failed`，有真实部分数据用 `partial`；只有共享配置明确关闭才能用 `skipped`（`finish` 会拒绝启用中的任务提交 `skipped`）。
- 修改生成器或路径后运行 `node --test execution.test.mjs regression.test.mjs verify-publication.test.mjs news-media.test.mjs`。
- 不在此目录复制 `shared/` 中的路径、主题和通用函数。
- 旧 DuMate 单文件发布脚本（`publisher`、`probe-console-session.mjs`）已废弃，仅作历史保留，不要在新流程中调用。

---

## 附录 8：`shared/AGENTS.md`

# 共享层约定

本目录是四个任务和未来WorkBuddy的唯一共享层。

- `config/`保存稳定任务ID、输入输出路径模式和固定链接。
- `lib/`保存日期、路径、原子写入等无业务偏好的通用能力。
- `presentation/`保存合并阶段共用主题与布局适配器。
- 共享接口保持向后兼容；业务专属逻辑仍留在对应 `apps/<task>/`。
- 禁止保存密钥、浏览器状态、日报成品、任务运行状态或大体积原始数据。
- 所有调用方每次执行先读取根 `../AGENTS.md` 的“浏览器强制规则”；共享配置只声明 CDP 浏览器通道与其偏好（`chrome`），**不保存登录态**，也不声明 Chrome 插件 / `extension` 模式。
- 修改共享代码后必须运行自动化回归和受影响任务测试。

---

## 附录 9：`reports/AGENTS.md`

# 报告产物约定

本目录只保存可交付报告，不保存源代码、浏览器缓存或中间文件。

- `daily/YYYY-MM-DD/`保存当天 `football.html`、`news.html`、`market.html`、`summary.html`；文件名固定。
- `research/<topic>/`保存跨日期研究报告及其可复核CSV/JSON。
- 历史报告默认不可修改；同日明确重跑由自动化先归档旧attempt，再原子替换当前成品。
- 禁止使用其他日期的数据伪装当天更新，缺失板块保留空状态。
- WorkBuddy读取最终报告或结构化研究文件，不直接解析 `automation/runs/`中的临时文件。
- 处理报告前回读根 `../AGENTS.md` 的“浏览器强制规则”；本目录自身不启动浏览器。

---

## 附录 10：`daily-merged/AGENTS.md`

# 固定汇总站点约定

本目录是 WorkBuddy 站点发布（多文件静态站点）的本地发布源，包含 `index.html`、历史日报归档 `archive/` 与共享资源 `assets/`。

- 禁止手工编辑 `index.html` 或 `archive/*.html`；使用 `../apps/portal/merge_daily_report.mjs D` 重建。
- 执行前回读根 `../AGENTS.md` 的“浏览器强制规则”；生成固定入口**不需要也不允许**打开浏览器（纯本地，不跑浏览器自检）。
- `index.html` 只含当日内容 + 历史日报链接列表（`archive/D.html`），历史日报不内嵌，避免 index 随历史无限膨胀，稳定控制在 50M 以内。
- `archive/` 保存每个日期独立的 dashboard 风格日报，版式与 `index.html` 完全一致。
- `assets/` 保存共享静态资源（如 `yanzu-banner.jpg` 海报）；源文件维护在 `../apps/portal/assets/`，合并时自动同步。
- 发布方式：用 WorkBuddy 站点发布能力发布本目录，入口页 `index.html`；更新同一应用（「FC27每日情报台」，`updateExistingApp`），保持公开链接 `https://fc27-site.app.workbuddy.host/` 不变。本目录含 `index.html` 与 `archive/*.html` 多个 HTML，发布时须显式指定 `entryHtml: "index.html"`，避免入口被判错。
- 发布成功与否必须由 `../automation/verify-publication.mjs D` 核验：本地与线上逐字节一致、含 `archive/D.html` 链接、含当日日期锚点、HTML 完整，四项全通过并 `exit 0` 才算发布成功。**生成成功不等于线上已更新。**
- **边缘缓存坑（实测）**：发布后根路径 `https://…/` 可能出现多版本缓存轮询（曾观测到旧版命中多次），而显式路径 `https://…/index.html` 立即命中最新版。verify 失败时**先别改代码**：用显式路径复查，并隔几分钟重新采样根路径（通常 3–4 分钟收敛）。
- 发布级联前提：`coordinate.mjs` 在 `['football','news','market']` 全无快照时会 `publish='skipped'`，此时本目录不会被更新，线上继续保留上一期内容——这是有意的保护，不是发布环节故障。

---

## 附录 11：`automation/prompts/README.md`

# 调度器提示词入口

本目录中的五份文件是 WorkBuddy 任务的完整提示词，覆盖四个内容任务和一个汇总发布任务：

- `football.md`：足球日报 —— 逐联赛核验积分榜 / 射手榜 / 助攻榜与足球资讯。
- `news.md`：FC27 资讯采集 —— 从 `apps/news/sources.txt` 的 X 账号采集近 24 小时资讯；**采集固定四步**（DOM 抽取 → syndication 接口补媒体 → 生成报告 → 校验提交），媒体不得从 DOM 抠取，带视频的推文不得整条丢弃。
- `market.md`：FC27 市场扫描 —— 概览四段 + 扫描双维度 + 传奇监控逐日台账。
- `evolution.md`：FC27 进化专栏 —— 热门进化卡与前置条件核验。
- `daily.md`：汇总链接 —— 纯本地等待快照、隔离合并并发布站点。

WorkBuddy 定时任务只保存 `../task-definitions.json` 中对应的 `bootstrapPrompt`。启动后先读取根 `AGENTS.md`，再完整读取对应 `promptFile`；不得把业务规则复制回 WorkBuddy 或另一份配置。修改任务要求时只改本目录的完整提示词。

`publish.md` 是发布能力契约，不是第五个日常任务；只有 `daily.md` 明确要求且发布器已经验证时才读取。

---

## 附录 12：`automation/prompts/daily.md`

# 综合任务执行入口（2026-09-15 · WorkBuddy 发布版）

每天 Asia/Shanghai 03:00 启动。固定日期 D。此任务不采集新闻或足球，不启动独立任务，不写子报告，不修改子报告布局，不探索发布接口。

## 一、本地合并

只运行 `node /Users/wuyanzu/Desktop/FC/automation/coordinate.mjs D`。工具返回后台进程时以每次最多 60 秒的等待轮询该进程，不新建同一命令。协调脚本最多等待 20 分钟，仅读取本日各单项 run-state 的完成快照，拒绝用旧状态或运行中报告作成功产物，在隔离目录完成合并并原子更新首页与历史日报归档，合并限制 60 秒。

合并成功后，本地应存在：
- `daily-merged/index.html`（固定入口，只含当日内容 + 历史日报链接列表）
- `daily-merged/archive/D.html`（当日历史日报独立文件，并保证全部历史日期版式统一）
- `daily-merged/assets/yanzu-banner.jpg`（共享海报资源）

协调器等待足球日报、FC27资讯和FC27市场监控三个单项快照；`evolution`（进化专栏）为**可选模块**：有已完成快照则从快照收录，没有也不影响合并。缺失板块按真实状态显示，不使用旧数据冒充。即使全部采集失败，只要各任务生成了当日失败状态快照，也要合并并发布 D 的状态页，让固定入口始终显示当天日期和真实失败原因；不得继续展示昨天内容造成“仍是昨天”的误解。合并前确认足球三榜校验通过（`node automation/verify-football-boards.mjs D`），市场报告已由 `render-market.mjs` 输出概览 + 扫描两份产物。五个日常任务均为 03:00，禁止新增重复调度。历史去重数据不得修改。每日输出目录为 `reports/daily/D/`。

## 二、发布到 WorkBuddy（自动发布）

合并成功后，使用 WorkBuddy 站点发布能力发布本地目录：

- 发布目录：`/Users/wuyanzu/Desktop/FC/daily-merged`
- 入口页：`index.html`
- 发布清单：`index.html` + `archive/*.html` + `assets/*`（多文件静态站点，相对路径必须可用）
- 目标是**更新已发布的同一个应用**（应用名：FC27每日情报台），保持分享链接不变；不要创建新的重复入口。

发布后用 `node /Users/wuyanzu/Desktop/FC/automation/verify-publication.mjs D` 复核线上与本地逐字节一致、当日历史日报链接存在、HTML 完整。线上缓存未刷新时做实际刷新验证，不能只凭发布工具返回成功判定完成。若发布能力不可用，如实记录“本地已生成、线上未更新”，保留原线上版本，不伪造成功、不下线旧页、不更换入口。

收尾：将发布日期、线上链接、验证结果及失败原因保存到 `automation/publish-status-D.json`（不含认证信息），并向用户提供固定入口与本次发布状态。

旧 DuMate 单文件 artifact 通道已废弃，不要再探索或调用。

浏览器强制规则：每次先读取根 AGENTS.md 对应段落。本任务只做本地合并与站点发布，不得启动 IAB、Chrome 或其他浏览器；发布核验仅由既有验证脚本与站点发布能力执行。

---

## 附录 13：`automation/prompts/football.md`

# football 单项执行契约（2026-09-11）

本文件为实际执行入口规则。每日 03:00 调度，每个单项只采集和生成自己的数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin football D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin football D --rerun`（先把旧 attempt 归档到 `automation/runs/D/football/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物。保留既有模板结构，展示由合并器统一处理；日报任务不得重构 CSS、补齐设计要求或恢复旧页面。有效数据不足时提交 partial，不能以旧日期改写冒充新报告。
4. 将本轮证据写入 `automation/runs/D/football/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish football D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。证据字段只是记录，不能代替实际打开来源。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。启用中的任务不能用 skipped 掩盖采集或生成失败。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

完整读取 apps/football/templates/football-daily.html，只复用数据结构、联赛 Tab、积分/射手/助攻切换和资讯筛选交互。展示样式由 shared/presentation/report-theme.mjs 统一为深色荧光绿布局。不要运行历史一次性补丁来冒充当日数据更新。

先获取当前赛季和比赛阶段，再检索本轮截止时间前 24 小时的新闻和最新排行榜。联赛/赛事官方数据优先，懂球帝及 BBC Sport、ESPN、Sky Sports 等用于补充和交叉检查。每条新闻必须打开原文核实，保存文章链接、发布时间、采集时间；不以搜索摘要为最终证据，不使用首页或搜索页充当原文链接。使用常见中文人名和队名。

积分榜覆盖官方当前所有参赛队，美职联分东/西区；不沿用写死的历史球队数量。射手和助攻榜尽量各取前 10，赛季尚未开赛或不足 10 人时如实说明。欧冠按实际阶段展示官方排名；抽签种子、赔率和预测不可冒充积分榜。数据冲突时记录源的更新时间和口径，不凑表。

今日头条目标 6–8 条独立重要事件，使用 data-league="toutiao"；资料不足可以少于目标并说明。其余覆盖转会、战报、伤停、杯赛和俱乐部动态；不为每个栏目硬凑新闻。同一事件多媒体报道合并保留可靠原文。

生成 reports/daily/D/football.html，先写临时文件，通过检查后原子替换当天报告。即使当天已有文件也允许有证据的刷新，但失败不能覆盖上次有效文件。核查所有联赛 Tab 都有对应数据或明确空状态，mls_east/mls_west 正确拆分，ucl 的榜单与阶段一致；积分、场次、净胜球逻辑合理；卡片数量与筛选计数一致，filterNews 和榜单切换能工作。对数据缺口标注缺失及截止时间，禁止伪造完整性。

## 三榜栏目（必做，缺一不可）

积分榜、射手榜、助攻榜是本任务的固定交付栏目，必须**逐联赛分别核验**，不得相互复制：

- 三个数据块 `standingsData`（每行 10 列：排名/球队/赛/胜/平/负/进/失/净/积分）、`scorersData`、`assistsData`（每行 4 列：[排名, 球员, 球队, 进球数或助攻数]）必须内容互不相同。
- 严禁把积分榜数据整段填入射手榜或助攻榜，也严禁射手榜与助攻榜互相复制——这是本任务历史真实故障，会被校验闸门直接判失败。
- 严禁「某联赛缺数据时自动回退到英超」的静默兜底：缺哪个联赛就如实留空并标注「本轮未逐条核验」，绝不沿用旧值或借用其他联赛。
- 每个联赛尽量取前 10；不足 10 人或赛季未开赛时如实说明名额与实际条数。
- 提交前**必须**运行校验闸门：`node automation/verify-football-boards.mjs D`。退出码非 0 时不得提交 success；修正数据后重跑，仍不通过则提交 partial 并在证据中记录未通过项。

浏览器强制规则：每次先读取根 AGENTS.md 对应段落；直接调用定时任务已绑定的 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。**采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选（不得代勾、不得改用其他浏览器）；也不要使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。** 禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。

---

## 附录 14：`automation/prompts/news.md`

# news 单项执行契约（2026-09-16 修订：媒体改走 syndication 接口）

本文件为实际执行入口规则。每日 03:00 调度，每个单项只采集和生成自己的数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin news D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin news D --rerun`（先把旧 attempt 归档到 `automation/runs/D/news/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物。保留既有模板结构，展示由合并器统一处理；日报任务不得重构 CSS、补齐设计要求或恢复旧页面。有效数据不足时提交 partial，不能以旧日期改写冒充新报告。
4. 将本轮证据写入 `automation/runs/D/news/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。每个 `openedAt` 必须晚于本轮 `startedAt`；不得通过 `touch` 报告或复制旧 run 的来源记录伪造新运行。运行 `node automation/run-state.mjs finish news D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。证据字段只是记录，不能代替实际打开来源。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。启用中的任务不能用 skipped 掩盖浏览器、采集或生成失败。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

在 /Users/wuyanzu/Desktop/FC 生成 FC27 资讯雷达。日期 D 使用总任务提供的 Asia/Shanghai 日期；独立执行时在开始时固定日期。

浏览器只使用本任务已绑定的 `Web Access（浏览器自动化）` 技能（CDP Proxy 直连用户日常已登录 Chrome），**不再使用 Chrome 插件 / `extension` 模式**。采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选，不得改用其他浏览器。不得运行 `dumate-browser-cli`、`automation/browser-env.sh`、`apps/news/auto_news.sh` 或 `automation/collect-news.mjs`，也不得因缺少 `DUMATE_*` 环境变量把本轮误判为失败。是否能采集以本轮实际打开来源并读取页面为准。不得打印、复制或改写任何认证文件。

每次重新读取 `apps/news/sources.txt`，不硬编码账号数量。采集按下面四步走，不要自创步骤：

1. **时间线抽取（DOM）**：用 Web Access 技能逐个访问账号主页，对页面执行 `apps/news/extract-timeline.js` 的内容（可直接读取该文件后 `/eval`）。它只负责拿推文 ID、链接、作者、时间和正文，以及 `hasVideo/hasPhoto/hasCard` 三个媒体存在标记。**不要**在 DOM 里抠图片地址——X 在后台标签页把媒体渲染成模糊骨架占位符（`[data-testid="tweetPhoto"]` 内没有 `<img>`），DOM 里的图既不可靠也不完整。
2. **媒体解析（接口）**：把第 1 步的结果写入 `apps/news/data/tweets-D.json`，再运行 `node apps/news/enrich-tweet-media.mjs D`。它调用 X 公开 syndication 接口，补齐权威的 `images`（正文配图）、`video`（封面 + mp4 直链 + 时长 + kind）、`card`（链接卡片标题/缩略图/目标地址）、`quoted`（被引用推文及其配图）与 `mediaResolved` 标记。
3. **生成报告**：`node apps/news/generate_report.mjs D`。
4. **翻译与校验**：见下文。

总采集阶段以 10 分钟为上限，剩余时间用于翻译、原图保存、校验和提交；**提交的硬上限是 `startedAt + 20 分钟`**，超时会因「超过提交期限」被拒，故最迟第 14 分钟必须收口转 `partial`。遇到运行锁先核实原任务是否仍运行，不盲目删除；同日重跑用 `node automation/run-state.mjs begin news D --rerun`。

只收录可核对发布时间、原始推文链接和正文的 FC27 相关信息。排除纯预测、纯推广，以及**除视频封面外没有任何信息文本**的纯视频/纯 GIF 内容；**带信息量的视频推文正常收录**，并在卡片上标注「视频 / 动图 GIF + 时长」与在原推中观看的入口（历史上「带 video 元素整条丢弃」的做法导致视频内容长期缺失，不要再那样做）。同一账号转发与同一推文 ID 去重。同一球员或同一 SBC 主题不能直接当作同一事件合并。官方公告与未经证实的爆料分开标注，不把 FC26 消息自动当作 FC27。

每张卡片包含博主、时间、完整中文翻译、可折叠原文、媒体区、原推链接，保留多列网格与移动端单列布局。媒体区按下面三态之一渲染，且所有媒体与占位都链接到原推：① 有配图/视频封面/链接卡片 → 正常展示，视频额外标注「视频 / 动图 GIF + 时长」；② `mediaResolved=false` → 显示「本条推文的媒体信息本轮未能解析，不代表原推没有配图」；③ 有 `hasVideo/hasPhoto/hasCard` 但未取到地址 → 显示「原推含媒体，本轮未取到媒体地址」；只有三者皆无才可写「原推为纯文本，无配图」。翻译服务失败时由执行任务的 AI 完成翻译，使用当日 `data/tweets-D.json` 保存完整数据；「术语替换」和英文混排不算翻译完成，未完成项必须明确标记为「待翻译，请查看原文」。

凡是 `pbs.twimg.com` 上的推文媒体都要落盘到 `reports/daily/D/assets/news/` 后再写入报告：正文配图（`/media/`，规范为 `name=orig`）、视频/动图封面（`/media/` 或 `/amplify_video_thumb/`）、链接卡片缩略图（`/card_img/`）。放行规则由 `shared/lib/report-assets.mjs` 的 `isCacheableXImage()` 统一判定，**不要**再自己写 `/media/` 正则。下载是两级：`generate_report.mjs` 先用 curl 直连，**本机拉不下来的会自动经用户浏览器（CDP）补下**——本运行环境的出口代理到 `pbs.twimg.com` 不通（直连被 reset、走代理 TLS 握手失败），所以「curl 报 SSL_ERROR_SYSCALL」属预期现象，不要据此判定图片无法保存。浏览器兜底需要 CDP Proxy 在线（本任务采集阶段本就在用），若 proxy 不可用则报告至少为 `partial` 并记录未落盘数量。合并器负责把这些本地资产内嵌到单文件汇总。不得只保留远程热链，也不得用 `onerror` 隐藏加载失败。媒体接口解析失败（`mediaResolved=false`）时，报告必须显示「媒体未解析」，**不得**写成「原推为纯文本，无配图」。

data/seen_tweets.json 是历史资产，禁止重置。只有 `generate_report.mjs` 可在报告校验通过后原子更新它；执行 AI、临时 Python/Node 脚本和手动翻译步骤均不得直接写此文件。生成器更新前必须保留 `data/seen_tweets.json.bak`。损坏时先从该备份核实恢复；备份不可用时可从 Git 中已跟踪的基线与各日 `tweets-D.json` 快照合并恢复，仍无法恢复就停止该子任务，绝不能创建空 seed 继续。报告成功生成后才提交去重记录；同日重跑合并当日已有内容，不因全部推文已看过就覆盖为空。保留原始采集文件和备份用于追溯。

输出 `reports/daily/D/news.html`。提交前按下表自检，任何一项不达标都要写进 `missingItems` 并按 `partial` 提交，不得声称已完整覆盖：

| 检查项 | 通过标准 |
|---|---|
| 当日日期 | 报告与快照的 `date` 均为 D |
| 卡片数量 | 与 `data/tweets-D.json` 的条目数一致，非 0（除非确实无内容） |
| 中文完整性 | 每条卡片都有中文翻译或明确的「待翻译」标记 |
| 媒体解析 | `enrich-tweet-media.mjs` 输出的失败条数与报告中的「媒体未解析」卡片数吻合 |
| 图片落盘 | 报告里的 `src` 全部指向 `assets/news/`，无远程热链；未落盘数量记入证据 |
| 账号覆盖 | 记录本轮成功打开 / 总数，未打开账号逐个列明 |
| 来源链接 | 每张卡片都有可点的原推链接 |

只有全部来源成功且确实无相关内容时才可写「本期无新资讯」；访问失败、媒体解析失败、图片落盘失败、翻译失败分别记录，不得合并成一句「部分失败」。失败时保留上次有效报告。

浏览器强制规则：每次先读取根 AGENTS.md 对应段落；直接调用定时任务已绑定的 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`apps/news/auto_news.sh`、`automation/collect-news.mjs`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。

---

## 附录 15：`automation/prompts/market.md`

# market 单项执行契约（2026-09-11）

本文件为实际执行入口规则。每日 03:00 调度，每个单项只采集和生成自己的数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin market D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin market D --rerun`（先把旧 attempt 归档到 `automation/runs/D/market/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物。保留既有模板结构，展示由合并器统一处理；日报任务不得重构 CSS、补齐设计要求或恢复旧页面。有效数据不足时提交 partial，不能以旧日期改写冒充新报告。
4. 将本轮证据写入 `automation/runs/D/market/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish market D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。证据字段只是记录，不能代替实际打开来源。
5. 市场任务当前已由用户明确启用。失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；数据不足但能形成如实报告则提交 partial。只有用户再次明确暂停且 `shared/config/project.json` 中 market 为 `enabled: false` 时才可提交 skipped。启用中的市场任务不能用 skipped 掩盖数据源、采集或生成失败。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

在 /Users/wuyanzu/Desktop/FC/apps/market/engine 执行 FC27 市场研究。市场任务已明确启用，日期 D 由总任务统一提供。先读取 `modules/market-segments.json`，分别完成各模块。

以 FUTBIN 实际可用的 FC27 数据为准；数据库、开服价格或进化任务尚不可用时记录原因，不用 FC26 数据冒充 FC27。默认 Cross 平台，PC 数据单独保存。每条记录保留稳定卡牌 ID、版本、球员名称/中文译名、评分、位置、卡类型、可交易性、价格单位、源 URL 和采集时间。排除不可交易 SBC、任务、租借和交换卡，不覆盖 FC26 历史数据。

## 三份产物 + 一个常驻研究子标签（互不覆盖）

市场模块每天产出**三个并列文件**，站点上以「市场概览 / 市场扫描 / 传奇监控 / 传奇卡研究」四个子标签切换展示，本任务**不得用其中一个覆盖另一个**。产物都由渲染器统一生成，不要手改它们的 HTML 版式。

### 1. `reports/daily/D/market.html` —— 市场概览（四段式，顺序与命名固定）

**一、本周活动卡与本周周黑**
分「本周活动卡（Promo）」与「本周周黑（TOTW）」两张表，采集本周实际发布的名单与发布时间；未公布或未采集则如实空状态。

**二、价格分层（每档监控 Top 50，按 Rating 排序）**
四个档位固定为：
- ≥ 100 万
- 30 - 100 万
- 10 - 30 万
- 1 - 10 万

每档最多列 50 张，**以 `https://www.futbin.com/27/players` 的 Rating 列降序**作为排序与识别依据。取数用该页的价格筛选参数直接分档拉取（PC 用 `pc_price`，PlayStation 用 `ps_price`，两者可叠加）：

| 档位 | FUTBIN 筛选参数 |
|---|---|
| ≥ 100 万 | `pc_price=1000000%2B` |
| 30 - 100 万 | `pc_price=300000-1000000` |
| 10 - 30 万 | `pc_price=100000-300000` |
| 1 - 10 万 | `pc_price=10000-100000` |

价格未开放时各档如实空状态并附核验证据，不伪造采样、不用 FC26 价格填充。

**三、传奇卡与英雄卡**
传奇（Icon）与英雄（Hero）卡名单；未独立核验卡类型时如实标注「待核验」。

**四、热门进化卡**
来源 `https://www.futbin.com/27/popular/evolutions`；无可用进化则如实空状态。

### 2. `reports/daily/D/market-scan.html` —— 市场扫描（双维度）

**维度一 · 价格维度**（按 Cross 平台最低价，单位 coins；1 万 = 10,000）
- 大卡：≥ 100 万
- 中卡：30 万 ≤ 价格 < 100 万
- 热门卡：10 万 ≤ 价格 < 30 万
- 适用卡：1 万 ≤ 价格 < 10 万
- 万元以下单独另列，不丢失。价格未开放时各档如实空状态并附核验证据，不伪造采样。

**维度二 · 热门球员维度**（按 FUTBIN 热门度，与价格无关）
- 主来源：https://www.futbin.com/27/popular
- 子类① 热门进化卡：https://www.futbin.com/27/popular/evolutions
- 子类② 价值卡：热门榜中的**非进化卡**（即热门球员里未参与进化的卡）
- 必须注明排序指标就是 FUTBIN 热门页所示的引用/使用热度；没有热度来源就不用「搜索热度」排序。

### 3. `reports/daily/D/market-icons.html` —— 传奇监控（FC27 全部基础传奇卡逐日价格变化）

**监控对象固定为 FC27 全部基础传奇卡（Icon，全量 131 张，rating ≥ 88）**，不含 Debut Icon、英雄卡（Hero）及任何特殊版本。

1. 采集当天的 FC27 基础传奇卡名单与价格，写入 `apps/market/engine/icons/data/prices/fc27/base-icons.json`（沿用现有抓取格式，含 `id` / `slug` / `nameZh` / `rating` / `currentPrice` / `marketUrl` / `launchDate`）。
2. 运行 `node apps/market/engine/scripts/record-icons-daily.mjs D`，把当天结果固化为当日快照 `apps/market/engine/icons/data/prices/fc27/daily/D.json`。
   - 一天一份，**同日重跑只覆盖当天快照，绝不删改其他日期**；写入采用临时文件原子替换。
   - 抓取结果缺失或不可用时，本步骤必须非 0 退出并**不写入任何快照**，不得伪造。
   - 价格 < 1000 视为占位值，`priceValid=false`；开服日（`launchDate`）前 `priceBasis=listing-estimate`，开服后为 `market`。
3. 渲染 `market-icons.html`：状态卡（开服倒计时 / 当日有效价卡数 / 已记录快照天数）、大盘中位价走势、全量台账（评分 / 位置 / 六维 / 金特技 / 价格 / 日环比 / 累计涨跌 / 逐卡走势）、逐日快照记录、来源与缺失项。
4. **口径要求**：FC27 未开服时 FUTBIN 只有列表页占位价，不是市场成交价 —— 此口径下页面**不得计算日环比与累计涨跌**，只做台账与记录进度，并如实标注口径；开服后自动切换为真实成交价逐日监控。任何缺失一律如实空状态，不用 FC26 或旧日期数据填充。

### 子标签「传奇卡研究」—— 跨日期常驻，不是每日产物

FC26↔FC27 阵容对照、属性与金特技变化、FC26 首月传奇卡市场基准、FC27 全量 131 张价格预测与投资分档，由常驻底稿 `apps/market/engine/icons/reports/fc27-icon-analysis.html` 提供，由合并器内嵌为市场栏目第四个同名子标签。

- 日任务**不需要**重新生成它，也不要删除或清空该底稿。
- 合并器优先取当日 `reports/daily/D/market-icons-research.html`，缺失则回退到上面的常驻底稿。
- 只有用户明确要求更新该研究时才重跑分析，并把新报告同步覆盖底稿；否则线上会继续展示旧版。

## 产出流程

1. 把三份产物所需的结构化结果写入 `automation/runs/D/market/market.json`：概览数据放 `overview`（`weekly.promo` / `weekly.totw` / `priceTiers[].items` / `iconsHeroes` / `evolutions`），扫描数据放顶层（`priceDimensions`、`popular.evolutions`、`popular.value`），另附 `sources` / `missing` / `notes`。结构见 `modules/market-segments.json` 与 `apps/market/AGENTS.md`。
2. 先运行 `node apps/market/engine/scripts/record-icons-daily.mjs D` 固化当日传奇卡快照，再运行 `node apps/market/engine/scripts/render-market.mjs D`，一次生成 `market.html`、`market-scan.html` 与 `market-icons.html`。渲染器对缺失数据一律输出如实空状态。
3. 校验卡牌 ID 去重、平台隔离、时间戳、价格有效性、数量一致后再提交。失败保留原始数据和上次有效报告。
浏览器强制规则：每次先读取根 AGENTS.md 对应段落；FUTBIN 及其他网页直接调用定时任务已绑定的 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。**采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选（不得代勾、不得改用其他浏览器）；也不要使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。FUTBIN 拒绝 curl/WebFetch 静态请求（403），必须走 CDP。** 禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。

---

## 附录 16：`automation/prompts/evolution.md`

# evolution 单项执行契约（2026-09-15）

本文件为进化专栏任务的执行入口规则。每日 03:00 调度，只采集和生成进化专栏数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin evolution D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin evolution D --rerun`（先把旧 attempt 归档到 `automation/runs/D/evolution/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物，版式由渲染器统一，不要手写或改造 HTML。
4. 将本轮证据写入 `automation/runs/D/evolution/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish evolution D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

进化专栏服务于站点「进化专栏」（首页右栏 + 独立视图）。数据来源与顺序：

- **热门进化卡主来源**：https://www.futbin.com/27/popular/evolutions （Popular Evolution Players 榜单）。逐条核验卡名、评分、位置、进化名称、费用、到期时间与前置条件（评分上限、位置、卡版本、可交易性等）。
- **候选球员**：需要补充候选时参考 https://www.futbin.com/27/players 的 Rating 列与位置筛选，说明候选口径。
- 每张卡保留：球员名称/中文译名、Rating、位置、进化名称、费用、到期时间、前置条件、源 URL、采集时间。
- 区分「可证实的卡面事实」与「推断的进化路线建议」；路线建议必须给出前提条件与失效情形，不输出无依据的精确收益预测。
- 页面无可列出进化卡时，如实输出空状态并记录核验证据（例如页面显示 No evolutions found），不得用 FC26 或其他日期数据填充。

## 产出流程

1. 把结构化结果写入 `automation/runs/D/evolution/evolution.json`：
   `{ date, status, generatedAt, dataCutoff, evolutions: [{ rank, name, rating, pos, evolutionName, cost, expires, requirements[], url }], routes: [{ name, cost, desc, steps[], note }], sources: [{ url, openedAt, note }], notes: [], missing: [] }`
2. 运行 `node apps/market/engine/scripts/render-evolution.mjs D`，生成 `reports/daily/D/evolution.html`。渲染器对缺失数据一律输出如实空状态。
3. 校验卡牌 ID/名称去重、时间戳、费用与到期字段有效性后再提交。失败保留原始数据和上次有效报告。

浏览器强制规则：每次先读取根 AGENTS.md 对应段落；FUTBIN 及其他网页直接调用定时任务已绑定的 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。**采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选（不得代勾、不得改用其他浏览器）；也不要使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。FUTBIN 拒绝 curl/WebFetch 静态请求（403），必须走 CDP。** 禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。

---

## 附录 17：`automation/prompts/publish.md`

# 每日报告自动发布（2026-09-15 · WorkBuddy 版）

用户已授权每次总任务生成报告后自动发布及更新固定入口，不需要日常手动确认。只发布本项目的日报与汇总站点，不上传原始采集数据、密钥、去重历史或整个工作目录。

- 固定本地发布源：`/Users/wuyanzu/Desktop/FC/daily-merged/`
- 固定公开入口：https://fc27-site.app.workbuddy.host/
- 每日归档快照：`reports/daily/D/summary.html`
- 历史日报独立归档：`daily-merged/archive/D.html`
- 共享静态资源：`daily-merged/assets/`（含 `yanzu-banner.jpg`）
- 日期 D 使用总任务固定的 Asia/Shanghai 日期。

## 发布方式（WorkBuddy 站点发布）

使用 WorkBuddy 的站点发布能力（sites / App Publishing）发布本地目录 `/Users/wuyanzu/Desktop/FC/daily-merged`，入口页 `index.html`。这是**多文件静态站点**：`index.html` + `archive/*.html` + `assets/*` 一起发布，站内相对链接（`archive/D.html`、`../assets/yanzu-banner.jpg`）才能正常访问。更新的是**同一个已发布应用**（应用名：FC27每日情报台），分享链接保持 `https://fc27-site.app.workbuddy.host/` 不变，不新建重复入口、不下线旧页。

发布清单：
1. `daily-merged/index.html` → 固定入口（只含当日内容 + 历史日报链接列表，控制在 50M 以内）。
2. `daily-merged/archive/D.html` → 历史日报独立文件（每个日期一个文件，版式与入口一致）。
3. `daily-merged/assets/yanzu-banner.jpg` → 海报资源（sidebar 与首页卡片引用）。

## 发布边界

- 发布阶段只使用已验证的站点发布能力，失败最多重试两次；失败时记录“生成成功、发布失败/阻塞”，保留原线上版本，结束本轮。不得探索接口、猜测参数、循环登录或临时编写发布程序。
- 不在命令行参数、日志、对话、项目文件或公开网页中写入 Cookie、密钥和令牌。
- 发布前运行合并脚本，确认入口 HTML 完整、三个板块视图存在、历史日报链接与海报资源齐全。允许明确标记缺失内容的部分日报，不将失败板块标为成功；没有任何有效板块时保留线上旧版本。

## 验证

发布后执行 `node /Users/wuyanzu/Desktop/FC/automation/verify-publication.mjs D`，比对本地 `daily-merged/index.html` 与固定公网入口的 SHA-256、当日历史链接与 HTML 完整性。再从公网打开固定入口，确认本次日期、三个板块视图与历史日报链接出现，点击当日链接核对内容；确保所有链接都不依赖本机路径。首页缓存未刷新时做实际刷新验证。

将发布日期、线上链接、验证结果及失败原因保存到 `automation/publish-status-D.json`（不含认证信息），并向用户提供固定入口与本次发布状态。

## 历史

旧 DuMate 单文件 artifact 通道（`www.dumate.cn/artifacts/7vbc68mkblkg`）自 2026-09-15 起废弃，不再使用；发布统一走 WorkBuddy 站点发布能力。

---
