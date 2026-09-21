# 调度器提示词入口

本目录中的文件是 WorkBuddy 任务的完整提示词，覆盖六个内容任务（含两个高频行情任务）、一个汇总发布任务和一个下游内容生产任务：

- `football.md`：足球日报 —— 逐联赛核验积分榜 / 射手榜 / 助攻榜与足球资讯。
- `news.md`：FC27 资讯采集 —— 从 `apps/news/sources.txt` 的 X 账号采集近 24 小时资讯；**采集固定四步**（DOM 抽取 → syndication 接口补媒体 → 生成报告 → 校验提交），媒体不得从 DOM 抠取，带视频的推文不得整条丢弃。
- `market.md`：FC27 市场监控 —— 概览三段（活动卡与周黑 / 价格分层 / 热门进化卡）+ 扫描双维度，**Console（PS/Xbox）与 PC 双平台口径**，两个平台都要采。传奇/英雄内容已迁出本任务。
- `market-hourly.md`：FC27 市场价格与关注列表（**每 4 小时**）—— 采集 FUTBIN 热门榜双平台价与热度，落库单文件累积观测序列，按「热度 + 价格 + 本日挂单价变动」重算关注列表，刷新 `market-watch.html`（市场栏目第三个子标签）与 `market-scan.html` 的价格；**并在每轮末重发布 `daily-merged/` 让线上刷新即读到本轮行情**（不重跑 `coordinate.mjs`、不渲染 `market.html`、不改页面结构），且**不使用 run-state.mjs**（其每日排他锁会拒绝同日的第 2 次运行）。
- `icons-heroes.md`：FC27 传奇/英雄卡监控 —— 监控全部传奇卡（Icon）与英雄卡（Hero）的逐日价格台账，双平台口径，产出 `reports/daily/D/icons-heroes.html`，挂「传奇/英雄专栏」。
- `icons-pricerange-hourly.md`：FC27 传奇卡价格区间（**每 4 小时**）—— 逐卡采集 FUTBIN 详情页 `Price Range`（最低价-最高价）与双平台当前价，重算「传奇卡研究」的 FC26↔FC27 投资建议并刷新监控页；不发布站点，且**不使用 run-state.mjs**（其每日排他锁会拒绝同日的第 2 次运行）。详见文件内说明。
- `evolution.md`：FC27 进化专栏 —— 热门进化卡与前置条件核验。
- `daily.md`：汇总链接 —— 纯本地等待快照、隔离合并并发布站点。
- `douyin.md`：抖音素材 —— 日报发布后把线上情报台各栏目**截成分析长图**并写出配套**视频讲解稿**（`apps/douyin/capture-shots.py`），供导入剪映出片；不参与日报合并发布，也不改动 `reports/daily/` 与站点产物。

WorkBuddy 定时任务只保存 `../task-definitions.json` 中对应的 `bootstrapPrompt`。启动后先读取根 `AGENTS.md`，再完整读取对应 `promptFile`；不得把业务规则复制回 WorkBuddy 或另一份配置。修改任务要求时只改本目录的完整提示词。

`publish.md` 是发布能力契约，不是第七个日常任务；只有 `daily.md` 明确要求且发布器已经验证时才读取。
