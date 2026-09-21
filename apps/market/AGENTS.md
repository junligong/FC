# FC27市场任务约定

本目录负责FC26历史数据库、FC27卡库、价格、活动卡、周黑、进化研究，最终生成 `../../reports/daily/D/market.html` 与 `../../reports/daily/D/market-scan.html`。

> **2026-09-16 拆分**：传奇卡（Icon）与英雄卡（Hero）已**不再属于市场任务**，改由独立任务「FC27传奇/英雄卡监控」产出 `../../reports/daily/D/icons-heroes.html`，展示在站点「传奇/英雄专栏」（见 `../../automation/prompts/icons-heroes.md`）。本目录的 `icons/`、`heroes/` 仅作为**共享数据源**保留，市场任务不再渲染、不再提交传奇/英雄报告，也不再产出 `market-icons.html`。

- 执行前读取 `../../automation/prompts/market.md` 和 `engine/modules/market-segments.json`。
- 每天产出两个并列文件，互不覆盖，均由渲染器生成，不要手改 HTML 版式：
  1. `market.html` = **市场概览**，三段式固定结构：① 本周活动卡与本周周黑 ② 价格分层（≥100万 / 30-100万 / 10-30万 / 1-10万，每档 Top 50，按 `/27/players` 的 Rating 降序） ③ 热门进化卡。取数用 `/27/players` 的区间参数：`1000000%2B` / `300000-1000000` / `100000-300000` / `10000-100000`。
  2. `market-scan.html` = **市场扫描**，双维度：维度一价格（大卡/中卡/热门卡/适用卡，低于1万另列），维度二热门球员（热门进化卡 `/27/popular/evolutions` 与 价值卡 `/27/popular` 中的非进化卡）。
- **第三个子标签「关注列表」`market-watch.html`（2026-09-17 起）**：由「FC·市场价格关注列表（每 4 小时）」任务产出，**不由本目录的每日任务负责**。链路与评分口径见 `automation/prompts/market-hourly.md`：
  - 采集 `collect-market-prices.mjs`（`/27/popular` 双平台价 + 热度、`/27/popular/evolutions` 热度）→ 单文件累积序列 `data/prices/fc27/series/{popular,evolutions}.json`（静态字段只存一次、时间维度挂在卡下；逐份全量快照的 `{hourly,daily}/` 写法已于 2026-09-20 废弃并删除）；**该采集器是高频任务与日任务共用的唯一取数入口**（2026-09-20 收敛）。
  - **日任务（03:05）的采集与组装同样只用常驻脚本，禁止在 `automation/runs/D/market/work/` 下另写一次性脚本**（2026-09-20 收敛）：`fetch-players-rows.mjs`（`/27/players` 翻页行，价格分层用）→ `assemble-daily-market.mjs D`（组装 `automation/runs/D/market/market.json`）。三个常驻脚本取数一律是「宿主页 `https://www.futbin.com/robots.txt` + 页内同源 fetch」，**不要改回导航**（导航会被 Cloudflare 挑战页打死，见根 AGENTS.md「来源页取数失败 ≠ 通道故障」）。
  - 计算 `build-market-watchlist.mjs D` → `automation/runs/D/market/watchlist.json`（只保存 cardId、评分与理由，不复制当前价）；
  - 当前价唯一写入 `engine/data/prices/fc27/current.json`，市场扫描、关注列表、进化与传奇页面加载时按 cardId 读取同一份；
  - 渲染 `render-market-watch.mjs D`。**`market.html` 是 `run-state` 受校验快照产物，高频任务不得重写它。**
  - 字段红线：`psPrice` = Console、`pcPrice` = PC 分别落库；<1000 为占位值；`.item-score-segment` 是卡片级 Item Score，不是成交价；不计算日环比与累计涨跌。
- **平台口径（Console / PC 双平台，必须都采）**：FUTBIN 只提供 **Console（PS / Xbox 合并）** 与 **PC** 两个市场，没有第三档。列表页每一行**同时渲染** `td.table-price.platform-ps-only`（Console）与 `td.table-price.platform-pc-only`（PC），因此**一次打开列表页即可同时读到两个平台价**；页顶按钮 `form.desktop-platform-change-form` 内的 `button value="ps"`（Console）/ `button value="pc"`（PC）**只是纯前端显隐切换**（不刷新、不改 URL、不重新取数）。
  - **不要**依赖 `ps_price` / `pc_price` URL 参数（该筛选在开服初期失效），也**不要**为切换平台重复导航；`rarity=` / `version=` 被服务端忽略。**但 `page` 翻页参数在会话建立后有效**（2026-09-17 实测，每页 30 行、Rating 降序）；`?version=base_icon` / `?version=heroes` 直接导航返回 0 行空表，不要走这条路线。
  - `td.table-item-score` 是估值列（IS），不是平台成交价。
  - 两平台价分别落库 `psPrice`（Console）/ `pcPrice`（PC）；顶层 `platform` 写 `"console+pc"`（不要再用旧的 `"cross"`）。渲染器自动输出两平台价格单元格与页顶切换按钮，**不要手改 HTML**。**不得只采 Console 漏 PC，也不得用一个平台价顶替另一个。**
