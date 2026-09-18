# FC·传奇价格区间（每小时）— 自动化执行记忆

契约：`automation/prompts/icons-pricerange-hourly.md`（唯一业务契约，本地文件为准）。
产品：pricerange/latest.json + hourly/<D>T<HH>.json、reports/daily/D/market-icons-research.html、icons-heroes.html。**不发布站点**，**不调用 run-state.mjs**（每日排他锁）。

## 固定执行顺序（4 步，勿改）
1. `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → 必须 exit 0
2. `node apps/market/engine/scripts/collect-icon-priceranges.mjs`（全量 131 张，串行限速 4–6 分钟，退避重试已内置；**禁止改高并发**）
3. `node apps/market/engine/scripts/build-icon-research.mjs <D>`
4. `node apps/market/engine/scripts/record-icons-daily.mjs <D>` → `node apps/market/engine/scripts/render-icons-heroes.mjs <D>`

## 历史执行

### 2026-09-17 13:0x（首次记录）
- 结果：**131/131 成功**，区间 69,000 – 15,000,000，口径 listing-estimate，errors 0。
- 研究：对照 131 张，投资建议 **2 张**（条件A 1 = 加林查 console 129,077；条件B 1 = 斯科尔斯 区间上沿 200,000；双命中 0），无 FC26 对照 14 张，无区间 0 张。
- **重要故障模式（会重复出现，务必按此处置）**：首轮采集在 4 个批（32 张）后整体劣化，剩余 99 张全部报
  `批失败: CDP 命令超时: Runtime.evaluate` / `批失败: Unexpected end of JSON input` —— 这是 **CDP 代理传输层故障，不是 429、不是 Cloudflare**。
  脚本内置的「补采一轮」同样拿到 0 张（通道持续劣化时补采无效）。
  **处置：先 `check-deps.mjs` 确认 exit 0，再用 `--limit 8` 试跑（只写 dryrun/，不覆盖生产）确认通道恢复，然后重跑全量。** 本次重跑即 131/131 恢复，耗时 3m11s。
  - 该脚本**只要采到 ≥1 张就会写 latest.json**（退出码非 0 仅当一张都没采到），所以**部分失败会把全量结果覆盖成残缺版**。但历史小时快照（如 T12）保留完整结果，不会丢数据；判定时优先看 `latest.json` 的 counts 与上一小时快照对比。
- 顺手修正 `record-icons-daily.mjs` 第 203 行的写死提示「开服前两平台均为 0，属预期」（当日实测 Console 5 / PC 1，与实测矛盾）；改为按 `platformValidCount` 动态输出。`regression.test.mjs` 13/13 通过。
- 未发布站点；publish-status 未改动。

### 2026-09-17 14:1x
- 结果：**131/131 成功**，耗时 4m19s，`errors 0`。区间 69,000（VARANE）– 15,000,000（PELÉ），与 T13 完全一致；口径 listing-estimate、scope card。
- **本轮通道完全健康**：全程 17 个批次无一次 CDP 超时/JSON 截断，无需 `--limit 8` 探测、无需重跑。印证 13:0x 的劣化是**偶发传输层故障**，不是名单或页面结构问题。
- 研究：对照 131 张，投资建议 **2 张**（条件A 1 = 加林查 console 129,077；条件B 1 = 斯科尔斯 区间上沿 200,000；双命中 0），无 FC26 对照 14 张，无区间 0 张。与 T13 结论一致。
- **判定适用性（重要，避免误读「131 张都没机会」）**：条件B 可判定 117 张；**条件A 实际只有 5 张可判定**（需同时有 FC26 对照 + 有效 FC27 当前价）= jones / shevchenko / lima do amor / laudrup / essien。其余 112 张有 FC26 对照但因当前价无效（<1000）不参与条件A，属**口径设计**而非采集缺失。
- 实时平台价滚动上升：T13 任一平台有价 20 张 → T14 21 张（Console 有效 17 / PC 有效 6）。当日 `priceBasis` 仍为 listing-estimate，**不计算日环比与累计涨跌**。
- 产物校验：研究页与监控页均含「不构成投资或交易建议」+「历史开服价不代表 FC27 会重演」；监控页三列（最低价/最高价/当前价）齐备；页面无按平台拆分区间的痕迹。
- 未发布站点；`publish-status` 未改动；未调用 run-state.mjs。

### 2026-09-17 15:2x（T15）
- 结果：**131/131 成功**，耗时 3m52s，`errors []`、`missing 0`。区间 69,000（VARANE）– 15,000,000（PELÉ，slug `nazario-de-lima`）；口径 listing-estimate、scope card。
- **通道完全健康**：17 个批次零 CDP 超时/JSON 截断，无需 `--limit 8` 探测、无需重跑。再次印证 13:0x 的劣化是偶发传输层故障。
- 实时平台价继续滚动上升：T14 21 张 → **T15 任一平台有价 20 张（Console 20 / PC 6）**。注意 **T15 相对 T14 的区间逐卡变化数为 0**（131 张最高/最低价全部持平），说明区间尚未进入新一轮滚动；`priceBasis` 仍为 listing-estimate，不计算涨跌。
- 研究：对照 131 张，投资建议 **2 张**（条件A 1 = 加林查 289,071 > 129,077；条件B 1 = 斯科尔斯 231,598 > 区间上沿 200,000；双命中 0），无 FC26 对照 14 张，无区间 0 张。与 T13/T14 完全一致。
- 可判定张数：条件B 117 张；**条件A 仅 5 张**（jones / shevchenko / lima-do-amor / laudrup / essien），其中仅加林查命中。属口径设计，非遗漏。
- 产物校验：研究页 45KB 含四条口径要素（不适用 / 有效价 / 无 FC26 对照 / listing-estimate / 占位）与两项免责；监控页 237KB 三列表头齐备（当前价(列表页) | 最低价 | 最高价）+ 卡级说明 + 1424 处「不适用/—/开服前」；当日快照 131/131 含 `priceRange`、`platforms` 为 console/pc 双键。
- **新增踩坑（正则假阳性）**：用 `(Console|PC).{0,20}区间` 之类正则扫「是否按平台拆区间」会**误命中口径说明句**「Console 与 PC 价格盒渲染出完全相同的区间」。判定时要打印命中原文，不能只看布尔值。
- 未发布站点；`publish-status` 未改动；未调用 run-state.mjs。

### 2026-09-17 16:2x（T16）
- 结果：**131/131 成功**（含一次重跑），`errors 0`、`missing 0`。区间 69,000（VARANE）– 15,000,000（PELÉ，slug `arantes-nascimento`）；口径 listing-estimate、scope card。
- **再次命中 13:0x 的传输层劣化故障（第 2 次，规律更清晰）**：首轮跑到 104/131 后**在进度 104 处完全卡死**（后续 112/120/128/131 四行全部停在「已成功 104」），补采 27 张拿到 0 张。
  错误构成：`批失败: CDP 命令超时: Runtime.evaluate` ×8 + `批失败: Unexpected end of JSON input` ×32 —— 与 13:0x 完全同类，**不是 429、不是 Cloudflare**。
  **验证过的恢复套路（两次都一次成功，照抄即可）**：① `check-deps.mjs` 应仍 exit 0（通道自检**测不出**这种劣化，别指望它报警）；② `--limit 8` 试跑（只写 `dryrun/`，有防呆不会覆盖生产）——8/8 即说明已恢复；③ 重跑全量 → 131/131，耗时 3m58s。
  - 结论：**该故障的特征是「跑到某一进度后连续批全失败 + 补采 0 张」，此时不要继续重试补采、不要调并发，直接按上面三步走。**
- 区间首次出现跨小时滚动：**1/131 变动** = 尤西比奥 `da-silva-ferreira` min 71,000→72,000、max 15,000,000→13,100,000（`updated 1 mins ago`）。此前 T13/T14/T15 之间变动为 0。T16 的**上沿极值仍为 PELÉ 15,000,000**，未受影响。
- 详情页有效当前价继续上升：T15 20 张 → **T16 26 张（Console 22 / PC 6）**。`priceBasis` 仍 listing-estimate，**不计算日环比与累计涨跌**。
- 研究：对照 131 张，投资建议 **2 张**（条件A 1 = 加林查 `lima-do-amor` 289,071 > 129,077；条件B 1 = 斯科尔斯 231,598 > 区间上沿 200,000；双命中 0），无 FC26 对照 14 张，无区间 0 张。条件B 可判定 117 张；**条件A 仅 5 张可判定**（jones / shevchenko / lima-do-amor / laudrup / essien）。与 T13/T14/T15 完全一致。
- 产物校验：research 45KB（7 项口径/免责要素全 OK）、icons-heroes 231KB；表头为 `当前价(列表页)|最低价|最高价`，**无按平台拆的区间列**；`daily/<D>.json` 顶层 `priceRange.scope=card` + `scopeNote` 明示卡级；逐卡 `priceRange` 131/131、`platforms` 双键 console/pc；头像 131/131。
- **快照结构校正（再次踩到命名坑）**：`daily/<D>.json` 的逐卡数组键是 **`players`**（不是 `cards`，本任务 hourly 快照才用 `cards`），逐卡字段为 `priceRange{min,max,updatedText,fetchedAt}` + `platforms.console/pc={price,valid}`；顶层另有 `priceRange` 汇总对象。用 `snap.cards` 会拿到 `undefined` 而误判「快照 0 张」。
- 未发布站点（本日无 `automation/publish-status-D.json` 改动）；未调用 run-state.mjs。

### 2026-09-17 17:3x（T17）— 传输层故障第 3 次，已定位根因并修复
- 结果：**131/131 成功**（首轮 16 → 48 → 修复后 107 + 补采 24 = 131），`counts.missing 0`、逐卡 `ok=false` 0 张。区间 69,000（VARANE）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。**较 T16 区间变动 0 张**。
- 有效当前价：T16 26 张 → **T17 26 张（Console 23 / PC 7 / 任一 26）**，滚动上升但区间未变。
- 研究：对照 131，投资建议 **2 张**（条件A 1 = 加林查 `lima-do-amor` 289,071 > 129,077；条件B 1 = 斯科尔斯 231,598 > 区间上沿 200,000；双命中 0），无 FC26 对照 14 张，无区间 0 张。条件B 可判定 117；**条件A 仅 5 张可判定**。与 T13–T16 完全一致。
- **根因已定位（重要，此前只当「偶发」处理）**：劣化是**长驻宿主页/单目标级**的资源累积，不是 429、不是 Cloudflare、不是 FUTBIN 拦截。证据：脚本每轮只建**一个**宿主页（`futbin.com/robots.txt`）供全部 17 个批复用，劣化总发生在「跑到某一进度之后」，且**单批试跑（`--limit 8`）永远成功**（= 新页从零开始，容量足够）。三次实测劣化点：16 / 104 / 48。
- **已实施修复**：`collect-icon-priceranges.mjs` 新增 `HOST_RECYCLE_EVERY = 3`，每 3 批（24 张）关闭旧宿主页并新建。修复后同一健康度下拿到 107 张（旧版本同条件只有 48），剩余 24 张由补采轮全部补齐 → 131/131。**串行与限速语义未变，未动并发**。36 个回归测试全通过。
- **顺带修复诊断字段缺陷**：`errors[]` 原先直接 `errors.slice(0,40)`，会把**补采已成功**的卡的首轮错误一并写入快照（T17 实测 24 条陈旧残留），使 131/131 的完整快照被下游误读成部分失败。现改为 `errors.filter(e => !collected.has(String(e.id)))`。注意该字段**不流入** daily 快照与页面（已核验），故 T17 已落盘的 24 条陈旧残留**仅存于 hourly/latest 的诊断字段**，未重跑覆盖（避免为纯诊断字段再多打 131 次请求）。
- 产物校验：research 45KB（免责 + 卡级口径 + 无条件A误判）；icons-heroes 231KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆的区间列 **0**；daily 快照 `players` 131/131 含 `priceRange`、`platforms` 双键 console/pc；区间覆盖 131/131、头像 131/131。
- 未发布站点；`publish-status` 未改动；未调用 run-state.mjs。

### 2026-09-17 18:5x（T18）
- 自检 exit 0；4 步全部按序完成。结果：**131/131 成功**（首轮 91 + 补采 40，耗时 4m36s），`counts.missing 0`、`errors 0`、逐卡 `ok=false` 0 张。区间 69,000（VARANE）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。
- **传输层劣化第 4 次出现，`HOST_RECYCLE_EVERY=3` 并未消除它**：劣化点在进度 32 附近（32→48→56 停滞）及 80/104/112；首轮仅 91 张，**内置补采轮 40 张一次全成**。结论：该修复只是**延后**劣化，不是根治；处置不变——依赖内置补采轮，**不要调并发、不要反复手动补采**。`check-deps.mjs` 期间仍 exit 0（测不出劣化）。
- **T17→T18 区间变动 0 张**（131 张最高/最低价全部持平）；任一平台有效当前价 T17 26 → T18 **26（Console 24 / PC 6）**，与 T17 持平。
- 研究：对照 131，投资建议 **2 张**（条件A 1 = 加林查 `lima-do-amor` 289,071 > 129,077；条件B 1 = 斯科尔斯 231,598 > 区间上沿 200,000；双命中 0），无 FC26 对照 14 张，无区间 0 张。条件B 可判定 117；条件A 仅 5 张可判定（jones / shevchenko / lima-do-amor / laudrup / essien）。与 T13–T17 完全一致。
- 产物校验：research 45.3KB（免责 / 不重演 / 不适用 / listing-estimate 四要素齐备）；icons-heroes 231.2KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，**按平台拆的区间列 0**；**日环比/累计涨跌 262 格（131×2）全为「—」，无任何伪百分比**；daily 快照 `players` 131/131 含 `priceRange`、`platforms` 双键 console/pc；跨平台顶替嫌疑 0；头像 img 179 处。
- 未发布站点；`publish-status` 未改动；未调用 run-state.mjs。

### 2026-09-17 20:5x（T20）
- 自检 exit 0；4 步全部按序完成。结果：**131/131 首轮即成功**（耗时约 4 分钟，17 批 0 重试），`counts.missing 0`、`errors 0`。区间 69,000（VARANE）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。
- **本轮通道完全健康**：5 次宿主页重建（每 3 批）全程零 CDP 超时/JSON 截断，无补采轮触发。说明 T13/T16/T17/T18 的劣化确为偶发传输层故障，非名单或结构问题。
- **T19 快照缺失**：hourly 目录为 T11–T18 + T20，**无 2026-09-17T19.json**，且自动化记忆无 T19 条目 —— 19:20 那一轮未产出（未执行或未落盘）。非本任务可控，如实记录；不影响 T20 完整性。
- **T18→T20 区间变动 0 张**（131 张最高/最低价全部持平）。任一平台有效当前价 T18 26 → **T20 32（Console 31 / PC 4）**，平台价继续滚动放出。
- **投资建议由 2 张变为 3 张（首次出现口径驱动的命中集变更，已交叉核验为正确）**：`charlton`（FC26 3,323,810 > 当前 2,499,000，condA）、`bergkamp`（505,048 > 300,000，condA）、`scholes`（231,598 > 当前 200,000 = condA；同时 > 区间上沿 200,000 = condB，**本日首个双命中**）。**上一轮的 `lima-do-amor`（加林查）掉出**：其详情页当前价由 129,077 涨到 1,289,000，已高于 FC26 开服价 289,071 → condA 转 false。属实时价滚动导致的正常结论更替，不是实现缺陷。
- 可判定张数随有效价上升：condA 5 → **31**（= 32 张有效价 − 1 张无 FC26 对照的 `nagasato`）；condB 恒为 117；无 FC26 对照 14 张；无区间 0 张。**此前「条件A 只有 5 张可判定」应改述为「取决于当日有效价张数」，非固定值。**
- **已核验的旧「已知待决」项（可结案）**：`record-icons-daily.mjs` 现已取**详情页当前价**而非 03:00 列表页 —— 当日快照有效价 Console 31 / PC 4，与 `current.json` 逐卡价**32/32 完全一致**（对比 `base-icons.json` 03:00 列表页仅 6 张有效）。监控页「当前价」列不再落后于研究口径。AGENTS.md 里「快照当前价取自列表页」的描述已过期。
- 产物校验：research 46.3 KB（不构成投资 / 历史不重演 / listing-estimate / 卡级 / 条件A 有效性 / 无 FC26 对照 / 占位 七要素齐备）；icons-heroes 275 KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间列 0（唯一正则命中是口径说明句，仍属 T15 记录的假阳性）；日环比/累计涨跌 0 个伪百分比、1393 处「—」；头像 `球员头像 131/131`；daily 快照 `players` 131/131 含 `priceRange`、`platforms` 双键、`priceRange.scope=card` + `scopeNote`。
- **三处区间一致性**：`current.json` ↔ `daily` 快照 区间不一致 **0** 张。`latest.json` 无顶层 `priceRange`（scope 只在逐卡与 daily 汇总对象里，查 `latest.priceRange.scope` 会拿到 undefined，勿据此判故障）。
- **常驻底稿文件名（文档漂移，非缺陷）**：`build-icon-research.mjs` 实际写 `icons/reports/fc27-icon-live-research.html`，而 AGENTS.md 第 203 行只提 `fc27-icon-analysis.html`。`merge_daily_report.mjs` 第 108–109 行的回退顺序是 **live-research 优先、analysis 兜底**，接线正确，无需改动；仅 AGENTS.md 描述略旧。
- 未发布站点；`publish-status` 未改动（18:01）；仅写 `icons-heroes.html` / `market-icons-research.html`（20:55）；未调用 run-state.mjs。

## 字段位置备忘（易踩）
- **追加本轮条目时不要拿「上一条的标题行」当 Edit 的锚点**：新条目正文会顶掉标题，导致上一条失去 `###` 头（2026-09-18 T01 实测踩到一次）。正确锚点取上一条的**正文末行**，或新条目写在最前、锚点用文件里第一个 `##`。
- `pricerange/latest.json` 与 `hourly/*.json` 的逐卡字段是 **`current.console` / `current.pc` + `currentValid.console` / `currentValid.pc`**，**不是** `platforms.*`（`platforms.*` 是 `daily/<D>.json` 快照的结构）。用错键名会误判成「0 张有实时价」。
- `latest.json` 的 `missingItems` 里可能只放**口径提示字符串**（如「未开服当前价多为 0 已判无效」），**不代表有卡缺失**；判缺失要看 `counts.missing` 与 `cards[].ok`。
- 研究文件（`research/fc26-vs-fc27-<D>.json`）**顶层没有 `summary`**，汇总是 **`counts`**：`{compared, advice, condA, condB, both, noFc26, noRange}`；另有 `minValidPrice`/`priceBasis`/`rangeCollectedAt`。逐卡明细在 `rows`，键为 **`fc26`（含 launchPrice/monthMin/monthMax/days）、`fc26Launch`、`fc27Current`（含 console/pc/valid/representative）、`fc27Min`、`fc27Max`、`condA`（null=不适用）/`condB`/`advice`/`maxRatio`**。条件A 用 `fc27Current.representative`。（2026-09-17 T15 实测校正；此前记的 `summary` / `fc26Open` / `fc27Range` 三个键名均不存在，照抄会查到 undefined 而误判。）
- 当日快照 `daily/<D>.json` 的逐卡区间在 **`priceRange{min,max,updatedText,fetchedAt}`**，平台价在 **`platforms.console/pc = {price,valid}`**；顶层另有 `priceRange` 汇总对象与 `priceBasisNote`。
- **两个文件的逐卡数组键不同**：hourly/latest 用 **`cards`**，`daily/<D>.json` 用 **`players`**（2026-09-17 T16 实测校正）。写校验脚本时用 `snap.cards` 会得到 `undefined`，**误判成「快照 0 张、区间未合并」**。

