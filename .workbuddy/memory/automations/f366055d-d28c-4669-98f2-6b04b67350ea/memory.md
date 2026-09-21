# evolution 自动化运行记忆（f366055d）

## 2026-09-21 03:26 (Asia/Shanghai) · 状态 partial（采集全部成功）
- runId `97c127ed-8f79-4e1c-aaf8-0961baa7e086`，03:25:57 启动、03:30:09 提交，全流程约 4 分钟。通道 `browser-triage` exit 0（独立 profile 9333，无自愈）。
- 采集（**新写法，仅 8 秒**）：宿主页停 `robots.txt` + 页内同源 `fetch` + `DOMParser`，一条脚本跑三页 → 榜单 **500 卡** / 总览 **19 条路径**（新增 **Creative Crossroads**，付费 150 FC Points + 15,000 金币；无路径下线，19 条全在有效期内）/ expired 0 节点。`priceEls=0` 再次确证进化卡无挂牌价。
- **⚠ 总览页 DOM 本轮再次重构（最高价值教训）**：`div.evolutions-overview-wrapper` 由「扁平换行」改为「深度缩进嵌套」，标签改**首字母大写**（`Evolutions`/`Training Camp`/`Cosmetics`/`Rewards`/`Season 1 Level: N`/`Free`/`Repeatable`），`Total Upgrades` 逐项由 4 token 合并为 2 token（`Overall` + `"+34 | 79"`），PATH token 变 `Path A → A → A`。旧解析会**四处同时静默失配**（requirements 全空 / upgrades 吞投票块虚高到 46 项 / 类型标签全空被默认成 Evolutions / FREE 读不到）；`/^PATH/` 大小写敏感还会吃掉一格使 (name,delta) 配对错位 → 「37 token 却输出未列出升级项」。**修法 = 空白归一化 + 大小写不敏感 + 升级块遇首个纯百分比行截断**。已写入 `web-access/references/site-patterns/futbin.com.md`。
- **踩坑（新）：`openedAt` 时区换算**。collect-meta 是 UTC ISO，只把 `Z` 换成 `+08:00` 而不加 8 小时 → 结果早于本轮 `startedAt`，触发 run-state「openedAt ≥ startedAt」校验失败。正解 `new Date(new Date(z).getTime()+8*3600e3)` 后再切片。
- 译名 33 未命中 → 全部补齐（含查证 **Bao Shimeng = 鲍世蒙**，上海海港）→ 未命中 0（500/500），词库 1858。头像 backfill 两轮 +24 键/+24 图，页头 **81/83**，唯一残留 = cardId 20509（源站 `noface`），第二轮新增 0，属源侧事实。行情关接 **81/500、有效报价 41**（低于 09-20 的 110/53，已交叉核对自洽——新路径基础卡多在市场集之外，**未填充**）；本任务未采价、未写 priceRef。
- 产物 `reports/daily/2026-09-21/evolution.html`（175,654 B，PARTIAL），快照 SHA-256 `b472e65f…`。

### 下次执行直接照做
1. `node automation/run-state.mjs begin evolution D` → 记 runId/startedAt（03:15 调度实际约 03:26 起跑，仍留足预算）。
2. `node automation/browser-triage.mjs`（**唯一判据**，exit 0 才继续；不要用 check-deps 当第一判据）。
3. 工作脚本**从 `automation/runs/2026-09-21/evolution/work/` 拷**（该版已含：宿主页+页内 fetch 三页采集器 `collect-evolution.mjs`、空白归一化+大小写不敏感的 total 页解析、2-token 升级解析、PATH 大小写修正、正确 `toCst` 时区换算）。**不要再拷 09-20 及更早版本**（会被本轮 DOM 重构静默打死）。
4. 改 `build-json.mjs` 的 D/runId → `node build-json.mjs` → 译名（未命中清单在 `runs/D/market/work/missing-name-zh.json`）→ backfill（**放后台并行**，与译名注入互不冲突）→ enrich → render → evidence → finish。
5. 收尾 `curl /close` 关闭自建 tab（本轮补全脚本会各留一个 `/27/popular` 会话页，按日志里的 session id 精确关闭，**不要动其它任务的 tab**）。

