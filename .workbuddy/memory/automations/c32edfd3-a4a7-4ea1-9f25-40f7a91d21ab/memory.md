# market-hourly 自动化运行记录

## 2026-09-18 17:00（17 点整点，修复后首轮）— 成功（含重合并 + 重发布）
- 首轮走「6a 重合并 → 6b 发布」新链路，**修复生效**：本地与线上 `index.html` 均为 `追踪卡数 1,265` + `10 个观测点（01–17 时）`，02:03 冻结痕迹消失。发布核对已按新口径加验「页面正文构建期字段」，不再只验 `current.json`。
- 通道 triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 175 / PC 168 有效价）、进化榜 500 张全有热度。
- `current.json` 1450 张、generatedAt `09:00:41.220Z`（北京 17:00:41）；幂等合并复核通过 —— 同相位「传奇价格区间」T16 写入的 131 条 card-scope priceRange 完整保留。
- watchlist：watch 273 / undervalued 97 / trending 199 / hotEvo 500；hourlyPoints 10（缺 16 点：无快照也无 failed 留证，属相位跳过）。Top3：安东尼·戈登 90、格雷茨卡 85、斯彭斯 84。
- 相对 T15：Console 中位 0.00%、PC 中位 +1.00%，无 ≥40% 大幅变动；热度中位 0.00%（Rodri +70.6% 领涨）。
- 译名补 4 条后未命中 0（词库 1054→1058）。`ben-bobzien` 中文源分歧，已取两源一致的「本·博布齐恩」并留痕。
- 线上 `current.json` 首查 200 且 generatedAt 一致，`retryCount=0`；已记 `publish-hourly.json` T17。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-18 16:18（用户报障，非定时轮次）— 修复「线上关注列表内容冻结」+ 时间戳改为客户端实时
- **用户报障**：线上页头显示「生成于 2026-09-17T18:03:56.883Z · 逐小时快照 2 个观测点（01–02 时）· 球员头像 127/140」，即停留在 **T02**（北京 02:03）。
- **根因（已用证据确证）**：`daily-merged/index.html` 是把各栏目 HTML **整体内联**的单文件产物，由**每日 03:35** 的 `merge_daily_report.mjs` 生成。当日该文件建于 **03:55**，而 T03 在 **03:57** 才落盘 → 合并消费的是 **T02** 那版渲染。此后每小时第 ⑥ 步只重传这份 03:55 的 `index.html`，**第 ⑤ 步渲染的 `reports/daily/D/market-watch.html` 根本不会被上传**。
- **为什么以前没发现**：价格单元格走客户端按 cardId 读 `assets/data/current.json`，所以价格是活的；只有页头、统计卡、五张榜单、关注分、头像数被冻结。形成「只有价格是活的」这种最易误判的形态。此前各轮「发布成功」只核对了 `current.json`。
- 对照证据：线上内联 `782 / 243 / 239 / 223`、`2 个观测点`、`127/140` ↔ 本地 T15 渲染 `1,266 / 275 / 266 / 252`、`9 个观测点（01–15 时）`、`134/140`。
- **修复 1（渲染器，永久有效）**：`render-market-watch.mjs` 新增
  - 页头 `生成于 <baked>` → 拆为「**行情更新于**（客户端实时，读 `doc.generatedAt`）」+「名单生成于（baked）」；
  - 新增「**更新于**」列（`<span class="live-time" data-card-id>`），页面加载时读 `current.json` 的 `updatedAt`/逐平台 `observedAt`/`popularityObservedAt` 取最大者，显示北京 HH:MM、悬浮显示完整时间；
  - 价格单元格加 `title` = 该平台 `observedAt`。
  - 已用 DOM stub + fetch stub 实测：页头 `2026-09-18 15:55:59 北京`、行内 `15:55`、价格 `25.4万` 且悬浮正确。`node --test` 四套件 **38/38 通过**。
