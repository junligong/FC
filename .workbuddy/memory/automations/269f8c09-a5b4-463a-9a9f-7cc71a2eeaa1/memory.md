# 自动化执行记录 · FC汇总发布（269f8c09）

## 2026-09-16（首次执行）
- 日期 D=2026-09-16（Asia/Shanghai）。
- 执行：`node automation/coordinate.mjs 2026-09-16` → 返回 `merge=no_current_snapshot`、`publish=skipped`。
- 原因：四个采集模块（football/news/market/evolution）本轮全部 `failed`——Chrome 插件 extension 通道不可用（RelayUnreachable 缺 DUMATE_HOST_URL / relay 未连通 / native messaging 宿主 com.workbuddy.extension.json 未注册 / 日常 Chrome 未开远程调试端口）。
- 处置（符合契约）：无有效快照可合并 → 不发布 → 保留线上旧版本（2026-09-15 内容，未下线、未换入口）。
- 复核：`node automation/verify-publication.mjs 2026-09-16` 退出码 1，线上 sha256=3f4a95d1… 与本地 daily-merged/index.html 逐字节一致（即旧版 09-15 完好），无 09-16 归档链接。
- 记录：`automation/publish-status-2026-09-16.json`（published=false，原因与模块状态已写明）。
- 待用户侧修复：将 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主），否则后续每日采集仍会失败、无法合并发布。

## 2026-09-16 12:40 补充（用户指定「仅发布」）
- 用户当日更新契约与生成器（AGENTS.md/coordinate/merge_daily_report/dashboard 等），并自行重建 `daily-merged/`（12:35，标题 `FC27情报台 · 2026-09-16`）。
- 按用户指令仅执行发布：WorkBuddy 站点发布 `daily-merged/`（updateExistingApp，入口 index.html），未采集/未跑 coordinate/未开浏览器。
- 结果：发布成功，链接 `https://fc27-site.app.workbuddy.host/` 不变；`verify-publication.mjs 2026-09-16` 退出码 0，四检全过。
- 哈希：index `cf29de7c…b3f6`；archive/2026-09-16.html `cd045855…9606`（均本地=线上）。

## 2026-09-16 13:40 更正（覆盖上文「待用户侧修复」结论）
- **上文「将 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主）」的修复建议作废。** 逐字节核查确认：WorkBuddy 桌面端 v5.5.6 根本没有实现 `com.workbuddy.extension` 原生消息宿主（`app.asar` 中 `connectNative`/`NativeMessaging`/扩展 ID 命中数全为 0），属产品侧缺口，用户侧无法修复；该扩展已在用户机器上禁用。
- **「本任务 failed」通常不是独立故障**：`coordinate.mjs` 只统计 `['football','news','market']` 中有 `snapshotPath` 的模块（`evolution` 是可选项，不参与计数），三者全无快照时 `merge='no_current_snapshot'`、`publish='skipped'`（**有意设计**，拒绝空状态页覆盖线上站点）。遇到本任务失败**先查采集任务的浏览器通道**。
- `coordinator-state.json` 的 `unattendedPublishingVerified` 字段**恒为 false**，是 `coordinate.mjs` 的既定写法，**不代表发布失败**，不要误判。发布状态的权威记录在 `automation/publish-status-D.json`。
- 同日重开：`node automation/coordinate.mjs D --prepare-rerun` → `node automation/coordinate.mjs D --rerun`。
- 发布参数：本目录含 `index.html` 与 `archive/*.html` 多个 HTML，发布时须显式指定 `entryHtml: "index.html"`，并带 `updateExistingApp` 保持公开链接不变。
- **边缘缓存坑**：发布后根路径可能出现多版本缓存轮询，而显式路径 `…/index.html` 立即命中最新版；verify 失败先别改代码，隔几分钟重采样根路径（约 3–4 分钟收敛）。
- 2026-09-16 13:37 实测（浏览器通道修复后重跑）：`merge='success'`、`failedPanels=0`，index 1,357,132 B / SHA-256 `2df002f6…cbdc`，`verify-publication.mjs` exit 0，线上与本地逐字节一致。

