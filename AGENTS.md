# FC 项目总约定

本项目用于采集足球与FC27资讯、研究FC27市场，并生成一个日期化日报与固定汇总站点。`apps/`只放四个业务任务（另有 2026-09-16 拆出的传奇/英雄卡监控任务，复用 market 引擎），`shared/`保存可被各任务和 WorkBuddy 共同调用的配置与代码，`automation/`只负责编排和运行状态，`reports/`只保存最终产物。项目已从 DuMate 迁移到 WorkBuddy，发布统一走 WorkBuddy 站点发布能力。

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

> 自检与修复流程详见本文件上方步骤；历史探针技能 `fc-browser-channel-check` 已作废，**不要调用**（它调用的 `dumate-browser-cli` 等入口都在禁止清单里）。

## FUTBIN 平台口径强制规则（市场监控 / 传奇英雄监控 每次采集必须遵守）

**FUTBIN 只提供 Console（PS / Xbox 合并）与 PC 两个市场口径，不存在「Xbox 独立」「PS 独立」第三档平台。两个平台都必须采集，缺一不可。**

### 页面结构（2026-09-16 实机核验）

| 要素 | 实测结果 |
|---|---|
| 每行价格单元格 | `td.table-price.platform-ps-only`（Console）与 `td.table-price.platform-pc-only`（PC）**同时存在于同一行 DOM** |
| 平台按钮 | `form.desktop-platform-change-form` 内 `button value="ps"`（文案 Console）/ `button value="pc"`（文案 PC） |
| 按钮行为 | **纯前端显隐切换**：默认 Console 单元格 `display:table-cell`、PC 为 `display:none`；点击后互换。**不刷新页面、不改 URL、不重新取数** |
| `td.table-item-score` | 开服前**估值列**（IS），**不是**平台成交价 |
| 开服日 | `launchDate = 2026-09-25`；之前两个平台价均为 0（球员页显示 `PRICE UPDATED: NEVER`） |

### 采集规则

1. **一次打开列表页即可同时读到两个平台价** —— 直接从 DOM 分别读两个价格单元格。不要为切换平台重复导航，不要截图后肉眼读数。
2. **不要依赖 URL 查询参数**：`ps_price=` / `pc_price=` 在开服前筛选失效；`rarity=` / `version=` / `page` 参数被服务端忽略（实测 `?rarity=icon`、`?rarity=hero`、`?version=icons` 返回的是同一批默认列表）。Icon / Hero 名单必须用页面自身的筛选 UI，或读全量列表后用台账比对归属。
3. **分别落库**：市场任务写 `players[].psPrice`（Console）/ `players[].pcPrice`（PC）；传奇英雄任务写逐卡 `platforms.console` / `platforms.pc`（`{price, valid}`）。**不得只采 Console 漏 PC，也不得用一个平台价顶替另一个**；某平台确无数据时如实留空。
4. 顶层 `platform` 写 `"console+pc"`，**不要**再用 `"cross"` 当平台名（`cross` 只是原始抓取里 Console 的别名）。
5. 价格 < 1000 视为占位值（`valid=false`）；开服前 `priceBasis=listing-estimate`，**不得**把估值当成交价，**不得**计算日环比与累计涨跌。
6. 渲染侧已就绪：`render-market-overview.mjs` / `render-market-report.mjs` / `render-market-icons.mjs` 都会为每个平台输出独立价格单元格并在页顶生成 Console / PC 切换按钮；采集侧只要把两个平台价如实写进 JSON 即自动生效，**不要手改 HTML**。

执行每日综合报告前读取 `automation/prompts/daily.md`；执行单项时读取对应的 `automation/prompts/{football|news|market|evolution|icons-heroes}.md`。发布规则读取 `automation/prompts/publish.md`。这些文件补充既有调度描述，若用户给出新的明确要求，以用户要求为准。

### WorkBuddy 定时任务（6 个，均在 03:00 / 03:05，Asia/Shanghai）

| 任务 | 时间 | 契约文件 | 产物 |
|---|---|---|---|
| FC·足球日报 | 03:00 | `prompts/football.md` | `football.html` |
| FC·资讯采集 | 03:00 | `prompts/news.md` | `news.html` |
| FC·市场监控 | 03:00 | `prompts/market.md` | `market.html` + `market-scan.html` |
| FC·进化专栏 | 03:00 | `prompts/evolution.md` | `evolution.html` |
| FC·传奇英雄监控 | 03:00 | `prompts/icons-heroes.md` | `icons-heroes.html` |
| FC·汇总发布 | 03:05 | `prompts/daily.md` | `daily-merged/` → 站点 |

- **市场监控与传奇英雄监控都必须遵守上方「FUTBIN 平台口径强制规则」**（Console + PC 双平台，缺一不可）；两者的调度提示词与 `automation/task-definitions.json` 的 `bootstrapPrompt` 都已写入该平台要求，改契约时三处同步。
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
  传奇/英雄的逐日快照由 `apps/market/engine/scripts/record-icons-daily.mjs D` 固化到 `apps/market/engine/icons/data/prices/fc27/daily/<DATE>.json`（逐卡含 `platforms.console` / `platforms.pc` 双平台价，采集规则同上方「FUTBIN 平台口径强制规则」；两平台都必须采，产物页同样带 Console / PC 切换）：一天一份、同日重跑只覆盖当天、原子写入，不删改历史；开服前不计算涨跌，只做台账与记录进度。该快照由「FC·传奇英雄监控」任务驱动。
  「传奇/英雄专栏」的第二个子标签「传奇卡研究」是**跨日期常驻**内容，源文件 `apps/market/engine/icons/reports/fc27-icon-analysis.html`（当日若有 `reports/daily/D/market-icons-research.html` 则优先）。它不是每日产物，重跑分析报告后必须同步覆盖该底稿，否则线上仍是旧版。
- 首页与每日日报共用 `apps/portal/dashboard.mjs` 同一模板；左侧导航固定为「今日总览 / 足球动态 / FC27 资讯 / FC27 市场 / 进化专栏 / 传奇/英雄专栏 / 历史日报」七个入口，右侧固定保留「进化专栏」卡片，由后续进化任务写入 `reports/daily/D/evolution.html` 后自动收录，未就绪时显示如实空状态。
- 「传奇/英雄专栏」是左侧导航的独立栏目（`LEGEND_TAB.label = '传奇/英雄专栏'`，面板 id `legend-column`，视图键 `legend`），内含两个子标签：「传奇/英雄监控」（当日产物 `reports/daily/D/icons-heroes.html`，受当日日期校验）与「传奇卡研究」（跨日期常驻底稿，由 `merge_daily_report.mjs` 的 `buildIconResearchPanel(D)` 读入：当日 `reports/daily/D/market-icons-research.html` 优先，否则回退 `apps/market/engine/icons/reports/fc27-icon-analysis.html`）。子标签通过 `subPanels.legend` 挂载；缺稿时显示如实空状态。改版式或调整该栏目时需同步 `apps/portal/dashboard.mjs`、`apps/portal/merge_daily_report.mjs`、`automation/coordinate.mjs`（`optionalPanels` 复制 `icons-heroes.html`）与 `automation/run-state.mjs`（`outputs['icons-heroes']`）。
- 新增或修改脚本时，文件开头必须有中文注释，说明脚本用途、输入和主要输出；Shebang可以位于第一行。
- 临时文件进入 `automation/runs/D/<module>/work/` 或系统临时目录，不得混入源代码、数据库或最终报告目录。
- 修改生成器后运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs`；测试使用隔离数据，禁止拿真实去重文件做破坏性测试。
