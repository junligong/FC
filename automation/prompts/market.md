# market 单项执行契约（2026-09-11）

本文件为实际执行入口规则。每日 03:00 调度，每个单项只采集和生成自己的数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin market D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin market D --rerun`（先把旧 attempt 归档到 `automation/runs/D/market/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物。保留既有模板结构，展示由合并器统一处理；日报任务不得重构 CSS、补齐设计要求或恢复旧页面。有效数据不足时提交 partial，不能以旧日期改写冒充新报告。
4. 将本轮证据写入 `automation/runs/D/market/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish market D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。证据字段只是记录，不能代替实际打开来源。
5. 市场任务当前已由用户明确启用。失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；数据不足但能形成如实报告则提交 partial。只有用户再次明确暂停且 `shared/config/project.json` 中 market 为 `enabled: false` 时才可提交 skipped。启用中的市场任务不能用 skipped 掩盖数据源、采集或生成失败。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

在 /Users/wuyanzu/Desktop/FC/apps/market/engine 执行 FC27 市场研究。市场任务已明确启用，日期 D 由总任务统一提供。先读取 `modules/market-segments.json`，分别完成各模块。

以 FUTBIN 实际可用的 FC27 数据为准；数据库、开服价格或进化任务尚不可用时记录原因，不用 FC26 数据冒充 FC27。

**平台口径（必须同时覆盖两档，不得只采一个）**：FUTBIN 只提供 **Console（PS / Xbox 合并）** 与 **PC** 两个市场口径。已实机核验的页面结构：

- 列表页每一行**同时渲染两个价格单元格**：`td.table-price.platform-ps-only`（Console）与 `td.table-price.platform-pc-only`（PC）。
- 页顶平台按钮在 `form.desktop-platform-change-form` 内：`button value="ps"`（文案 Console）/ `button value="pc"`（文案 PC）。点击它**只是纯前端显隐切换**（默认 Console 可见、PC 为 `display:none`），**不刷新页面、不改 URL、不重新取数**。
- **结论：一次打开列表页即可同时读到两个平台价**，直接从 DOM 分别读两个单元格即可；**不要**依赖 `ps_price` / `pc_price` URL 参数（开服前该筛选失效），也**不要**为切换平台而重新导航。
- `td.table-item-score` 是**开服前估值列**，不是平台成交价，不得当作行情信号。

两个平台必须分别落库为 `psPrice`（Console）与 `pcPrice`（PC），**不得只取 Console 而漏掉 PC，也不得用一个平台的价格顶替另一个**；某一平台确无数据时如实留空，不做推断填充。每条记录保留稳定卡牌 ID、版本、球员名称/中文译名、评分、位置、卡类型、可交易性、价格单位、源 URL 和采集时间。排除不可交易 SBC、任务、租借和交换卡，不覆盖 FC26 历史数据。

## 两份产物（互不覆盖）

市场模块每天产出**两个并列文件**，站点上以「市场概览 / 市场扫描」两个子标签切换展示，本任务**不得用其中一个覆盖另一个**。产物都由渲染器统一生成，不要手改它们的 HTML 版式。

> **2026-09-16 起拆分**：传奇卡（Icon）与英雄卡（Hero）**已不再属于市场任务**，改由独立的「FC27传奇/英雄卡监控」任务（`automation/prompts/icons-heroes.md`，产物 `reports/daily/D/icons-heroes.html`）负责，展示在站点「传奇/英雄专栏」。市场任务不再采集、渲染或提交任何传奇/英雄内容，也不得再写入 `market-icons.html`。

### 1. `reports/daily/D/market.html` —— 市场概览（三段式，顺序与命名固定）

**一、本周活动卡与本周周黑**
分「本周活动卡（Promo）」与「本周周黑（TOTW）」两张表，采集本周实际发布的名单与发布时间；未公布或未采集则如实空状态。

**二、价格分层（每档监控 Top 50，按 Rating 排序）**
四个档位固定为：
- ≥ 100 万
- 30 - 100 万
- 10 - 30 万
- 1 - 10 万

每档最多列 50 张，**以 `https://www.futbin.com/27/players` 的 Rating 列降序**作为排序与识别依据。分档用该页的价格筛选区间（开服后有效）：

| 档位 | 筛选区间 |
|---|---|
| ≥ 100 万 | `1000000%2B` |
| 30 - 100 万 | `300000-1000000` |
| 10 - 30 万 | `100000-300000` |
| 1 - 10 万 | `10000-100000` |

