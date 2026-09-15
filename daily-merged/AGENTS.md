# 固定汇总站点约定

本目录是 WorkBuddy 站点发布（多文件静态站点）的本地发布源，包含 `index.html`、历史日报归档 `archive/` 与共享资源 `assets/`。

- 禁止手工编辑 `index.html` 或 `archive/*.html`；使用 `../apps/portal/merge_daily_report.mjs D` 重建。
- 执行前回读根 `../AGENTS.md` 的“浏览器强制规则”；生成固定入口不需要打开浏览器。
- `index.html` 只含当日内容 + 历史日报链接列表（`archive/D.html`），历史日报不内嵌，避免 index 随历史无限膨胀，稳定控制在 50M 以内。
- `archive/` 保存每个日期独立的 dashboard 风格日报，版式与 `index.html` 完全一致。
- `assets/` 保存共享静态资源（如 `yanzu-banner.jpg` 海报）；源文件维护在 `../apps/portal/assets/`，合并时自动同步。
- 发布方式：用 WorkBuddy 站点发布能力发布本目录，入口页 `index.html`；更新同一应用，保持公开链接不变。
- 发布成功与否必须由 `../automation/verify-publication.mjs` 核验，生成成功不等于线上已更新。
