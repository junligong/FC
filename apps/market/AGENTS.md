# FC27市场任务约定

本目录负责FC26历史数据库、FC27卡库、价格、活动卡、周黑、进化研究，最终生成 `../../reports/daily/D/market.html` 与 `../../reports/daily/D/market-scan.html`。

> **2026-09-16 拆分**：传奇卡（Icon）与英雄卡（Hero）已**不再属于市场任务**，改由独立任务「FC27传奇/英雄卡监控」产出 `../../reports/daily/D/icons-heroes.html`，展示在站点「传奇/英雄专栏」（见 `../../automation/prompts/icons-heroes.md`）。本目录的 `icons/`、`heroes/` 仅作为**共享数据源**保留，市场任务不再渲染、不再提交传奇/英雄报告，也不再产出 `market-icons.html`。

- 执行前读取 `../../automation/prompts/market.md` 和 `engine/modules/market-segments.json`。
- 每天产出两个并列文件，互不覆盖，均由渲染器生成，不要手改 HTML 版式：
  1. `market.html` = **市场概览**，三段式固定结构：① 本周活动卡与本周周黑 ② 价格分层（≥100万 / 30-100万 / 10-30万 / 1-10万，每档 Top 50，按 `/27/players` 的 Rating 降序） ③ 热门进化卡。取数用 `/27/players` 的区间参数：`1000000%2B` / `300000-1000000` / `100000-300000` / `10000-100000`。
  2. `market-scan.html` = **市场扫描**，双维度：维度一价格（大卡/中卡/热门卡/适用卡，低于1万另列），维度二热门球员（热门进化卡 `/27/popular/evolutions` 与 价值卡 `/27/popular` 中的非进化卡）。
- **平台口径（Console / PC 双平台，必须都采）**：FUTBIN 只提供 **Console（PS / Xbox 合并）** 与 **PC** 两个市场，没有第三档。列表页每一行**同时渲染** `td.table-price.platform-ps-only`（Console）与 `td.table-price.platform-pc-only`（PC），因此**一次打开列表页即可同时读到两个平台价**；页顶按钮 `form.desktop-platform-change-form` 内的 `button value="ps"`（Console）/ `button value="pc"`（PC）**只是纯前端显隐切换**（不刷新、不改 URL、不重新取数）。
  - **不要**依赖 `ps_price` / `pc_price` URL 参数（开服前筛选失效），也**不要**为切换平台重复导航；`rarity=` / `version=` / `page` 参数同样被服务端忽略。
  - `td.table-item-score` 是开服前估值列，不是平台成交价。
  - 两平台价分别落库 `psPrice`（Console）/ `pcPrice`（PC）；顶层 `platform` 写 `"console+pc"`（不要再用旧的 `"cross"`）。渲染器自动输出两平台价格单元格与页顶切换按钮，**不要手改 HTML**。**不得只采 Console 漏 PC，也不得用一个平台价顶替另一个。**
- 「传奇卡研究」自 2026-09-16 起同样迁至「传奇/英雄专栏」子标签，常驻底稿仍在 `engine/icons/reports/fc27-icon-analysis.html`（跨日期、非每日产物，日任务不重跑也不得清空）。
- 数据统一写入 `../../automation/runs/D/market/market.json`（概览放 `overview`，扫描放顶层含 `players[]`），再运行 `node engine/scripts/render-market.mjs D` 一次渲染两份产物；缺失数据由渲染器输出如实空状态。站点上两者以「市场概览 / 市场扫描」子标签切换。`overview` 与 `players[]` 中不要写 `iconsHeroes` 字段。
- 传奇/英雄的逐日快照仍保存在 `engine/icons/data/prices/fc27/daily/<DATE>.json`，由 `engine/scripts/record-icons-daily.mjs D` 从当日抓取结果固化（含 `platforms.console` / `platforms.pc`）：一天一份、同日重跑只覆盖当天、原子写入，禁止删改历史日期；抓取失败时不写入快照。该快照由「传奇/英雄卡监控」任务驱动，市场任务不再写它。开服前（`launchDate` 之前）FUTBIN 只有列表页占位价，此口径下不计算日环比与累计涨跌。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；FUTBIN 等站点只能通过 `web-access` 技能的 CDP 通道访问用户日常 Chrome，禁止先试 IAB，也不要用 Chrome 插件 / `extension` 模式。
- **FUTBIN 静态路线不存在**：`curl`/WebFetch 请求（含 `/27/popular/evolutions`）返回 **HTTP 403 / 641 B**，必须走浏览器 CDP；实测 `/27/players`、`/27/popular`、`/27/popular/evolutions` 均可正常读取。
- 已知取数限制（实测）：开服前 `pc_price` 三档筛选页（≥100万 / 30–100万 / 10–30万）返回 0 行，是**筛选在开服前失效**而非「无卡」；此类空档必须如实记为缺失，不能据此推断市场无卡，更不能编造价格。
- `engine/data`、`gold/data`、`evolution/data`、`icons/data`、`heroes/data`、`totw/data` 是可复用数据源，不因报告失败而覆盖。
- `engine/output/`只放可重建截图与分析缓存；公众号集成位于 `integrations/wechat/`，不得由日报任务自动发布。
- 进化专栏内容单独写入 `../../reports/daily/D/evolution.html`（可选），由首页右栏收录，不作为 market.html 的一部分。
- Cross与PC价格分开保存；FC26历史不能冒充FC27实时行情。
- 共用查询能力优先进入 `engine/src/player-data.mjs` 或根目录 `../../shared/`，不要为WorkBuddy复制数据库。
