# icons-pricerange-hourly 单项执行契约（2026-09-17 新建）

「FC27 传奇卡价格区间（最低价-最高价）与实时价」逐小时采集任务。每小时执行一次，采集 FC27 全部基础传奇卡（Icon）的价格区间与双平台当前价，并重算「传奇卡研究」的投资建议。**不发布站点、不改首页、不改版式、不动其他模块。**

## 为什么这是一个独立任务

- 03:20 的「FC·传奇英雄监控」是**每日**任务，其数据源（FUTBIN 列表页）只提供单一价格列。
- FUTBIN 详情页的 `Price Range`（最低价 - 最高价）是**开服前唯一持续滚动更新**的行情字段，更新频率为分钟级，每日采一次损失极大。
- 因此把「区间价 + 实时价」拆成小时级采集，与每日任务解耦：每日任务负责台账与逐日快照，本任务负责高频行情与跨代投资分析。

## 执行步骤（顺序固定，前一步失败不进入后一步的推断）

1. **浏览器前置自检（必须，唯一判据）**：`node automation/browser-triage.mjs`，**exit 0 才继续**。完整规则（自愈链、分诊结论、红线、禁止入口、来源页取数失败 ≠ 通道故障）见根 AGENTS.md「浏览器强制规则」，此处不重复。
   - **失败留证（固定文件名与字段，2026-09-18 新增——此前本任务预检失败不写任何文件、失败在本机不可见）**：写
     `automation/runs/D/icons-heroes/hourly-<HH>-failed.json`（`<HH>` = 本地整点两位），字段为
     `{ task, scheduledHour, checkedAt, result:"failed", stage:"browser-precheck", reason, triage:{ verdict, checkDepsExit, chrome:{listener,wsPath}, actions }, notAttemptedAndWhy, lastValidResultKept, manualActionNeeded }`；
     内容取自 `node automation/browser-triage.mjs --json`（复用同一份判定，**不要**再自行探测一遍）。连续失败 ≥3 轮时，只追加一行时间戳与结论、复用上一轮诊断正文，不再重写全套诊断。
     **预检失败时同样不得写 `pricerange/hourly/` 快照**（该目录只放真实成功观测，避免历史序列被失败轮次污染）。
2. **采集价格区间**：`node apps/market/engine/scripts/collect-icon-priceranges.mjs`
   - 逐卡读取 FUTBIN 详情页 `https://www.futbin.com/27/player/<id>/<slug>`，解析 `Price Range`（最低价/最高价）、`Price Updated`、双平台当前价。
   - 落库 `apps/market/engine/icons/data/prices/fc27/pricerange/latest.json` 与 `pricerange/hourly/<D>T<HH>.json`（同日同小时只覆盖该小时，不动其他小时）。
   - 同一次成功观测还会按 cardId 合并进唯一当前行情 `apps/market/engine/data/prices/fc27/current.json`；网页当前价与区间只读这一份，`pricerange` 快照仅作审计和历史序列。
   - 脚本**串行 + 间隔**执行并对 429/5xx 退避重试（FUTBIN 并发 5 即返回 429，禁止改成高并发）；全量 131 张约需 4–6 分钟。
   - **退出码非 0** = 一张都没采到：记为本次失败，**保留上次有效结果**，不用历史数据填充，并在最终回复中写明失败原因。
3. **重算传奇研究**：`node apps/market/engine/scripts/build-icon-research.mjs D`
   - 输出 `reports/daily/D/market-icons-research.html`（站点「传奇/英雄专栏 → 传奇卡研究」子标签）与结构化结果 `apps/market/engine/icons/data/research/fc26-vs-fc27-D.json`。
   - 本轮只运行一次研究分析；当前价与最高/最低区间全部按 cardId 读取刚写入的 `current.json`。不得再从 `pricerange/latest.json` 或逐日快照复制一份当前行情，也不得为监控页重复逐卡采集。
