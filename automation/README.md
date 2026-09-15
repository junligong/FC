# FC 自动执行契约（2026-09-11）

四个日常任务均使用 Asia/Shanghai 日期并按每日 03:00 配置。不要创建重复调度。市场采集已按用户要求启用。

- 资讯、足球先执行 run-state.mjs begin，保存 runId。相同日期同一模块只允许一个所有者。
- 单项只生成自身报告，15分钟内完成或提交部分结果。资讯 collect-news.mjs 对采集子进程设10分钟硬上限。足球是AI采集，15分钟是执行指令预算，并非平台硬限制。
- 完成时通过 run-state.mjs finish 提交证据与快照，记录 SHA-256。完成后立即结束对话。不能继续合并、发布或修改布局。
- 总任务只运行 coordinate.mjs：等待本轮快照，最多20分钟；隔离合并，60秒上限；发布器120秒；公网验证30秒。任何阶段失败必须记录状态，不进入接口探索。
- 缺失单项不使用旧日期或旧运行中间文件填补。完成快照不会随工作区后续修改而变化。

## 当前状态位置

`automation/runs/D/<news|football|market>/state.json` 为单项状态，`report.html` 为冻结的内部快照。
`automation/runs/D/coordinator-state.json` 为合并与发布状态。旧 `status-*-D.json` 只作历史，不再用于本轮协调决策。

同日重复启动默认拒绝，避免两个任务同时写入。需要再次重跑时，应先确认现有运行已经结束，再归档当日 runs 目录并启动新一轮；不得在活动运行中删除锁。

`skipped` 只表示用户已明确暂停、且 `shared/config/project.json` 已将对应任务设为 `enabled: false`。启用任务遇到数据源、浏览器或生成故障时必须提交 `failed`；有可核验的部分结果时提交 `partial`，避免把故障误报成暂停。

## 发布能力边界

每日输出：`reports/daily/D/{football,news,market,summary}.html`

## 明确的同日重跑

自动调度仍使用普通 `begin` 防止重复。只有用户明确要求同日重跑时，先执行
`node automation/run-state.mjs prepare-rerun <football|news|market> D`，旧运行会移入
对应任务的 `attempts/<runId>/`，随后可从 DuMate 点击“立即执行”。协调器使用
`node automation/coordinate.mjs D --prepare-rerun` 后再立即执行。历史报告和去重库不会被清空。
固定入口：https://www.dumate.cn/artifacts/7vbc68mkblkg
没有自动安装或伪造发布器。当前缺少经过验证的 `automation/publisher`，协调器记录 `publish=blocked` 后正常退出。已授权通过 DuMate 原生界面更新此入口，但该界面操作尚未成为可重复调用的无人值守发布器。

## 验证

运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs`。测试数据使用隔离目录，不修改真实历史去重文件。
