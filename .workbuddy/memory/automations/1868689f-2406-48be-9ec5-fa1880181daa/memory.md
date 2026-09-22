# FC·传奇英雄监控 自动化执行记忆（1868689f）

## 2026-09-22（第 6 次记录，状态 partial）— 5 分钟收口；403 恢复为「按页滚动限流」
- runId `740de08a-1627-42f9-a076-327565c89375`，19:28:39Z 启动、19:33:43Z 提交 `partial`（硬上限 19:48:39Z，全程 5 分钟，近几轮最快）。通道 `browser-triage` OK，未自愈。
- 采集：`/27/players` 只读通 **1–10 页（300 行）**，11–26 页全 403；退避 60s、150s 各重试 1 次（契约上限 2 次）仍 403、0 行 → 停手。台账补全生效：**131 张 Icon 全部在册**（28 张在可读页未出现，空价保留）+ **英雄卡 50 张**（回到页 1–10 的 50，非 09-21 的 99）。
- **对照组价值（新增结论）**：同日 03:25 的 evolution 任务用同一「宿主页 + 页内同源 fetch」口径**三页全 200**，本任务 03:28–03:33 页 11–26 全 403 ⇒ **403 是按页/按热度滚动的时段性限流，不是站点级持久拦截**；00:29 market-hourly 轮的全败同理不代表全天不可采。既不要据 403 判「站点坏了」，也不要据某轮成功判「已恢复」。
- 产物：`daily/2026-09-22.json`（131 张、0 重复 cardId、双平台 131/131、区间 131/131、有效价 90、Console 85/PC 65、basis `partial-live`、launchDate `2026-09-18`、累计 7 天）、`reports/daily/2026-09-22/icons-heroes.html`（394,699 B、SHA-256 `a1af30cb…`）。译名 131/131 + 50/50（词库已覆盖，本轮 0 新增）；头像传奇 131/131、英雄 48/50（2 张 noface，如实不出图）；backfill 渲染前后各一次均 **no-op**（830 cardId 零缺口）。
- **09-21 的「派生台账重复计账」未复现**：页头「FC27 英雄卡 50 张」= `base-heroes.json` 卡数（该修复仍生效，每次仍须核对）。
- 未渲染/未发布/未新增定时任务/未重开详情页取价。
- **前次遗留已闭环**：`LAUNCH_DATE` 口径分裂已消除——`collect-icons-list` / `record-icons-daily` / `collect-icon-priceranges` / `build-icon-research` / `build-same-period-advice` 常量**均已统一为 `2026-09-18`**。**仅剩** `base-icons.json` / `base-heroes.json` 的 `version` 字段恒为空串（09-17 起；下游按文件区分版本，无外部症状），待用户裁定后改采集器 `mk()` 并重跑。
- 下次要点：① 先试 1–15 页；被 403 后按 60s/150s 退避各 1 次即止（勿加码）；② 结束前必核对页头「FC27 英雄卡 N 张」= `base-heroes.json` 卡数；③ `daily/<D>.json` 卡数必须 = 131（不等于即写出路径又退回「只写成功项」）；④ 新增英雄译名先查 FC26 英雄台账 `heroes/data/prices/fc26/base-heroes.json` 的 `nameZh`。

