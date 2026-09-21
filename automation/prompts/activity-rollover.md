# activity-rollover 单项执行契约（2026-09-20 新建）

「FC27 本周活动卡滚动更新」任务。**每周六 03:00 执行一次**（WorkBuddy 调度 rrule=`FREQ=WEEKLY;BYDAY=SA;BYHOUR=3;BYMINUTE=0`）。把上一周的活动卡并入 83+ 池，并从 FUTBIN 采集最新本周活动卡。**不发布站点、不改首页、不改版式、不动其他模块。**

## 背景

FC27 活动卡（Promo / Ones to Watch / Hall of FUT 等）每周六更新。本任务每周六执行：把 `activity-current.json`（上一周活动卡）并入 `rating83plus.json`（83+ 池）与 `activity-history.json`，再采集最新本周活动卡覆盖 `activity-current.json`，并汇入统一行情 `current.json`。

## 执行步骤（顺序固定）

1. **浏览器前置自检（必须，唯一判据）**：`node automation/browser-triage.mjs`，**exit 0 才继续**。完整规则见根 AGENTS.md「浏览器强制规则」。
2. **滚动合并**：`node apps/market/engine/scripts/roll-over-ledger.mjs activity`
   - 把 `activity-current.json` 的卡并入 `activity-history.json` 与 `rating83plus.json`（按 cardId 去重累加），清空 `activity-current.json`。
3. **采集本周活动卡**：`node apps/market/engine/scripts/collect-activity-list.mjs`
   - 打开 `/27/latest` 翻页，按 `Added on` 列精确匹配**今天（周六）**的卡。
   - **SBC 过滤红线**：双平台价恒为 0 的卡是不可交易 SBC，一律忽略；价格 >0 才保留。
   - 落库 `promo/data/players/fc27/activity-current.json`。
   - **退出码非 0** = 一张都没采到：保留上次结果，如实记失败。
4. **补采 83+ 池价格**（可选，仅当 83+ 池有新卡需补价）：`node apps/market/engine/scripts/collect-r83-prices.mjs`
   - 翻 `/27/players` 筛 rating>=83 普通金卡，merge 进 current.json（source=futbin-players）。
5. **汇入统一行情**：`node apps/market/engine/scripts/sync-current-market.mjs D`
   - 把活动卡价按 cardId merge 进 `current.json`（source=futbin-latest），同步 assets。

## 口径约束

- **日期精确匹配当天**：只看 `/27/latest` 的 `td.table-added-on` == 今天（周六），不做「上次~本次」区间。
- **SBC 判据**：`td.table-cross-price` 与 `td.table-pc-price` 均为 0 → 忽略。
- 版本识别靠卡面图 URL（`img/cards/tiny/<n>_<version>.png`），列表页无文字版本标签。
- 价格 < 1000 视为占位值（valid=false）。
- **不调用 run-state.mjs**；运行记录以台账快照为准。
- **不渲染三专栏、不发布**：`database-columns.html` 由随后的「FC·市场监控」（03:05，每日）经 `render-database-columns.mjs D` 读取滚动后的最新台账统一渲染，并随每日 06:15 汇总发布上线。本任务只改台账 + `current.json`，避免与市场任务重复渲染。
