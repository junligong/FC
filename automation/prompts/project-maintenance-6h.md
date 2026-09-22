# FC 项目重构续跑检查（每 6 小时）

在 `/Users/wuyanzu/Desktop/FC` 执行。先完整读取根 `AGENTS.md`、`automation/AGENTS.md` 和 `automation/maintenance-state.json`。

1. 若 `maintenance-state.json.status` 为 `complete`：仅运行 `node automation/audit-file-growth.mjs --json` 做只读检查；无新问题时静默结束，不重复生成文件、不重新发布。
2. 若状态为 `in_progress`：按 `nextAction` 继续当前重构，每次只处理一个可验证的切片；先读 Git diff，不覆盖已有采集数据或其他任务的未提交改动。
3. 数据约束：当前价只写 `apps/market/engine/data/prices/fc27/current.json`；观测历史只对固定累积序列 upsert；运行结果只更新固定的 `attempts.json` / `watchlist.json` / HTML，禁止创建 `hourly-<HH>.json`、`verify-t<HH>.mjs` 或其他按轮次文件。
4. 页面原则：首屏先展示决策数据和可用性，再展示模块入口；所有模块共用同一行情主表，不从 HTML 回读或复制当前价。
5. 每轮完成后运行与改动相关的测试，更新同一个 `maintenance-state.json`，不新建进度文件。只在任务完成、失败或需要用户操作时通知。
