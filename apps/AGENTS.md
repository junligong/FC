# apps 业务任务约定

本目录只容纳四个独立任务：`football`、`news`、`market`、`portal`。前三项生成内容，`portal`只合并。每个任务必须遵守自己的 `AGENTS.md`，不得直接修改其他任务的数据。

- 共享路径、配置、展示层或通用函数放入 `../shared/`，不在任务之间复制。
- 业务输入保留在所属任务；最终HTML统一写入 `../reports/daily/D/`。
- 临时文件写入 `../automation/runs/D/<module>/work/`，成功后可清理。
- WorkBuddy后续应通过 `shared/config/project.json` 和稳定的数据文件读取结果，不依赖某个任务的内部临时结构。
- 每次执行必须先读取根 `../AGENTS.md` 的“浏览器强制规则”；需要网页时只能通过 `web-access`（浏览器自动化）技能以 CDP 连接用户已登录的日常 Chrome，禁止 IAB、未登录浏览器、临时浏览器和新 profile；也不要再使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。
- 所有脚本开头使用中文说明用途、输入和输出。
