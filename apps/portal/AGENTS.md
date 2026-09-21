# 汇总入口任务约定

本目录只负责读取已完成的当日报告，生成 `../../reports/daily/D/summary.html`，并刷新 `../../daily-merged/index.html`、**全部** `../../reports/daily/<D>/summary.html` 与共享资源目录 `../../daily-merged/assets/`。

- 执行前读取 `../../automation/prompts/daily.md`。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；本任务是纯本地合并，**不打开任何浏览器、不跑浏览器自检**（不启动 IAB、Chrome、CDP Proxy，也不为「检查」而联网）。
- 不采集新闻、足球或市场数据，不修改单项报告内容。
- 缺失板块显示真实空状态，不使用历史数据补齐当天。
- 合并期做两件事：把页面里的本地图片改写成指向 `daily-merged/assets/` 的相对路径（`../../shared/lib/report-assets.mjs#rewriteLocalReportAssets`，**不再内联 base64**），并把各日 `reports/daily/<D>/assets/`（除 `data/`）按内容寻址增量归并进该目录。重复调用接近零成本（按 size 跳过未变文件）。
- 共享主题位于 `../../shared/presentation/`，固定路径来自 `../../shared/config/project.json`。
- 历史日期倒序生成；固定入口始终可由日期化报告重建。