**平台取数规则**：两平台价在同一页同一行同时存在，**每档只需打开一次页面**，从 DOM 里分别读 Console 与 PC 两个价格单元格，不要为切换平台重复拉取，也不要依赖 `ps_price` / `pc_price` URL 参数分平台取数。开服前该价格筛选会返回 0 行（筛选失效，非「无卡」），此时各档如实空状态并附核验证据，不伪造采样、不用 FC26 价格填充。

产物页顶部提供 Console / PC 平台切换按钮，两种口径的价同时渲染、按平台显隐；扫描页的价格分档与排序也跟随所选平台。

**三、热门进化卡**
来源 `https://www.futbin.com/27/popular/evolutions`；无可用进化则如实空状态。

### 2. `reports/daily/D/market-scan.html` —— 市场扫描（双维度）

**维度一 · 价格维度**（按所选平台最低价，单位 coins；1 万 = 10,000）
- 大卡：≥ 100 万
- 中卡：30 万 ≤ 价格 < 100 万
- 热门卡：10 万 ≤ 价格 < 30 万
- 适用卡：1 万 ≤ 价格 < 10 万
- 万元以下单独另列，不丢失。页面顶部同样提供 Console / PC 切换，价格列与价格分档均按所选平台计算。价格未开放时各档如实空状态并附核验证据，不伪造采样。

**维度二 · 热门球员维度**（按 FUTBIN 热门度，与价格无关）
- 主来源：https://www.futbin.com/27/popular
- 子类① 热门进化卡：https://www.futbin.com/27/popular/evolutions
- 子类② 价值卡：热门榜中的**非进化卡**（即热门球员里未参与进化的卡）
- 必须注明排序指标就是 FUTBIN 热门页所示的引用/使用热度；没有热度来源就不用「搜索热度」排序。

## 数据字段（平台价必须显式落库）

- 球员记录的 `players[]` 里，每张卡必须同时带：
  - `psPrice` —— Console（PS / Xbox 合并）平台价，来自 `td.table-price.platform-ps-only`
  - `pcPrice` —— PC 平台价，来自 `td.table-price.platform-pc-only`
  - `price` —— 列表页 `td.table-item-score` 开服前估值（仅作展示兜底，**不是**成交价）
  - `priceValid` —— 该卡是否存在有效平台价（< 1000 视为占位值，判 false）
- 开服前 `psPrice` 与 `pcPrice` 均为 0，此时 `priceBasis=listing-estimate`，**不得**把估值当成交价，也**不得**在开服前计算日环比与累计涨跌。
- 顶层 `platform` 记 `"console+pc"`；不要再用 `"cross"` 作为平台名（那是旧写法，`cross` 只作为原始抓取里 Console 的别名存在）。
- 渲染器（`render-market-overview.mjs` / `render-market-report.mjs`）会为每张卡输出两个平台的价格单元格并在页顶生成切换按钮；采集侧只要把两个平台价如实写进 JSON 即自动生效。
- 价格 < 1000 视为占位值，渲染器会标注「估值 / 占位」，不能当有效价。

## 产出流程

1. 把两份产物所需的结构化结果写入 `automation/runs/D/market/market.json`：概览数据放 `overview`（`weekly.promo` / `weekly.totw` / `priceTiers[].items` / `evolutions`），扫描数据放顶层（`priceDimensions`、`popular.evolutions`、`popular.value`、`players[]`），另附 `sources` / `missing` / `notes`。结构见 `modules/market-segments.json` 与 `apps/market/AGENTS.md`。**`overview` 与 `players[]` 中都不要再写 `iconsHeroes` 字段**（已迁出）。
2. 运行 `node apps/market/engine/scripts/render-market.mjs D`，一次生成 `market.html` 与 `market-scan.html`。渲染器对缺失数据一律输出如实空状态，并按 Console / PC 双平台渲染价格列与平台切换按钮。
3. 校验卡牌 ID 去重、平台隔离（每个平台价独立校验）、时间戳、价格有效性、数量一致后再提交。失败保留原始数据和上次有效报告。
浏览器强制规则：每次先读取根 AGENTS.md 对应段落；FUTBIN 及其他网页直接调用定时任务已绑定的 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。**采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选（不得代勾、不得改用其他浏览器）；也不要使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。FUTBIN 拒绝 curl/WebFetch 静态请求（403），必须走 CDP。** 禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。
