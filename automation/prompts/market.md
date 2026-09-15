# market 单项执行契约（2026-09-11）

本文件为实际执行入口规则。每日 03:00 调度，每个单项只采集和生成自己的数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin market D`（D 在开始时固定 Asia/Shanghai 日期）。accepted=false 立即最终回复“本日已有运行”，不得继续。保存返回的 runId 与 deadlineAt。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物。保留既有模板结构，展示由合并器统一处理；日报任务不得重构 CSS、补齐设计要求或恢复旧页面。有效数据不足时提交 partial，不能以旧日期改写冒充新报告。
4. 将本轮证据写入 `automation/runs/D/market/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish market D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。证据字段只是记录，不能代替实际打开来源。
5. 市场任务当前已由用户明确启用。失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；数据不足但能形成如实报告则提交 partial。只有用户再次明确暂停且 `shared/config/project.json` 中 market 为 `enabled: false` 时才可提交 skipped。启用中的市场任务不能用 skipped 掩盖数据源、采集或生成失败。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

在 /Users/wuyanzu/Desktop/FC/apps/market/engine 执行 FC27 市场研究。市场任务已明确启用，日期 D 由总任务统一提供。先读取 `modules/market-segments.json`，分别完成各模块，再汇总成一份市场报告。

以 FUTBIN 实际可用的 FC27 数据为准；数据库、开服价格或进化任务尚不可用时记录原因，不用 FC26 数据冒充 FC27。默认 Cross 平台，PC 数据单独保存。每条记录保留稳定卡牌 ID、版本、球员名称/中文译名、评分、位置、卡类型、可交易性、价格单位、源 URL 和采集时间。排除不可交易 SBC、任务、租借和交换卡，不覆盖 FC26 历史数据。

按两个维度组织结果，结构固定、不得混编：

**维度一 · 价格维度**（按 Cross 平台最低价，单位 coins；1 万 = 10,000）
- 大卡：≥ 100 万
- 中卡：30 万 ≤ 价格 < 100 万
- 热门卡：10 万 ≤ 价格 < 30 万
- 适用卡：1 万 ≤ 价格 < 10 万
- 万元以下单独另列，不丢失。价格未开放时各档如实空状态并附核验证据，不伪造采样。

**维度二 · 热门球员维度**（按 FUTBIN 热门度，与价格无关）
- 主来源：https://www.futbin.com/27/popular
- 子类① 热门进化卡：https://www.futbin.com/27/popular/evolutions
- 子类② 价值卡：热门榜中的**非进化卡**（即热门球员里未参与进化的卡）
- 必须注明排序指标就是 FUTBIN 热门页所示的引用/使用热度；没有热度来源就不用「搜索热度」排序。

两个维度分别独立成章，并在报告中明确标注各自的来源 URL、打开时间与数据截止时间。此外按需增量维护第二观察维度：本周活动卡与周黑、传奇卡与英雄卡。

数据写入 `automation/runs/D/market/market.json`（结构见 `modules/market-segments.json` 与 `apps/market/AGENTS.md`），随后运行 `node apps/market/engine/scripts/render-market-report.mjs D` 渲染出 `reports/daily/D/market.html`。版式由渲染器统一，不要手改 HTML 版式；渲染器对缺失数据一律输出如实空状态。校验卡牌 ID 去重、平台隔离、时间戳、价格有效性、数据与图表数量一致后再提交。失败保留原始数据和上次有效报告。
浏览器强制规则：每次先读取根 AGENTS.md 对应段落；FUTBIN及其他网页只使用用户已登录的 Chrome 浏览器插件，并固定 `extension` 模式。禁止IAB、未登录浏览器、临时浏览器或新profile；扩展连接失败则提交failed/partial，不得先试或回退IAB。
