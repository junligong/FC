# icons-heroes 单项执行契约（2026-09-16 新建）

本文件为「FC27 传奇/英雄卡监控」任务的执行入口规则。每日 03:00 调度，只采集和生成传奇卡（Icon）与英雄卡（Hero）的监控数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

> 背景：2026-09-16 起，传奇/英雄内容从 FC27 市场任务中**整体迁出**。市场任务不再监控传奇/英雄卡，也不再产出 `market-icons.html`；本任务独立承担该职责，产物挂在站点「传奇/英雄专栏」下。

1. 第一条命令运行 `node automation/run-state.mjs begin icons-heroes D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin icons-heroes D --rerun`（先把旧 attempt 归档到 `automation/runs/D/icons-heroes/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**`finish` 的硬上限是 `startedAt + 20 分钟`**：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。
3. HTML 只作为内部数据产物，版式由渲染器统一，不要手写或改造 HTML。
4. 将本轮证据写入 `automation/runs/D/icons-heroes/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish icons-heroes D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 监控对象（务必全量，不得只取部分）

监控 FC27 **全部基础传奇卡（Icon）与全部英雄卡（Hero）**：

- 传奇卡与英雄卡名单：入口 `https://www.futbin.com/27/players`。**URL 查询参数不可用于筛选**（已实机核验：`?rarity=icon`、`?rarity=hero`、`?version=icons` 三个地址返回的都是**同一批默认列表**，服务端并未按参数过滤；`page` 参数同样不生效）。因此必须走以下两条路之一：
  1. **用页面自身的筛选 UI**：点击 FUTBIN 列表页的版本/稀有度筛选控件（Icon / Hero）后再读取表格；或
  2. **读全量列表后用台账比对归属**：以卡库台账 `apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json`（131 张 Icon）与英雄卡台账为基准判定每张卡的版本，列表未覆盖的卡逐一记录为缺失。
- **每张卡必须写明版本字段（`version`: `"Icon"` / `"Hero"`）**，两个版本严格区分，不得互相混入；不得因为筛选控件难用就把两版混成一份。
- 排除一切特殊版本（Debut Icon、进化后版本、SBC/任务/租借/交换卡等），只保留基础卡。
- 列表页首屏约 30 行且分页不生效，凑齐全量需靠滚动加载或按价格/评分区间分档多次读取；凑不全时如实记 `missingItems` 并提交 `partial`，不得用部分数据冒充全量。

## 平台口径（2026-09-16 起必须，实机核验）

FUTBIN 只有 **Console（PS/Xbox 合并）** 与 **PC** 两个平台。列表页每一行**同时渲染两个价格单元格**：

- `td.table-price.platform-ps-only` —— Console 价
- `td.table-price.platform-pc-only` —— PC 价
- 页顶按钮在 `form.desktop-platform-change-form` 内（`button value="ps"` 文案 Console / `button value="pc"` 文案 PC），**只是纯前端显隐切换**：默认 Console 的单元格 `display:table-cell`、PC 为 `display:none`；点击后互换，**不刷新页面、不改 URL、不重新取数**。

因此：

- **一次打开列表页即可同时读到两个平台价**，直接分别读两个单元格即可。**不要**依赖 `ps_price` / `pc_price` URL 参数（开服前该筛选失效），也**不要**为切换平台重复导航。
- **两个平台的价格都必须逐卡采集**，分别写入 `prices.console` 与 `prices.pc`；经 `record-icons-daily.mjs` 固化为 `platforms.console` / `platforms.pc`（`{price, valid}`）。不得只取其中一个平台，也不得用一个平台价顶替另一个；某平台确无数据时如实留空。
- 开服日 `launchDate=2026-09-25` 之前，两个平台价均为 0（球员页显示 `PRICE UPDATED: NEVER`）。此时列表页 `td.table-item-score`（IS 列）是**开服前估值**，必须单独记为 `estimate`，**不得当作平台成交价**，也不得据此计算日环比与累计涨跌。
- 价格 < 1000 视为占位值，`priceValid=false`。
- 开服后自动切换为 `market` 口径，按平台逐日计算日环比与累计涨跌（产物页已有 Console / PC 切换按钮，两个平台的指标分别计算）。

## 产出流程

1. 采集当日全量传奇卡 + 英雄卡名单与价格，分别写入：
   - `apps/market/engine/icons/data/prices/fc27/base-icons.json`（沿用现有格式：`id` / `slug` / `nameZh` / `rating` / `currentPrice` / `prices` / `marketUrl` / `launchDate`）
   - `apps/market/engine/heroes/data/prices/fc27/base-heroes.json`（同一格式，新增；`version: "Hero"`）
2. 运行 `node apps/market/engine/scripts/record-icons-daily.mjs D` 固化当日传奇卡快照到 `icons/data/prices/fc27/daily/D.json`（一天一份，同日重跑只覆盖当天，原子写入，禁止删改历史日期；抓取失败必须非 0 退出且不写快照）。
3. 运行 `node apps/market/engine/scripts/render-icons-heroes.mjs D`，生成 `reports/daily/D/icons-heroes.html`（传奇/英雄专栏主视图）。
   - 渲染器对缺失数据一律输出如实空状态；英雄卡数据缺失时如实标注「英雄卡数据源待建立」，不得用传奇卡顶替。
4. 校验：卡牌 ID 去重、Icon/Hero 版本字段齐全、平台字段齐全、时间戳、价格有效性与数量一致性。失败保留原始数据和上次有效报告。

## 浏览器强制规则

每次先读取根 AGENTS.md 对应段落；FUTBIN 直接调用 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。**采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选（不得代勾、不得改用其他浏览器）；也不要使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。FUTBIN 拒绝 curl/WebFetch 静态请求（403），必须走 CDP。** 禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。