- **修复 2（发布链路）**：第 ⑥ 步改为 **6a 先重合并**（`FC_PROJECT_ROOT=… node apps/portal/merge_daily_report.mjs D`，**实测 1.6 秒**）→ **6b 再发布**。该脚本**无锁**，与带当日排他锁的 `coordinate.mjs` 不同，可每小时安全重跑；且**不写入任何受 `run-state` 快照校验的产物**（已核 `automation/run-state.mjs` 的 `outputs` 只含 news/football/market/evolution/icons-heroes，`summary.html`/`market-watch.html`/`market-scan.html` 均不在内）。
- 契约已同步：`AGENTS.md`「每小时行情任务」段 + `automation/prompts/market-hourly.md` 第 6 步 + 产物表 + 时间预算（三处口径一致）。
- 操作留痕：改前已备份 `daily-merged/index.html` 与 `archive/` 到 `/tmp/fc-daily-merged-backup-20260918`（147 MB）。重合并重建 7 篇历史归档，`index.html` 26.0 MB。
- 发布：应用与链接不变，线上 `index.html` 首查即已是 T15（含 `9 个观测点`、`>1,266<`、新时间戳，旧 02:03 已消失），`current.json` 200 且 `generatedAt` 一致。
- **未做（待用户定）**：`market-scan.html` 的逐行「更新于」需要**成对**改 `render-market-report.mjs`（每小时）与 `render-market.mjs`（每日）两个渲染器，只改一个会被另一版式覆盖，本轮未动。

## 2026-09-18 15:55（15 点整点）— 成功（含发布）；13 点失败连续两轮未复现
- 浏览器自检 verdict=OK、exit 0、无自愈动作（独立调试 profile 9333 通道健康）。
- 采集一次成功（第 1 次导航即成功，无 403）：热门榜 250 张，Console 有效价 177 / PC 有效价 173（both 166）；进化榜 500 张全有热度。
- current.json：1450 张卡、generatedAt 2026-09-18T07:55:59.756Z（= 北京 15:55:59），daily-merged 镜像一致；幂等合并核对通过（futbin-icon-detail 的 131 条 card-scope priceRange 完整保留，其 observedAt 07:54:05Z 为同相位「传奇价格区间」T15 写入）。
- watchlist：watch 275 / undervalued 96 / trending 201 / hotEvo 500 / pendingPrice 991；universe.tracked 1266、priceValid 275；整点观测 01/02/03/04/06/10/12/14/15（9 点，11 与 13 点缺失属失败占位）。
- Top3：芭芭拉·班达 94 分（挂单价上行 +21.95%）、安东尼·戈登 91 分、格雷茨卡 86 分。
- 相对 14 点观测：306 个可比平台价中位 0.00%，上涨 126 / 下跌 136 / 持平 44；大幅变动以 PC 侧为主且幅度温和（C 罗 PC +41.7%、邓弗里斯 PC +30.0%、James PC −28.6%、巴尔韦德 PC −26.5%）。热度侧 220 个可比点，凯塞多 +83%、安德森 +81%、廷贝尔 +75% 领涨。
- 译名补 4 条（胡安·巴里纳加、布鲁妮尼亚、贾斯汀·莱尔马、刘易斯·邓克；四条均经百度百科/球探体育等权威源核验）后 140/140 命中、未命中 0；词库 1050 → 1054 条、无空值。
- 第 ⑥ 步发布成功（应用「FC27每日情报台」与链接 https://fc27-site.app.workbuddy.host/ 不变），线上 current.json 首次请求即 200 且 generatedAt 与本轮一致，已记 publish-hourly.json T15（保留 T01–T14）。
- 渲染隔离核对：market.html mtime 仍为 03:35（未被本轮触碰）；market-watch.html / market-scan.html 为 15:56。

## 2026-09-18 14:50（14 点整点）— 成功（含发布）；13 点失败未复现
- 浏览器自检 verdict=OK、exit 0、无自愈动作（独立调试 profile 9333 通道健康）。
- 采集一次成功（第 1 次导航即成功，无 403）：热门榜 250 张，Console 有效价 169 / PC 有效价 160（both 155）；进化榜 500 张全有热度。
- current.json：1449 张卡、generatedAt 2026-09-18T06:50:50.346Z（= 北京 14:50），daily-merged 镜像一致；幂等合并核对通过（futbin-icon-detail 的 131 条 priceRange 完整保留，未被覆盖）。
- watchlist：watch 263 / undervalued 95 / trending 199 / hotEvo 500 / pendingPrice 994；整点观测 01/02/03/04/06/10/12/14（8 点，11 与 13 点缺失属正常/失败占位）。
- Top3：C 罗 91 分（挂单价上行 +46.67%）、安东尼·戈登 83（91 分）、安东尼·戈登进化前身 82（90 分）。
- 相对 12 点观测：299 个可比平台价中位 −4.00%，上涨 110 / 下跌 177；大幅变动 Martinelli(PC) +1780%、Pablo Barrios/Matheus Cunha(PS) +100%、Timber +90%、Thuram(PC) +78.8%、Endrick/Dani Olmo +66.7/+64.3%、Mbappé(PC) +55.6%。热度侧 233 个可比点涨跌各半（Malen +139%、Brown +124%、C 罗 +95%）。
- 译名补 8 条（玛丽亚·略雷利亚、阿迪勒·奥希什、扬-菲特·阿尔普、科斯坦蒂诺·法瓦苏利、朱利安·霍尔、乔尔·佩雷拉、杰里米·蒙加、大泽春花）后 140/140 命中、未命中 0；渲染 watch/scan 两页成功（scan 内嵌 750 条 nameZh、0 空值）。
- 第 ⑥ 步发布成功（应用「FC27每日情报台」与链接 https://fc27-site.app.workbuddy.host/ 不变），线上 current.json 首次请求即 200 且 generatedAt 与本轮一致，已记 publish-hourly.json T14。
- 异常留痕（非契约违反）：写入前 publish-hourly.json 已存在 T14 键，但当日 market 目录无 hourly-14-failed.json、watchlist/渲染产物 mtime 均在本轮，14:43–14:47 窗口被「传奇价格区间」T14 占满（其自述未发布）→ 无法回溯该键来源；契约允许同小时覆盖，已按本轮真实结果覆盖 T14 并保留 T01–T12。