- 「传奇卡研究」自 2026-09-16 起同样迁至「传奇/英雄专栏」子标签，常驻底稿仍在 `engine/icons/reports/fc27-icon-analysis.html`（跨日期、非每日产物，日任务不重跑也不得清空）。
- **`players[]` 去重与字段口径（2026-09-20 固化，用户反馈驱动）**：FUTBIN 进化卡的 URL 形如 `/27/player/<基础cardId>_<进化链编码>/<slug>`（例 `810_15/marcus-rashford`），同一张基础卡因不同进化路径会产生多条 URL，按整串 URL 去重去不掉。`players[]` 必须按**基础 cardId** 归并为「一人一行」，保留优先级为「非进化母卡 > 热度最高变体」，进化路径名并入 `evoName`（` / ` 连接）、变体数记 `variantCount`。2026-09-20 实测原始 750 条里唯一基础 cardId 仅 **559** 个（191 条重复：Rashford `810` ×4、Boey `4955` ×16）；`render-market-report.mjs#mergeByBaseCard()` 是**唯一**归并落点；`assemble-daily-market.mjs` 故意保留原始逐条观测（750 条），因为系列排除需要读到所有变体的卡面版本前缀取并集，采集侧先合会丢掉变体的版本信号。`evo` 字段只允许 `在进化池` / `非进化池`（把进化名写进 `evo` 会让索引卡「在进化池」计数恒为 0、状态筛选返回空表）；`stats` 键必须是英文大写 `PAC/SHO/PAS/DRI/DEF/PHY`（门将 `DIV/HAN/KIC/REF/SPD/POS`），写中文键会让六维列整列显示「—」。**同名多行不等于重复，禁止按姓名合并**——同一球员可拥有多张不同 cardId 的真卡（实测 Álvaro Carreras `22778`/`22780`、Thuram `22769`/`22768` 均为两张独立卡且价格不同），按姓名合并会静默丢卡。经核验 `players[]` 全部为 `/27/player/...`、无 `/26/` 链接，**不存在 FC26 混入**。
- **`market-scan.html` 的四项口径（2026-09-20 固化，用户反馈驱动；与根 `../../AGENTS.md` 同源，改动前先读）**：
  1. **排除英雄卡 / 传奇卡 / 活动卡**：扫描名单不得出现 Hero、Icon 与 **Hall of FUT 活动卡**（前者已有「传奇/英雄专栏」，后者属退役名将活动卡，用户明确要求一并排除）。判据两条并存：① 卡片版本前缀（FUTBIN 卡面图 `img/cards/hd/<版本>.png`，采集侧字段 `cardVersion`，由 `extract-market-prices.js` 与卡片同页读取 `src`/`data-src`；排除家族 `base_hero`/`base_icon`/`debut_icon`/`champion_icon`/`icon`/`hall_of_fut`）；② cardId 命中 `engine/data/players/fc27/scan-exclusions.json`（人工可增改，**新增活动卡系列必须先补这里**）。判据合并位置：`render-market-report.mjs#loadScanExclusions()` + `mergeByBaseCard()` 汇总的 `__versions`（同一张卡的任一变体带出版本即可判出，例：Zidane 只有进化条目带 `160_debut_icon`）。2026-09-20 命中 14 张、559 → 545 行。
  2. **价格分 6 档**：`1 万以下` / `1 ~ 5 万` / `5 ~ 10 万` / `10 ~ 50 万` / `50 ~ 100 万` / `100 万以上`，定义在 `PRICE_BUCKETS`，渲染时注入前端共用；chip 与下拉以档位 `id` 为键。不要在任何一侧另写阈值。
  3. **无有效价的卡按最高价处理**：`有效价` = 平台成交价 ≥ 1000，否则退回列表页估值且仍需 ≥ 1000，都没有即无有效价（<1000 一律仍是占位值）。无有效价卡的价格列填「`≥` + 该快照最高有效价」并标注「无价·按最高价」，分档归入「100 万以上」，排序按该值参与。**该数值是标注过的占位值，不是该卡真实成交价，不得当行情引用。** 2026-09-20 实测 329/545 行无有效价。
  4. **价格索引首屏渲染 `—`**：服务端无平台成交价，不得用列表页估值兜底（历史踩坑：旧三档全落在「5000 以下 559」）；由页面载入 `current.json` 后 `refreshPriceIndex()` 按当前平台重算。
