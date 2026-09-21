# evolution 单项执行契约（2026-09-15）

本文件为进化专栏任务的执行入口规则。每日 03:15 调度（2026-09-18 起日任务按 5 分钟错开发起，权威时刻表见 `shared/config/project.json` 的 `dailySchedule`），只采集和生成进化专栏数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin evolution D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin evolution D --rerun`（先把旧 attempt 归档到 `automation/runs/D/evolution/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物，版式由渲染器统一，不要手写或改造 HTML。
4. 将本轮证据写入 `automation/runs/D/evolution/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish evolution D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

进化专栏服务于站点「进化专栏」（首页右栏 + 独立视图）。数据来源与顺序：

- **热门进化卡主来源**：https://www.futbin.com/27/popular/evolutions （Popular Evolution Players 榜单）。逐条核验卡名、评分、位置、进化名称、费用、到期时间与前置条件（评分上限、位置、卡版本、可交易性等）。
- **候选球员**：需要补充候选时参考 https://www.futbin.com/27/players 的 Rating 列与位置筛选，说明候选口径。
- 每张卡保留：球员名称/中文译名、Rating、位置、进化名称、费用、到期时间、前置条件、源 URL、采集时间。
- **中文译名（必做，2026-09-17 起）**：进化榜单球员同样必须带中文译名。写入 `evolution.json` 后、渲染之前运行
  ```bash
  node apps/market/engine/scripts/apply-market-name-zh.mjs D --file automation/runs/D/evolution/evolution.json
  ```
  它按 FUTBIN 球员 URL 的**全名 slug**（注意进化榜 URL 的 id 段带版本后缀，形如 `/player/1272_8/pierre-emerick-aubameyang`，脚本已兼容）匹配持久译名词库，就地写 `nameZh`，并把未命中清单写到 `automation/runs/D/market/work/missing-name-zh.json`。**本任务负责把当日未命中清单译完**：在执行预算内逐条取可靠译名（官方中文名 / 公开资料，缺依据时用通行音译）**追加**到 `apps/market/engine/data/players/name-zh-supplement-fc27.json` 的 `mappings`（键为 slug；**只增不改，禁止写入空字符串占位**），重跑本步直到 `未命中 0`。
  确实无法确定汉字的姓名（仅有方言罗马拼写且无公开汉字依据）**保留英文原名并记入 `missing`**，不得猜测填充。
- 区分「可证实的卡面事实」与「推断的进化路线建议」；路线建议必须给出前提条件与失效情形，不输出无依据的精确收益预测。
- 页面无可列出进化卡时，如实输出空状态并记录核验证据（例如页面显示 No evolutions found），不得用 FC26 或其他日期数据填充。

## 球员头像（必做，2026-09-17 起）

进化专栏的球员姓名单元格**必须带头像**，由渲染器自动解析（`reports/daily/D/assets/players/`），不要手改 HTML。

- 渲染前后各跑一次：`node apps/market/engine/scripts/backfill-avatar-keys.mjs D`（补 `cardId → 头像键` 映射并下载缺失头像；浏览器通道已由任务开头的 `browser-triage.mjs` 预检验证，如需复检用 `node automation/browser-triage.mjs`，exit 0 才可用）。进化榜里的球员大量是低评分卡，不在本地卡库（canonical 只覆盖 gold 榜 + icons 榜）中，**不跑补全脚本就会有一半以上没有头像**。
- 该脚本对缺口 cardId 走 FUTBIN 的 `playerhover` 接口（同源 fetch），**单并发 + 450ms 间隔**，不要调高并发（429 会退避重试），也不要为了补头像逐页打开球员详情页。
- 提交前核对页头「球员头像 X/Y」计数是否收敛；解析不到的条目如实不显示图片，**严禁**用其他球员的图或占位图顶替，也严禁删行凑数。

## 产出流程

1. 把结构化结果写入 `automation/runs/D/evolution/evolution.json`：
   `{ date, status, generatedAt, dataCutoff, evolutions: [{ rank, name, nameZh, rating, pos, altPos, evolutionName, cost, expires, requirements[], popularityCount, futbinRating, totalStats, baseCardId, stats, url, evoUrl }], routes: [{ name, cost, desc, steps[], note }], sources: [{ url, openedAt, note }], notes: [], missing: [] }`
   - `popularityCount` = 榜单卡片上火苗图标旁的**热度/使用计数**（不是费用）。
   - `futbinRating` = 榜单卡片上 `div.playercard-27-futbin-rating` 的**FUTBIN Rating**（如 81.5）。**注意它不是价格**；历史字段名 `futbinListValue` 命名有误，仅为兼容保留，新代码一律用 `futbinRating`。
2. 运行 `node apps/market/engine/scripts/apply-market-name-zh.mjs D --file automation/runs/D/evolution/evolution.json` 注入中文译名；把未命中清单译完后追加词库并重跑，直到 `未命中 0`。
3. 运行 `node apps/market/engine/scripts/backfill-avatar-keys.mjs D` 补全球员头像键并下载缺失头像。
4. 运行 `node apps/market/engine/scripts/enrich-evolution-prices.mjs D` 补齐关联键与派生指标：就地写逐卡 `baseCardId`、`totalStats`、`futbinRating`，并写顶层 `marketJoin`。当前价不复制进 evolution.json，页面运行时从统一 `current.json` 读取。
   - 本任务禁止为进化卡再次采集或分析市场价格；只建立一次 `baseCardId` 关联。价格展示直接复用市场任务已经写好的 `current.json`，未命中如实留空。
5. 运行 `node apps/market/engine/scripts/render-evolution.mjs D`，生成 `reports/daily/D/evolution.html`。渲染器对缺失数据一律输出如实空状态，在英文名后追加 `<span class="zh">中文名</span>`，并把头像缩放到 `reports/daily/D/assets/players/` 写进姓名单元格。版式见下方「版式要求」。
6. 校验卡牌 ID/名称去重（**按「球员 URL + 进化名称」去重，不按球员名**——同名不同卡版本是独立条目）、时间戳、费用与到期字段有效性，并确认产物含中文名（`grep -c 'class="zh"'` 非 0）与头像计数已收敛后再提交。失败保留原始数据和上次有效报告。

## 价格口径（2026-09-17 实机核验，必须遵守）

- **FUTBIN 对进化卡不公布挂牌价**，这是已实测确认的事实：
  - `/27/popular/evolutions` 的进化卡内**没有任何价格元素**（`popular-price-wrapper` / `platform-price-wrapper` / `price-segment` / `item-score-segment` 命中数全为 0）。对照组：`/27/popular` 的普通球员卡开头就是 Console/PC 双平台价。
  - `/27/players/evolutions` 表头只有 NAME/RAT/POS/COST/FOOT/SM/WF/PAC/SHO/PAS/DRI/DEF/PHY/IGS/BODY，其中 COST 是**进化解锁费用**（当前全部 Free），不是币价；该页 `td.table-price` 命中数为 0。
  - `playerhover` 接口（`data-player-hover-location`）无价格，只有 Total Stats / Total IGS / Playstyles。
  - 进化**版本**的详情页（如 `/27/player/1272_8/...`）也只有 FUTBIN Rating 与 Item Score，没有 Console/PC 价。
- **因此本任务的「价格」一律定义为**：把进化候选按**球员 ID**（URL 中 `/player/<数字>` 段；进化卡带版本后缀、基础卡不带）关接到**市场模块当日采集的基础卡双平台价**，作为该候选的**持仓成本参考价**。
  - 只关接市场数据集里**非进化**的条目——进化条目自身的价格在来源页就是空的，用了等于自欺。
  - 页面与 `note` 中必须标注为「参考价（基础卡）」，**不得**表述为该进化卡的成交价。
  - `baseCardId` 在统一行情中关接不到，或两平台均无有效价时，页面显示「无报价」，**严禁**用 FUTBIN Rating、六维合计、FC26 数据或其他日期数据冒充价格。
- 展示与排序统一用「**PC 价优先，PC 无有效价时取 Console 价**」，值只来自 `apps/market/engine/data/prices/fc27/current.json`；禁止从 `market.json`、逐轮观测序列或历史报告再复制一份当前价格。
- 覆盖率会随 FUTBIN 开服后的价格投放与市场模块采集范围变化（2026-09-17 当日仅 45/500 关接成功）。**每次以当日 `marketJoin` 为准，不要照抄历史覆盖率**，也不要把「无报价」写成「价格为 0」。

## 版式要求（2026-09-17 改版）

- 页面**不再全量平铺候选卡**（500 张既冗长又缺投资参考价值），改为「精选池 × 三视角」：
  1. **按进化精选**：每条进化只出 `popularityCount` 最高的 **Top5**，组内按参考价升序；
  2. **按位置精选**：同一精选池按位置分组；
  3. **按价格档精选**：同一精选池按参考价档位分组（「无报价」不单独成表，只标注人数）。
- 精选池 = 每条进化热度 Top5 的并集（最多 14×5 张）。**全量数据仍必须完整采集并保存在 `evolution.json`**，不得因为页面精简就少采、丢字段或不去核验。
- 选取**只按热度**，不得让价格影响「最热 5 人」的构成；同热度用 Rating、姓名做确定性兜底，保证每日结果可复现。
- 每行至少展示：头像、姓名（中英）、Rating、位置、热度、参考价（C/P 双平台）、六维合计、FB评分。

浏览器强制规则：采集前先运行 `node automation/browser-triage.mjs`（唯一判据），`exit 0` 才继续；完整规则（自愈链、分诊、红线、禁止入口、FUTBIN 必须走 CDP）见根 AGENTS.md「浏览器强制规则」，此处不重复。
