# 报告产物约定

本目录只保存可交付报告，不保存源代码、浏览器缓存或中间文件。

- `daily/YYYY-MM-DD/`保存当天 `football.html`、`news.html`、`market.html`、`summary.html`；文件名固定。
- `research/<topic>/`保存跨日期研究报告及其可复核CSV/JSON。
- 历史报告默认不可修改；同日明确重跑由自动化先归档旧attempt，再原子替换当前成品。
- 禁止使用其他日期的数据伪装当天更新，缺失板块保留空状态。
- WorkBuddy读取最终报告或结构化研究文件，不直接解析 `automation/runs/`中的临时文件。
- 处理报告前回读根 `../AGENTS.md` 的“浏览器强制规则”；本目录自身不启动浏览器。
