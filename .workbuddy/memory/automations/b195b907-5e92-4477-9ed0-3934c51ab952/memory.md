# 市场监控 自动化执行记录

## 2026-09-16（首次记录）
- 状态：**failed**
- runId：`4d4ee634-7252-4c9e-a0c9-e44282d3ad3a`
- 失败原因：Chrome 插件 extension 通道不可用（init 返回 RelayUnreachable / 缺 DUMATE_HOST_URL；doctor relay.connected=false、extConnected=false、mode=cdp；NativeMessagingHosts 缺 com.workbuddy.extension.json；Chrome 未开 remote-debugging-port）。
- 处置：按契约未回退 IAB、未用旧日期/FC26 数据填充，四段概览与扫描维度均如实空状态。
- 产物：`reports/daily/2026-09-16/market.html`（概览）+ `market-scan.html`（扫描），均带 FAILED 徽标；证据 `automation/runs/2026-09-16/market/evidence.json`、结构 `.../market/market.json`。
- ~~需用户侧修复：接通 Chrome 扩展与 WorkBuddy 桌面端 native messaging 宿主~~ —— **该建议作废，见下方更正。**

## 2026-09-16 13:40 更正（覆盖上文）
- **WorkBuddy 桌面端 v5.5.6 根本没有实现 `com.workbuddy.extension` 原生消息宿主**（`app.asar` 中 `connectNative`/`NativeMessaging`/扩展 ID 命中数全为 0），属产品侧缺口，用户侧无法修复；该扩展已在用户机器上禁用。不要再排查或配置它，也不要用 Chrome 插件 / `extension` 模式。
- **现行唯一通道 = `Web Access（浏览器自动化）` 技能**（CDP Proxy :3456 直连用户日常 Chrome）。前置开关 `chrome://inspect/#remote-debugging` 已开启且**跨重启持久**（`Local State → devtools.remote_debugging={"user-enabled":true}`，端口 9222）；`config.env` 已固化 `WEB_ACCESS_BROWSER=chrome`。
- 自检：`node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → exit 0 才继续。FUTBIN 拒绝 curl/WebFetch（403），必须走 CDP。
- 同日重跑用 `node automation/run-state.mjs begin market D --rerun`；`finish` 硬上限 `startedAt + 20 分钟`。
- 2026-09-16 13:30 重跑结果：提交 `partial`，三份产物齐全；传奇快照 131 张 / 有效价 97 / `listing-estimate`。实测开服前 `pc_price` 三档筛选页返回 0 行，是筛选失效而非「无卡」。

## 2026-09-17 03:00 调度（runId 5ffd24f4）
- 状态：**partial**（03:28:58 提交，快照 SHA-256 b56ed319…）。
- 通道：check-deps exit 0（Chrome 9222），CDP 正常。
- 关键发现：**FUTBIN 已开始滚动更新 FC27 双平台实价**——/27/popular 250 张唯一卡中 Console 有效价 193 / PC 197（昨日全为 0）。明日基线已存在，可评估是否恢复日环比（注意 launchDate=2026-09-25 未到，契约措辞需再核）。
- 采集：/27/popular（250 卡，双平台价+热度计数 .xxs-font.bold）、/27/popular/evolutions（500 卡，含 .og-pill 进化名，无价格单元格）均成功；**/27/players 三次间隔重试（03:18/03:22/03:24，含建会话+60s 退避）均 403 拦截页**，价格分层/价格维度如实空状态。
- 落库：market.json players[] 750 条（250 热门 + 500 进化，URL 去重），psPrice/pcPrice 分开，platform=console+pc；priceBasis=partial-live。
- 踩坑：① market.json 组装时漏写 overview 键导致概览全空（已补）；② evidence/market.json 的 openedAt 误写成 2026-09-16T19:xx+08:00（=UTC 上午，早于 startedAt 被 finish 拒收「复用旧证据」），正确写法 2026-09-17T03:xx+08:00。
- 产物：reports/daily/2026-09-17/market.html + market-scan.html；evidence 同目录。

## 2026-09-18 03:00 调度（runId 0991f958）
- 状态：**partial**（03:35:51 提交，快照 SHA-256 b0311d2e…，在 20 分钟硬上限内）。
- 采集：/27/popular 250 卡（Console 有效价 185 / PC 168，priceBasis=partial-live）、/27/popular/evolutions 500 卡成功；**/27/players 页 1-4 页内 fetch 与退避后单次重试均 403**（03:00 窗口时限性拦截，与 09-17 一致），价格分层与价格维度如实空状态；周黑/活动卡候选路由（/totw 等 6 个）实测 404，如实空状态。
- 落库：players[] 750 条（URL 去重 750/750），译名注入 1750/1750 命中、未命中 0（新增 261 条通行音译）；sync-current-market 合并 750 张进 current.json（仅此一次）；头像 backfill +179 键、下载 175 张，渲染后复核 0 缺口（页面 499/500、749/750，同 1 张 noface 源卡）。
- 产物：reports/daily/2026-09-18/market.html + market-scan.html；evidence 同 runs 目录。watchlist 未刷新（时间不足，非阻塞项）。
- 踩坑：assemble 脚本 `new URL('.',import.meta.url)+'../market.json'` 把文件写到了 runs/D/ 上级，注入器「无法读取」；已移正并重跑。291 个未命中实为 261 个唯一 slug（三区重复计数）。

## 2026-09-19 03:05 调度（runId ee1b9a02）
- 状态：**partial**（03:53:20 提交，快照 SHA-256 b090c3b6…，硬上限内收口，未触发重跑）。
- 采集：/27/popular 250 卡（Console 有效价 184 / PC 183，priceBasis=partial-live）、/27/popular/evolutions 500 卡成功（首轮导航即成，无退避）。
- **/27/players 本轮实测 200 可访问**（打破 09-17/09-18 连续两日 03:00 窗口 403 的先例）：页 1-4 渲染 DOM 各 30 行共 120 行，价格分层首次有真实数据（≥100万 50 / 30-100万 31 / 10-30万 8 / 1-10万 4，按双平台有效价较大者分档）。
- 关键踩坑：**/27/players 页内 fetch 返回 SPA 壳（无 tbody/table-name）**，必须等浏览器渲染后从 DOM 抽取；行结构 = td.table-name 内嵌 mini playercard（名在 title/文本行、评分在 .playercard-s-27-rating），价格单元格文本首行才是价格（含税收百分比等多行）。
- assemble 输出路径踩坑重演：dir 是 market/ 不是 work/，`dir+'../market.json'` 会写到 2026-09-19/ 上一级，注入器「无法读取」→ 改 `dir+'market.json'` 重跑。
- 译名：未命中 429（去重后 ~147 唯一 slug，三来源区重复计数），一次性补 145 条 → 命中 1843/1843、未命中 0。
- sync-current-market 合并 750 张进 current.json（本轮唯一一次当前价写入）；头像 backfill 787 cardId、新增 109 键 / 108 图，渲染后复核 0 新增缺口（概览 589/593、扫描 746/750，缺口为 noface 源卡如实无图）。
- watchlist 未由本任务刷新（非阻塞项；03:0x 每小时任务已写过 watchlist.json + publish-hourly.json）。
- 证据：automation/runs/2026-09-19/market/evidence.json（其中「run-state 时限」一条为预判超时写下的表述，实际 finish 在窗口内被接受、未发生重跑，以本条为准）。

## 2026-09-20 03:05 调度（runId 042921bb）
- 状态：**partial**（03:25:32 提交，快照 SHA-256 038e4197…，硬上限内收口）。
- 采集：/27/popular 250 卡（Console 有效价 204 / PC 186，priceBasis=partial-live）、/27/popular/evolutions 500 卡均首轮成功；**/27/players 页 1-4 实测 200**，页内 fetch 共 120 行（Console 有效价 99 / PC 77），价格分层 50/25/8/4。/27/totw、/27/promos 实测无内容，如实空状态。
- **关键踩坑：FUTBIN /27/players 行结构变化**——价格单元格改 `div.price` + `div.price-diff`（涨跌徽标），`td.table-name.innerText` 变「评分/姓名/版本标签」三行。旧解析全部失配（psPrice 全 0、姓名取成评分）。已写修正版 `fetch-players-pages.mjs`（work 目录）按新结构重抓。另：注入浏览器的辅助函数不要包 IIFE（外层拿不到 → 代理返回空对象）。
- 译名：新增 96 条（含检索核实的彭逸翔/塞尔吉尼奥），命中 1837/1837、未命中 0。
- sync-current-market 合并 750 张进 current.json（本轮唯一一次）；头像渲染前 +97 键/91 图、渲染后 0 新增缺口（概览 582/587、扫描 745/750，缺口为守卫拒绝/noface 源卡，如实空状态）。
- 附加：watchlist 构建 + market-watch.html 渲染已跑（非阻塞项），未触碰 market.html 与 run-state。

## 2026-09-21 03:13 调度（runId 37a347ba）
- 状态：**partial**（03:24:43 提交，快照 SHA-256 c5c737ea…，硬上限内收口）。
- 通道：browser-triage OK（独立 profile 9333），三路采集全部首轮成功：/27/popular 250 卡（Console 有效价 198 / PC 177）、/27/popular/evolutions 500 卡、/27/players 页 1-4 共 120 行（validPS 105 / validPC 78）。priceBasis=partial-live。
- 译名：未命中 158 唯一 slug，一次性补 158 条 → 命中 1833/1833、未命中 0。
- 扫描名单：574 行唯一基础 cardId（排除 10 张 Hall of FUT，今日池新增 Doumbia/Guarin；09-20 的 5 张 Icon/Hero 卡不在今日榜单）。价格索引照旧走客户端 current.json。
- 头像：补全 115 键/113 图；概览 581/583、扫描 572/574，缺口 2 张（Franco 12014 / Banda 19000，CDN 无头像图，如实空状态）。
- current.json 合并 750 张一次；sync-current-market 同时合并了周黑 30 / 英雄 50 / 传奇 131（既有逻辑）。
- 附加（非阻塞）：database-columns.html（totw 30 / activity 0 / r83 218）、watchlist 构建 + market-watch.html 渲染均已跑。83+ 补采（collect-r83-prices.mjs）本轮未执行，已记入 notes。
- run-state begin 注意：`D` 字面值会被拒（「无效日报日期」），必须传实际日期 2026-09-21。
