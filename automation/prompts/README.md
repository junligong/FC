# 调度器提示词入口

本目录中的六份文件是 WorkBuddy 任务的完整提示词，覆盖五个内容任务和一个汇总发布任务：

- `football.md`：足球日报 —— 逐联赛核验积分榜 / 射手榜 / 助攻榜与足球资讯。
- `news.md`：FC27 资讯采集 —— 从 `apps/news/sources.txt` 的 X 账号采集近 24 小时资讯；**采集固定四步**（DOM 抽取 → syndication 接口补媒体 → 生成报告 → 校验提交），媒体不得从 DOM 抠取，带视频的推文不得整条丢弃。
- `market.md`：FC27 市场监控 —— 概览三段（活动卡与周黑 / 价格分层 / 热门进化卡）+ 扫描双维度，**Console（PS/Xbox）与 PC 双平台口径**，两个平台都要采。传奇/英雄内容已迁出本任务。
- `icons-heroes.md`：FC27 传奇/英雄卡监控 —— 监控全部传奇卡（Icon）与英雄卡（Hero）的逐日价格台账，双平台口径，产出 `reports/daily/D/icons-heroes.html`，挂「传奇/英雄专栏」。
- `evolution.md`：FC27 进化专栏 —— 热门进化卡与前置条件核验。
- `daily.md`：汇总链接 —— 纯本地等待快照、隔离合并并发布站点。

WorkBuddy 定时任务只保存 `../task-definitions.json` 中对应的 `bootstrapPrompt`。启动后先读取根 `AGENTS.md`，再完整读取对应 `promptFile`；不得把业务规则复制回 WorkBuddy 或另一份配置。修改任务要求时只改本目录的完整提示词。

`publish.md` 是发布能力契约，不是第七个日常任务；只有 `daily.md` 明确要求且发布器已经验证时才读取。
