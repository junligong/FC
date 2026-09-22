# 自动化编排约定

本目录负责四任务的执行契约、单次运行所有权、证据、超时、合并和发布验证，不保存业务数据库。项目已从 DuMate 迁移到 WorkBuddy。

- `prompts/` 是 WorkBuddy 定时任务的入口；路径必须引用优化后的绝对项目位置。
- 所有任务每次执行必须读取根 `../AGENTS.md` 的“浏览器强制规则”；编排提示应明确走 **Web Access（浏览器自动化）技能的 CDP 模式**，不要写 `extension` 或 Chrome 插件。
- 各采集任务必须在 WorkBuddy 定时任务配置中绑定 `Web Access（浏览器自动化）` 技能。浏览器通道、禁止入口与故障判定一律以根 `../AGENTS.md`「浏览器强制规则」为准（独立调试 profile 9333 是唯一采集通道）。
- `prompts/*.md` 是完整提示词；调度器只保存 `task-definitions.json` 的短启动提示，不复制业务规则。
- `runs/D/<module>/` 保存 owner、state、evidence、work 和不可变报告快照。同日重跑必须显式归档旧 attempt，不能静默覆盖。
- **文件数量预算**：高频任务不得按轮次新建文件。当前价只 upsert `current.json`，历史观测只 upsert 固定累积序列，本轮状态只 upsert `attempts.json`。禁止新建 `hourly-<HH>.json`、`verify-t<HH>.mjs`、`detail-t<HH>.mjs` 等轮次文件。
- `work/` 只是临时区；日任务 `finish` 成功或 partial 后运行 `node automation/compact-run-work.mjs D <module> --apply`。所有任务收尾时运行 `node automation/audit-file-growth.mjs`，新增文件数量异常时先修复数据链路，不得只靠手工删除。

### 单次运行生命周期（`run-state.mjs`）

```bash
node automation/run-state.mjs begin  <module> D            # 正常启动
node automation/run-state.mjs begin  <module> D --rerun    # 同日重跑（先归档旧 attempt）
node automation/run-state.mjs prepare-rerun <module> D     # 只归档、不启动（排查用）
node automation/run-state.mjs finish <module> D <RUN_ID> <success|partial|failed> <evidence.json>
```

- **同日重跑必须带 `--rerun`**：上一轮的 `owner.json` 会残留 `status:"running"` 锁（脚本用 `openSync(owner.json,'wx')` 抢锁），不带 `--rerun` 的 `begin` 必定返回 `accepted=false`（「本日任务已启动或已完成」）。带 `--rerun` 时先把 `owner.json`/`state.json`/`report.html`/`evidence.json`/`work` 等归档到 `runs/D/<module>/attempts/<旧runId>/`（仅 rename，非破坏性），再开新 run。
- 只有 `state.status === 'running'` 时 `--rerun` 会被拒绝（「当前运行仍在进行」）。
- **提交硬上限是 `startedAt + 20 分钟`**（`deadlineAt` 字段的 15 分钟只是提示）：超时提交 `success`/`partial` 会被「超过提交期限，不接受迟到版本」拒绝。子任务应在第 14 分钟左右收口转 `partial`，宁可覆盖不全也不要超时作废。
- `finish` 对 `success`/`partial` 的强校验：报告 mtime ≥ `startedAt`、HTML 含当日日期并以 `</html>` 结尾、`evidence.sources` 非空、**每个 `openedAt` ≥ `startedAt`**；且 `missingItems` 非空时 `success` 会被自动降级为 `partial`。
- `failed` 也会在条件满足时报存快照（报告 mtime ≥ `startedAt`、含日期、以 `</html>` 结尾、含 FAILED 标记），用于让汇总页展示如实状态。
- 每次运行 `owner.json`、`state.json`、`evidence.json` 是权威记录；`evidence.sources` 只是记录，不能代替实际打开来源。
- `coordinate.mjs` 只读取已完成快照并合并；新闻失败不阻断其他任务。合并成功后 `publish=delegated`，由同一会话用 WorkBuddy 站点发布能力发布 `daily-merged/`。
  - 同日重开：`node automation/coordinate.mjs D --prepare-rerun`（归档上一轮，写到 `runs/D/coordinator-attempts/<时间戳>/`）→ `node automation/coordinate.mjs D --rerun`。
  - **级联规则（重要）**：`available` 只统计 `['football','news','market']` 中**有 `snapshotPath` 且文件存在**的模块（`evolution` 是可选模块，不参与该计数）。三者全都没有快照时 `merge='no_current_snapshot'`、`publish='skipped'` —— 这是**有意设计**，拒绝用空状态页覆盖线上站点。因此「采集全体失败」时汇总发布任务必然 `failed`，它通常**不是独立故障**，排查时先查采集任务的浏览器通道。
  - `coordinator-state.json` 的 `unattendedPublishingVerified` 字段**恒为 `false`**（`coordinate.mjs` 只在初始化时写死该值，之后不再更新），**不代表发布失败**，不要误判。发布的权威记录在 `automation/publish-status-D.json`（由 `verify-publication.mjs` 写入）。
  - 合并脚本在系统临时目录做隔离 stage，并把 `apps/portal/assets/`、`apps/market/engine/icons/reports/` 一并拷入；改动这些常驻内容源时无需额外接线。
  - **报告图片不再内联**（2026-09-20 起）：合并期把各日 `reports/daily/<D>/assets/`（除 `data/`）增量归并进 `daily-merged/assets/`，并把页面里的图片路径改写成指向该目录（`shared/lib/report-assets.mjs#rewriteLocalReportAssets`，两遍改写：`<img src>` 与 JSON 数据块里的 `"assets/…"` 字符串）。因此合并会同时重建 `index.html`、**全部** `reports/daily/<D>/summary.html` 与历史归档；该脚本**无锁**，下游高频任务每轮可安全重跑。
- 启用任务失败用 `failed`，有真实部分数据用 `partial`；只有共享配置明确关闭才能用 `skipped`（`finish` 会拒绝启用中的任务提交 `skipped`）。
- 修改生成器或路径后运行 `node --test execution.test.mjs regression.test.mjs verify-publication.test.mjs news-media.test.mjs`。
- 不在此目录复制 `shared/` 中的路径、主题和通用函数。
- 旧 DuMate 单文件发布脚本（`publisher`、`probe-console-session.mjs`）已废弃，仅作历史保留，不要在新流程中调用。
