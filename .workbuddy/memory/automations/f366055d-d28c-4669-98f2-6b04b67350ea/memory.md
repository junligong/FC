# evolution 自动化运行记忆（f366055d）

## 2026-09-22 03:27 (Asia/Shanghai) · 状态 partial（采集全部成功）
- runId `8894d783-d38e-4bcb-889b-aad05fc89ed7`，03:25:32 起跑、03:27:07 提交，全流程约 **1.7 分钟**（近三轮最快）。通道 `browser-triage` exit 0（独立 profile 9333，无自愈）。
- 采集（沿用 09-21 写法，**一次成功、约 8 秒**）：宿主页停 `robots.txt` + 页内同源 `fetch` + `DOMParser`，一条脚本跑三页 → 榜单 **500 卡**（`ratingEls 495/500`、`priceEls 0`）/ 总览 **19 条**（与 09-21 完全一致，无新增、无下载线）/ expired 0 节点。
- **本轮无任何站点结构变更**：总览页 19 条逐条复核通过（requirements / upgrades / 类型标签 / 费用全非空且与页面一致）。09-21 版工作脚本可**原样复用**，只需改 `build-json.mjs` 的 `D` / `RUN_ID` / 时区注释 → 未来若再出现结构变更再重写解析。
- 译名 17 未命中（唯一 slug）→ 全部查证补齐（含百度百科 `西德尼·洛佩斯·卡布拉尔`、中文维基 `埃莱内·莱特`、懂球帝 `弗雷德里科·杜阿尔特`、球探/网易 `佩希尼奥`）→ 未命中 **0（500/500）**，词库 1995 → 2012。
- 头像 backfill：缺口 12 → playerhover **12/12 命中 + 12/12 下载**，页头 **89/89** 收敛（连续两日零残留，09-21 的 cardId 20509 已消失）。
- 行情关接 **109/500、有效报价 45**（09-21 为 81/45）。**未采价、未写 priceRef**；价格一律运行时按 `baseCardId` 读唯一行情 `apps/market/engine/data/prices/fc27/current.json`（PC 有效价优先）。
- 产物 `reports/daily/2026-09-22/evolution.html`（188,443 B，PARTIAL，`class="zh"` 199 处），快照 SHA-256 `02b543d2…`。

### 高价值对照（本轮唯一新信息）
- 同日 **00:29 的 market-hourly 与 00 点 icons-heroes 轮对 FUTBIN 页内同源 fetch 均 403**，而本任务 **03:25 同口径三页全 200** ⇒ FUTBIN 的 403 **具时段性，不是站点级持久拦截**。不要用 00 点轮结论推断全天不可采，也不要因历史 403 就预先降级本任务。

### 下次执行直接照做
1. `node automation/run-state.mjs begin evolution D` → 记 runId/startedAt（03:15 调度实际 03:25 起跑，预算充裕）。
2. `node automation/browser-triage.mjs`（**唯一判据**，exit 0 才继续；不要用 check-deps 当第一判据）。
3. 工作脚本**从 `automation/runs/2026-09-22/evolution/work/` 拷**（该版 = 09-21 版，已含：宿主页+页内 fetch 三页采集器 `collect-evolution.mjs`、空白归一化+大小写不敏感的 total 页解析、2-token 升级解析、PATH 大小写修正、正确 `toCst` 时区换算、本轮的 `append-name-zh.mjs` 模板）。**不要再拷 09-20 及更早版本**。
4. 改 `build-json.mjs` 的 `D` / `RUN_ID` / 时区注释 → `node build-json.mjs` → 译名注入（未命中清单在 `runs/D/market/work/missing-name-zh.json`）→ backfill（**放后台并行**，与译名注入互不冲突）→ enrich → render → evidence → finish。
5. 收尾关闭自建 tab（`collect-evolution.mjs` 自建的宿主页会自行 `/close`；若 build-json 之外的补全脚本另留 `/27/popular` 会话页，按日志 session id 精确关闭，**不要动其它任务的 tab**）。

### 三条硬约束（每次都适用）
1. `evidence.missing` 非空时 `finish success` 会被自动降级为 `partial`。**直接提交 partial，并把 evolution.json 的 `status` 也写成 partial**（build-json 里就要写好），否则报告徽标与权威状态矛盾。
2. `evidence.sources[].openedAt` 必须 ≥ 本轮 `startedAt`（**注意时区换算**：collect-meta 是 UTC ISO，须 `new Date(new Date(z).getTime()+8*3600e3)` 后再切片，只换 `Z` 后缀会早 8 小时、校验必失败）；`--rerun` 会让上一轮 openedAt 失效，必须在重跑轮内重新打开来源页。
3. `--rerun` 会把 `automation/runs/D/evolution/` 整体 rename 进 `attempts/<旧runId>/`；重跑前从 attempts 拷回工作脚本。

### 采集口径（稳定、每日适用）
- **去重按「球员 URL + 进化名称」**，不按球员名（同名不同卡版本是独立条目）。09-18～09-22 五轮 500 URL 全唯一。
- **FUTBIN Rating 天然缺失**：09-18 458/500、09-19 481/500、09-20 469/500、09-21 480/500、**09-22 495/500（缺 5）**；按 DOM 实测计数，缺失如实留空。
- 榜单 Rating 是「进化后」OVR；卡片数字是热度计数（popularityCount）；FUTBIN 只给 UNLOCK/EXPIRES 相对时长（会自然递减，如入门系列 12 → 11 Months）。
- `/27/players` 列表目录对本 IP/会话 403；榜单 500 条整齐、无「共 N 条」计数，无法证实是否服务端截断，如实记入 missing。
- 行情关接覆盖率每日波动大（09-17 45 / 09-19 77 / 09-20 110 / 09-21 81 / 09-22 109），**每次以当日 marketJoin 为准**，不照抄历史，也不把「无报价」写成 0。

### 历史（仅备查）
- **2026-09-21 partial**（runId 97c127ed，约 4 分钟）：500 卡 / 19 路径（新增 Creative Crossroads，付费 150 FC Points + 15,000 金币）/ expired 0。**当日总览页 DOM 重构（最高价值教训）**：`div.evolutions-overview-wrapper` 由扁平换行改为深度缩进嵌套，标签改首字母大写，`Total Upgrades` 逐项由 4 token 合并为 2 token（`Overall` + `"+34 | 79"`），PATH token 变 `Path A → A → A`；旧解析会四处同时静默失配。修法（已固化进本轮脚本）= 空白归一化 + 大小写不敏感 + 升级块遇首个纯百分比行截断。已写入 `web-access/references/site-patterns/futbin.com.md`。译名 33 → 0，头像 81/83，关接 81/500、有效 41。
- **2026-09-20 partial**（runId b20f6a74）：500 卡 / 18 路径；新增来源类型 `COSMETICS`（OTV Retro 18/19/20，纯外观、无属性升级）、费用格不再恒为 FREE（两行 `200` + `25,000`）、Training Camp 多 `TRAINING 时长` 格、`REPEATABLE` 可带次数；关接 110/500、有效 53。
- 09-16 03:00 failed（扩展通道，作废）；09-16 12:51 failed（开关未开）；09-16 13:30 partial（456 卡 / 5 路径）；09-17 03:44 partial（500 卡 / 14 路径，姓名解析有 5 条错、42 条无 FB 评分同源）。