## 已知待决（非本任务职责）

_（原「record-icons-daily 当前价取自 03:00 列表页」一项已于 2026-09-17 T20 结案并移除：脚本现取**详情页/current.json 当前价**，快照有效价与研究口径逐卡一致。T23 复核仍成立 —— 快照有效价 42 = `latest.json` 任一平台有效 42。AGENTS.md 中「快照当前价取自列表页」的描述属过期文本。）_

### 2026-09-17 21:57（落盘 T22）— 首轮即成功，无劣化
- 自检 exit 0；4 步按序完成。结果：**131/131 首轮即成功**（4m10s、17 批 0 重试），`counts.missing 0`、`errors 0`、逐卡 `ok=false` 0 张。区间 69,000（VARANE）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。**5 次宿主页重建（每 3 批）全程零 CDP 劣化，内置补采轮未触发** —— 与 T20 同，再次说明劣化是偶发传输层故障。
- **T20→T22 区间变动 0 张**；任一平台有效当前价 T20 32 → **T22 37（Console 35 / PC 5）**，平台价继续滚动放出。
- 研究：对照 131 张，投资建议 **3 张**（与 T20 同集）：`charlton`（FC26 3,323,810 > 当前 2,300,000，condA；当前价较 T20 的 2,499,000 略降）、`bergkamp`（505,048 > 300,000，condA）、`scholes`（231,598 > 当前 200,000 = condA，且 > 区间上沿 200,000 = condB → 双命中 1）。无 FC26 对照 14 张、无区间 0 张。
- 产物校验：`current.json`（本地 814 KB，cards 为 **cardId 映射对象而非数组**，勿用 `.map`）中传奇 **131/131 命中**，逐卡 `priceRange{min,max,scope:card,source:futbin-icon-detail}` + `platforms.console/pc`；与 hourly T22 区间不一致 0、当前价不合 0；`sources['futbin-icon-detail'].cards=131`。daily 快照 `players` 131/131 含区间 + 双平台键，与 current 区间不一致 0。research 50.7 KB（免责 / 不重演 / listing-estimate / 卡级 / 条件A 判据 / 无 FC26 对照 / 占位 齐备，区间覆盖 131/131）；icons-heroes 313.4 KB，表头 `当前价(列表页)|最低价|最高价`，区间列唯一且 `title` 明示「卡级：Console 与 PC 渲染同值」，伪百分比 0、1388 处「—」，头像 131/131，页内按 `data-card-id` + `assets/data/current.json` 运行时取最新值。
- **T19 与 T21 逐小时快照均缺失**（hourly 目录现为 T11–T18 + T20 + T22），19:20 与 21:20 两轮未产出；本轮 21:57 启动故落 T22。非本任务可控，如实记录。
- 仅覆盖当日 `daily/2026-09-17.json`（09-16 未变）；`publish-status-2026-09-17.json` 仍 18:01；未发布站点、未调用 run-state.mjs、未渲染 market.html。

### 2026-09-17 23:0x（T23）— 首轮即成功，无劣化
- 自检 exit 0；4 步按序完成。**131/131 首轮即成功**（4m02s、17 批、5 次宿主页重建），`counts.missing 0`、`errors 0`。区间 69,000（VARANE）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。与本日 T20/T22 同：零 CDP 劣化、补采轮未触发。
- **T22→T23 区间变动 0 张**；任一平台有效当前价 T22 37 → **T23 42（Console 40 / PC 10）**，平台价继续滚动放出。
- 研究：投资建议 **4 张（本轮由 3 → 4）**，**新增 `kroos`**（FC26 开服价 1,128,656 > 其 Console 当前价 850,000）；其 T22 当前价为 2,100,000（condA 不成立），本轮跌至 850,000 才转真 —— 属**真实价变动驱动的结论更替**，非实现缺陷。其余三张与 T22 同集：`scholes`（231,598 > 200,000，双命中）、`charlton`（3,323,810 > 2,100,000）、`bergkamp`（505,048 > 500,000，**余量仅 1.0%**，下一轮极易翻转，回报时宜提示）。无 FC26 对照 14 张、无区间 0 张；condA 不适用 94 张（= 当前价无效）。
- 产物校验：`current.json` 传奇 131/131 命中、`priceRange.scope=card`/`source=futbin-icon-detail` 全合规、双平台键 131/131、与 hourly T23 及 daily 区间/平台价不一致均 **0**；daily `players` 131/131 含区间 + console/pc，顶层 `priceRange.scope=card`+`scopeNote`；research 49KB（七要素齐备，建议表列出 4 张）；icons-heroes 305KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间列 0（唯一正则命中仍是口径说明句的假阳性）、伪百分比 0、1378 处「—」、头像 131/131、`data-card-id` 655 处 + 运行时读 `assets/data/current.json`。`current.json` 市场侧条目（futbin-popular 250 / daily-market 750）未被破坏，总条目仍 985。
- 未发布站点；`publish-status-2026-09-17.json` 仍 18:01；未调用 run-state.mjs；未渲染 market.html。
- 新增经验：投资建议集合会随实时价滚动而**增减**（已有先例：T20 `lima-do-amor` 掉出、T23 `kroos` 进入）。回报时若命中集变化，必须给出**触发该项变化的具体价格证据**，否则会被误读成脚本回归。