## 2026-09-21（第 5 次记录，状态 partial）— 英雄卡首次突破 15 页；修掉「英雄表重复计账」
- runId `fd734deb-9080-4191-a8b9-61801271c8fc`，19:31:35Z 启动、19:45Z 提交 `partial`。通道 triage OK，未自愈。
- 采集：`/27/players` **首次读通 1–15 页（450 行）**（此前各轮 11 页起即 403）；16–26 页 403，按契约退避 75s、150s 各试 1 次（上限 2 次）仍 403 → 停手。台账补全仍生效：**131 张 Icon 全部采到**（iconMissingFromSource=0），**英雄卡 99 张**（此前各轮只有 50 —— 那 50 只是页 1–10 里的；页 14/15 的英雄是首次可见）。
- **英雄卡是「每个球员两张不同 cardId」的孪生结构**（如 ayew 21571/21581、zola 21634/21643、stam 21645/21646）：不要按姓名或 slug 去重，只能按 cardId。页 15 末出现 1 名只有单卡的英雄 → 提示页 16+ 仍有未采尽的英雄，故提交 partial。
- **本轮修复（重要，静默错）**：`render-icons-heroes.mjs` 的 `collectHeroes()` 递归扫描 `heroes/data/**`，把 2026-09-20 新增的**派生台账** `players/fc27/ledger-heroes.json`（50 张、无价格）与采集产物 `prices/fc27/base-heroes.json`（99 张）一并收录 → 同一张表 **149 行、其中 50 张 cardId 重复**（页头写「FC27 英雄卡 149 张」）。修法 = 跳过 `ledger-*.json` + 按 cardId 去重兜底；修复后 99 张（单来源）。**任何按目录递归聚合的渲染器都要核对「派生台账」是否被重复收录**。
- 译名：24 个新英雄 slug 不在词库 → 追加 25 条到 `name-zh-supplement-fc27.json`（`cesar-costa`/`georges`/`cole`/`gomez` 等以 **FC26 英雄台账 `heroes/data/prices/fc26/base-heroes.json` 的既有 nameZh 为准**，这是跨代同源译名的权威来源，别自己猜），再用 `apply-market-name-zh.mjs 2026-09-21 --file apps/market/engine/heroes/data/prices/fc27/base-heroes.json` 注入 → 英雄中文名 99/99。
- 产物：`daily/2026-09-21.json`（131 张、有效价 118、Console 116/PC 79、区间 131/131、basis `partial-live`）、`reports/daily/2026-09-21/icons-heroes.html`（410,266 B、SHA-256 `58952fd0…`）；头像传奇 131/131、英雄 95/99；backfill 两轮 38 新映射 / 19 张图，余 1 个 noface(20509)。测试 40/40。
- 未渲染 market.html / market-scan.html、未发布、未新增定时任务、未重开详情页取价。
- **待用户裁定（本轮未动）**：`base-icons.json` / `base-heroes.json` 的 `version` 字段恒为空串，而契约要求写 `"Icon"` / `"Hero"`（09-17 起长期偏差；下游按文件而非该字段区分版本，故无外部症状）。修法需改采集器 `mk()` 并重跑采集。
- 下次要点：① 先试 1–15 页，被 403 后按 75s/150s 退避两次即止；② 结束前必核对渲染页头「FC27 英雄卡 N 张」是否等于 `base-heroes.json` 的卡数（不等于就是又重复计账）；③ 新增英雄名先查 FC26 英雄台账译名。

## 2026-09-20（第 4 次记录，状态 partial）— 抓到两个「静默错」级缺陷并修复其一
- runId `7101b6da-badc-4cb5-bf00-151a806bb53d`，19:44:01Z 启动、19:52:32Z 提交 `partial`（deadline 19:59:01Z 内，全程 8.5 分钟）。通道 `browser-triage` OK，未自愈。
- 采集：`/27/players` 仍只读通 1–10 页（300 行），**11–26 页全 403**；按契约退避 120s、180s 各重试 1 次（共 2 次，上限）均 403 → 停手。台账补全生效：131 张 Icon（102 张带列表价、29 张空价）+ 50 张英雄卡。
- **缺陷 1（已修，重要）**：`collect-icons-list.mjs` 的 `parseCoins` 用整串锚定正则。2026-09-20 FUTBIN 行结构变化后，价格单元格 innerText 变成「币价\n…\n涨跌徽标(如 14.29%)」多行串 → **300 行只有 50 行解析出价**（consoleValid 12 / pcValid 16 是这个缺陷的失真低值，不是真实行情）。修法 = **价格取首个非空行**，丢弃涨跌徽标行。已用本轮实测原始串离线验证：`6M\n…14.29%`→6000000、`11.57M…`→11570000、`15M`→15000000、`0`→0。同日 market 任务在 `fetch-players-pages.mjs` 独立修过同源问题，口径一致。
- **缺陷 2（已修，待用户裁定）**：`collect-icons-list.mjs` 的 `LAUNCH_DATE` 曾被改成 `2026-09-18`（注释称「2026-09-19 用户明确口径」），与根 AGENTS.md、`prompts/icons-heroes.md`、MEMORY.md、09-17/18/19 三份快照（均 2026-09-25）冲突，并会把当日快照 priceBasis 由 `listing-estimate` **静默翻成 `market`**（首次提交时已实测发生），触碰「开服前不计算日环比与累计涨跌」红线。已改回 2026-09-25，快照确认为 listing-estimate。**其余 4 个脚本（collect-icon-priceranges / record-icons-daily / build-icon-research / build-same-period-advice）仍带 2026-09-18 常量，本轮未动**，需用户一次性裁定后全局同步。
- 复跑验证受限：修好解析器后复跑（19:51:20Z）26 页**全部被拦、0 行**，修复无法在活数据上验证，只能离线验证（已通过）。⇒ **下次要点：若当轮已被 403 打满，别指望同轮复跑来验证解析改动，直接用已存原始串离线验证。**
- 产物：`daily/2026-09-20.json`（131 张、有效价 113、Console 112/PC 75、区间 131/131、无涨跌字段）、`reports/daily/2026-09-20/icons-heroes.html`（334,370 B、SHA-256 `66032ee6…`）；头像 传奇 131/131、英雄 48/50；backfill 两轮（渲染前+后）2 个缺口均为 `noface`（20886 / 21437），0 新增，如实不出图。测试 38/38 通过。
- 未渲染 market.html / market-scan.html、未发布、未新增定时任务、未重开详情页重复采价（当前价一律按 cardId 读 `current.json`）。
- 坑（新）：`run-state finish` 是**终态、拒绝二次提交**（报「运行所有者不匹配或已经结束，拒绝覆盖」）。因此**证据里的时间戳必须在首次 finish 前核准**（本轮把「复跑」时间估成 19:59Z，实际 19:51:20Z，事后只能改盘上 evidence.json，state.json 内嵌副本保留了旧串）。

