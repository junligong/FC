# 固定汇总页约定

本目录是固定公开入口的本地发布源，只保留生成后的 `index.html`。

- 禁止手工编辑 `index.html`；使用 `../apps/portal/merge_daily_report.mjs D`重建。
- 执行前回读根 `../AGENTS.md` 的“浏览器强制规则”；生成固定入口不需要打开浏览器。
- 页面嵌入 `../reports/daily/`中已有的日期化报告并按日期倒序展示。
- 不在此目录保存图片、缓存、脚本、备份或业务数据。
- 发布成功与否必须由 `../automation/verify-publication.mjs`核验，生成成功不等于线上已更新。
