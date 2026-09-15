# FC27市场任务约定

本目录负责FC26历史数据库、FC27卡库、价格、活动卡、周黑、进化、传奇卡和英雄卡研究，最终生成 `../../reports/daily/D/market.html`。

- 执行前读取 `../../automation/prompts/market.md` 和 `engine/modules/market-segments.json`。
- 报告固定两个维度：维度一价格（大卡/中卡/热门卡/适用卡，低于1万另列），维度二热门球员（热门进化卡 `/27/popular/evolutions` 与 价值卡 `/27/popular` 中的非进化卡）。
- 采集结果写入 `../../automation/runs/D/market/market.json`，再用 `engine/scripts/render-market-report.mjs D` 渲染出 `market.html`；不要手改 HTML 版式，缺失数据由渲染器输出如实空状态。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；FUTBIN等站点只能由已登录Chrome插件访问，禁止先试IAB。
- `engine/data`、`gold/data`、`evolution/data`、`icons/data`、`heroes/data`、`totw/data` 是可复用数据源，不因报告失败而覆盖。
- `engine/output/`只放可重建截图与分析缓存；公众号集成位于 `integrations/wechat/`，不得由日报任务自动发布。
- 进化专栏内容单独写入 `../../reports/daily/D/evolution.html`（可选），由首页右栏收录，不作为 market.html 的一部分。
- Cross与PC价格分开保存；FC26历史不能冒充FC27实时行情。
- 共用查询能力优先进入 `engine/src/player-data.mjs` 或根目录 `../../shared/`，不要为WorkBuddy复制数据库。