### 2026-09-18 01:15（T01）— 首轮即成功，无劣化
- 自检 exit 0；4 步按序完成，D=2026-09-18（`hourly/2026-09-18T01.json`）。**131/131 首轮即成功**（3m17s、17 批、5 次宿主页重建），`counts{"total":131,"ok":131,"missing":0}`、`errors 0`。区间 69,000（VARANE）– 15,000,000（PELÉ）；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T00→T01 区间变动 0 张**；任一平台有效当前价 T00 42 → **T01 47（Console 43 / PC 11）**。
- 研究：对照 131，投资建议 **8 张（T00 的 5 → 8）**，前 5 张全保留，新增 3 张全为条件A、均由**真实价下跌**触发（回报必附证据，否则易被误读为脚本回归）：
  - **`morgan` 进入**：5,000,000 → **4,199,000** < FC26 4,645,282。
  - **`foudy` 进入**：1,400,000 → **949,000** < FC26 993,762（**其 PC 价本轮由 1,300,000 转为无效 0**，故代表值由 max(console,pc) 下移）。
  - **`hagi` 进入**：400,000 → **335,000** < FC26 356,797。
  - 持平：`charlton` 2,279,000（较 T00 2,100,000 上涨，仍 < 3,323,810）、`kroos` 850,000、`del-piero` 1,500,000、`hernandez-creus` 750,000；`scholes` 当前价无效、仅条件B。`both`=0。
  - `condA` 可判定 **43 张**（47 有效价 − 4 张无 FC26 对照）、不适用 88；无 FC26 对照 14、无区间 0。**再次印证 condA 可判定张数随有效价张数浮动，非固定 5/31 之值。**
- 产物校验：`current.json` 990 条、传奇 131/131 命中、`scope=card`/`source=futbin-icon-detail`/console+pc 双键 0 违例；与 hourly T01 区间及当前价不一致 0；daily `players` 131/131 含 `priceRange`+`platforms`，与 current 不一致 0；`sources` 三源完好。research 51.6KB（七要素齐备）；icons-heroes 305.2KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间列 0（唯一正则命中仍是说明句假阳性）、伪百分比 0、1374 处「—」、头像 131/131、`data-card-id` 655、运行时读 `assets/data/current.json`（报告目录副本 generatedAt 与主文件一致）。
- **新观察**：`foudy` 的 PC 平台价出现「有效 → 0」回退，说明开服前滚动放出并非单调递增，平台价可能回落到占位值。这属源站行为，**不得**用上一小时值填补（本轮如实按无效处理，故代表值下移）。
- 未发布站点；无 `publish-status-2026-09-18.json`；未调用 run-state.mjs；未渲染 market.html。

### 2026-09-18 00:13（T00，首次跨日）— 首轮即成功，无劣化
- 自检 exit 0；4 步按序完成，D 由 09-17 切到 **09-18**（采集器自动落 `hourly/2026-09-18T00.json`）。**131/131 首轮即成功**（4m01s、17 批、5 次宿主页重建），`counts{"total":131,"ok":131,"missing":0,"minFloor":69000,"maxCeiling":15000000}`、`errors 0`。区间 69,000（VARANE）– 15,000,000；口径 listing-estimate、scope card。补采轮未触发。
- **T23→T00 区间变动 0 张**；任一平台有效当前价 T23 42 → **T00 42（Console 41 / PC 10）**。
- 研究：对照 131，投资建议 **5 张（T23 的 4 → 5）**，全部为**真实价变动驱动**（务必附证据回报）：
  - **`bergkamp` 掉出**：当前价 500,000 → **1,000,000**，已高于 FC26 开服价 505,048 → condA 转 false。
  - **`del-piero` 进入**：1,700,000 → **1,500,000** < FC26 1,662,844。
  - **`hernandez-creus` 进入**：900,000 → **800,000** < FC26 812,407。
  - 持平项：`charlton` 2,100,000（FC26 3,323,810）、`kroos` 850,000（FC26 1,128,656）condA；`scholes` 当前价无效、仅 condB（> 区间上沿 200,000）。`both`=0。condA 可判定 38 张、无 FC26 对照 14 张、无区间 0 张。
- 产物校验：`current.json` 传奇 131/131、`priceRange.scope=card` 131/131、双平台键 131/131、与 hourly T00 区间/价有效位不一致 **0**；与 daily 快照不一致 **0**；`sources` 三源完好（futbin-popular 250 / futbin-icon-detail 131 / daily-market 750，总 988）。daily `players` 131/131 含 `priceRange`+`platforms.console/pc`，顶层 `priceRange.scope=card`+`scopeNote`。research 45.9KB（七要素齐备；**平台拆区间正则本轮命中 0**，因文案已改为「不按平台拆分」）。icons-heroes 268KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆的区间列 0、伪百分比 0、1377 处「—」、头像 131/131、`data-card-id` 655 处、运行时读 `assets/data/current.json`（renderer 已在报告目录内落副本，无需手工复制）。
- **跨日行为（新观察）**：`reports/daily/2026-09-18/` 采集前不存在，由本任务第 4 步创建（仅 `assets/`）。这是**正常**的 —— 小时任务在 03:00 汇总任务之前先落地当日 `icons-heroes.html` 与 `market-icons-research.html`，不得因此判定异常；03:00 的每日任务随后会补齐其他栏目。
- 未发布站点；`publish-status-2026-09-17.json` 仍 18:01、未新建 09-18 发布记录；未调用 run-state.mjs；未渲染 market.html（仍 09-17 19:22）。

### 2026-09-18 02:20（T02）— 首轮即成功，无劣化
- 自检 exit 0；4 步按序完成，D=2026-09-18（`hourly/2026-09-18T02.json`；`collectedAt 2026-09-17T18:24:30.377Z`）。**131/131 首轮即成功**（4m07s、17 批、5 次宿主页重建），`counts{"total":131,"ok":131,"missing":0,"minFloor":69000,"maxCeiling":15000000}`、`errors 0`、逐卡 `ok=false` 0。区间 69,000（VARANE）– 15,000,000；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T01→T02 区间变动 0 张**；任一平台有效当前价 T01 47 → **T02 48（Console 44 / PC 11）**，平台价继续缓慢滚动放出。
- 研究：对照 131，投资建议 **7 张（T01 的 8 → 7）**，为**进 2 出 3**，全部由真实价变动驱动（回报必须附下列证据，否则易被误读为脚本回归）：
  - **掉出 3 张**（当前价上穿 FC26 开服价 → 条件A 转 false）：`del-piero` 1,500,000 → **2,100,000**（> 1,662,844）· `hernandez-creus` 750,000 → **900,000**（> 812,407）· `foudy` 949,000 → **1,167,000**（> 993,762）。
  - **新增 2 张**（当前价下穿 FC26 开服价 → 条件A 转 true）：`schmeichel` 500,000 → **400,000**（< 482,905）· `totti` 2,200,000 → **1,700,000**（< 1,948,634）。
  - **保留 5 张**：`charlton` 2,279,000 → 2,079,000（< 3,323,810）· `morgan` 4,199,000（持平）· `kroos` 850,000 → 750,000 · `hagi` 335,000（持平）· `scholes` 无有效价、仅条件B（区间上沿 200,000）。`both`=0。
  - `condA` 可判定 **44 张**（= 48 张有效价 − 4 张无 FC26 对照）、不适用 87；condB 可判定 117；无 FC26 对照 14、无区间 0。**condA 可判定张数 = 当日有效价张数浮动值，非固定值**（已第三次印证）。
- 产物校验：`current.json` 999 条（icon 131 / Evolution 500 / 其他 368），传奇 **131/131** 命中、`priceRange.scope=card` + `source=futbin-icon-detail` + 双平台键 0 违例、`observedAt` 全部 = 本轮 `2026-09-17T18:24:30.377Z`；与 hourly T02 区间/价有效位不一致 **0**；daily `players` 131/131 含 `priceRange`（键为 `fetchedAt`）+ `platforms.console/pc`，与 current 区间/价不一致 **0**；`sources` 三源完好（futbin-popular 250 / futbin-icon-detail 131 / daily-market 750），市场侧 868 条非传奇条目 `platforms` 齐备未被破坏。
- daily 快照 `counts{"total":131,"valid":48,"missing":83,"platformValid":{"console":44,"pc":11}}` —— 此处 **`missing` = 无有效当前价（占位 <1000）的张数，不是采集缺失**；采集缺失看 hourly `counts.missing`（=0）与逐卡 `ok`。当日快照 3 天历史，09-16（16:20）、09-17（23:07）未被改动。
- research 52.3KB（七要素齐备：免责 / 不重演 / listing-estimate / 卡级 / 条件A 有效性 / 无 FC26 对照 / 占位；7 张建议卡全部在页内）；常驻底稿 `apps/market/engine/icons/reports/fc27-icon-live-research.html` 同尺寸同步覆盖。icons-heroes 312.4KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间列 0（3 处正则命中全为口径说明句，仍属已知假阳性）、伪百分比 0、1373 处「—」、头像 131/131、`data-card-id` 655、运行时读 `assets/data/current.json`（报告目录副本 `generatedAt` 与主文件一致）。
- 未发布站点；未新建 `publish-status-2026-09-18.json`；未调用 run-state.mjs；未渲染 market.html（当日不存在）；`automation/runs/2026-09-18/` 仅有 market-hourly 的 `market/` 目录。

### 2026-09-18 04:0x（落盘 T04，开始时间 03:59）— 首轮即成功，无劣化
- 自检 exit 0；4 步按序完成。**131/131 首轮即成功**（2m30s，本日最快；17 批、5 次宿主页重建），`counts{"total":131,"ok":131,"missing":0,"minFloor":69000,"maxCeiling":15000000}`、`errors []`、逐卡 `ok=false` 0、`missingItems` 仅口径提示串。区间 69,000（`bale`，与多卡并列下沿）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **快照落在 T04 而非 T03（新的调度观察）**：本轮于 03:59:22 启动，采集结束 04:02，脚本按**写盘时刻**取小时，故落 `hourly/2026-09-18T04.json`，**T03 无快照**。属脚本既有行为（与 T19/T21 缺轮不同），非采集失败；跨整点启动的小时任务都可能出现此半小时空档，判定缺失时勿与真失败混淆。
- **T02→T04 区间变动 0 张**（131 张最高/最低价全部持平）；当前价变动 **40 张**（滚动活跃）。任一平台有效当前价 T02 48 → **T04 47（Console 44 / PC 13）**：总数微降但 PC 由 11 升至 13，属平台价滚动放出与个别回落并存（T01 已记录过 `foudy` PC「有效→0」非单调行为）。
- 研究：对照 131，投资建议 **9 张（T02 的 7 → 9）**，**进 2 出 0**，全部为真实价变动驱动（证据见下，缺证据易被误读为脚本回归）：
  - **`hernandez-creus` 进入（condA）**：console 900,000 → **750,000** < FC26 开服价 812,407（T02 为 900,000 > 812,407，故 T02 为 false）。
  - **`foudy` 进入（condA）**：代表值（两平台较大者）1,167,000 → **650,000** < FC26 993,762（console 823,000→640,000，PC 1,167,000→650,000）。
  - 保留 7 张：`charlton` 2,079,000→1,999,000（< 3,323,810）· `morgan` 4,199,000（持平，< 4,645,282）· `kroos` 750,000→530,000（< 1,128,656）· `hagi` 335,000→300,000（< 356,797）· `schmeichel` 400,000→395,000（< 482,905）· `totti` 1,700,000→1,799,000（< 1,948,634）· `scholes` 无有效价、仅 condB（区间上沿 200,000，`maxRatio` 1.158）。`both`=0。
  - `condA` 可判定 **42 张**、不适用 89；condB 可判定 116；**无 FC26 对照 15 张（较 T02 的 14 张 +1，根因已定位，见下）**；无区间 0。
- **【已定位·新缺陷】`eto-o` 跨代 slug 漂移导致对照失效（无当日结论影响，需契约级决策，本轮未擅改）**：
  - 现象：`无 FC26 对照` 由 14 → 15，新增项为 **cardId 21805 = 埃托奥**。与 `research/fc26-vs-fc27-2026-09-17.json` 的 noFc26 名单逐个比对，确认唯一差异项即 `eto-o`。
  - 根因：03:17 每日任务刷新 `icons/data/prices/fc27/base-icons.json` 后，该卡 slug 由 **`etoo` → `eto-o`**（同 id 21805，仅此一处 slug 变更；其余 130 张 slug 与 09-17 快照逐张一致）。而 FC26 侧 `icons/data/prices/fc26/base-icons.json`（mtime 2026-08-28，冻结数据集）仍为 `etoo`，`build-icon-research.mjs` 按 `fc26BySlug.get(card.slug)` **严格等值**关联，遂失配 → 落入「无 FC26 对照」。
  - **当日影响：无。** 埃托奥 FC27 双平台当前价均为 0（无效）→ condA 本就不适用；其 FC27 区间上沿 15,000,000 > FC26 开服价 2,740,906 → condB=false。即**即便正确关联也不会进入投资建议**，9 张的结论不变。
  - **排查方法（可复用）**：noFc26 张数变动时，取上一日 `research/fc26-vs-fc27-<D-1>.json` 的 `rows.filter(!fc26).slug` 与当日做集合差；再用两张 hourly 快照按 `cardId` 比对 slug 差异，即可区分「真新卡」与「slug 漂移」。另注意 FC26 侧有 5 张卡（`roberto-rivellino` `batistuta` `geoff-hurst` `mario-alberto-kempes` `bledorn-verri`）**全月无任何正价观测**，脚本 `if(!days.length) continue` 会直接跳过，同样计入「无对照」——属既有口径，非缺陷。
  - **未修复原因**：修法只能是跨代 slug 别名表（如 `eto-o → etoo`），但 AGENTS.md 明确要求「两代卡按 FUTBIN slug 关联……不得用人名模糊匹配凑数」，且项目内**目前不存在任何 slug 别名机制**，引入属口径变更（按第 162 行需 AGENTS.md / prompts / task-definitions / WorkBuddy 提示词四处同步）。该变更影响「无 FC26 对照」口径与显式排除集合，属契约级决策，**不宜在无人值守的小时任务里擅改**；本轮如实报告并留待用户确认。若后续该卡出现有效 FC27 当前价且低于 2,740,906，此失配会造成**漏报**，届时优先处理。
