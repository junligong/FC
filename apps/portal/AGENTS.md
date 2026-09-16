# 汇总入口任务约定

本目录只负责读取三个已完成的当日报告，生成 `../../reports/daily/D/summary.html`，并刷新 `../../daily-merged/index.html`。

- 执行前读取 `../../automation/prompts/daily.md`。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；本任务是纯本地合并，**不打开任何浏览器、不跑浏览器自检**（不启动 IAB、Chrome、CDP Proxy，也不为「检查」而联网）。
- 不采集新闻、足球或市场数据，不修改单项报告内容。
- 缺失板块显示真实空状态，不使用历史数据补齐当天。
- 共享主题位于 `../../shared/presentation/`，固定路径来自 `../../shared/config/project.json`。
- 历史日期倒序生成；固定入口始终可由日期化报告重建。