- 数据统一写入 `../../automation/runs/D/market/market.json`（概览放 `overview`，扫描放顶层含 `players[]`），再运行 `node engine/scripts/render-market.mjs D` 一次渲染两份产物；缺失数据由渲染器输出如实空状态。站点上两者以「市场概览 / 市场扫描」子标签切换。`overview` 与 `players[]` 中不要写 `iconsHeroes` 字段。
- **中文译名（2026-09-17 起必做）**：写完 `market.json` / `evolution.json` 后运行 `node engine/scripts/apply-market-name-zh.mjs D`（进化加 `--file ../../automation/runs/D/evolution/evolution.json`）注入 `nameZh`；未命中清单在 `../../automation/runs/D/market/work/missing-name-zh.json`，由当日任务译完后**追加**到 `engine/data/players/name-zh-supplement-fc27.json` 的 `mappings`（只增不改，禁止写空字符串占位）并重跑直到未命中 0。渲染器自动输出「英文名 + 中文名」，不要手改 HTML。
- 传奇/英雄的逐日快照仍保存在 `engine/icons/data/prices/fc27/daily/<DATE>.json`，由 `engine/scripts/record-icons-daily.mjs D` 从当日抓取结果固化（含 `platforms.console` / `platforms.pc`）：一天一份、同日重跑只覆盖当天、原子写入，禁止删改历史日期；抓取失败时不写入快照。该快照由「传奇/英雄卡监控」任务驱动，市场任务不再写它。开服初期（含开服当天，`launchDate=2026-09-18`）FUTBIN 可能只有列表页占位价；`priceBasis` 按**当日实测有效价**判定（当日无 ≥1000 coins 平台价 → `listing-estimate`；有则 `partial-live`。**词表只有这两个值，不得再引入 `market`**），该口径下不计算日环比与累计涨跌。
- **球员头像（2026-09-17 起必做）**：市场概览 / 市场扫描 / 进化专栏 / 传奇英雄监控的球员姓名单元格都带头像，由渲染器自动解析并缩放到 `../../reports/daily/D/assets/players/`（合并期由 `shared/lib/report-assets.mjs#rewriteLocalReportAssets` 改写为指向 `daily-merged/assets/` 的相对路径，不再内联 base64；不要手改 HTML）。解析与落盘统一走 `../../shared/lib/player-avatar.mjs`；本地卡库没覆盖的卡用 `node engine/scripts/backfill-avatar-keys.mjs D` 走 FUTBIN `playerhover` 接口补 `cardId → 头像键` 并下载图片（**单并发 + 450ms 间隔**，429 退避；不得逐页打开详情页，不得调高并发）。**头像键 = EA resourceId（无 EA 头像时为 FUTBIN 自绘 `p<数字>`），不是 URL 里的 cardId**；匹配多义时一律放弃（宁缺勿错）。解析不到的条目如实不显示图片，禁止用别的球员的图或占位图顶替。
- **头像的两条红线（2026-09-17 实测踩到，勿放宽）**：① 姓氏词元兜底必须过「姓名词元双向包含」守卫，否则同姓不同人会互相串图（`Oh Hoo Sung`↔`Cho Gue Sung`、`Ethan Mbappé`↔Kylian Mbappé）；收紧后发现缺口要**重跑补全脚本用 `playerhover` 权威补回**，不是把守卫放宽。② **FC26 数据一律不配头像**——FC26 的 FUTBIN 卡 ID 与 FC27 头像库不同源，混用必错（同日 82 张里 6 张配错）。`backfill-avatar-keys.mjs` 聚合英雄数据时已排除 `heroes/data/**/fc26/**`，`render-icons-heroes.mjs` 的「FC26 参考对比」区也已显式返回空图。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；FUTBIN 等站点只能通过 `web-access` 技能的 CDP 通道访问用户日常 Chrome，禁止先试 IAB，也不要用 Chrome 插件 / `extension` 模式。
- **FUTBIN 静态路线不存在**：`curl`/WebFetch 请求（含 `/27/popular/evolutions`）返回 **HTTP 403 / 641 B**，必须走浏览器 CDP；实测 `/27/players`、`/27/popular`、`/27/popular/evolutions` 均可正常读取。
- 已知取数限制（实测）：开服初期 `pc_price` 三档筛选页（≥100万 / 30–100万 / 10–30万）返回 0 行，是**筛选在开服初期失效**而非「无卡」；此类空档必须如实记为缺失，不能据此推断市场无卡，更不能编造价格。
- `engine/data`、`gold/data`、`evolution/data`、`icons/data`、`heroes/data`、`totw/data` 是可复用数据源，不因报告失败而覆盖。
- `engine/output/`只放可重建截图与分析缓存；公众号集成位于 `integrations/wechat/`，不得由日报任务自动发布。
- 进化专栏内容单独写入 `../../reports/daily/D/evolution.html`（可选），由首页右栏收录，不作为 market.html 的一部分。
- Cross与PC价格分开保存；FC26历史不能冒充FC27实时行情。
- 共用查询能力优先进入 `engine/src/player-data.mjs` 或根目录 `../../shared/`，不要为WorkBuddy复制数据库。
