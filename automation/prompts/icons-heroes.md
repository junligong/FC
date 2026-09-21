# icons-heroes 单项执行契约（2026-09-16 新建 · 2026-09-17 修订）

本文件为「FC27 传奇/英雄卡监控」任务的执行入口规则。每日 03:20 调度（2026-09-18 起日任务按 5 分钟错开发起，权威时刻表见 `shared/config/project.json` 的 `dailySchedule`），只采集和生成传奇卡（Icon）与英雄卡（Hero）的监控数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

> 背景：2026-09-16 起，传奇/英雄内容从 FC27 市场任务中**整体迁出**。市场任务不再监控传奇/英雄卡，也不再产出 `market-icons.html`；本任务独立承担该职责，产物挂在站点「传奇/英雄专栏」下。

1. 第一条命令运行 `node automation/run-state.mjs begin icons-heroes D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin icons-heroes D --rerun`（先把旧 attempt 归档到 `automation/runs/D/icons-heroes/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**`finish` 的硬上限是 `startedAt + 20 分钟`**：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。
3. HTML 只作为内部数据产物，版式由渲染器统一，不要手写或改造 HTML。
4. 将本轮证据写入 `automation/runs/D/icons-heroes/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish icons-heroes D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 监控对象（务必全量，不得只取部分）

监控 FC27 **全部基础传奇卡（Icon）与全部英雄卡（Hero）**：

- 传奇卡与英雄卡名单：入口 `https://www.futbin.com/27/players`。**URL 查询参数筛选不可依赖**（实机核验：`?rarity=icon`、`?rarity=hero`、`?version=icons` 三个地址返回的都是**同一批默认列表**，服务端并未按参数过滤）。**`page` 翻页参数在会话建立后可用**（2026-09-17 实测：`?page=2` 起按评分降序返回后续名单，每页 30 行）；注意 `?version=base_icon` / `?version=heroes` 虽是站点筛选下拉自带的 href，但**直接导航会返回 0 行空表**（疑似依赖站内 JS 状态），不得当作采集路线。因此必须走以下两条路之一：
  1. **用页面自身的筛选 UI**：点击 FUTBIN 列表页的 Version 下拉（Base Icon / Heroes / Debut Icon）后在页内读取表格（不要依赖点选后 URL 直接重开）；或
  2. **翻页读全量列表后用台账比对归属**：以卡库台账 `apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json`（131 张 Icon）为基准判定归属；英雄卡以页面版本标签 `Base Heroes` 识别。**列表页每行 `td.table-name` 自带版本标签**（如 `95\nMaradona\nIcon`，英雄为 `Base Heroes`），以此区分版本最可靠。
- **采集通道注意事项（2026-09-17 实测）**：① CDP 代理对含可选链 `?.` 的较长 eval 表达式会偶发返回空对象，提取脚本用 `function` + 显式判空写法；② eval 必须等导航完成后再发（导航后 `sleep 3–6` 秒，返回空对象就重试）；③ 列表页无法整页滚动懒加载（30 行即全部，翻页靠 `page` 参数）。
- **每张卡必须写明版本字段（`version`: `"Icon"` / `"Hero"`）**，两个版本严格区分，不得互相混入；不得因为筛选控件难用就把两版混成一份。
- 排除一切特殊版本（Debut Icon、进化后版本、SBC/任务/租借/交换卡等），只保留基础卡。
- 列表页首屏约 30 行，凑齐全量需按 `page` 参数逐页翻取直到名单穷尽（或用筛选 UI）；按评分降序时，131 张基础传奇卡（85–95 评分）集中在前 10 页左右，英雄卡（`Base Heroes` 标签）多在 84–88 评分区间。凑不全时如实记 `missingItems` 并提交 `partial`，不得用部分数据冒充全量。
- **FC26 数据口径（2026-09-17 固化）：本模块只监控 FC27**。`apps/market/engine/heroes/data/prices/fc26/` 下的 FC26 英雄卡历史数据**只作跨代参考对比**，渲染器已将其单独放入「FC26 参考对比」折叠区；**严禁把 FC26 数据混入 FC27 台账或当日统计**，也不得用 FC26 数据填充当日缺失。

## 来源 403 的处置策略（2026-09-17 固化）

FUTBIN 对 `/players` 列表目录的 403 拦截**具时限性**（2026-09-17 03:00 全路径 403，09:46 重试即解除）。处置规则：

1. 先开 `https://www.futbin.com/` 建立会话（同源对照基准），再单次尝试 `/27/players`。
2. 仍 403 时**延长退避（分钟级）**，最多再试 2 次；**禁止秒级密集重试或连续变形重试**（换参数/换标签页轮番轰炸会加重拦截，2026-09-17 实测 7 连败即为教训）。
3. 预算内始终未通过时，按契约提交 `failed`/`partial` 并留证（URL、打开时间、错误摘要），**不得**用 FC26、旧日期快照或昨日台账冒充当日数据。

## 平台口径（2026-09-16 起必须，实机核验）

FUTBIN 只有 **Console（PS/Xbox 合并）** 与 **PC** 两个平台。列表页每一行**同时渲染两个价格单元格**：

- `td.table-price.platform-ps-only` —— Console 价
- `td.table-price.platform-pc-only` —— PC 价
- 页顶按钮在 `form.desktop-platform-change-form` 内（`button value="ps"` 文案 Console / `button value="pc"` 文案 PC），**只是纯前端显隐切换**：默认 Console 的单元格 `display:table-cell`、PC 为 `display:none`；点击后互换，**不刷新页面、不改 URL、不重新取数**。

