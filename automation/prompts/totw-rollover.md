# totw-rollover 单项执行契约（2026-09-20 新建）

「FC27 周黑（TOTW）滚动更新」任务。**每周四 03:00 执行一次**（WorkBuddy 调度 rrule=`FREQ=WEEKLY;BYDAY=TH;BYHOUR=3;BYMINUTE=0`）。把上一周的周黑并入历史库，并从 FUTBIN 采集最新本周周黑。**不发布站点、不改首页、不改版式、不动其他模块。**

## 背景

FC27 周黑（Team of the Week）每周四更新。本任务每周四执行：把 `totw-current.json`（上一周周黑）并入 `totw-history.json` 历史库，再采集最新本周周黑覆盖 `totw-current.json`，并汇入统一行情 `current.json`。

## 执行步骤（顺序固定）

1. **浏览器前置自检（必须，唯一判据）**：`node automation/browser-triage.mjs`，**exit 0 才继续**。完整规则见根 AGENTS.md「浏览器强制规则」。
2. **滚动合并**：`node apps/market/engine/scripts/roll-over-ledger.mjs totw`
   - 把 `totw-current.json` 的卡并入 `totw-history.json`（按 cardId 去重累加），清空 `totw-current.json`。
   - 幂等：若 current 为空（无上周数据），只清空 current，不向 history 写空记录。
3. **采集本周周黑**：`node apps/market/engine/scripts/collect-totw-list.mjs`
   - 打开 `/27/players?version=team_of_the_week` 翻页，逐卡读双平台价。
   - **版本判定**：行内 `td.table-name` 尾部 `TOTW` 标签；双平台价 `td.table-price.platform-ps-only` / `platform-pc-only`。
   - 落库 `totw/data/players/fc27/totw-current.json`。
   - **退出码非 0** = 一张都没采到：保留上次结果，如实记失败。
4. **汇入统一行情**：`node apps/market/engine/scripts/sync-current-market.mjs D`
   - 把周黑价按 cardId merge 进 `current.json`（source=futbin-totw），同步 assets。

## 口径约束

- **版本参数是 `team_of_the_week`**（不是 `totw`），实测有效（30 行/页，非空表）。
- 同一球员可能有多张 TOTW 卡，按 cardId 分别记账，不得混并。
- 价格 < 1000 视为占位值（valid=false）。
- **不调用 run-state.mjs**（每周任务，owner.json 一天一次语义会拒绝）；运行记录以台账快照为准。
- 价格区间是卡级字段，Console/PC 同值，不按平台拆。
- **不渲染三专栏、不发布**：`database-columns.html` 由随后的「FC·市场监控」（03:05，每日）经 `render-database-columns.mjs D` 读取滚动后的最新台账统一渲染，并随每日 06:15 汇总发布上线。本任务只改台账 + `current.json`，避免与市场任务重复渲染。
