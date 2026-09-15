# 调度器提示词入口

本目录中的四份文件是任务的完整提示词，也是 DuMate 与 WorkBuddy 的共同输入：

- `football.md`：足球日报
- `news.md`：FC27 资讯采集
- `market.md`：FC27 市场扫描
- `daily.md`：汇总链接

调度器自身只保存 `../task-definitions.json` 中对应的 `bootstrapPrompt`。启动后先读取根 `AGENTS.md`，再完整读取对应 `promptFile`；不得把业务规则复制回 DuMate、WorkBuddy 或另一份配置。修改任务要求时只改本目录的完整提示词。

`publish.md` 是发布能力契约，不是第五个日常任务；只有 `daily.md` 明确要求且发布器已经验证时才读取。