## 2026-09-18 13:46（13 点整点）— 失败（热门榜价格源零卡采到，未渲染未发布）
- 浏览器自检 verdict=OK、exit 0、无自愈动作（独立调试 profile 9333 通道健康），故障与通道无关。
- 热门榜 /27/popular 两次导航（首次 + 首页重建会话后 45 秒退避重试）均「等待 45 秒后仍无卡片元素」，0 卡采到，退出码 1；非 403 明示，按红线不追查、不第三次重试。
- 进化榜成功：500 张全有热度，evolutions hourly/daily T13 已落库。
- 按契约未执行 watchlist/译名/渲染/发布；current.json 本轮未被本任务触碰（其 generatedAt 13:41:54Z 为同相位「传奇价格区间」T13 写入，已核实归属）。上次有效结果保留 T12。
- 证据：automation/runs/2026-09-18/market/hourly-13-failed.json。

## 2026-09-18 12:39（12 点整点）— 成功（含发布）
- 浏览器自检 verdict=OK、exit 0、无自愈动作（独立调试 profile 9333 通道持续健康）。
- 采集一次成功，无 403。热门榜 250 张：Console 有效价 165、PC 有效价 155；进化榜 500 张全有热度。
- current.json：1442 张卡、generatedAt 2026-09-18T04:39:21.488Z（= 北京 12:39），daily-merged 镜像一致。
- watchlist：watch 252 / undervalued 74 / trending 187 / hotEvo 500 / pendingPrice 996；整点观测 01/02/03/04/06/10/12（11 点相位跳过，属正常）。
- Top3：安东尼·戈登 83（91 分）、安东尼·戈登（进化前身 82，90 分）、哈里·凯恩 90（90 分）。
- 相对 10 点观测：276 个可比平台价中位 −7.01%，上涨 66 / 下跌 197；大幅变动（≥40%，PC 侧为主）Kundananji +143%、Hemp +63%、马丁内利 +51%。
- 译名补 8 条（卡斯珀·约根森、克里斯蒂安·莫斯克拉、保罗·迪亚斯、卡勒姆·奥黑尔、伊丽莎贝塔·奥利维耶罗、埃利亚斯·拉恩、孙兴慜、宋敏圭）后 140/140 命中、未命中 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（应用与链接不变），线上 current.json 首次请求即 200 且 generatedAt 一致，已记 publish-hourly.json T12。