- 产物校验：`current.json` 1417 条（icon 131 / 非传奇 1286）、`generatedAt 2026-09-17T20:02:06.251Z`、`sources.futbin-icon-detail{cards:131,observedAt:2026-09-17T20:02:06.235Z}`，另两源 futbin-popular 250 / daily-market 750 完好；传奇 131/131 命中、`priceRange.scope=card` 131/131、`priceRange.source=futbin-icon-detail` 131/131、双平台键 131/131、逐卡 `observedAt` 全部 = 本轮时刻、**0 违例**；与 hourly T04 区间/当前价不一致 **0**、未命中 0；**传奇条目 `source` 取自 `platforms.*.source`，卡级无 `source` 字段**（用 `cards[k].source` 过滤会得 0 条，误判「icon 0 张」）。
- daily 快照 `players` 131/131 含 `priceRange` + `platforms.console/pc`，与 current 区间不一致 **0**；顶层 `priceRange{scope:"card",scopeNote,withRange:131,missing:0,minFloor:69000,maxCeiling:15000000,collectedAt}`；`counts{"total":131,"valid":47,"missing":84,"platformValid":{"console":44,"pc":13}}`（此处 `missing` = 无有效价的张数，非采集缺失）；历史 09-16（16:20）、09-17（23:07）未被改动。
- research 53.3KB（免责 / 不重演 / listing-estimate / 卡级 / 条件A有效性 / 无 FC26 对照 / 占位 七要素齐备；常驻底稿 `icons/reports/fc27-icon-live-research.html` 同尺寸 53,293 同步覆盖）。**免责句实测为「历史开服价不代表 FC27 会重演」**，用 `/不重演|不代表.{0,6}重演/` 之类正则扫会因中间夹「FC27 」而**假阴性**，校验时改扫关键词「重演」或直接打印原文。
- icons-heroes 312.2KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间正则命中 1（仍是口径说明句「Console 与 PC 价格盒渲染出完全相同的区间」的已知假阳性）、**伪百分比 0**、1371 处「—」、头像 131/131、`data-card-id` 655、运行时读 `assets/data/current.json`。
- 未发布站点（`publish-status-2026-09-18.json` 为 03:56 的每日发布任务所写，非本任务）；未调用 run-state.mjs；`market.html` 仍 03:35 未被改动。

### 2026-09-18 05:0x（T05）— 首轮即成功，无劣化
- 自检 exit 0；4 步按序完成，D=2026-09-18（`hourly/2026-09-18T05.json`；`collectedAt 2026-09-17T21:07:45.128Z`）。**131/131 首轮即成功**（2m35s、17 批、5 次宿主页重建），`counts{"total":131,"ok":131,"missing":0,"minFloor":69000,"maxCeiling":15000000}`、`errors 0`、逐卡 `ok=false` 0、`missingItems` 仅口径提示串。区间 69,000（`bale`/`barnes`/`bledorn-verri` 并列下沿）– 15,000,000；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T04→T05 区间变动 0 张**；当前价变动 44 张；任一平台有效当前价 T04 47 → **T05 50（Console 48 / PC 14）**。
- 研究：对照 131，投资建议 **12 张（T04 的 9 → 12）**，**进 3 出 0**，新增三张全为条件A、均由**真实价下跌**触发（无证据易被误读为脚本回归，回报必附）：
  - **`sanchez` 进入**：console 1,100,000 → **750,000** < FC26 790,667。
  - **`chiellini` 进入**：代表值 1,700,000 → **1,400,000**（console 1,700,000→1,400,000、pc 1,500,000→1,100,000）< FC26 1,583,129。
  - **`cole` 进入**：console 540,000 → **450,000** < FC26 492,365。
  - 保留 9 张：`charlton` 1,999,000（持平，< 3,323,810）· `hernandez-creus` 750,000→700,000 · `morgan` 4,199,000→4,000,000 · `foudy` 650,000→495,000 · `kroos` 530,000→450,000 · `schmeichel` 395,000→400,000 · `totti` 1,799,000（持平）· `hagi` 300,000→292,000；`scholes` 无有效价、仅 condB（区间上沿 200,000，`maxRatio` 1.158）。`both`=0。
  - `condA` 可判定 49 张、不适用 82；condB 可判定 116；无 FC26 对照 **15 张**（与 T04 同集，`eto-o` slug 漂移项仍在，见 T04 条目，未新增漂移）；无区间 0。
- 产物校验：`current.json` 1421 条（icon 131 / Evolution 910 / 其他 380）、`generatedAt 2026-09-17T21:07:45.147Z`、`sources` 三源完好（futbin-popular 250 @20:59:30 / futbin-icon-detail 131 @21:07:45.128 / daily-market 750 @03:30+08）。传奇 131/131 命中、`priceRange.scope=card` 131/131、`source=futbin-icon-detail` 131/131、双平台键 131/131、逐卡 `updatedAt` **全部 = 本轮 `collectedAt`（0 违例）**；与 hourly T05 区间/当前价不一致 **0**；1290 条非传奇条目 `platforms` 齐备未被破坏。
- daily 快照 `players` 131/131 含 `priceRange` + `platforms.console/pc`，与 current 区间/价不一致 **0**；顶层 `priceRange{scope:"card",withRange:131,missing:0,minFloor:69000,maxCeiling:15000000,scopeNote}`；`counts{"total":131,"valid":50,"missing":81,"platformValid":{"console":48,"pc":14}}`（此处 `missing` = 无有效价的张数，非采集缺失）。历史 09-16（16:20）、09-17（23:07）未被改动。
- research 48.8KB（七要素齐备），**12 张建议卡全部出现在页内**（0 缺失）；常驻底稿 `icons/reports/fc27-icon-live-research.html` 同尺寸同步覆盖（`identical: true`）。icons-heroes 267.7KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，**按平台拆的区间列 0**（3 处正则命中全为已知假阳性：1 句口径说明 + 2 处 `title` 属性「Console 与 PC 渲染同值」，后者本身即卡级标注）；**伪百分比 0**、1366 处「—」、头像 131/131（`pimg` 179）、`data-card-id` 655、运行时读 `assets/data/current.json`（报告目录副本 `generatedAt` 与主文件一致）。
- **新增经验（字段名）**：研究 `rows` 逐卡键为 **`id`**（不是 `cardId`），且 `rows` **不含** `cardId`；用 `x.cardId` 取会全部 undefined，进而使「与上一轮命中集对比」整体失效（本轮实测踩到一次，改用 `slug` 关联后正常）。研究侧另有 `nameZh` / `rangeUpdatedText` / `rangeFetchedAt` 可用。
- **另新增经验（`current.json` 时间戳字段）**：传奇条目顶层用 **`updatedAt`**（= 采集时刻），但 `pagesRange` / `platforms.*` 内部另存 **`observedAt`**；只写 `observedAt` 时语义不同。用错字段会误报 131 条时间戳不一致。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs；未渲染 market.html（仍 03:35；market-scan/market-watch 为 05:00 的市场每小时任务所写）。

### 2026-09-18 06:09–06:18（T06）— **采集未执行：浏览器通道不可用（新的失败模式，非 CDP 劣化）**
- 自检 `check-deps.mjs` **exit 1**（`proxy: connecting... ❌ 连接超时`），**4 步全部未进入**。按契约「exit 0 才继续」「前一步失败不进入后一步」，本轮**未采集、未写任何产物**。
- **根因（已定位，与既有「CDP 传输层劣化」完全不同）**：**Chrome 于 06:04:12 重启**（主进程 PID 49850，启动参数仅 `--no-startup-window`，**无** `--remote-debugging-port`；`DevToolsActivePort` mtime 06:04:16、wsPath `/devtools/browser/61448423-…`）。Chrome 重启使调试会话**按实例失效**，而**长驻 `cdp-proxy.mjs` 仍持有上一实例的 wsPath**。
  - 直接探测证据：`curl http://127.0.0.1:9222/devtools/browser/<wsPath>` 带 Upgrade 头 → **HTTP 403**（稍后复测为 `000`）；`/json/version` 与 `/json/list` → 404（开关模式下属预期，不能据此判定）。
  - `Local State` 的 `devtools.remote_debugging = {"user-enabled": true}` **仍为 true**，即**持久化开关在、但本实例未获授权** —— 与 AGENTS.md「开关跨重启持久生效」的表述存在偏差，实测需**人工重新确认**。
- **已尝试的处置（均在允许范围内）**：① `pkill -f cdp-proxy.mjs` 后冷启动代理（两次，含清日志）→ 仍 exit 1；② 契约唯一允许的自动补救 `open -a "Google Chrome" "chrome://inspect/#remote-debugging"` 推前台 → 仍 exit 1。**勾选/「允许」必须人工完成，Agent 不得代勾**，故本轮无法自行恢复。
- **未做且禁止做的事**：未换用任何禁止通道（dumate-browser-cli / DUMATE_* / browser-env.sh / fc-browser-channel-check / agent-browser / IAB / 临时浏览器 / 新 profile / Chrome 插件），未回退 FC26 或历史快照填充，未因通道失败而跑步骤 3/4（否则会用 05:07 的旧价产出「看着很新」的当日报告，属误导）。
- 产物核实（**均未改动**）：`pricerange/latest.json` 05:07、`hourly/` 末位 `2026-09-18T05.json`、`icons-heroes.html` 05:08、`market-icons-research.html` 05:07；`current.json` 06:03 由 **market-hourly**（非本任务）所写。当日无 T06 快照。
- **给用户的最小恢复动作**：在已打开的 `chrome://inspect/#remote-debugging` 页面勾选 **Allow remote debugging for this browser instance**（或点击弹窗「允许」）。恢复后下一轮（07:20）自动继续；本轮缺口不可补（小时快照按小时落盘，不得回填）。

### 2026-09-18 07:22–07:27（T07）— **采集未执行：同一通道故障未恢复（连续第 2 轮）**
- 自检 `check-deps.mjs` **exit 1**（`proxy: connecting...` → 2m14s 后 `❌ 连接超时`），**4 步全部未进入**。按契约「exit 0 才继续」，本轮**未采集、未写任何产物**。**与 T06 是同一个故障的延续，非新故障。**
- 通道状态实测（较 T06 更完整，可直接复用此判据表）：
  - Chrome 主进程 **PID 49850 仍为 06:04:12 那一实例**（未再重启），启动参数 `--no-startup-window`，无 `--remote-debugging-port`；`DevToolsActivePort` = `9222` + wsPath `/devtools/browser/61448423-6d50-46d5-8e61-da19849eff47`（与 T06 同）。
  - **`lsof -nP -iTCP:9222 -sTCP:LISTEN` 有监听**（Chrome 49850）—— 即「端口在听」**不代表**通道可用。
  - **决定性判据（T06 未记录的定量证据）**：带 `Upgrade: websocket` 头请求该 wsPath → **`http_code=000`**（拒绝升级、非 101）；`GET /json/list` → **404**。代理日志同因：`连接错误: Received network error or non-101 status code`。
  - `Local State` 的 `devtools.remote_debugging = {"user-enabled": true}` 仍为 true —— 再次确认「**持久化开关为 true 但本实例未获授权**」。**判定通道可用性只用 `check-deps.mjs` 退出码 + 上述 000/404 组合，不要用 Local State、不要用 9222 监听、不要用 `curl /json/version`（开关模式下恒空）。**
