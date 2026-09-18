# market-hourly 单项执行契约（2026-09-17 新建）

「FC27 市场价格与关注列表（**每小时**）」任务。每小时采集 FUTBIN 热门榜的双平台平台价与热度，落库逐小时快照，并按「热度 + 价格 + 本日挂单价变动」重算**可关注球员列表**，刷新 `reports/daily/D/market-watch.html`（站点「FC27 市场 → 关注列表」子标签）与 `reports/daily/D/market-scan.html`（价格与热度刷新为最新观测值）。

**去重原则**：本轮采集器把当前值写入 `current.json` 一次后，后续分析只按 cardId 读取该文件；逐小时序列只用于计算相邻真实观测变化。不得再从 `market.json`、`players.json` 或页面 HTML 复制/重算当前价，不得为关注列表与扫描页分别再次采集同一批价格。

**每小时在采集与渲染后重发布线上行情资源（见第 6 步，2026-09-17 用户明确要求）；不改首页与版式、不动其他模块、不写 run-state、不重跑 coordinate.mjs。**

## 为什么这是一个独立任务

- 03:05 的「FC·市场监控」是**每日**任务：它负责周黑/活动卡、价格分层、进化卡与日报名单（受 `run-state.mjs` 的每日排他锁保护，同日只能跑一次）。
- FUTBIN 的平台价是**滚动更新**的（2026-09-17 实测：03:00 与 16:00 两次观测，Console 有效价 193 → 188、PC 197 → 192，逐卡价格有升有降）。每日采一次会丢掉整个白天的行情。
- 因此把「价格高频观测 + 关注列表」拆成小时级任务，与每日任务解耦：每日任务负责名单与结构，本任务负责高频价格与信号。

## 执行步骤（顺序固定）

1. **浏览器前置自检（必须，唯一判据）**：`node automation/browser-triage.mjs`，**exit 0 才继续**。完整规则（自愈链、分诊结论、红线、禁止入口、来源页取数失败 ≠ 通道故障）见根 AGENTS.md「浏览器强制规则」，此处不重复。
   - **失败留证（固定文件名与字段）**：写 `automation/runs/D/market/hourly-<HH>-failed.json`，字段为
     `{ task, scheduledHour, checkedAt, result:"failed", stage:"browser-precheck", reason, triage:{ verdict, checkDepsExit, chrome:{listener,wsPath}, actions }, notAttemptedAndWhy, lastValidResultKept, manualActionNeeded }`；
     内容取自 `node automation/browser-triage.mjs --json`（复用同一份判定，**不要**再自行探测一遍）。连续失败 ≥3 轮时，只追加一行时间戳与结论、复用上一轮诊断正文，不再重写全套诊断。
2. **采集价格与热度**：`node apps/market/engine/scripts/collect-market-prices.mjs`
   - 打开 `https://www.futbin.com/27/popular`（250 张卡的双平台价 + 热度）与 `https://www.futbin.com/27/popular/evolutions`（500 张进化卡热度 + 进化名）。
   - 落库 `apps/market/engine/data/prices/fc27/popular/{hourly,daily}/` 与 `.../evolutions/{hourly,daily}/`，最新值写 `latest.json`，尝试结果写 `last-attempt.json`。**同日同小时只覆盖该小时**，不动其他小时、不删改历史。
   - 脚本自带「首页建会话 + 45 秒退避重试一次」；被 403 拦截时**不得密集重试**（站点经验：分钟级退避）。
   - **退出码非 0** = 热门榜（价格源）一张都没采到：记为本次失败，**保留上次有效结果**，不用历史数据或 FC26 填充，并在最终回复写明原因。
3. **计算关注列表**：`node apps/market/engine/scripts/build-market-watchlist.mjs D`
   - 输出 `automation/runs/D/market/watchlist.json`（只保存名单、评分、理由与 cardId，不复制当前价）。
   - 所有当前价统一写入 `apps/market/engine/data/prices/fc27/current.json`；页面刷新时按 cardId 读取该文件。
   - 当前价格、当前热度只读 `current.json`；`popular/daily/D.json` 仅为相邻整点变化提供历史点，不得把其末值另存成“当前价”。同一轮只运行一次本分析器，渲染器直接复用 `watchlist.json` 的评分与理由。
4. **注入中文译名**：`node apps/market/engine/scripts/apply-market-name-zh.mjs D --file automation/runs/D/market/watchlist.json`
   - 未命中清单在 `automation/runs/D/market/work/missing-name-zh.json`；**本任务负责把与关注列表相关的未命中名译完**（按根 AGENTS.md「中文译名强制规则」：只增不改、禁止空字符串占位），追加词库后重跑至未命中收敛。