## 2026-09-19（第 3 次记录，状态 partial）— 403 形态复现；修复采集器「静默缩表」回归
- runId `782473f7-0254-4899-bd03-92eb4fef22e2`，20:27:52Z 启动、20:36:48Z 提交 `partial`（deadline 20:42:52Z 内，未触 20 分钟硬上限，全程约 9 分钟）。
- 通道：`browser-triage.mjs` → OK（独立 profile 9333，exit 0，未自愈）。
- 采集：`/27/players` 第 11–26 页全 403（与 09-18 同形）；退避 150s、200s 两次重试仍 403（契约上限 2 次），停手。得 10 页 300 行 → 台账内 **102 张带当日列表价、29 张空价**；英雄卡 **50/50 全采到**。
- **本轮修复（最重要）**：`collect-icons-list.mjs` 原先只写「采到的行」→ 被 403 截断时当日台账从 131 **静默缩到 102**（09-17/09-18 均 131）。现改为「采到的行 + 未采到的台账卡以空价保留」，只取卡库台账为名单基准，价一律 0/valid=false。**回填无需重翻全量**：`--from-page 26 --max-page 26 --merge`（单页低负载，约 15 秒）→ 立刻得到 131 张。
- 产物：`daily/2026-09-19.json`（131 张、有效价 106、Console 104/PC 65、区间 131/131）、`reports/daily/2026-09-19/icons-heroes.html`（335,756 B、SHA-256 `a1b2ef28…`）、base-icons 131 / base-heroes 50（中文名 131/131、50/50）；头像 传奇 131/131、英雄 48/50（Márquez 21587/21600 无本地图）；backfill 3 个 noface、新增 0。
- 未渲染 market.html / market-scan.html、未发布、未新增定时任务；测试 38/38 通过。
- 下次要点：① 若 11+ 页仍 403，只跑退避重试即止，别加码；② 结束后**务必核对 `daily/<D>.json` 卡数 = 131**（=台账），不等于 131 说明写出路径又退回「只写成功项」；③ 英雄 2 张无图属来源缺图，不要试图补。

## 2026-09-18（第 2 次记录，状态 partial）— 首次拿到当日英雄卡数据
- runId `bd2ebc99-0330-4c5a-bad2-50a28b3ce979`，19:10:34Z 启动、19:17:23Z 提交 `partial`（deadline 19:25:34Z 内，未触 20 分钟硬上限）。
- 通道正常：check-deps exit 0。**`/27/players` 本次可读**（09-17 全路径 403 未复现），但**翻页至第 11 页起全部 403** → 属**滚动触发的限流**（首页与 1-10 页同轮可读）。按契约分钟级退避 120s 单次重试仍 403；共 2 次尝试后停止，未秒级密集重试。
- 结果：131 张台账中 **102 张**取得当日列表价；**英雄卡 50 张全部取得双平台价 + 中文名**（与既有台账 50 张数量一致，评分 88–89）。快照 131 张、区间 131/131；页面传奇头像 131/131、FC27 英雄 48/50、FC26 参考 93 张。
- 新增脚本 `apps/market/engine/scripts/collect-icons-list.mjs`（本任务此前无列表页采集器）：页内同源 fetch + DOMParser、每 3 批重建宿主页、`--from-page/--merge/--wait-sec` 支持退避补采、**内置台账收敛**。
- 三条新增实测结论（下次直接用）：
  1. `?version=base_icon` 直连仍是 0 行空表；站内版本下拉是纯 JS 状态，点 `li.searchable-version` 后列表不变、无可提交 Apply → **版本筛选路线不可用**，只能翻页 + 行内尾标签判定。
  2. 列表页带 `Icon` 标签的行数**多于**台账（10 页 199 行，97 行不在台账内）→ 必须用 `fc27-icons-playstyles.json`（131）收敛，否则污染 base-icons.json 与逐小时快照。
  3. 尾标签要按后缀匹配（`Base Heroes`/`Debut Icon`/`Icon`）；按空格切分会把多词姓名切给标签。
- backfill-avatar-keys 判定 181 个 cardId 全部可解析、无需补全；渲染侧 48/50 的差异在于渲染还要求本地图片文件存在（Márquez 21587/21600 两个名目无图，如实不出图）。
- 下次要点：① 先单次试 `/27/players`；② **控制翻页节奏**，页 1-10 后主动分批间隔，被 403 后按分钟级退避且不超 2 次重试；③ 补采直接用 `collect-icons-list.mjs --from-page N --merge --wait-sec <秒>`；④ 缺的 29 张卡当前价不影响展示（current.json 已覆盖），不必重复开详情页。