- 已做的允许动作：`open -a "Google Chrome" "chrome://inspect/#remote-debugging"` 推前台（唯一自动补救），随后**重试自检仍 exit 1**（第二次 2m17s 超时）。勾选必须人工完成，Agent 不得代勾 → 本轮无法自行恢复。
- **未做的正确决策**：未 `pkill cdp-proxy`、未重复重试、未跑步骤 2/3/4。理由：故障点在**浏览器端拒绝升级**（非 101/000），代理重启对 T06 已两次无效（日志里可见多轮 `已有实例运行…退出` + 同一 non-101），重锚代理不可能修复；而跳过步骤 2 直接跑 3/4 会用 05:07 的旧价产出「看着是当日」的报告，属误导。
- 产物核实（**均未改动**）：`pricerange/latest.json` 05:07、`hourly/` 末位 **`2026-09-18T05.json`**（T06/T07 均无快照）、`current.json` 06:03（**由 market-hourly 所写，非本任务**）、`icons-heroes.html` 05:08、`market-icons-research.html` 05:07。未发布站点、`publish-status-2026-09-18.json` 未由本任务改动、未调用 run-state.mjs。
- **影响面提示**：同一 Chrome 实例故障同样会阻断 `market-hourly`（06:03 后应无成功轮次）与所有需浏览器的小时任务；恢复动作一次即可解除全部。
- 恢复动作同 T06：在 `chrome://inspect/#remote-debugging` 勾选 **Allow remote debugging for this browser instance**（或点弹窗「允许」）；若勾选后仍 exit 1，本实例可能需**重启 Chrome** 后重新授权（Agent 不得自行重启用户浏览器，须用户手动）。缺口不可回填。

### 2026-09-18 08:32–08:40（T08）— **采集未执行：同一通道故障未恢复（连续第 3 轮，缺口累计 3 小时）**
- 自检 `check-deps.mjs` **exit 1**（`proxy: connecting...` → `❌ 连接超时`），**4 步全部未进入**，本轮**未采集、未写任何产物**。与 T06/T07 **同一故障的延续**，非新故障。
- 通道状态实测与 T07 完全一致（判据表可直接复用，无变化）：
  - Chrome 主进程仍为 **PID 49850（06:04:12 那一实例）**，`--no-startup-window`、无 `--remote-debugging-port`；`DevToolsActivePort` = `9222` + wsPath `/devtools/browser/61448423-6d50-46d5-8e61-da19849eff47`（与 T06/T07 同）。
  - `lsof -nP -iTCP:9222 -sTCP:LISTEN` **有监听**（Chrome 49850）→ 仍印证「端口在听 ≠ 通道可用」。
  - **决定性判据不变**：带 `Upgrade: websocket` 请求该 wsPath → **`http_code=000`**；`GET /json/list` → **404**。
  - `Local State` 的 `devtools.remote_debugging = {"user-enabled": true}` 仍为 true → **持久化开关为 true 但本实例未获授权**（连续第 3 轮复现）。
  - 日志同因：`连接错误: Received network error or non-101 status code`。
- **本轮新增证据（可强化结论）**：自检时线上代理已是**全新进程 PID 64508（08:28:08 启动）**，**新代理同样只拿到 non-101** → 证明故障**不在代理侧**，「重启代理能修」被彻底排除（与 T06 两次 pkill 无效、T07 判定一致）。故本轮**未 `pkill`、未反复重试**。
- 已做的允许动作：`open -a "Google Chrome" "chrome://inspect/#remote-debugging"` 推前台（唯一自动补救）→ **重试自检仍 exit 1**。勾选必须人工完成，Agent 不得代勾 → 本轮无法自行恢复。缺口不可回填。
- **影响面已交叉证实（同一 Chrome 实例故障，一次恢复可解除全部）**：`automation/runs/2026-09-18/market/` 下存在 **`hourly-07-failed.json`（07:21）与 `hourly-08-failed.json`（08:31）**，其 `stage=browser-precheck`、`browserCheck.exitCode=1`、reason 与本节同因 → **market-hourly 亦自 06:04 起连续失败**。两任务最后成功轮次均为 **06:03/06:04**（`current.json` 06:03、`publish-hourly.json` 06:04）。所有需浏览器的小时任务均已停产约 3 小时。
- 产物核实（**均未改动**）：`pricerange/latest.json` 05:07、`hourly/` 末位 **`2026-09-18T05.json`**（T06/T07/T08 均无快照）、`icons-heroes.html` 05:08、`market-icons-research.html` 05:07、`research/` 末位 `fc26-vs-fc27-2026-09-18.json`（T05 所写）。未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs；未渲染 market.html（仍 03:35）。
- **给用户的最小恢复动作（唯一有效路径）**：在 Chrome 里完成授权——① 于 `chrome://inspect/#remote-debugging` 勾选 **Allow remote debugging for this browser instance**（或点击弹出的「允许」）；② 若勾选后自检仍 exit 1，则**重启 Chrome 后重新授权**（Agent 不得自行重启用户浏览器）。恢复后下一整点轮次自动继续；T06/T07/T08 三个小时缺口**不可回填**（小时快照按小时落盘）。
- **文档偏差（建议用户决策，本轮未擅改）**：AGENTS.md 称该调试开关「跨 Chrome 重启持久生效」，但 06:04 重启后本实例未获授权，需人工重新确认；`Local State` 为 true 不能作为可用判据。建议将 AGENTS.md 该句修正为「重启后需人工重新授权」。

### 2026-09-18 09:46–09:52（T09）— **采集未执行：同一通道故障未恢复（连续第 4 轮，缺口累计 4 小时）**
- 自检 `check-deps.mjs` **exit 1**（`proxy: connecting...` → 连接超时），**4 步全部未进入**，本轮**未采集、未写任何产物**。与 T06/T07/T08 同一故障延续，非新故障。当日无 `hourly/2026-09-18T09.json`。
- 通道判据与 T07/T08 逐项一致（判据表可直接复用）：Chrome 主进程仍 **PID 49850（06:04:12 实例）**；`DevToolsActivePort` = `9222` + wsPath `/devtools/browser/61448423-6d50-46d5-8e61-da19849eff47`；`lsof -nP -iTCP:9222 -sTCP:LISTEN` **有监听**；带 `Upgrade: websocket` 探测该 wsPath → **`http_code=000`**；`/json/list` 与 `/json/version` 均 **404**；`Local State` 的 `devtools.remote_debugging = {"user-enabled": true}`。
- **本轮新增第 4 份独立证据（代理侧被彻底排除）**：自检时线上代理已是**全新进程 PID 71979（09:42:44 启动）**，且经 `lsof :3456` 确认是**该端口唯一持有者**（无其他 cdp-proxy 残留进程）；该全新代理同样只拿到 `non-101`。连同 T06 的两次冷启、T08 的 PID 64508，共 **4 个独立代理实例全部失败** → 故障必在浏览器端。故本轮**未 pkill、未反复重试**。
- 已做（唯一允许的自动补救）：`open -a "Google Chrome" "chrome://inspect/#remote-debugging"` 推前台 → 复跑自检 `EXIT=1`。勾选必须人工完成，Agent 不得代勾 → 本轮无法自行恢复。
- **交叉印证（market-hourly 已完成深度诊断，可直接引用，无需重复采样）**：`automation/runs/2026-09-18/market/hourly-09-failed.json` 的 `channelDiagnostics` 显示 Chrome 的 main / `Chrome_IOThread` / `Chrome_DevToolsHandlerThread` 三线程**均空闲在 `kevent64`（未死锁）**，`sampleFile=/tmp/chrome-hang-sample.txt`；结论为「监听 socket 未接入 DevTools 消息泵」。**即故障性质不是线程卡死，pkill 代理 / 重推前台在原理上不可能修复**，与 T09 判据吻合。market-hourly 连续失败轮为 **T07/T08/T09**（最后成功轮 06 点）。
- 产物核实（**均未改动**）：`pricerange/latest.json` 05:07、`hourly/` 末位 **`2026-09-18T05.json`**（T06–T09 均无快照）、`icons-heroes.html` 05:08、`market-icons-research.html` 05:07、`current.json` 06:03（**由 market-hourly 所写，非本任务**）、`research/` 末位 `fc26-vs-fc27-2026-09-18.json`（T05 所写）。未发布站点；未新建/改动 `publish-status-2026-09-18.json`；未调用 run-state.mjs；未渲染 market.html（仍 03:35）。
- **给用户的最小恢复动作（唯一有效路径，候选已收敛）**：① 退出并重启 Chrome（Agent 不得自行重启用户浏览器），重启后于 `chrome://inspect/#remote-debugging` 勾选 **Allow remote debugging for this browser instance**；② 若重启后仍 exit 1，说明该开关需在 Chrome **启动后**再确认一次（`user-enabled: true` 不足以保证本实例获授权）。恢复后下一整点自动继续；T06–T09 四个小时缺口**不可回填**（小时快照按小时落盘）。
- **判据照抄提醒**：判定通道可用性**只用 `check-deps.mjs` 退出码**（辅以上述 000/404 组合）；**不要**用 `Local State`、**不要**用 9222 是否 LISTEN、**不要**用 `curl /json/version`（开关模式下恒 404）。

### 2026-09-18 11:01–11:06（T11）— 通道已恢复，首轮即成功，无劣化
- 自检 `node automation/browser-triage.mjs --json` **exit 0、verdict `OK`、`actions` 为空**（未触发任何自愈，`check-deps` tail = `proxy: ready (Chrome)`）。**通道已从 T06–T09 故障中恢复**（与 AGENTS.md 记载的 10:20 恢复一致）。4 步按序完成，D=2026-09-18（`hourly/2026-09-18T11.json`）。**131/131 首轮即成功**（4m28s、17 批、5 次宿主页重建），`counts{total:131,ok:131,missing:0,minFloor:69000,maxCeiling:15000000}`、`errors []`、逐卡 `ok=false` 0、`missingItems` 仅口径提示串。区间 69,000–15,000,000；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T06–T10 五个小时无快照（通道故障期 06:04–10:20）**：`hourly/` 09-18 仅有 T00–T05 + T11。**T10 无任何痕迹**（无 `hourly/2026-09-18T10.json`、也无 `hourly-10-failed.json`）→ 10:20 那轮未产出。**故 T05→T11 实为 6 小时跨度，不得当作 1 小时变化解读。**
- 区间 T05→T11 **变动 0 张**；当前价（任平台较大者）**变动 86 张**、**新转有效 38**、有效转无效 3。任一平台有效当前价 T05 50 → **T11 85（Console 83 / PC 45）**——PC 首次大批放出（14 → 45），是本轮全部结论更替的直接原因。
- 研究：投资建议 **15 张（T05 的 12 → 15）**，**进 10 出 7 保留 5**，逐项均有价格证据（缺证据易被误读为脚本回归，回报必附）：
  - **掉出 7 张全部由 PC 平台价抬升驱动**（代表值 = max(console,pc) 上穿 FC26 开服价）：`charlton` 1,999,000→**6,300,000** · `morgan` 4,000,000→**12,800,000** · `kroos` 450,000→**1,197,000** · `sanchez` 750,000→**1,150,000** · `cole` 450,000→**1,200,000** · `hagi` 292,000→**470,000** · `schmeichel` 400,000→**599,000**。
  - **新增 10 张 = 6 张「PC 价首次放出转有效」**（`abily` 1,800,000 · `antunes-coimbra` 尤西比奥 3,900,000 · `bale` 4,200,000 · `dalglish` 2,450,000 · `makelele` 888,000 · `ribery` 1,450,000；T05 时当前价无效 ⇒ condA 本为 null）**+ 4 张真实价下跌**（`bergkamp` 956,000→473,000 · `best` 4,400,000→1,977,000 · `iniesta-lujan` 1,950,000→1,424,000 · `schelin` 3,440,000→1,770,000）。
  - 保留 5：`chiellini`（1,400,000→1,300,000）· `foudy`（495,000→499,000）· `hernandez-creus`（700,000→715,000）· `scholes`（无效→200,000，**双命中**，区间上沿 200,000 < FC26 231,598）· `totti`（1,799,000→1,077,000）。condB 全场仅 scholes。
  - **判定链无回归的证明**：用 T05 快照 + 本轮 FC26 开服价**重算 T05 建议集得 12 张，与记忆中 T05 名单逐张一致** ⇒ 15 张的差异全部源于真实价变动。
  - `condA` true 15 / 不适用(null) 55、`condB` true 1、无 FC26 对照 **15 张**（与 T04/T05 同集，`eto-o` slug 漂移项仍在，未新增）、无区间 0。
