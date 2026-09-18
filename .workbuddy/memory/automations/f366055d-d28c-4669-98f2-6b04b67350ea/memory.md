# evolution 自动化运行记忆（f366055d）

## 2026-09-18 03:49 (Asia/Shanghai) · 状态 partial（采集全部成功）
- runId `83e83d3c-558d-4aa0-aea9-3583124114b6`，03:49:56 启动，03:54:30 提交，全流程约 4.5 分钟（软上限 04:04:56 / 硬上限 04:09:56）。
- 通道：`check-deps.mjs` exit 0（Chrome :9222 / proxy ready），三个来源页均在本轮内打开并实采。
- 采集结果：500 张进化卡 + 14 条路线（与 09-17 一致，无新增/下线）。产物 `reports/daily/2026-09-18/evolution.html`（137,959 B，徽标 PARTIAL），快照 SHA-256 `30b26c58…`。
- 译名：首轮未命中 39（唯一 slug）→ 全部补译入词库（963 → 1002 条）→ 重跑「未命中 0」。头像：backfill 两轮，页头「球员头像 70/70」收敛。
- 行情关接 54/500、其中有有效报价 34（09-17 为 45/500）。**本任务未采价、未写 priceRef**，价格由页面运行时按 baseCardId 读 `current.json`。

### 下次执行直接照做
1. `node automation/run-state.mjs begin evolution D` → 记 runId/startedAt。
2. `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`，exit 0 才继续。
3. 工作脚本**从 `automation/runs/2026-09-18/evolution/work/` 拷**（本日已修过两处解析缺陷，比 09-16/09-17 版本正确）：
   `extract-cards.js` / `extract-evolutions.js` / `build-json.mjs`。
4. `/new` 打开三页 → `/eval` 注入两个 extract 脚本 → `node build-json.mjs`（先改 D 与 note 文案）→ 译名 → enrich → backfill → render → evidence → finish。

### 三条硬约束（每次都适用）
1. `evidence.missing` 非空时 `finish success` 会被自动降级为 `partial`。**直接提交 partial，并把 evolution.json 的 `status` 也写成 partial**（build-json 里就要写好），否则报告徽标与权威状态矛盾。
2. `evidence.sources[].openedAt` 必须 ≥ 本轮 `startedAt`；`--rerun` 会让上一轮 openedAt 失效，必须在重跑轮内重新打开来源页。
3. `--rerun` 会把 `automation/runs/D/evolution/` 整体 rename 进 `attempts/<旧runId>/`；重跑前从 attempts 拷回工作脚本。

### 采集口径（含 2026-09-18 新修正）
- **去重按「球员 URL + 进化名称」**，不按球员名（同名不同卡版本是独立条目）。本轮 500 URL 全唯一。
- **extract-cards.js 的两处解析缺陷已修**（09-17 版本会把姓名解析错，务必用 09-18 版）：
  - 少数卡片 innerText **没有六维块**（尾部只有 `FUTBIN Rating / 姓名 / 进化名称 / 热度`，本轮 5 张）：旧写法「最后一个非数字即姓名」会把进化名称当姓名 → 改按尾部位置 pop → evol → name。
  - **门将卡的属性标签是 DIV/HAN/KIC/REF/SPD/POS**（本轮 1 张 GK）：旧写法定位不到数值块，姓名被解析成 `POS` → 已把 GK 标签纳入识别集合。
  - 修好后 500 条姓名全部为真实球员名、可疑姓名 0 条。
- **FUTBIN Rating 天然缺失**：500 张里仅 458 张有 `div.playercard-27-futbin-rating`（DOM 实测 withFR=458），42 条如实留空，不用 Rating 列顶替 → 每次都会出现在 `missing` 里，这是事实不是缺陷。
- 榜单 Rating 是「进化后」OVR；卡片数字是热度计数（popularityCount）；费用取自 `/27/evolutions` 卡片的 FREE 标记。FUTBIN 只给 UNLOCK/EXPIRES 相对时长。
- `/27/players` 列表目录对当前 IP/会话 403（已知，不要靠它做候选筛选）；榜单是否被服务端截断无法证实（500 条整齐、无「共 N 条」计数），如实记入 missing。
- 站点经验见 `~/.workbuddy/skills/web-access/references/site-patterns/futbin.com.md`（09-18 已补 GK 标签与无六维块布局）。

### 历史（仅备查）
- 09-16 03:00 failed（扩展通道，作废）；09-16 12:51 failed（开关未开）；09-16 13:30 partial（456 卡 / 5 路径）；09-17 03:44 partial（500 卡 / 14 路径，姓名解析有 5 条错、42 条无 FB 评分同源）。