4. **刷新监控页**：`node apps/market/engine/scripts/record-icons-daily.mjs D` → `node apps/market/engine/scripts/render-icons-heroes.mjs D`
   - 把详情页最新双平台当前价与区间一起传播进当日快照，并重渲染 `reports/daily/D/icons-heroes.html`（最低价 / 最高价 / 当前价三列）；页面加载/刷新时再按 cardId 从 `current.json` 取最新值。
   - 本步骤是幂等的：同日重跑只覆盖当天快照与当天报告，历史与其他日期不受影响。**本任务自身不发布站点**：线上行情资源的重发布由「FC·市场价格关注列表（每小时）」的第 6 步承担（同一份 `current.json`，整点部署），因此本任务写进 `current.json` 的传奇价与区间最迟在下一个整点上线。

## 不使用 run-state.mjs 的原因（重要，勿改成 begin/finish）

`automation/run-state.mjs` 的 `begin` 用排他锁 `owner.json` 记录「本日任务已启动或已完成」，**同一天第二次 begin 会被拒绝**，那是为每日任务设计的。本任务每小时执行，一天要跑 24 次，套用该锁会导致 02:00 之后全部被拒。
因此本任务的运行记录以**逐小时快照文件本身**为准：`pricerange/hourly/<D>T<HH>.json` 内含 `collectedAt`、`counts`、`missingItems`、`errors`，足以逐次复核。**不要**为本任务调用 run-state，也不要新增锁文件。

## 时间预算与并发

- 单次运行预算 12 分钟：采集通常 4–6 分钟，重算与分析 1 分钟内。
- 采集必须**串行**。若出现大面积 429，应加大批间隔或分两轮补采，不要提高并发。

## 口径约束

- **价格区间是卡级字段**：同一张卡的 Console 与 PC 价格盒渲染出**完全相同**的区间值（2026-09-17 对 20 张卡批量核验，差异为 0）。只落一份 min/max，产物内以 `scope: "card"` 标注，**不得**拆成「每平台一套区间」。
- **区间不是成交价**：开服日 `launchDate = 2026-09-25` 之前为 `listing-estimate` 口径，不得据此计算日环比与累计涨跌。
- **平台当前价**未开服前普遍为 0，属占位值（<1000 判无效），如实留空，不用另一平台顶替。
- 缺失一律如实空状态：不用 FC26、不用历史日期、不用其他卡的数据顶替。

## 投资建议判定（第 3 步的分析口径）

- 条件 A：FC26 开服价 > FC27 当前价；条件 B：FC26 开服价 > FC27 最高价。满足任一即摘出为投资建议。
- **条件 A 只在 FC27 当前价为有效价（≥1000 coins）时参与判定**。开服前当前价多为 0，若不设该判据，「FC26 开服价 > 0」对每张卡都成立，会把全部卡误判为投资建议——那是错误结论，禁止这样实现或表述。
- FC26 开服价取该卡在 FC26 开服日（2025-09-18）的 Console 均价（`fc26/base-icons.json` 的 `prices.cross` 首日值），两代卡按 FUTBIN slug 关联。
- 报告须保留「不构成投资建议」的免责声明，并如实标注无 FC26 对照的新卡。

## 产物

| 产物 | 路径 |
|---|---|
| 最新价格区间 | `apps/market/engine/icons/data/prices/fc27/pricerange/latest.json` |
| 唯一当前行情（网页运行时源） | `apps/market/engine/data/prices/fc27/current.json` |
| 逐小时快照 | `apps/market/engine/icons/data/prices/fc27/pricerange/hourly/<D>T<HH>.json` |
| 传奇卡研究 | `reports/daily/D/market-icons-research.html` |
| 研究结构化结果 | `apps/market/engine/icons/data/research/fc26-vs-fc27-D.json` |
| 传奇监控页（含最低/最高/当前价） | `reports/daily/D/icons-heroes.html` |

## 最终回复要求

一句话结论 + 本次成功卡数/总数、区间下沿与上沿极值、投资建议命中数、失败或缺失项（区分「采集失败」与「本日无数据」）。不发布、不汇报站点状态。