- **新数据观察（源站行为，未改口径）**：43 张「两平台均有效」中 **37 张 PC > Console**（`seger` 10.0× · `vieira-da-silva` 4.2× · `drogba` 4.16× · `madeira-caeiro-figo` 3.45× · `morgan` 3.32×）。代表价取 max ⇒ **PC 单方面决定 condA**，7 张掉出全部源自此。属 FUTBIN 开服前滚动放出行为；**如实记录，不改用 Console 顶替、不改口径**。
- 产物校验：`current.json` 1435 条（传奇 131 全部 `source=futbin-icon-detail`）、`generatedAt 2026-09-18T03:06:09.609Z`、三源完好（futbin-popular 250 / futbin-icon-detail 131 @03:06:09.555Z / daily-market 750）；传奇 **131/131** 命中、`priceRange.scope=card` 131/131、`source=futbin-icon-detail` 131/131、双平台键 131/131、`updatedAt` 全部 = 本轮 `collectedAt`，**0 违例**；与 hourly T11 区间/价/有效位不一致 **0**。daily `players` 131/131 含 `priceRange` + `platforms.console/pc`，与 current 区间/价/有效位不一致 **0**，顶层 `priceRange{scope:"card",scopeNote,withRange:131,missing:0,minFloor:69000,maxCeiling:15000000}`。09-16 / 09-17 快照未动（3 天历史）。
- research 55.0KB（`不构成投资` / `重演` / listing-estimate / 卡级 / 条件A有效性 / 无FC26对照 / 占位 七要素齐备；15 张建议卡页内 15/15），常驻底稿 `icons/reports/fc27-icon-live-research.html` 与当日页**逐字节一致**。icons-heroes 305.2KB，三列表头 `当前价(列表页)|最低价|最高价`、按平台拆区间列 0（唯一正则命中仍为口径说明句假阳性）、**伪百分比 0**、1300 处「—」、头像 131/131（`pimg` 179）、`data-card-id` 655、运行时读 `assets/data/current.json`。
- **本轮新增字段备忘**：`hourly` 逐卡数组键是 **`id`**（不是 `cardId`）；**daily 快照 `players` 的键也是 `id`**（用 `p.cardId` 查 `current.json` 会 **0 命中并误报「131 张未命中」**，T11 实测踩到一次）；**hourly 逐卡 `priceRange` 只有 `{min,max,updatedText}`、没有 `scope`**（`scope: card` 只出现在 `current.json` 逐卡与 daily 顶层），按逐卡查 `priceRange.scope` 会得空值，勿据此判缺失。
- **通道样本（量测弹框假设，仅记录不结案）**：`automation/runs/browser-channel-log/2026-09-18.jsonl` 显示 `sessions/managedTabs` 由 **12 掉到 1**（本地 10:52 → 11:01 窗口）⇒ 该窗口内发生过一次调试 WS 重连，与「每个整点任务首个请求触发一次重连 = 每小时一次弹框」的首要假设方向一致；单点证据，未结案。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs（`icons-heroes/owner.json` 仍 03:10）；未渲染 market.html（仍 03:35）；未动首页与版式；未写任何 `hourly-11-failed.json`（本轮成功）。

### 2026-09-18 12:33–12:40（T12，独立调试 profile 架构下首轮成功）— 首轮即成功，无劣化
- 预检 `node automation/browser-triage.mjs --json` **exit 0 / verdict `OK` / actions `[]`**（**未发生自愈**；代理已连 9333 独立 profile）。4 步按序完成，D=2026-09-18（`hourly/2026-09-18T12.json`；`collectedAt 2026-09-18T04:37:16.453Z`）。**131/131 首轮即成功**（4m07s、17 批、5 次宿主页重建），`counts{"total":131,"ok":131,"missing":0,"minFloor":69000,"maxCeiling":15000000}`、`errors 0`、逐卡 `ok=false` 0。区间 69,000–15,000,000；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T11→T12 区间变动 0 张**；代表价变动 59 张；任一平台有效当前价 T11 85 → **T12 86（Console 82 / PC 46，PC 较 T11 的 45 略增）**。
- 研究：对照 131，投资建议 **14 张（T11 的 15 → 14）**，**出 6 进 5**，全部为真实价变动驱动。**判定链无回归的证明**：用 T11 快照 + 当日 FC26 开服价**重算 T11 命中集 = 15 张，与记忆逐张一致** ⇒ 差异全部源于实时价滚动。
  - **掉出 6 张（代表价上穿 FC26 开服价 → condA 转 false）**：`chiellini` 1,300,000→**1,700,000**（> 1,583,129）· `foudy` 499,000→**1,355,000**（PC 499,000→1,355,000，> 993,762）· `totti` 1,077,000→**5,600,000**（PC 首次放出 5,600,000，> 1,948,634）· `antunes-coimbra`（尤西比奥）3,900,000→**11,000,000**（PC 首次放出，> 6,831,947）· `dalglish` 2,450,000→**4,000,000**（> 3,347,517）· `best` 1,977,000→**2,875,000**（> 2,229,986）。
  - **新增 5 张（代表价下穿 FC26 开服价 → condA 转 true，多为 PC 价回落/无效后代表值下移）**：`borba-ferreira`（里瓦尔多）855,000→**840,000**（< 842,905，余量仅 0.3%，下轮极易翻转）· `drogba` 3,900,000→**1,000,000**（PC 3,900,000→0，代表值落到 console）· `jones` 800,000→**310,000**（PC 800,000→0）· `sanchez` 1,150,000→**625,000**（pc 1,150,000→625,000）· `essien` 1,575,000→**715,000**（PC 1,575,000→0）。
  - **保留 9 张**：`iniesta-lujan` 1,424,000（持平）· `hernandez-creus` 715,000→670,000 · `abily` 1,800,000（持平）· `bergkamp` 473,000→404,000 · `schelin` 1,770,000（持平）· `scholes` 无 PC 价、**双命中**（condA 200,000 < 231,598 且 condB 区间上沿 200,000）· `bale` 4,200,000（持平）· `makelele` 888,000（持平）· `ribery` 1,450,000（持平）。
  - `counts{compared:131,advice:14,condA:14,condB:1,both:1,noFc26:15,noRange:0}`；无 FC26 对照仍为 **15 张同集**（`eto-o` slug 漂移项仍在，见 T04 条目，未新增漂移）。
- 产物校验：`current.json` **1435 条**（传奇 131 / 其余 1304）、`generatedAt 2026-09-18T04:37:16.475Z`、三源完好（futbin-popular 250 / futbin-icon-detail 131 / daily-market 750）；传奇 **131/131** 命中、`priceRange.scope=card` 131/131、`source=futbin-icon-detail` 131/131、双平台键 131/131、`updatedAt` 全部 = 本轮 `collectedAt`，**0 违例**；与 hourly T12 区间 **0** 不一致、当前价 **0** 不一致。daily 快照 `players` 131/131 含 `priceRange`+`platforms.console/pc`，与 current **0** 不一致；顶层 `priceRange{scope:"card",withRange:131,missing:0,minFloor:69000,maxCeiling:15000000}`；`counts{total:131,valid:86,missing:45,platformValid:{console:82,pc:46}}`（此处 `missing` = 无有效价的张数，非采集缺失）；历史 09-16（16:20）/ 09-17（23:07）未被改动。
- research 50.1KB（七要素齐备：不构成投资 / 重演 / listing-estimate / 卡级 / 条件A有效性 / 无FC26对照 / 占位 / 不适用）；常驻底稿 `icons/reports/fc27-icon-live-research.html` 与当日页**逐字节一致**。icons-heroes 270.3KB，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间列 0（唯一正则命中仍为口径说明句假阳性）、**伪百分比 0**、1300 处「—」、头像 `球员头像 131/131`（`pimg` 179）、`data-card-id` 655、运行时读 `assets/data/current.json`（报告目录副本 `generatedAt` 与主文件一致）。
- **新增踩坑（校验脚本假阴性，勿重犯）**：研究页显示名带变音符（`sánchez` / `ribéry` / `makélélé` / `borba ferreira` / `hernández creus`），用 `page.includes(row.slug)` 判「建议卡是否在页内」会稳定**假阴性**（本轮误报 6 张缺失，实为 14/14 全在页内）。正确判据是用 `row.name` 或 `row.nameZh` 做包含判断。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs（`automation/runs/2026-09-18/icons-heroes/owner.json` 仍 03:10）；未渲染 market.html（仍 03:35）；未写 `hourly-12-failed.json`（本轮成功）。

### 2026-09-18 13:39–13:42（T13）— 首轮即成功，无劣化
- 预检 `node automation/browser-triage.mjs --json` **exit 0 / verdict `OK` / actions `[]`**（**未发生自愈**；`checkDeps.tail` = `proxy: ready (Chrome (独立调试 profile))`，chrome.port 9333、listener true、`/json/version` 200）。4 步按序完成，D=2026-09-18（`hourly/2026-09-18T13.json`；`collectedAt 2026-09-18T05:41:54.372Z`）。**131/131 首轮即成功**（2m33s、17 批、5 次宿主页重建），`counts{total:131,ok:131,missing:0,minFloor:69000,maxCeiling:15000000}`、`errors []`、逐卡 `ok=false` 0、`missingItems` 仅口径提示串。区间 69,000（VARANE 等并列下沿）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T12→T13 区间变动 0 张**；代表价变动 50 张；任一平台有效当前价 T12 86 → **T13 89（Console 82→85 / PC 46→46）**。
- 研究：对照 131，投资建议 **13 张（T12 的 14 → 13）**，**出 3 进 2**，全部为真实价变动驱动（证据见下）。**判定链无回归的证明**：用 T12 快照 + 当日 FC26 开服价**重算 T12 命中集 = 14 张，与记忆逐张完全一致** ⇒ 差异全部源于实时价滚动。
  - **掉出 3 张（代表价 = max(console,pc) 上穿 FC26 开服价 → condA 转 false）**：`iniesta-lujan` 1,424,000→**5,100,000**（PC 0→5,100,000 首次放出，> 1,667,636）· `makelele` 888,000→**1,500,000**（console 888,000→1,500,000，> 940,688）· `essien` 715,000→**1,340,000**（PC 0→1,340,000 首次放出，> 999,938）。
  - **新增 2 张**：`cantona` 代表值 0→**1,450,000**（console 0→1,450,000 **首次放出转有效**，< FC26 2,372,397）· `kroos` 1,197,000→**1,000,000**（pc 1,197,000→1,000,000 下跌，< FC26 1,128,656）。
  - **保留 8 张**：`hernandez-creus` 670,000→650,000 · `abily` 1,800,000（持平）· `bergkamp` 404,000→395,000 · `borba-ferreira` 840,000→**825,000**（< 842,905，**余量仅 2.1%**，下轮极易翻转）· `schelin` 1,770,000→1,850,000 · `drogba` 1,000,000→850,000 · `jones` 310,000→304,000 · `sanchez` 625,000→499,000 · `bale` 4,200,000→3,386,000 · `ribery` 1,450,000→1,415,000；`scholes` 无 PC 价、**双命中**（condA 200,000 < 231,598 且 condB 区间上沿 200,000 < 231,598）。
  - `counts{compared:131,advice:13,condA:13,condB:1,both:1,noFc26:15,noRange:0}`；`minValidPrice 1000`、`priceBasis listing-estimate`、`rangeCollectedAt 2026-09-18T05:41:54.372Z`。无 FC26 对照仍 **15 张同集**（`eto-o` slug 漂移项仍在，见 T04 条目，未新增漂移）。
- 产物校验：`current.json` **1442 条**（icon 131 / 非传奇 1311）、`generatedAt 2026-09-18T05:41:54.394Z`、三源完好（futbin-popular 250 @04:39:19.998Z / futbin-icon-detail 131 @05:41:54.372Z / daily-market 750）；传奇 **131/131** 命中、`priceRange.scope=card` 131/131、`source=futbin-icon-detail` 131/131、双平台键 131/131、`updatedAt` **全部 = 本轮 `collectedAt`（0 违例）**；与 hourly T13 区间/价/有效位不一致 **0**；非传奇 1311 条双平台键齐备、未被破坏。daily `players` 131/131 含 `priceRange`+`platforms.console/pc`，与 current 不一致 **0**；顶层 `priceRange{scope:"card",withRange:131,missing:0,minFloor:69000,maxCeiling:15000000,scopeNote}`；`counts{total:131,valid:89,missing:42,platformValid:{console:85,pc:46}}`（`missing` = 无有效价的张数，非采集缺失）；快照内**无**任何 `日环比/累计涨跌/dayOverDay/cumulative` 字段。历史 09-16（16:20）/ 09-17（23:07）未被改动。
- research 53,869 B（不构成投资 / 重演 / listing-estimate / 卡级 / 无 FC26 对照 / 占位 / 不适用 七要素齐备；13 张建议卡页内 **13/13**，用 `row.name`/`row.nameZh` 判定，勿用 slug——变音符假阴性坑见 T12）；常驻底稿 `icons/reports/fc27-icon-live-research.html` 与当日页**逐字节一致**（`identical: True`）。icons-heroes 270,195 B，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间正则命中 1（仍为口径说明句「Console 与 PC 价格盒渲染出完全相同的区间值」的**已知假阳性**）、**伪百分比 0**、1297 处「—」、头像 `球员头像 131/131`（`pimg` 180）、`data-card-id` 655、运行时读 `assets/data/current.json`（报告目录副本 `generatedAt` 与主文件一致）。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs（`automation/runs/2026-09-18/icons-heroes/owner.json` 仍 03:10，无失败留证文件）；未渲染 market.html（仍 03:35）；未写 `hourly-13-failed.json`（本轮成功）；未动首页与版式。

