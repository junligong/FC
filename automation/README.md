# FC 自动执行契约（2026-09-15 · WorkBuddy 版）

五个内容任务（足球、资讯、市场、进化、传奇/英雄卡监控）与一个汇总发布任务均使用 Asia/Shanghai 日期。资讯、市场、进化、传奇英雄按 2026-09-18 起的 5 分钟错开序列在凌晨发起（资讯 03:00、市场 03:05、进化 03:15、传奇英雄 03:20）；足球日报自 2026-09-20 起移到早上 06:00，汇总发布相应顺延到 06:15 执行并等待必需快照。错开发起用于避免同一分钟并发触发进入排队。权威时刻表见 `shared/config/project.json` 的 `dailySchedule`。不要创建重复调度。市场采集已按用户要求启用。项目已从 DuMate 迁移到 WorkBuddy，发布统一走 WorkBuddy 站点发布能力。

WorkBuddy 从 `task-definitions.json` 读取短启动提示，再加载 `prompts/` 中对应的完整本地提示词；业务规则只维护一份。

- 资讯、足球、市场、进化先执行 run-state.mjs begin，保存 runId。相同日期同一模块只允许一个所有者。
- 单项只生成自身报告，15 分钟内完成或提交部分结果。资讯、足球、市场、进化都通过 `Web Access（浏览器自动化）` 技能（CDP 直连用户日常 Chrome）采集；资讯采集阶段最多 10 分钟。足球是 AI 采集，15 分钟是执行指令预算，并非平台硬限制。
- **提交硬上限是 `startedAt + 20 分钟`**（`run-state.mjs` 的 `finish` 会拒绝迟到版本）；返回的 `deadlineAt` 15 分钟只是提示，最迟第 14 分钟应收口转 `partial`。
- 完成时通过 run-state.mjs finish 提交证据与快照，记录 SHA-256。完成后立即结束对话。不能继续合并、发布或修改布局。
- 总任务只运行 coordinate.mjs：等待本轮快照，最多20分钟；隔离合并，60秒上限。发布由 WorkBuddy 站点发布能力在同一会话内完成；公网验证30秒。
- 缺失单项不使用旧日期或旧运行中间文件填补。完成快照不会随工作区后续修改而变化。

## 当前状态位置

`automation/runs/D/<news|football|market|evolution>/state.json` 为单项状态，`report.html` 为冻结的内部快照。
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

自动调度仍使用普通 `begin` 防止重复。**同日重跑有两种等价写法，任选其一：**

1. 一步式：`node automation/run-state.mjs begin <football|news|market|evolution> D --rerun` —— 自动归档旧 attempt 后直接开新 run。
2. 两步式：先 `node automation/run-state.mjs prepare-rerun <module> D`（只归档、不启动，可用于排查），再执行普通 `begin`。

旧运行会移入对应任务的 `attempts/<runId>/`（仅 rename，非破坏性）。协调器使用 `node automation/coordinate.mjs D --prepare-rerun` 后再执行 `--rerun`。历史报告和去重库不会被清空。

**注意锁的语义**：上一轮结束后 `owner.json` 仍会残留 `status:"running"`，因此同日不带 `--rerun` 的 `begin` 必定返回 `accepted=false`（「本日任务已启动或已完成」）；只有 `state.json` 的 `status` 仍为 `running` 时才表示运行真的在进行中，此时 `--rerun` 同样会被拒绝。

## 验证

运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs`。测试数据使用隔离目录，不修改真实历史去重文件。