5. **渲染**：
   ```bash
   node apps/market/engine/scripts/render-market-watch.mjs D    # 关注列表页
   node apps/market/engine/scripts/render-market-report.mjs D   # 市场扫描页（价格/热度刷新）
   ```
   - **不要渲染 `market.html`**：它是 03:05 每日任务经 `run-state.mjs` 快照校验的产物，本任务重写它会造成快照与文件不一致。
   - 本步骤幂等：同日重跑只覆盖当日这两份产物。
6. **重合并 + 重发布线上行情资源（每小时一次；重合并为 2026-09-18 追加）**
   - **6a 先重合并（必做，实测约 1.6 秒）**：`FC_PROJECT_ROOT=/Users/wuyanzu/Desktop/FC node apps/portal/merge_daily_report.mjs D`
     - **为什么必须**：`daily-merged/index.html` 是把当日各栏目的 HTML **整体内联**成的单文件产物。第 ⑤ 步渲染出的 `reports/daily/D/market-watch.html` **本身不会被上传**——上传的是 `daily-merged/`，其中内联的仍是**上一次合并**时的那一版。不重合并，线上关注列表的页头、统计卡、五张榜单与关注分就会冻结在每日 03:35 合并所消费的那一版上（2026-09-18 实测：内联面板停留在 02:03 的 T02「2 个观测点（01–02 时）· 追踪卡数 782」，而价格因为走客户端 `current.json` 仍是新的——即「只有价格是活的」）。
     - 该脚本是**无锁**的合并引擎，与带当日排他锁的 `coordinate.mjs` 不同，可每小时安全重跑；它只依据 `reports/daily/` 的当日源文件重建 `index.html`、`reports/daily/D/summary.html` 与历史归档，**受 `run-state` 快照校验的产物**（`news/football/market/evolution/icons-heroes.html`）**不在其写入范围内**，因此不会破坏任何快照。
   - **6b 再发布**：用 WorkBuddy 站点发布能力发布本地目录 `/Users/wuyanzu/Desktop/FC/daily-merged`：入口 `index.html`、`language=static`、`updateExistingApp=true`、`userAskedToPublish=true`（用户已常驻授权本任务每小时重发布）、`domainPrefix=fc27-daily-intel`。更新同一应用「FC27每日情报台」，分享链接 `https://fc27-site.app.workbuddy.host/` 保持不变；**不得新建应用、不得改应用名、不下线旧页**。
   - 前置：确认 `daily-merged/assets/data/current.json` 的 `generatedAt` 已是本轮采集时间（`mergeCurrentMarket` 会经 `syncCurrentMarketAssets()` 自动镜像到该路径；若 `daily-merged/` 不存在，如实说明并跳过本步）。
   - **仍然不要重跑 `coordinate.mjs`**：它带当日排他锁（当日重复执行直接空转），且是每日 03:35 汇总任务的编排入口；本步只调用无锁的 `merge_daily_report.mjs`。
   - **时间口径不要只靠渲染时固化值**：`render-market-watch.mjs` 已把页头「行情更新于」与每行「更新于」列改为页面加载/刷新时按 cardId 从 `assets/data/current.json` 实时读取（含逐平台 `observedAt` 悬浮明细）。即使某轮合并或发布失败，页面上显示的时间也不会骗人。
   - 核对：请求 `https://fc27-site.app.workbuddy.host/assets/data/current.json`，确认返回 200 且 `generatedAt` 与本地一致。**不要运行 `automation/verify-publication.mjs`**（它会重写 `automation/publish-status-D.json`，那是每日发布任务的权威记录）；该 host 存在边缘缓存短时版本漂移，**不得只凭一次请求不一致就判定发布失败**，按契约最多再重试一次部署，仍不一致则如实记录。
   - 结果写入 `automation/runs/D/market/publish-hourly.json`：`{ "T<HH>": { published, at, url, currentJsonGeneratedAt, remoteGeneratedAt, error } }`，按小时覆盖、不删历史小时。
   - **防重复站点红线**：若发布能力返回「本工作区没有可更新的既有应用」或要求选择/新建应用，**立即停止发布步骤**——绝不允许新建应用、改用其他域名或在别的工作区发布；如实记录并提醒用户「需在 FC 工作区手动重发一次」。分享链接变化等于换了站点，是本任务最严重的错误。
   - 发布失败**不回滚本地文件、不影响行情采集与打分的成功判定**；如实上报，不伪造成功。