### 三条硬约束（每次都适用）
1. `evidence.missing` 非空时 `finish success` 会被自动降级为 `partial`。**直接提交 partial，并把 evolution.json 的 `status` 也写成 partial**（build-json 里就要写好），否则报告徽标与权威状态矛盾。
2. `evidence.sources[].openedAt` 必须 ≥ 本轮 `startedAt`（**注意时区换算**）；`--rerun` 会让上一轮 openedAt 失效，必须在重跑轮内重新打开来源页。
3. `--rerun` 会把 `automation/runs/D/evolution/` 整体 rename 进 `attempts/<旧runId>/`；重跑前从 attempts 拷回工作脚本。

### 采集口径
- **去重按「球员 URL + 进化名称」**，不按球员名（同名不同卡版本是独立条目）。09-18～09-21 四轮 500 URL 全唯一。
- **FUTBIN Rating 天然缺失**：09-18 458/500、09-19 481/500、09-20 469/500、**09-21 480/500（缺 20）**；按 DOM 实测计数，缺失如实留空。
- 榜单 Rating 是「进化后」OVR；卡片数字是热度计数（popularityCount）；FUTBIN 只给 UNLOCK/EXPIRES 相对时长。
- `/27/players` 列表目录对当前 IP/会话 403（已知）；榜单 500 条整齐、无「共 N 条」计数，无法证实是否服务端截断，如实记入 missing。
- 行情关接覆盖率每日波动大（09-17 45 / 09-19 77 / 09-20 110 / 09-21 81），**每次以当日 marketJoin 为准，不要照抄历史**，也不要把「无报价」写成 0。


## 2026-09-20 03:38 (Asia/Shanghai) · 状态 partial（采集全部成功）
- runId `b20f6a74-30d5-4835-989a-8ca4b8d92125`，03:38:42 启动，03:42:48 提交，全流程约 4 分钟（软上限 03:53:42 / 硬上限 03:58:42）。通道 `browser-triage` exit 0（独立 profile 9333，无自愈）。
- 采集结果：**500 张进化卡 + 18 条路线**（09-19 为 15 条，**新增 Ones to Watch Retro 18/19/20 —— 全新来源类型 COSMETICS**、纯外观/稀有度、无属性升级；无路径下线）。产物 `reports/daily/2026-09-20/evolution.html`（173,281 B，徽标 PARTIAL），快照 SHA-256 `0e8793b2…`。
- 译名：首轮未命中 29（唯一 slug）→ 全部补译入词库（1545 → 1574）→ 重跑「未命中 0」。头像：backfill 两轮，页头「球员头像 **83/84**」收敛（唯一缺图 = Dastan Satpaev cardId 21437，playerhover 返回 noface）。
- 行情关接 **110/500、其中有有效报价 53**（09-19 为 77/500、35）。**本任务未采价、未写 priceRef**，逐卡只有 baseCardId。
- **站点结构再变（本轮新发现，务必按新口径解析）**：
  - 来源类型新增 `COSMETICS`（3 条 OTV Retro），`Player Requirements` 与 `Total Upgrades` 均为空，`upgrades` 只剩投票百分比 → fmtUpgrades 必须过滤 `^\d+(\.\d+)?%$`，否则输出「11% undefined」。
  - **费用格不再恒为 FREE**：OTV Retro 为两行 `200` + `25,000`（首行带 fc-points 图标 = FC 点数、次行金币）；Training Camp 类在 EXPIRES 与费用之间**多一个 `TRAINING 时长` 格**。必须按内容识别费用（FREE / 纯数字），`TRAINING…` 单列。两种误读都实测复现过（旧正则读成空；按位置取第 3 格读成 `TRAINING + 1 HOUR`）。
  - `REPEATABLE` 格可带次数（`REPEATABLE|2`）。
  - 总览 18 条 vs 榜单 17 个进化名：**Relentless 当天零卡片入选**，属榜单热度口径，不是缺采。