### 2026-09-18 14:43–14:47（T14）— 首轮即成功，无劣化
- 预检 `node automation/browser-triage.mjs --json` **exit 0 / verdict `OK` / actions `[]`**（**未发生自愈**；`checkDeps.tail` = `proxy: ready (Chrome (独立调试 profile))`，chrome.port 9333、listener true、`/json/version` 200、proxy.health.connected true、sessions 1、managedTabs 0）。4 步按序完成，D=2026-09-18（`hourly/2026-09-18T14.json`；`collectedAt 2026-09-18T06:47:19.715Z`）。**131/131 首轮即成功**（3m27s、17 批、5 次宿主页重建），`counts{total:131,ok:131,missing:0,minFloor:69000,maxCeiling:15000000}`、`errors 0`、逐卡 `ok=false` 0、`missingItems` 仅口径提示串。区间 69,000（`bale`）– 15,000,000（PELÉ `arantes-nascimento`）；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T13→T14 区间变动 0 张**；代表价变动 **49 张**、**新转有效 3**（`buffon` 0→15,000,000 · `batistuta` 0→300,000 · `nedved` 0→500,000）、有效转无效 0。任一平台有效当前价 T13 89 → **T14 92（Console 88 / PC 50）**。
- 研究：对照 131，投资建议 **13 张（与 T13 张数同为 13，但**出 3 进 3**）**，全部为真实价变动驱动（证据见下）。**判定链无回归的证明**：用 T13 快照 + 当日 FC26 开服价**重算 T13 命中集 = 13 张，与记忆逐张完全一致**（差异 0）⇒ 变化全部源于实时价滚动。
  - **掉出 3 张（代表价 = max(console,pc) 上穿 FC26 开服价 → condA 转 false）**：`bergkamp` 395,000→**555,000**（> FC26 505,048，余量转负）· `borba-ferreira`（里瓦尔多）rep 825,000→**855,000**（PC 825,000→855,000；> FC26 842,905，**上轮余量 2.1% 已耗尽，符合 T13 预警**）· `hernandez-creus` rep 650,000→**2,300,000**（**PC 0→2,300,000 首次放出**，代表值由 console 650,000 跳到 PC 2,300,000，> FC26 812,407）。
  - **新增 3 张（代表价下穿 FC26 开服价 → condA 转 true）**：`dalglish` con 4,000,000→**2,590,000**（< FC26 3,347,517；T13 为 4,000,000 故 false）· `chiellini` con 1,700,000→**1,300,000**（pc 690,000→905,000，代表值回落；< FC26 1,583,129）· `miyama` rep 900,000→**500,000**（con 385,000→420,000、pc 900,000→500,000；< FC26 597,722）。
  - **保留 10 张**：`abily` 1,800,000（持平）· `bale` 3,386,000→4,200,000 · `cantona` 1,450,000→1,966,000 · `drogba` 850,000→722,000 · `jones` 304,000→310,000 · `kroos` 1,000,000（持平，pc） · `ribery` 1,415,000→1,300,000 · `sanchez` 499,000→550,000 · `schelin` 1,850,000→1,800,000 · `scholes` 无 PC 价、**双命中**（condA 200,000 < 231,598 且 condB 区间上沿 200,000 < 231,598，`maxRatio` 1.15799，为全场唯一 condB）。
  - `counts{compared:131,advice:13,condA:13,condB:1,both:1,noFc26:15,noRange:0}`；`minValidPrice 1000`、`priceBasis listing-estimate`、`rangeCollectedAt 2026-09-18T06:47:19.715Z`。无 FC26 对照仍 **15 张同集** = `aguero, batistuta, bledorn-verri, douglas-sisenando, eto-o, hurst, lima-ferreira, mario-alberto-kempes, nagasato, papin, rivellino, sinclair, torres, toure, varane`（`eto-o` slug 漂移项仍在，见 T04 条目，未新增漂移；`batistuta` 属 FC26 侧全月无正价观测的既有口径）。
- 产物校验：`current.json` **1447 条**（icon 131 / 非传奇 1316）、`generatedAt 2026-09-18T06:47:19.734Z`、三源完好（futbin-popular 250 / futbin-icon-detail 131 @06:47:19.715Z / daily-market 750）；传奇 **131/131** 命中、`priceRange.scope=card` 131/131、`source=futbin-icon-detail` 131/131、双平台键 131/131、`updatedAt` **全部 = 本轮 `collectedAt`（0 违例）**；与 hourly T14 区间/平台价不一致 **0**、未命中 0。daily `players` 131/131 含 `priceRange`+`platforms.console/pc`，与 current 区间/平台价不一致 **0**；顶层 `priceRange{scope:"card",withRange:131,missing:0,minFloor:69000,maxCeiling:15000000}`；`counts{total:131,valid:92,missing:39,platformValid:{console:88,pc:50}}`（`missing` = 无有效价的张数，非采集缺失）；快照内**无**任何 `日环比/累计涨跌/dayOverDay/cumulative` 字段。历史 09-16 / 09-17 快照未被改动（3 天历史）。
- research 53,771 B（不构成投资 / 重演 / listing-estimate / 卡级 / 条件A有效性 / 无FC26对照 / 占位 七要素齐备；13 张建议卡页内 **13/13**，用 `row.name`/`row.nameZh` 判定，勿用 slug——变音符假阴性坑见 T12）；常驻底稿 `icons/reports/fc27-icon-live-research.html` 与当日页**逐字节一致**。icons-heroes 304,189 B，表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌`，按平台拆区间正则命中 **1**（仍为口径说明句「Console 与 PC 价格盒渲染出完全相同的区间值」的**已知假阳性**）、**价格语境伪百分比 0**（全页 3 处 `%` 全在 CSS `width/height:50%/100%`，非涨跌）、1290 处「—」、头像 `球员头像 131/131`（`img` 179）、`data-card-id` 655、运行时读 `assets/data/current.json`（报告目录副本 `generatedAt` 与主文件一致）。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs（`automation/runs/2026-09-18/icons-heroes/owner.json` 存在但为 03:10 每日任务所留，本任务未写）；未渲染 market.html（仍 03:35）；未写 `hourly-14-failed.json`（本轮成功）；未动首页与版式。
- **新增踩坑（FC26 底稿结构）**：`icons/data/prices/fc26/base-icons.json` 的 `players[].prices.cross` 是**以日期为键的对象**（如 `"2025-09-18": 14135976`），**不是数组**。写「重算上一轮命中集」的校验脚本时按数组取 `days[0]` 会拿到 `undefined`，导致 FC26 开服价全空、重算命中集恒为 **0 张**，进而**误判「判定链有回归」**（T14 实测踩到一次）。正确取法：`Object.keys(prices.cross).sort()[0]`。另 FC26 侧仅 122 张有开服价条目（131 − 122 ≈ 与「无 FC26 对照 15 张 + 无正价观测 5 张」。

### 2026-09-18 15:49–15:54（T15）— 首轮即成功，无劣化
- 预检 `node automation/browser-triage.mjs --json` **exit 0 / verdict `OK` / actions `[]`**（**未发生自愈**；`checkDeps.tail` = `proxy: ready (Chrome (独立调试 profile))`，chrome.port 9333、listener true、`/json/version` 200、`proxy.health.connected true`、sessions 1）。4 步按序完成，D=2026-09-18（`hourly/2026-09-18T15.json`；`collectedAt 2026-09-18T07:54:05.455Z`）。**131/131 首轮即成功**（4m17s、17 批、5 次宿主页重建），`counts{total:131,ok:131,missing:0,minFloor:69000,maxCeiling:15000000}`、`errors 0`、逐卡 `ok=false` 0。区间 69,000–15,000,000；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T14→T15 区间变动 0 张**；代表价变动 **70 张**、**新转有效 5 / 有效转无效 5**；任一平台有效当前价 T14 92 → **T15 92（Console 88→87 / PC 50→52）**。
- 研究：投资建议 **13 → 19（出 1 进 7）**，全部为真实价变动驱动（证据见下）。**判定链无回归的证明**：用 T14 快照 + 当日 FC26 开服价**重算 T14 命中集 = 13 张，与记忆逐张完全一致** ⇒ 差异全部源于实时价滚动。
  - **掉出 1**：`drogba` 722,000 → **3,900,000**（**PC 0→3,900,000 首次放出**，> FC26 2,317,368）。
  - **新增 7（代表价下穿 FC26 开服价 → condA 转 true）**：`maradona` 14,390,000→**13,946,000**（< 14,135,976，**余量仅 1.3%**）· `iniesta-lujan` 5,100,000→**1,390,000**（PC 5,100,000→0，代表值落回 console）· `antunes-coimbra`（尤西比奥）11,000,000→**4,090,000**（PC 11,000,000→0，< 6,831,947）· `bergkamp` 555,000→**492,000**（< 505,048，**余量 2.6%**）· `borba-ferreira`（里瓦尔多）855,000→**599,000**（PC 855,000→599,000，< 842,905）· `da-silva-rocha` 2,500,000→**1,500,000**（< 1,689,610）· `beckham` 950,000→**750,000**（< 764,349，**余量 1.9%**）。
  - **保留 12**：`abily` 1,800,000（持平）· `dalglish` 2,590,000→2,450,000 · `kroos` 1,000,000→880,000 · `miyama` 500,000→450,000 · `schelin` 1,800,000→1,770,000 · `cantona` 1,966,000（持平）· `jones` 310,000→285,000 · `sanchez` 550,000→575,000 · `bale` 4,200,000→3,490,000 · `chiellini` 1,300,000→1,005,000 · `ribery` 1,300,000→1,200,000；`scholes` 本轮**失去有效当前价**、仅 condB（区间上沿 200,000）。
  - `counts{compared:131,advice:19,condA:18,condB:1,both:0,noFc26:15,noRange:0}`。**`both` 由 1→0 不是口径改动**：`scholes` 失去有效价后 condA 记为 `null`（不适用）而非 false，故双命中为 0，它仍以条件 B 留在建议集内。无 FC26 对照仍 **15 张同集**（`eto-o` slug 漂移项仍在，见 T04 条目，未新增漂移）。
- 产物校验：`current.json` **1449 条**（icon 131 / 非传奇 1318）、`generatedAt 2026-09-18T07:54:05.473Z`、三源完好（futbin-popular 250 / futbin-icon-detail 131 @07:54:05.455Z / daily-market 750）；传奇 **131/131** 命中、`scope=card` / `source=futbin-icon-detail` / 双平台键 **0 违例**、`updatedAt` 全部 = 本轮 `collectedAt`；与 hourly T15 区间/平台价不一致 **0**。daily `players` 131/131 含 `priceRange` + `platforms.console/pc`，与 current 不一致 **0**；顶层 `priceRange{scope:card,withRange:131,missing:0,minFloor:69000,maxCeiling:15000000}`；`counts{total:131,valid:92,missing:39,platformValid:{console:87,pc:52}}`；**无日环比/累计涨跌字段**。历史 09-16 / 09-17 快照未被改动。
- research 56,729 B（不构成投资 / 重演 / listing-estimate / 卡级 / 无 FC26 对照 / 占位 / 不适用 齐备）；19 张建议卡页内 **19/19**（用 `row.name`/`row.nameZh` 判定，勿用 slug——变音符假阴性坑见 T12）；常驻底稿 `icons/reports/fc27-icon-live-research.html` 与当日页**逐字节一致**。icons-heroes 304,098 B，三列表头齐备、按平台拆区间正则命中 **1**（仍是口径说明句假阳性）、价格语境**伪百分比 0**（3 处 `%` 全为 CSS `width/height`）、1289 处「—」、头像 `球员头像 131/131`、`data-card-id` 655、运行时读 `assets/data/current.json`。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs（`automation/runs/2026-09-18/icons-heroes/` 仍 03:17，无 `hourly-15-failed.json`）；未渲染 market.html（仍 03:35）；未动首页与版式。
- **新增踩坑（校验假阴性）**：研究页的条件句在 HTML 里写作 **「条件 A」中间带空格**，用 `条件A`（无空格）扫会稳定假阴性、误判「未写明条件口径」；校验口径关键词时须对空格不敏感。

### 2026-09-18 16:56–16:59（T16）— 首轮即成功，无劣化
- 预检 `node automation/browser-triage.mjs --json` **exit 0 / verdict `OK` / actions `[]`**（**未发生自愈**；`checkDeps.tail` = `proxy: ready (Chrome (独立调试 profile))`，chrome.port 9333、listener true、`/json/version` 200、proxy.health.connected true、sessions 1）。4 步按序完成，D=2026-09-18（`hourly/2026-09-18T16.json`；`collectedAt 2026-09-18T08:58:47.669Z`）。**131/131 首轮即成功**（2m34s、17 批、5 次宿主页重建），`counts{total:131,ok:131,missing:0,minFloor:69000,maxCeiling:15000000}`、`errors 0`、逐卡 `ok=false` 0。区间 69,000–15,000,000；口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T15→T16 区间变动 0 张**（连续第 N 轮持平）；代表价变动 **62 张**、**新转有效 6 / 有效转无效 4**；任一平台有效当前价 T15 92 → **T16 94（Console 89 / PC 58）**。
- 研究：投资建议 **19 → 19（张数持平，出 4 进 4）**，全部为真实价变动驱动（证据见下）。**判定链无回归的证明**：用 T15 快照 + 当日 FC26 开服价**重算 T15 命中集 = 19 张，与记忆 T15 条目逐张完全一致（差异 0）** ⇒ 变化全部源于实时价滚动。
  - **掉出 4 张，全部由 PC 平台价首次放出/抬升驱动**（代表值 = max(console,pc) 上穿 FC26 开服价 → condA 转 false）：`antunes-coimbra`（尤西比奥）rep 4,090,000→**9,980,000**（**PC 0→9,980,000 首次放出**，> 6,831,947）· `dalglish` rep 2,450,000→**6,300,000**（PC 0→6,300,000 首次放出，> 3,347,517）· `iniesta-lujan` rep 1,390,000→**5,100,000**（PC 0→5,100,000 再次放出，> 1,667,636）· `jones` rep 285,000→**500,000**（PC 0→500,000，> 327,656）。
  - **新增 4 张**：`henry`（亨利）console 7,050,000→**4,950,000**（< FC26 5,681,158）· `hernandez-creus`（哈维）rep 1,050,000→**800,000**（con 625,000→670,000、pc 1,050,000→800,000；< 812,407，**余量仅 1.5%**，下轮极易翻转）· `muller`（穆勒）**两平台 0→con 1,250,000 首次放出转有效**（< 2,063,817）· `puyol-saforcada`（普约尔）rep 666,000→**300,000**（con 241,000→248,000、pc 666,000→300,000；< 317,443，**余量 5.5%**）。
  - **保留 15 张**：`abily` · `bale` · `beckham` · `bergkamp` · `borba-ferreira` · `cantona` · `chiellini` · `da-silva-rocha` · `kroos` · `maradona` · `miyama` · `ribery` · `sanchez` · `schelin` · `scholes`（无有效价、仅 condB：区间上沿 200,000 < 231,598，`both`=0）。
  - `counts{compared:131,advice:19,condA:18,condB:1,both:0,noFc26:15,noRange:0}`；`minValidPrice 1000`、`priceBasis listing-estimate`、`rangeCollectedAt 2026-09-18T08:58:47.669Z`。无 FC26 对照仍 **15 张同集**（`eto-o` slug 漂移项仍在，见 T04 条目，未新增漂移）。
- 产物校验：`current.json` **1450 条**、`generatedAt 2026-09-18T08:58:47.686Z`、三源完好（futbin-popular 250 @07:55:58 / futbin-icon-detail 131 @08:58:47.669 / daily-market 750 @03:30+08）；传奇 **131/131** 命中、`priceRange.scope=card` 131/131、`source=futbin-icon-detail` 131/131、双平台键 131/131、`updatedAt` **全部 = 本轮 `collectedAt`（0 违例）**；**current↔hourly 区间/平台价不一致 0；current↔daily 区间/平台价不一致 0**。daily `players` 131/131 含 `priceRange`+`platforms.console/pc`；顶层 `priceRange{scope:"card",withRange:131,missing:0,minFloor:69000,maxCeiling:15000000}`；`counts{total:131,valid:94,missing:37,platformValid:{console:89,pc:58}}`（`missing` = 无有效价的张数，非采集缺失）；快照内**无**任何日环比/累计涨跌字段。历史 09-16（16:20）/ 09-17（23:07）未被改动。
- research 52,256 B（不构成投资 / 重演 / listing-estimate / 卡级 / 条件A有效性 / 无FC26对照 / 占位 / 不适用 齐备；19 张建议卡页内 **19/19**，用 `row.name`/`row.nameZh` 判定，勿用 slug——变音符假阴性坑见 T12）；常驻底稿 `icons/reports/fc27-icon-live-research.html` 与当日页**逐字节一致**。icons-heroes 298,422 B，三列表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌` 齐备，按平台拆区间正则命中 **1**（仍是「同一张卡的 Console 与 PC 价格盒渲染出完全相同的区间值」的**已知假阳性**）、**伪百分比 0**（全页 3 处 `%` 全为 CSS `width/height`）、1283 处「—」、头像 `球员头像 131/131`（`pimg`/`img` 均 179）、`data-card-id` 786、运行时读 `assets/data/current.json`；**FC26 参考区（偏移 262,564 起）pimg 数 0，跨代不配头像红线保持**。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs（`automation/runs/2026-09-18/icons-heroes/owner.json` 仍 03:10，目录内无 `hourly-16-failed.json`）；未渲染 market.html（仍 03:35）；未动首页与版式。
- **本轮新增证据（新转有效首次出现 PC 回落型）**：`antunes-coimbra` 的 PC 价在 T12/T15 曾两度「有效→0」（代表值下移使 condA 转 true），本轮又 0→9,980,000（代表值上移使 condA 转 false）——**同一张卡的 PC 价可在有效/占位之间反复横跳**，故单轮结论更替属源站滚动行为，回报时必须以「本卡本轮的 con/pc 两值」为证据，不得据单轮变化推断脚本回归。

