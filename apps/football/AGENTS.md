# 足球日报任务约定

本目录负责足球比赛、新闻、积分榜、射手榜和助攻榜的当日核验与报告生成。输入来自本轮打开的可靠来源，模板位于 `templates/`，输出固定为 `../../reports/daily/D/football.html`。

- 执行前读取 `../../automation/prompts/football.md`。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；来源核验只走 `web-access` 技能的 CDP 通道（用户日常 Chrome 登录态），不用 IAB、新 profile，也不用 Chrome 插件 / `extension` 模式。
- 积分榜 / 射手榜 / 助攻榜是固定必做三榜，逐联赛分别核验、内容互不相同；提交前**必须**运行 `node ../../automation/verify-football-boards.mjs D`，退出码非 0 不得提交 `success`（修正后重跑；仍不过则提交 `partial` 并在证据中记录未通过项）。
- 不得做「缺数据静默回退英超」之类的兜底；缺失如实标注并提交 `partial`。
- 不用旧比赛结果推算当日完整榜单；缺失必须标注并提交 `partial`。
- `templates/`只保存可复用结构，不保存日期化成品。
- 展示主题由 `../../shared/presentation/`统一维护，本任务不复制主题代码。
- 证据、工作文件和不可变快照写入 `../../automation/runs/D/football/`。