## 2026-09-18 10:51（10 点整点）— 成功（含发布）；07/08/09 三连败就此中断
- 浏览器自检 verdict=OK、exit 0、无自愈动作；**07/08/09 的通道故障本轮未复现**（与 10:20 不带 URL 的 `open -a "Google Chrome"` 自愈后恢复一致）。
- 采集一次成功，无 403。热门榜 250 张：Console 有效价 157、PC 有效价 163；进化榜 500 张全有热度。
- current.json：generatedAt 2026-09-18T02:52:23.259Z（= 北京 10:52），daily-merged 镜像一致。
- watchlist：watch 237 / undervalued 66 / trending 174 / hotEvo 500 / pendingPrice 997；hourlyPoints 6（01/02/03/04/06/10，07–09 缺）。
- Top3：芭芭拉·班达 93、长谷川唯 92、哈里·凯恩 90。相对 06 点观测：143 张可比卡中位 +7.14%、上涨占比 62.2%，Dani Olmo +122% / 盖约罗 +72% / 马丁内利 −75%；两平台有效价覆盖 191 → 169。
- 译名补 7 条（吕焯毅、乔恩·阿兰布鲁、泰瑞斯·霍尔、琼乔·肯尼、卢卡·兰戈尼、特拉斯科·塞戈维亚、弗朗茨·坦加拉）后 140/140 命中、未命中 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（应用与链接不变），线上 current.json 首次请求即 200 且 generatedAt 一致，已记 publish-hourly.json T10。
- 新增可复用踩坑（已写入项目当日记忆）：① `apply-market-name-zh.mjs` 未命中收敛 0 时**不重写** `work/missing-name-zh.json`，旧清单会残留，收敛判据只认 stdout；② 热门榜快照 `cards[]` **无 cardId 字段**，需从 `url` 的 `/27/player/<id>/` 提取。

## 2026-09-18 09:45（09 点整点）— 失败（浏览器通道不可用，未采集）
- 第三轮连续失败（07/08/09）。check-deps exit 1：Chrome 调试端点 TCP 可连但 DevTools 不响应——`/json/version`、`/json/list` 均 404 空体，浏览器级 WS 升级无响应直至 curl 超时（path 与 DevToolsActivePort 的 GUID 一致）。
- 新增确诊证据（`sample` 采样 PID 49850）：main / Chrome_IOThread / Chrome_DevToolsHandlerThread 三线程**均空闲在 kevent64**（非死锁），即监听 socket 未接入 DevTools 消息泵；Chrome 于 06:04:12 由 launchd 以 `--no-startup-window` 重启（无窗口），此后一直挂死。
- 允许的补救均已穷尽：初次自检、`open -a chrome://inspect/#remote-debugging` 推前台、`pkill cdp-proxy` + 重启代理 + 复跑——全部 exit 1。未 kill 用户 Chrome（不在允许补救清单内）。
- 按红线未采集未渲染未发布；current.json 与线上保留 06 点有效结果。证据：automation/runs/2026-09-18/market/hourly-09-failed.json（含 channelDiagnostics）。
- 待人工：退出并重启 Chrome + 重勾 `chrome://inspect/#remote-debugging` 的调试开关，下一整点自动恢复。

## 2026-09-18 08:30（08 点整点）— 失败（浏览器通道不可用，未采集）
- check-deps 连续 3 次 exit 1：`browser: ok (Chrome, 9222)` 但 CDP 代理 WS 握手挂起（non-101），Chrome 调试服务卡死——与 07 点整点同一症状延续。
- 已做全部允许补救：3 次自检重试、pkill 重启 cdp-proxy、open chrome://inspect 推前台——均无效。
- 按红线未采集未渲染未发布；current.json 与线上保留 06 点有效结果。证据：automation/runs/2026-09-18/market/hourly-08-failed.json。
- 待人工：重启 Chrome 后下一整点自动恢复（07、08 两连败均指向调试服务卡死，普通补救无效）。

## 2026-09-18 07:20（07 点整点）— 失败（浏览器通道不可用，未采集）
- check-deps 连续 4 次 exit 1：Chrome 06:04:12 重启后 9222 在 LISTEN、开关持久化正常、DevToolsActivePort 是新 GUID，但 /json/version 404、WS 握手挂起，调试服务卡死。
- 已做全部允许的补救：重试自检、pkill 重启 cdp-proxy、裸 WS 探测、open chrome://inspect 推前台——均无效。
- 按红线未采集未渲染未发布；current.json 与线上保留 06 点有效结果。证据：automation/runs/2026-09-18/market/hourly-07-failed.json。
- 待人工：重启 Chrome 或重勾调试开关后下一整点自动恢复。

## 2026-09-18 06:03（06 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 189、PC 有效价 174；进化榜 500 张全有热度。
- current.json：generatedAt 22:03:12Z（= 北京 06:03），daily-merged 镜像一致。
- watchlist：watch 260 / undervalued 69 / trending 192 / pendingPrice 942；hourlyPoints 5（01–06）。
- Top3：安东尼·戈登 87 分、安东尼·戈登（进化前身 82）85 分、若昂·坎塞洛 85 分。
- 译名补 11 条（Messias、Xavi Ríos、Binder、Bouhoudane、Bauermann、Hannequin、Maidana、Lucas Rosa、Bambu、Smit、Vidović）后未命中收敛 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（链接不变），线上 current.json 200 且 generatedAt 首次核对即一致，已记 publish-hourly.json T06。

