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
