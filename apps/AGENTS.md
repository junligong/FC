# apps 业务任务约定

本目录只容纳四个独立任务：`football`、`news`、`market`、`portal`。前三项生成内容，`portal`只合并。每个任务必须遵守自己的 `AGENTS.md`，不得直接修改其他任务的数据。

- 共享路径、配置、展示层或通用函数放入 `../shared/`，不在任务之间复制。
- 业务输入保留在所属任务；最终HTML统一写入 `../reports/daily/D/`。
- 临时文件只写入 `../automation/runs/D/<module>/work/`，不得放入源码目录；任务成功或部分成功后运行 `node automation/compact-run-work.mjs D <module> --apply`。
- WorkBuddy后续应通过 `shared/config/project.json` 和稳定的数据文件读取结果，不依赖某个任务的内部临时结构。
- 每次执行必须先读取根 `../AGENTS.md` 的“浏览器强制规则”；需要网页时先运行 `node automation/browser-triage.mjs`，只能通过 `web-access`（浏览器自动化）技能的 CDP Proxy 连接独立调试 profile `Chrome-FC-Debug` 的 9333 端口。日常 Chrome、IAB、临时 profile 与 extension 模式均禁止。
- 所有脚本开头使用中文说明用途、输入和输出。