## 2026-09-18 04:59（04 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 188、PC 有效价 172；进化榜 500 张全有热度。
- current.json：1421 张卡、generatedAt 20:59:31Z（= 北京 04:59），daily-merged 镜像一致。
- watchlist：watch 250 / undervalued 81 / trending 191 / pendingPrice 823；hourlyPoints 4（01–04）。
- Top3：C 罗 89 分（挂单价上行 +16.67%）、安东尼·戈登 87 分、芭芭拉·班达 86 分。
- 译名补 8 条（Odriozola、Al Hamlawi、Dowell、Lobjanidze、Meerveld、Tetteh、Tzimas、Varga）后未命中收敛 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（链接不变），线上 current.json 200 且 generatedAt 首次核对即一致，已记 publish-hourly.json T04。

## 2026-09-18 03:57（03 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 186、PC 有效价 170；进化榜 500 张全有热度。
- current.json：1417 张卡、generatedAt 19:57:33Z（= 北京 03:57），daily-merged 镜像一致。
- watchlist：watch 246 / undervalued 70 / trending 183 / pendingPrice 658；hourlyPoints 3（01–03）。
- Top3：安东尼·戈登 87 分、长谷川唯 84 分、霍安·加西亚 82 分。
- 译名补 1 条（Archie Brown=阿奇·布朗）后未命中收敛 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（链接不变），线上 current.json 200 且 generatedAt 首次核对即一致，已记 publish-hourly.json T03。

## 2026-09-18 02:04（02 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 190、PC 有效价 179；进化榜 500 张全有热度。
- current.json：999 张卡、generatedAt 18:03:54Z（= 北京 02:03），镜像一致。
- watchlist：watch 243 / undervalued 67 / trending 173 / pendingPrice 539；hourlyPoints 2（01–02）。
- Top3：哈兰德 85 分（挂单价上行 +25.1%）、安东尼·戈登 85 分、芭芭拉·班达 81 分。
- 译名补 7 条（Ayunga、Aravena、Jakobs、Maina、Miley、Voth、Wilson）后未命中收敛 0；渲染 watch/scan 两页成功（market.json 当日尚未生成、扫描页结构区为如实空状态，属预期，03:00 每日任务产出）；第 ⑥ 步发布成功（链接不变），线上 current.json 200 且 generatedAt 首次核对即一致，已记 publish-hourly.json T02。

## 2026-09-18 01:06（01 点整点，新日期首点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 196、PC 有效价 182；进化榜 500 张全有热度。
- current.json：990 张卡、generatedAt 17:00:26Z（= 北京 01:00），合并目录镜像一致。
- watchlist：watch 228 / undervalued 70 / trending 0（新日期仅 1 个整点，无相邻观测）/ pendingPrice 522；hourlyPoints 1（01 点）。
- Top3：长谷川唯 89 分、哈兰德 88 分、格雷茨卡 86 分。
- 译名补 11 条（Petxarroman、Antalyalı、Astley、Jessen、Lammers、Mina、Parrott、Pavel Pérez、Senciuc、Álvarez、Éverton Ribeiro）后未命中收敛 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（链接不变），线上 current.json 200 且 generatedAt 与本地一致，已记 publish-hourly.json T01。

## 2026-09-17 23:57（23 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 202、PC 有效价 190；进化榜 500 张全有热度。
- watchlist：watch 318 / undervalued 85 / trending 231 / pendingPrice 972；hourlyPoints 8（16–23）。
- Top3：安东尼·戈登 84 分、C 罗 83 分、哈兰德 81 分。
- 译名补 9 条（Banerjee、Macalou、Mejía、Baleba、Gabri Martínez、Gomel、Hanson、Kiko Bondoso、Krattenmacher）后未命中收敛 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（链接不变），线上 current.json 200 且 generatedAt 与本地一致（15:57:37Z），已记 publish-hourly.json T23。

## 2026-09-17 17:31（17 点整点）— 成功
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 213、PC 有效价 218；进化榜 500 张全有热度。
- watchlist：watch 30 / undervalued 20 / trending 20 / pendingPrice 50；hourlyPoints 16→17。
- Top3：沙德 82 分、科曼 80 分、卡蒂嘉·肖 79 分。
- 译名补 10 条至词库后收敛 0；渲染 watch/scan 两页成功，未发布站点。
- 注意：--file 需传实际日期路径 `runs/2026-09-17/` 而非字面 `runs/D/`。