## 不使用 run-state.mjs 的原因（重要，勿改成 begin/finish）

`automation/run-state.mjs` 的 `begin` 用排他锁 `owner.json` 记录「本日任务已启动或已完成」，同一天第二次 `begin` 会被拒绝，那是为每日任务设计的。本任务每小时执行，一天要跑 24 次，套用该锁会导致当日日任务启动（2026-09-18 起为 03:00）之后的全部每小时运行被拒。

因此本任务的运行记录以**逐小时快照文件本身**为准：`popular/hourly/<D>T<HH>.json` 与 `evolutions/hourly/<D>T<HH>.json` 内含 `collectedAt`、`counts`、`attempts`，`last-attempt.json` 记录最近一次成功/失败与原因，足以逐次复核。**不要**为本任务调用 run-state，也不要新增锁文件。

## 关注列表口径（打分公式必须透明）

- **参考价** = 该卡两个平台中**有效价（≥1000 coins）的较大者**；两个平台都无效的卡不参与打分，只进「暂无有效平台价」区。
- **热度分** = 该卡 FUTBIN 热度计数在全体有热度卡中的分位（0–100）。
- **价格分** = `50 + 50×(1 − 参考价 / 同档中位价)`，同档 = 同位置组且总评 ±2、样本 ≥5 才计算；越便宜分越高。
- **变动分** = `50 + 挂单价变动百分比×2`（+10% → 70，−10% → 30）。**只取两个真实整点观测**（`basis: "hourly"`）的对比；与当日开盘基线（03:05 市场任务的价格，`basis: "daily-open"`）的单点对比**只作展示、不计入综合分**——开服前 FUTBIN 的平台价字段本身会大幅跳动，单点对比可能混入其自身估值修订，产物内以 `moveSuspicious` 标注 `|变动| ≥ 50%` 的跳变。
- **关注分** = `0.45×热度分 + 0.40×价格分 + 0.15×变动分`；缺项按中性 50 计入并在 `scoreParts.neutralFilled` 标注。

### 口径红线

- `.item-score-segment` 是卡片级 **Item Score**（两平台同值），**不是**任何平台的成交价，不得当作价格参与计算。
- 平台价与估值严格分开落库（`psPrice` = Console / `pcPrice` = PC），<1000 视为占位值，不与另一平台互相顶替。
- **不计算日环比与累计涨跌**；`intradayChange` 只表示同一日内两个有效观测点之间的变化。
- 缺失一律如实空状态：不用 FC26、不用历史日期、不用其他卡的数据顶替。
- 免责声明必须保留：本表为机械计算结果，仅供游戏内研究，不构成投资或交易建议。

## 产物

| 产物 | 路径 |
|---|---|
| 逐小时价格快照 | `apps/market/engine/data/prices/fc27/popular/hourly/<D>T<HH>.json` |
| 当日价格序列 | `apps/market/engine/data/prices/fc27/popular/daily/<D>.json` |
| 进化榜热度快照 | `apps/market/engine/data/prices/fc27/evolutions/hourly/<D>T<HH>.json` |
| 关注列表（结构化） | `automation/runs/D/market/watchlist.json` |
| 统一当前行情 | `apps/market/engine/data/prices/fc27/current.json` |
| 关注列表页 | `reports/daily/D/market-watch.html` |
| 市场扫描页（价格刷新） | `reports/daily/D/market-scan.html` |
| 线上行情资源（重发布） | `daily-merged/assets/data/current.json` → 站点 `https://fc27-site.app.workbuddy.host/assets/data/current.json` |
| 线上页面（重合并后重发布） | `daily-merged/index.html`（内联当日各栏目，含本任务的关注列表） |
| 发布记录 | `automation/runs/D/market/publish-hourly.json` |

## 时间预算

单次运行预算 14 分钟：采集两次页面导航通常 1–2 分钟，打分与渲染各 10 秒内，重合并约 1–2 秒，重发布与线上核对 1–3 分钟（目录约 40 MB，受网络影响）。被拦截时最多重试一次并留证，不追查、不改版。

## 最终回复要求

一句话结论 + 成功卡数（Console / PC 有效价数）+ 关注列表 Top 3（含中文名与关注分）+ 与上一观测点相比的显著变化 + 线上重发布结果（应用/分享链接/线上 `generatedAt` 是否与本轮一致）+ 失败或缺失项（严格区分「采集失败」「本日无数据」「发布失败」）。