### 2026-09-18 18:00–18:04（T18）— 首轮即成功，无劣化
- 预检 `node automation/browser-triage.mjs --json` **exit 0 / verdict `OK` / actions `[]`**（**未发生自愈**；`checkDeps.tail` = `proxy: ready (Chrome (独立调试 profile))`，chrome.port 9333、listener true、`/json/version` 200、proxy.health.connected true、sessions 1）。4 步按序完成，D=2026-09-18（`hourly/2026-09-18T18.json`；`collectedAt 2026-09-18T10:03:49.596Z`）。**131/131 首轮即成功**（3m15s、17 批、5 次宿主页重建），`counts{total:131,ok:131,missing:0,minFloor:69000,maxCeiling:15000000}`、`errors 0`、逐卡 `ok=false` 0、`missingItems` 仅口径提示串。口径 listing-estimate、scope card。补采轮未触发、零 CDP 劣化。
- **T17 快照缺失（新调度缺口，如实记录）**：09-18 `hourly/` 目录为 T00/T01/T02/T04/T05/**T11–T16**/T18，**无 T17**，且自动化记忆亦无 T17 条目 → 17:xx 那一轮未产出（无快照、无 `hourly-17-failed.json`）。故**本轮实际为 T16→T18，跨 2 小时**，解读变动幅度时勿按 1 小时口径。缺口不可回填。
- **T16→T18 区间变动仅 1 张**：`da-silva-ferreira`（尤西比奥）72,000–13,100,000 → **71,000–15,000,000**（上沿回到 15,000,000，与 PELÉ 并列）。其余 130 张最高/最低价全部持平；全局下沿仍 69,000（`bale`/`barnes` 等）、上沿 15,000,000。
- 代表价（两平台有效价较大者）变动 **72 张**、**新转有效 9 / 有效转无效 4**；任一平台有效当前价 T16 94 → **T18 100（Console 98 / PC 52）**。
- 研究：对照 131，投资建议 **19 → 26（出 1 进 8 保留 18）**，全部为真实价变动驱动。**判定链无回归的证明**：用 T16 快照 + 当日 FC26 开服价**重算 T16 命中集 = 19 张，与记忆 T16 条目逐张完全一致（差异 0）** ⇒ 变化全部源于实时价滚动。
  - **掉出 1 张**：`muller`（穆勒）console 1,250,000 → **0/0 双平台价全部失效**，代表值归 0 ⇒ condA 记为 `null`（不适用，非 false），condB 亦不成立（区间上沿 15,000,000 > FC26 2,063,817）→ 退出建议集。
  - **新增 8 张，6 张由「PC 有效价回落至 0 使代表值下移」驱动、2 张由 Console 真实下跌驱动**（证据逐张如下，缺证据易被误读为脚本回归）：
    - `maldini` 马尔蒂尼：con 3,900,000/pc **6,500,000 → 0**，代表值 6,500,000 → **2,899,000** < FC26 4,865,792。
    - `morgan` 摩根：con 3,299,000→4,150,000、pc **12,800,000 → 0**，代表值 12,800,000 → **4,150,000** < 4,645,282（余量 10.7%）。
    - `jones` 琼斯：con 270,000→304,000、pc **500,000 → 0**，代表值 500,000 → **304,000** < 327,656（余量 7.2%）。
    - `baresi` 巴雷西：con 300,000→310,000、pc 399,000→330,000，代表值 399,000 → **330,000** < 351,000（余量 6.0%）。
    - `barnes` 巴恩斯：con 375,000→346,000、pc 1,400,000→650,000，代表值 1,400,000 → **650,000** < 679,221（余量 4.3%）。
    - `van-der-sar` 范德萨：con 480,000→493,000、pc 990,000→720,000，代表值 990,000 → **720,000** < 825,859（余量 12.8%）。
    - `desailly` 德塞利：con **1,500,000 → 1,000,000**（pc 均 0）< FC26 1,033,565（**余量仅 3.3%**，下轮极易翻转）。
    - `smith` 凯莉·史密斯：con **7,990,000 → 599,000**（pc 均 0）< FC26 774,438（本卡当日最大跌幅）。
  - **保留 18 张**：`maradona`（rep 13,251,000 < 14,135,976，**余量 6.3%**，`maxRatio` 0.975）· `bale` 2,950,000 · `henry` 3,760,000 · `cantona` 1,933,000 · `schelin` 1,751,000 · `abily` 1,499,000 · `da-silva-rocha` 1,401,000 · `ribery` 1,180,000 · `chiellini` 900,000 · `hernandez-creus` 680,000 · `borba-ferreira` 655,000 · `kroos` 650,000 · `beckham` 601,000 · `sanchez` 515,000 · `miyama` 440,000 · `bergkamp` 433,000 · `puyol-saforcada` 240,000；`scholes` 无有效价、仅 condB（区间上沿 200,000 < 231,598，`maxRatio` 1.15799）。
  - `counts{compared:131,advice:26,condA:25,condB:1,both:0,noFc26:15,noRange:0}`；`minValidPrice 1000`、`priceBasis listing-estimate`、`rangeCollectedAt 2026-09-18T10:03:49.596Z`。`both` 为 0 的原因同 T15：`scholes` 当前价无效 ⇒ condA 记 `null` 而非 true/false。无 FC26 对照仍 **15 张同集**（`eto-o` slug 漂移项仍在，见 T04 条目；`batistuta` 属 FC26 侧全月无正价观测的既有口径）。
- 产物校验：`current.json` **1450 条**（icon 131 / 非传奇 1319）、`generatedAt 2026-09-18T10:03:49.611Z`、三源完好（futbin-popular 250 @09:00:38.270Z / futbin-icon-detail 131 @10:03:49.596Z / daily-market 750 @03:30+08）；传奇 **131/131** 命中、`priceRange.scope=card` 131/131、`source=futbin-icon-detail` 131/131、双平台键 131/131、`updatedAt` **全部 = 本轮 `collectedAt`（0 违例）**；**current↔hourly T18 区间/平台价不一致 0**；非传奇 1319 条双平台键缺失 **0**（市场侧未被破坏）。daily `players` 131/131 含 `priceRange`+`platforms.console/pc`，**与 current 区间/平台价不一致 0**；顶层 `priceRange{scope:"card",withRange:131,missing:0,minFloor:69000,maxCeiling:15000000}`；`counts{total:131,valid:100,missing:31,platformValid:{console:98,pc:52}}`（`missing` = 无有效价的张数，非采集缺失）；快照内**无**任何日环比/累计涨跌字段。历史 09-16（16:20）/ 09-17（23:07）未被改动（3 天历史）。
- research **59,837 B**（不构成投资 / 重演 / listing-estimate / 卡级 / 条件 A 有效性 / 无 FC26 对照 / 占位 / 不适用 八要素齐备；26 张建议卡页内 **26/26**，用 `row.name`/`row.nameZh` 判定，勿用 slug——变音符假阴性坑见 T12）；常驻底稿 `icons/reports/fc27-icon-live-research.html` 与当日页**逐字节一致**（59,837）。
- icons-heroes **337,155 B**，五列表头 `当前价(列表页)|最低价|最高价|日环比|累计涨跌` 齐备，按平台拆区间正则命中 **1**（仍是「Console 与 PC 价格盒渲染出完全相同的区间」的**已知假阳性**）、**伪百分比 0**（全页 3 处 `%` 全为 CSS `width/height`）、1280 处「—」、头像 `球员头像 131/131`（`img` 179）、`data-card-id` **786**、运行时读 `assets/data/current.json`（报告目录副本 `generatedAt` 与主文件一致）；**FC26 参考区（偏移 262,669 起）`img` 数 0，跨代不配头像红线保持**。
- 未发布站点；`publish-status-2026-09-18.json` 仍 03:56（每日发布任务所写，非本任务）；未调用 run-state.mjs（`icons-heroes/owner.json` 仍 03:10 每日任务所留）；未渲染 market.html（仍 03:35）；未写 `hourly-18-failed.json`（本轮成功）；未动首页与版式。