## 2026-09-16 16:25 改版后重新合并发布（成功）
- 触发来源：用户要求对 FC27 市场做三项重构（补 PC 平台 + 平台切换按钮 / 传奇英雄内容迁入「传奇/英雄专栏」/ 新建独立的传奇英雄监控任务）。改完渲染器与 portal 后需重合并发布。
- 关键前提：`coordinate.mjs` 只读不可变快照，改渲染器后必须重提快照，否则线上仍是旧版式。
  - market 重提：prepare-rerun → begin → CDP 实机重开 FUTBIN 三个来源页（记录真实 openedAt 与探针结果）→ 重渲染 → finish partial（sha `d9e7a5bf…`）。
  - icons-heroes（新模块）首轮 + 改版重提各一次 → finish partial（sha `a2aa575e…`）。
  - football / news / evolution 报告未变，沿用原快照。
- 合并：`merge=success`、`failedPanels=0`、index sha `8b9c6b00…`。
- 发布：`workbuddy_sites_deploy`（directory=`daily-merged`，entryHtml=`index.html`，updateExistingApp）→ 链接不变 `https://fc27-site.app.workbuddy.host/`。
- 核验：`verify-publication.mjs 2026-09-16` **exit 0**，四检全过，本地=线上 26,497,051 B。
- 站点结构实测：市场栏子标签 = 概览/扫描；传奇/英雄专栏子标签 = 传奇/英雄监控/传奇卡研究；两页各有 Console/PC 平台切换（plat-btn 27 个、pv-console 674 个）。
- 新任务：WorkBuddy 定时任务 `FC·传奇英雄监控`（id `1868689f-2406-48be-9ec5-fa1880181daa`，每日 03:00），promptFile `automation/prompts/icons-heroes.md`。
- 本任务（汇总发布）本身无独立故障；本次为派生需求，正常执行即成功。

## 2026-09-16 17:00 第 6 轮需求（双平台口径落地）——本轮未重新合并发布
- 用户新需求：市场监控与传奇/英雄卡监控都要覆盖 PC 与主机（Console）平台，并写进 `AGENTS.md`。**属契约层优化，不改当日报告数据**。
- 核查结论：`AGENTS.md`（FUTBIN 平台口径强制规则 + 6 个定时任务表）、`prompts/market.md`、`prompts/icons-heroes.md`、`apps/market/AGENTS.md`、`task-definitions.json`、以及两个 WorkBuddy 任务 prompt（`FC·市场监控` b195b907 / `FC·传奇英雄监控` 1868689f）**均已含双平台要求**，无需再改。
- 修复：`render-market-overview.mjs` 丢失的 `const PTOTAL` 声明（会让市场概览在次日 03:00 整体渲染抛错，market 无快照 → **本任务会被连带判失败**）；平台提示改三态（齐备 / 单边缺失告警 / 全零估值）。回归 36 例全绿。
- 本轮**没有**重跑 `coordinate.mjs`、没有重新发布：当日 09-16 站点已于 16:27 发布并核验通过，本轮改动不影响报告数据；09-16 市场概览与修好的渲染器仅差平台提示一句话，按快照不可变约定留待次日生效。
- `verify-publication.mjs 2026-09-16` 复核 **exit 0**：四检全过，本地=线上 sha `8b9c6b002386…`，26,497,051 B，链接仍为 `https://fc27-site.app.workbuddy.host/`。
- 经验：改生成器后**务必先跑回归**——本次若不跑，次日市场采集会以一个必崩的渲染器上线。另：bash `grep` 对含中文的多分支正则会失配（曾误判 `AGENTS.md` 缺章节），必须用 Grep 工具复核。

## 2026-09-17（常规每日执行，成功）
- 日期 D=2026-09-17（Asia/Shanghai）。流程：`coordinate.mjs 2026-09-17` → `merge=success`、`failedPanels=0`、index sha `d0a490c3…bff04`；`workbuddy_sites_deploy`（updateExistingApp + entryHtml=index.html）发布 daily-merged/；`verify-publication.mjs` exit 0 四检全过，本地=线上 11,781,323 B，链接不变 https://fc27-site.app.workbuddy.host/。
- 模块状态：football/news/market/evolution 均 partial（有真实快照）；icons-heroes **failed**（FUTBIN `/27/players` 全路径 403，含 /26/players 对照、会话建立、/click 自然导航、带 referer、分页参数、独立标签页 14 秒退避均被拦；对照 / 与 /27/popular、球员详情页正常 → 判定来源侧拦截非通道故障）。该模块按契约如实空状态、未用旧数据填充、未写逐日快照（record-icons-daily.mjs 以昨日 base-icons.json 为输入会生成虚假当日快照，主动跳过）。
- 注意事项：icons-heroes 报告还暴露出渲染器既有缺陷（英雄区块会读 heroes/data/prices/fc26/ 混入 93 张 FC26 英雄卡；today 回退最近快照且无「本日无新采集」标识），建议单独修正渲染器英雄数据源约束——与本次发布无关，属遗留项。
- 修正：`publish-status-2026-09-17.json` 的 `reason` 原为脚本既有写法「发布触发方式未确认」，已改为明确记录本轮实际经 workbuddy_sites_deploy 发布并复核。