- 站点经验已同步 `~/.workbuddy/skills/web-access/references/site-patterns/futbin.com.md`（COSMETICS + 费用格结构 + 总览/榜单不同步）。

### 下次执行直接照做
1. `node automation/run-state.mjs begin evolution D` → 记 runId/startedAt（03:15 调度实际 03:38 起跑，仍留足 15 分钟）。
2. `node automation/browser-triage.mjs`（**唯一判据**，exit 0 才继续；不要再跑 check-deps 当第一判据）。
3. 工作脚本**从 `automation/runs/2026-09-20/evolution/work/` 拷**（该版含：无六维块按尾部解析 + GK 标签集合 + 来源多值/赛季行解析 + **COSMETICS** + **费用格按内容识别/trainingCost/repeatCount** + 百分比 token 过滤）：
   `extract-cards.js` / `extract-evolutions.js` / `build-json.mjs`（另有 `append-name-zh.mjs` 可复用为译名追加器）。
4. `/new` 打开三页（榜单 / 总览 / expired）→ `/eval` 注入两个 extract 脚本 → 改 `build-json.mjs` 的 D/runId/OPENED 时刻 → `node build-json.mjs` → 译名 → backfill → enrich → render → evidence → finish。
5. **头像补全放后台并行**（它只写 avatar-index.json/images，与译名注入互不冲突），本轮实测省约 1 分钟，无冲突。
6. 收尾关闭自建 tab（`/close`），不要动其它任务留下的 tab。

### 三条硬约束（每次都适用）
1. `evidence.missing` 非空时 `finish success` 会被自动降级为 `partial`。**直接提交 partial，并把 evolution.json 的 `status` 也写成 partial**（build-json 里就要写好），否则报告徽标与权威状态矛盾。
2. `evidence.sources[].openedAt` 必须 ≥ 本轮 `startedAt`；`--rerun` 会让上一轮 openedAt 失效，必须在重跑轮内重新打开来源页。
3. `--rerun` 会把 `automation/runs/D/evolution/` 整体 rename 进 `attempts/<旧runId>/`；重跑前从 attempts 拷回工作脚本。

### 采集口径
- **去重按「球员 URL + 进化名称」**，不按球员名（同名不同卡版本是独立条目）。09-18/09-19/09-20 三轮 500 URL 全唯一。
- **extract-cards.js 的两处解析缺陷已修**（09-17 版本会把姓名解析错，务必用 09-18 及以后版本）：少数卡片 innerText 没有六维块（09-18 有 5 张，09-19/09-20 为 0 张）→ 按尾部位置 pop → evol → name；**门将卡属性标签是 DIV/HAN/KIC/REF/SPD/POS**，必须并入门将标签集合。
- **FUTBIN Rating 天然缺失**：09-18 458/500、09-19 481/500、**09-20 469/500（缺 31）**；按 DOM 实测计数，缺失如实留空。
- 榜单 Rating 是「进化后」OVR；卡片数字是热度计数（popularityCount）；FUTBIN 只给 UNLOCK/EXPIRES 相对时长。
- `/27/players` 列表目录对当前 IP/会话 403（已知）；榜单是否被服务端截断无法证实（500 条整齐、无「共 N 条」计数），如实记入 missing。

### 历史（仅备查）
- 09-16 03:00 failed（扩展通道，作废）；09-16 12:51 failed（开关未开）；09-16 13:30 partial（456 卡 / 5 路径）；09-17 03:44 partial（500 卡 / 14 路径，姓名解析有 5 条错、42 条无 FB 评分同源）。