## 2026-09-17 18:36（18 点整点）— 成功
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 208、PC 有效价 214；进化榜 500 张全有热度。
- watchlist：watch 263 / undervalued 85 / trending 211 / pendingPrice 986；hourlyPoints 16→18。
- Top3：赛巴里 79 分、法尔科内 79 分、科曼 78 分。
- 译名补 13 条至词库后收敛 0；渲染 watch/scan 两页成功，未发布站点。

## 2026-09-17 19:39（19 点整点）— 成功
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 210、PC 有效价 214；进化榜 500 张全有热度。
- watchlist：watch 272 / undervalued 79 / trending 228 / pendingPrice 988；整点观测 16→19（16/17/18/19 四点）。
- Top3：哈兰德 81 分、帕约尔 78 分、C 罗 78 分。
- 译名补 16 条至词库（Bakoune、Lola Brown、Igamane、Jesé、Mbangula、Setford 等）后收敛 0；渲染 watch/scan 两页成功，未发布站点。
- 备注：hourly 任务脚本只写 watchlist.json，players.json 由 03:00 市场任务维护（apply 脚本对缺失 players.json 输出「跳过」属预期）。

## 2026-09-17 20:47（20 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 204、PC 有效价 208；进化榜 500 张全有热度。
- watchlist：watch 346 / undervalued 77 / trending 237 / pendingPrice 933；整点观测 16–20 五点。
- Top3：帕约尔 90 分、哈兰德 89 分、基米希 82 分。
- 译名补 13 条（Bose、Skov Olsen、Barco、Chair、Mudryk、Strand Larsen、Tella、Yan Couto 等）后未命中收敛至 1（myung-soon-kim，汉字无法核实按规则保留英文）。
- 渲染 watch/scan 两页成功；**首次按契约完成第 ⑥ 步重发布**（updateExistingApp，应用/链接不变），线上 assets/data/current.json 200 且 generatedAt 与本地一致（12:47:54Z），结果已写 publish-hourly.json 的 T20。

## 2026-09-17 21:58（21 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 219、PC 有效价 209；进化榜 500 张全有热度。
- watchlist：watch 334 / undervalued 77 / trending 244 / pendingPrice 959；整点观测 16–21 六点。
- Top3：长谷川唯 92 分、芭芭拉·班达 91 分、布卡约·萨卡 87 分。
- 译名补 14 条后未命中收敛 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（链接不变），线上 generatedAt 与本地一致，已记 publish-hourly.json T21。

## 2026-09-17 22:57（22 点整点）— 成功（含发布）
- 浏览器自检 exit 0；采集一次成功，无 403。
- 热门榜 250 张：Console 有效价 211、PC 有效价 194；进化榜 500 张全有热度。
- watchlist：watch 30 / undervalued 20 / trending 20 / pendingPrice 50。
- Top3：芭芭拉·班达 85 分、安东尼·戈登 85 分、哈兰德 82 分。
- 译名补 10 条（Jobe Bellingham、Cambiaso、Cryzan=克雷桑、Jaén、Kusi-Asare 等）后未命中收敛 0；渲染 watch/scan 两页成功；第 ⑥ 步发布成功（链接不变），线上 current.json 200 且 generatedAt 与本地一致（14:54:39Z），已记 publish-hourly.json T22。

## 2026-09-18 18:14（18 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 178 / PC 177 有效价）、进化榜 500 张全有热度。
- current.json 1451 张、generatedAt 10:06:01Z（北京 18:06:01）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留）。
- watchlist：watch 266 / undervalued 86 / trending 198 / hotEvo 500；Top3：安东尼·戈登 91、长谷川唯 88、普比尔 87。
- 相对 T17：Console/PC/热度中位均 0.00%；≥40% 变动 5 处（Osimhen PC +61.1%、Heaps PC +80.6%、Dybala PC +40.5%、Cunha PC +40.0%、亚马尔 Console −53.6%）。注意：首轮对比脚本误按 undefined 键配对（快照无 cardId），得出 +39384% 假变动，改按 url 提取 cardId 重算后修正。
- 译名补 1 条（pia-sophie-wolter=皮娅·索菲·沃尔特）后 140/140 命中 0 未命中；词库 1058→1059。
- 6a 重合并（index.html 26.0 MB）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；线上正文核验含「11 个观测点（01–18 时）」+「追踪卡数 1,273」。publish-hourly.json 记 T18。未跑 run-state / verify-publication / coordinate，未渲染 market.html。