## 2026-09-17 10:20 修复 icons-heroes 后重新合并发布（成功）
- 用户指令：FC26 仅作参考对比 + 体检全部任务 + 修复失败任务。6 个定时任务调度配置全 ACTIVE，唯一失败项 icons-heroes。
- 渲染器修正（重提快照前置条件）：`render-icons-heroes.mjs` 英雄数据按代际分流（fc27 进台账，fc26 单列「FC26 参考对比」折叠区）；`render-market-icons.mjs` 当日无快照时显示 `STALE · 本日无新采集` 徽标，不再静默回退冒充当日。回归 36/36。
- icons-heroes 重跑（runId 213a542c，partial）：/players 403 已解除；`page` 参数会话建立后有效；`td.table-name` 版本标签判定归属；131 张台账传奇 131/131 命中 + 50 张 Base Heroes；快照 `daily/2026-09-17.json` 落库。
- 合并发布：`--prepare-rerun` + `--rerun` → merge=success（五模块全 partial，failedPanels=0）→ 发布 → **根路径边缘缓存 9 分钟未收敛（较既往 3–4 分钟更久），重部署一次后 90 秒收敛** → verify exit 0，SHA `8d1c0e41…`，12,027,110 B。
- 契约同步：prompts/icons-heroes.md 新增 FC26 口径与 403 处置策略两节；task-definitions.json bootstrapPrompt 同步。

## 2026-09-17 11:02 中文翻译落地后重新合并发布（成功）
- 触发来源：用户要求「市场扫描球员给中文翻译并加到自动化任务」「FC27 资讯翻译成中文」，随后「继续执行」。属**派生需求**，本任务（汇总发布）本身无独立故障。
- 前置：四模块需重提快照（改渲染器/报告后只改 reports/ 下 HTML 不会更新快照）。四模块各自 `begin --rerun` → **本轮真实重开来源页**（契约要求 openedAt ≥ 本轮 startedAt）→ 重渲染 → `finish partial`。
  - news `492e3d7b`（sha de261287，123,397 B）：重开 16 个 X 账号核验可达；译文文件补齐 71 条，「待翻译」计数 0。
  - market `08a0f112`（sha 0030e493，28,229 B）：重开 /27/players（首访经 Cloudflare 挑战约 30s 通过）、/27/popular、/27/popular/evolutions；players 750/750 带中文名。
  - evolution `f1bb9f35`（sha 878eee24，298,327 B）：重开 /27/popular/evolutions、/27/evolutions、/27/evolutions/expired、/27/players；进化榜 500/500 带中文名。
  - icons-heroes `0b22fe34`（sha 3f1154af，194,410 B）：重开首页 + /27/players?page=2/8/12；修复台账 15 条英文名 UTF-8 乱码（latin1→utf8 反解）。
- 合并发布：`--prepare-rerun` + `--rerun` → merge=success、failedPanels=0、index sha `83f8c016…`（12,118,761 B）→ sites 发布（domainPrefix=fc27-site、entryHtml=index.html、updateExistingApp）→ `verify-publication.mjs` **exit 0**，四检全过。**本次根路径无边缘缓存滞后，立即收敛**（既往需 3–9 分钟）。
- 契约同步：根 AGENTS.md 新增「中文译名强制规则」整节，并修正两处过期事实（`page` 参数实际有效；「开服前两平台价均为 0」已被 partial-live 推翻）；apps/market/AGENTS.md、apps/news/AGENTS.md、prompts/{market,news,evolution}.md、task-definitions.json、WorkBuddy 三个定时任务（资讯采集 30296b95 / 市场监控 b195b907 / 进化专栏 f366055d）提示词全部同步。
- 经验：`coordinate.mjs` 对 football/news/market 只认 **run-state 快照**（校验 sha256），对 evolution/icons-heroes 这类可选面板优先用 sha 匹配的快照、不匹配才回退当日文件。所以**任何报告改动都必须重提快照**，否则站点会静默回退到旧版。

