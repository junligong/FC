# 自动化编排约定

本目录负责四任务的执行契约、单次运行所有权、证据、超时、合并和发布验证，不保存业务数据库。项目已从 DuMate 迁移到 WorkBuddy。

- `prompts/` 是 WorkBuddy 定时任务的入口；路径必须引用优化后的绝对项目位置。
- 所有任务每次执行必须读取根 `../AGENTS.md` 的“浏览器强制规则”；编排提示应明确 `extension`，禁止 IAB、未登录浏览器和新 profile。
- `prompts/*.md` 是完整提示词；调度器只保存 `task-definitions.json` 的短启动提示，不复制业务规则。
- `runs/D/<module>/` 保存 owner、state、evidence、work 和不可变报告快照。同日重跑必须显式归档旧 attempt，不能静默覆盖。
- `coordinate.mjs` 只读取已完成快照并合并；新闻失败不阻断其他任务。合并成功后 `publish=delegated`，由同一会话用 WorkBuddy 站点发布能力发布 `daily-merged/`。
- 启用任务失败用 `failed`，有真实部分数据用 `partial`；只有共享配置明确关闭才能用 `skipped`。
- 修改生成器或路径后运行 `node --test execution.test.mjs regression.test.mjs verify-publication.test.mjs`。
- 不在此目录复制 `shared/` 中的路径、主题和通用函数。
- 旧 DuMate 单文件发布脚本（`publisher`、`probe-console-session.mjs`）已废弃，仅作历史保留，不要在新流程中调用。
