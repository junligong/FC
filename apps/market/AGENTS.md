# FC27市场任务约定

本目录负责FC26历史数据库、FC27卡库、价格、活动卡、周黑、进化、传奇卡和英雄卡研究，最终生成 `../../reports/daily/D/market.html`。

- 执行前读取 `../../automation/prompts/market.md` 和 `engine/modules/market-segments.json`。
- 每天产出两个并列文件，互不覆盖，均由渲染器生成，不要手改 HTML 版式：
  1. `market.html` = **市场概览**，四段式固定结构：① 本周活动卡与本周周黑 ② 价格分层（≥100万 / 30-100万 / 10-30万 / 1-10万，每档 Top 50，按 `/27/players` 的 Rating 降序） ③ 传奇卡与英雄卡 ④ 热门进化卡。取数用 `/27/players` 的分档参数：`pc_price=1000000%2B` / `300000-1000000` / `100000-300000` / `10000-100000`。
  2. `market-scan.html` = **市场扫描**，双维度：维度一价格（大卡/中卡/热门卡/适用卡，低于1万另列），维度二热门球员（热门进化卡 `/27/popular/evolutions` 与 价值卡 `/27/popular` 中的非进化卡）。
- 数据统一写入 `../../automation/runs/D/market/market.json`（概览放 `overview`，扫描放顶层），再运行 `node engine/scripts/render-market.mjs D` 一次渲染两份产物；缺失数据由渲染器输出如实空状态。站点上两者以「市场概览 / 市场扫描」子标签切换。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；FUTBIN等站点只能由已登录Chrome插件访问，禁止先试IAB。
- `engine/data`、`gold/data`、`evolution/data`、`icons/data`、`heroes/data`、`totw/data` 是可复用数据源，不因报告失败而覆盖。
- `engine/output/`只放可重建截图与分析缓存；公众号集成位于 `integrations/wechat/`，不得由日报任务自动发布。
- 进化专栏内容单独写入 `../../reports/daily/D/evolution.html`（可选），由首页右栏收录，不作为 market.html 的一部分。
- Cross与PC价格分开保存；FC26历史不能冒充FC27实时行情。
- 共用查询能力优先进入 `engine/src/player-data.mjs` 或根目录 `../../shared/`，不要为WorkBuddy复制数据库。