## 2026-09-17 15:40 球员头像全站接入后重新合并发布（成功）
- 触发来源：用户要求「主页所有和球员相关的监控都加上球员图片」。属派生需求，本任务本身无独立故障。
- 前置：market / evolution / icons-heroes 三模块重提快照（各 `prepare-rerun` → `begin --rerun` → **本轮真实重开 FUTBIN 来源页** → 重渲染 → `finish partial`）。其中 market 与 evolution 因当日又做了一轮头像解析器修复各重跑两次。
- 阻断项与处置：首轮渲染发现 **6 张头像配错人**（FC26 跨代卡 ID 混入 FC27 头像索引 + 只按「姓」兜底命中同姓球员）。修 `player-avatar.mjs`（姓名词元双向包含守卫）、`render-icons-heroes.mjs`（FC26 参考区不出图）、`backfill-avatar-keys.mjs`（排除 `heroes/data/**/fc26/**`）、清理 `avatar-index.json` 59 条跨代映射，再重跑补全补回 23 条映射，最后重渲染三模块并重提快照。**结论：任一渲染器改动后不要只重提受影响模块的快照，共享解析器（`shared/lib/*`）改动会影响全部渲染器，四份产物都要重出、三个模块都要重提。**
- 合并发布：`--prepare-rerun` + `--rerun` → merge=success、failedPanels=0、index **22,441,726 B**、sha `fcd74363…` → sites 发布（domainPrefix=fc27-site、entryHtml=index.html、updateExistingApp）→ 链接不变 https://fc27-site.app.workbuddy.host/。**显式 `/index.html` 与本地逐字节一致**（当日线上校验以此为准）。
- 边缘缓存：本次根路径仍停留在上一版（12,118,761 B / sha `83f8c016…`），属既知 3–9 分钟收敛现象，不是发布失败。**verify-publication 报 not verified 时，先单独 curl `/index.html` 比对哈希再判失败。**
- 体积：单文件站点新增约 10.3 MB（1941 张 48×48 头像内联为 data URL）。历史上本站点曾达 26.5 MB，仍在可接受区间；若后续继续膨胀，需评估按需缩略或外链策略。
- 线上核验明细（本轮）：`/index.html` 22,441,726 B / sha `fcd74363…` **与本地逐字节一致**；`/archive/2026-09-17.html` 22,441,676 B / sha `5a010c83…` **也一致**；根路径 `/` 在发布后 9 分钟内持续返回上一版（12,118,761 B / sha `83f8c016…`），已按既往做法再部署一次仍未立即收敛。**结论：判"发布是否成功"只看显式路径与归档页，根路径滞后不代表失败，也不要因此反复重发超过 2 次。**

## 2026-09-18（常规每日执行，成功）
- 日期 D=2026-09-18（Asia/Shanghai）。流程：`verify-football-boards.mjs 2026-09-18` exit 0（射/助榜覆盖 epl/laliga/seriea/bundesliga/ligue1/mls/saudi/ucl，mls_east/mls_west 为分区键属预期提醒）→ `coordinate.mjs 2026-09-18` `merge=success`、`failedPanels=0`、index sha `f94a3f03…b7516`、27,167,347 B、`publish=delegated` → `workbuddy_sites_deploy`（updateExistingApp + entryHtml=index.html + domainPrefix=fc27-site）发布 daily-merged/ → `verify-publication.mjs 2026-09-18` exit 0 四检全过，本地=线上逐字节一致（SHA 双方均 f94a3f03…），链接不变 https://fc27-site.app.workbuddy.host/。**本次无边缘缓存滞后，立即收敛。**
- 模块状态：五模块全有真实快照——football partial / news success / market partial / evolution partial / icons-heroes partial。market 的 `/27/players?page=1..4` 与 icons-heroes 的 `?page=11..26` 本轮仍被 FUTBIN 403 拦截（分路径/会话级反爬），均按契约如实空状态/留空、未用旧数据填充；译名 1750/1750、头像补全 +179 键。
- `assets/data/current.json`（1,183,440 B）已随目录生成并随站点部署；本轮只复制未做任何价格二次分析。
- 收尾：`automation/publish-status-2026-09-18.json` 的 `reason` 由脚本默认「发布触发方式未确认」改为明确记录本轮实际经 workbuddy_sites_deploy 发布并复核。
