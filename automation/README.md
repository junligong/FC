# FC 自动执行契约（2026-09-15 · WorkBuddy 版）

四个日常任务均使用 Asia/Shanghai 日期并按每日 03:00 配置。不要创建重复调度。市场采集已按用户要求启用。项目已从 DuMate 迁移到 WorkBuddy，发布统一走 WorkBuddy 站点发布能力。

WorkBuddy 从 `task-definitions.json` 读取短启动提示，再加载 `prompts/` 中对应的完整本地提示词；业务规则只维护一份。

- 资讯、足球、市场先执行 run-state.mjs begin，保存 runId。相同日期同一模块只允许一个所有者。
- 单项只生成自身报告，15分钟内完成或提交部分结果。资讯 collect-news.mjs 对采集子进程设10分钟硬上限。足球是AI采集，15分钟是执行指令预算，并非平台硬限制。
- 完成时通过 run-state.mjs finish 提交证据与快照，记录 SHA-256。完成后立即结束对话。不能继续合并、发布或修改布局。
- 总任务只运行 coordinate.mjs：等待本轮快照，最多20分钟；隔离合并，60秒上限。发布由 WorkBuddy 站点发布能力在同一会话内完成；公网验证30秒。
- 缺失单项不使用旧日期或旧运行中间文件填补。完成快照不会随工作区后续修改而变化。

## 当前状态位置

`automation/runs/D/<news|football|market>/state.json` 为单项状态，`report.html` 为冻结的内部快照。
`automation/runs/D/coordinator-state.json` 为合并与发布状态（`publish=delegated` 表示本地已合并、发布交由 WorkBuddy 站点发布能力执行）。

同日重复启动默认拒绝，避免两个任务同时写入。需要重跑时，先确认现有运行已结束，再归档当日 runs 目录并启动新一轮；不得在活动运行中删除锁。

`skipped` 只表示用户已明确暂停、且 `shared/config/project.json` 已将对应任务设为 `enabled: false`。启用任务遇到数据源、浏览器或生成故障时必须提交 `failed`；有可核验的部分结果时提交 `partial`。

## 产物与发布

本地产物：
- `reports/daily/D/{football,news,market,summary}.html`
- `daily-merged/index.html`（固定入口）、`daily-merged/archive/D.html`（历史日报）、`daily-merged/assets/`（海报等共享资源）

发布方式：用 WorkBuddy 站点发布能力发布目录 `daily-merged/`（多文件静态站点，入口 `index.html`），更新同一应用，保持公开链接不变。发布后用 `automation/verify-publication.mjs D` 复核。

固定入口：https://fc27-site.app.workbuddy.host/

旧的 DuMate 单文件 artifact 通道（`automation/publisher` + `probe-console-session.mjs`）自 2026-09-15 起废弃，不再参与日常流程；相关脚本仅作为历史记录保留，不要恢复使用。

## 明确的同日重跑

自动调度仍使用普通 `begin` 防止重复。只有用户明确要求同日重跑时，先执行
`node automation/run-state.mjs prepare-rerun <football|news|market> D`，旧运行会移入
对应任务的 `attempts/<runId>/`。协调器使用 `node automation/coordinate.mjs D --prepare-rerun` 后再立即执行。历史报告和去重库不会被清空。

## 验证

运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs`。测试数据使用隔离目录，不修改真实历史去重文件。