因此：

- **一次打开列表页即可同时读到两个平台价**，直接分别读两个单元格即可。**不要**依赖 `ps_price` / `pc_price` URL 参数（开服前该筛选失效），也**不要**为切换平台重复导航。
- **两个平台的价格都必须逐卡采集**，分别写入 `prices.console` 与 `prices.pc`；经 `record-icons-daily.mjs` 固化为 `platforms.console` / `platforms.pc`（`{price, valid}`）。不得只取其中一个平台，也不得用一个平台价顶替另一个；某平台确无数据时如实留空。
- 开服日 `launchDate=2026-09-18`（2026-09-20 定案；`2026-09-25` 是正式发售日，勿改回）。**开服初期（含开服当天）**两个平台价可能仍为 0（球员页显示 `PRICE UPDATED: NEVER`）；此时列表页 `td.table-item-score`（IS 列）是**占位/估值**，必须单独记为 `estimate`，**不得当作平台成交价**。**「是否已开价」不看日期、看当日实测**：`priceBasis` 按当日有效价（≥1000 coins）数量判定，全无有效价则为 `listing-estimate`，该口径下不得据此计算日环比与累计涨跌。
- 价格 < 1000 视为占位值，`priceValid=false`。
- 当日已有有效平台价时口径为 `partial-live`，按平台逐日计算日环比与累计涨跌（产物页已有 Console / PC 切换按钮，两个平台的指标分别计算）。**词表只有 `listing-estimate` / `partial-live` 两个值，不得再引入 `market`**。

## 产出流程

1. 采集当日全量传奇卡 + 英雄卡名单与价格，分别写入：
   - `apps/market/engine/icons/data/prices/fc27/base-icons.json`（沿用现有格式：`id` / `slug` / `nameZh` / `rating` / `currentPrice` / `prices` / `marketUrl` / `launchDate`）
   - `apps/market/engine/heroes/data/prices/fc27/base-heroes.json`（同一格式，新增；`version: "Hero"`）
2. 运行 `node apps/market/engine/scripts/record-icons-daily.mjs D` 固化当日传奇卡快照到 `icons/data/prices/fc27/daily/D.json`（一天一份，同日重跑只覆盖当天，原子写入，禁止删改历史日期；抓取失败必须非 0 退出且不写快照）。
   - 该脚本会**顺带合并**「FC·传奇价格区间（每4小时）」任务产出的价格区间 `icons/data/prices/fc27/pricerange/latest.json`（逐卡 `priceRange{min,max}`，卡级字段）。**区间文件缺失不构成失败**：区间列如实留空即可，不得因此跳过快照写入，也不得用估值或别的卡顶替。
3. 运行 `node apps/market/engine/scripts/render-icons-heroes.mjs D`，生成 `reports/daily/D/icons-heroes.html`（传奇/英雄专栏主视图）。台账含「当前价 / 最低价 / 最高价」三列，姓名单元格带头像（渲染器自动缩放到 `reports/daily/D/assets/players/`）。
   - 逐日快照只保存历史台账；页面当前价与最低/最高区间统一按 cardId 从 `current.json` 读取。不得把 `base-icons.json`、`pricerange/latest.json` 或逐日快照的末值再次当作另一份当前行情进行分析。
   - 传奇卡（Icon，cardId 21400+）在 canonical 里，头像天然 131/131 命中；**英雄卡（Base Heroes）不在 canonical 中，必须靠补全脚本**：渲染前后各跑一次 `node apps/market/engine/scripts/backfill-avatar-keys.mjs D`（浏览器通道已由任务开头的 `browser-triage.mjs` 预检验证，如需复检用 `node automation/browser-triage.mjs`，exit 0 才可用）。补全走 FUTBIN `playerhover` 接口，**单并发 + 450ms 间隔**，不要调高并发，也不要为了补头像逐页打开球员详情页。
   - 渲染器对缺失数据一律输出如实空状态；英雄卡数据缺失时如实标注「英雄卡数据源待建立」，不得用传奇卡顶替。解析不到头像的条目如实不显示图片，**严禁**用其他球员的图或占位图顶替。
   - 价格区间是**卡级**字段（FUTBIN 同一卡的 Console / PC 渲染同值），切换平台时区间列不变；平台差异只体现在「当前价」列，不得把区间拆成每平台一套。
   - 本任务只负责 FC27 传奇/英雄名单与日历史记录；实时价和区间已由「传奇价格区间」任务（每 4 小时）写入统一行情，不得再次逐卡打开详情页重复采集。
4. 校验：卡牌 ID 去重、Icon/Hero 版本字段齐全、平台字段齐全、时间戳、价格有效性与数量一致性，并核对页头「球员头像 X/Y」计数已收敛。失败保留原始数据和上次有效报告。

> 价格区间（最低价-最高价）与「传奇卡研究」由独立的**每 4 小时**任务 `icons-pricerange-hourly` 采集与刷新（见 `automation/prompts/icons-pricerange-hourly.md`）。本任务只消费它的产物，不自行采集区间，也不要改它的数据文件。

## 浏览器强制规则

采集前先运行 `node automation/browser-triage.mjs`（唯一判据），`exit 0` 才继续；完整规则（自愈链、分诊、红线、禁止入口、FUTBIN 必须走 CDP）见根 AGENTS.md「浏览器强制规则」，此处不重复。
