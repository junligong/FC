# 固定汇总站点约定

本目录是 WorkBuddy 站点发布（多文件静态站点）的本地发布源，包含 `index.html`、历史日报归档 `archive/` 与共享资源 `assets/`。

- 禁止手工编辑 `index.html` 或 `archive/*.html`；使用 `../apps/portal/merge_daily_report.mjs D` 重建。
- 执行前回读根 `../AGENTS.md` 的“浏览器强制规则”；生成固定入口**不需要也不允许**打开浏览器（纯本地，不跑浏览器自检）。
- `index.html` 只含当日内容 + 历史日报链接列表（`archive/D.html`），历史日报不内嵌，避免 index 随历史无限膨胀。2026-09-20 起图片不再内联 base64（改走 `assets/` 共享目录），index.html 实测约 3.3 MB（此前需把当日全部图片内联，达 21 MB）。
- `archive/` 保存每个日期独立的 dashboard 风格日报，版式与 `index.html` 完全一致。
- `assets/` 保存**全站共享资源**，三类：① 常驻资源（如 `yanzu-banner.jpg` 海报）源文件维护在 `../apps/portal/assets/`，合并时自动同步；② 报告图片 `assets/players/`、`assets/news/`，由合并时从各日 `../reports/daily/<D>/assets/` 增量归并；③ `assets/data/current.json`，当日唯一行情快照（逐日覆盖）。
- **图片按内容寻址命名**（`players/<resourceId>.png`、`news/<sha256 前 20 位>.jpg`），**同名即同内容**，因此可跨日共用一份、不会覆盖成别人的图。新增资源类型必须沿用这一命名约定，否则不得直接并入本目录。不要手工往里加文件或删单个文件。
- 发布方式：用 WorkBuddy 站点发布能力发布本目录，入口页 `index.html`；更新同一应用（「FC27每日情报台」，`updateExistingApp`），保持公开链接 `https://fc27-site.app.workbuddy.host/` 不变。本目录含 `index.html` 与 `archive/*.html` 多个 HTML，发布时须显式指定 `entryHtml: "index.html"`，避免入口被判错。
- 发布成功与否必须由 `../automation/verify-publication.mjs D` 核验：本地与线上逐字节一致、含 `archive/D.html` 链接、含当日日期锚点、HTML 完整，四项全通过并 `exit 0` 才算发布成功。**生成成功不等于线上已更新。**
- **边缘缓存坑（实测）**：发布后根路径 `https://…/` 可能出现多版本缓存轮询（曾观测到旧版命中多次），而显式路径 `https://…/index.html` 立即命中最新版。verify 失败时**先别改代码**：用显式路径复查，并隔几分钟重新采样根路径（通常 3–4 分钟收敛）。
- 发布级联前提：`coordinate.mjs` 在 `['football','news','market']` 全无快照时会 `publish='skipped'`，此时本目录不会被更新，线上继续保留上一期内容——这是有意的保护，不是发布环节故障。
