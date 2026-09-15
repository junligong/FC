# 足球日报任务约定

本目录负责足球比赛、新闻、积分榜、射手榜和助攻榜的当日核验与报告生成。输入来自本轮打开的可靠来源，模板位于 `templates/`，输出固定为 `../../reports/daily/D/football.html`。

- 执行前读取 `../../automation/prompts/football.md`。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；来源核验只用已登录Chrome插件，不用IAB或新profile。
- 不用旧比赛结果推算当日完整榜单；缺失必须标注并提交 `partial`。
- `templates/`只保存可复用结构，不保存日期化成品。
- 展示主题由 `../../shared/presentation/`统一维护，本任务不复制主题代码。
- 证据、工作文件和不可变快照写入 `../../automation/runs/D/football/`。
