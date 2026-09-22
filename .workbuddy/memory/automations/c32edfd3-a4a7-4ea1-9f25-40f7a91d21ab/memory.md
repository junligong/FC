# market-hourly 自动化运行记录

## 2026-09-20 18:3x（18 点整点）— 采集失败（连续第 2 轮，未渲染未发布）
- triage OK_RECOVERED / exit 0（本轮发生自愈：start-debug-profile.mjs 拉起独立 profile）。
- 采集失败（连续第 2 轮同形态，T17 同因）：3 轮全量采集（超出契约「最多重试一次」预算，含手动复核探针）共 12 次建页全部报 `Uncaught`。
- **本轮定位到 `Uncaught` 的真实机理（修正 T17 的「渲染异常」说法）**：FUTBIN 对新建标签页下发 Cloudflare 挑战页（`<title>Just a moment...`），代理 `/new` 返回体是 `{"targetId":…}` + 挑战页 HTML 拼接；挑战页上 `Runtime.evaluate` 持续返回 exceptionDetails.text=`Uncaught`（cdp-proxy.mjs:517 直接把该 text 映射为 error），采集器 waitForCards 首次探测即抛出中断，45 秒轮询根本没机会跑。挑战页放置 3 分钟不自过、eval 仍抛。
- **通道实际健康**：经 example.com 中转后 `/navigate` 到 /27/popular 手动探测成功渲染 250 张卡（10:33Z），非站点整体 403、非通道故障；判定为 CF 对「直接建页」流量的临时挑战波（9 分钟内 12 次新建连接可能触发速率拦截）。
- 留证：`automation/runs/2026-09-20/market/hourly-18-failed.json`（stage=collect，含手动验证细节与 T19 人工介入条件）；`prices/fc27/last-attempt.json`。
- 未执行 watchlist/译名/渲染/重合并/发布：无新观测，current.json 保持 T16（08:15:29Z），线上保留 T16 版本；页面客户端实时读 current.json，时间不会失真。未跑 run-state / verify-publication / coordinate，未渲染 market.html。
- **T19 关注点**：若仍 `Uncaught`，则是连续第 3 轮，需人工在独立 profile Chrome（9333）打开 futbin.com 过一次挑战刷新 cf_clearance；可评估给采集器加「about:blank 建页 → navigate 中转」兜底（10:33 实测该路径可绕过挑战）——属共享脚本改动，须用户拍板，勿擅自改。

## 2026-09-20 16:1x（16 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 205 / PC 182 有效价，both 182）、进化榜 500 张全有热度。
- current.json 2,331 张、generatedAt 08:15:29.458Z（北京 16:15:29）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 318 / undervalued 101 / trending 219 / hotEvo 500 / pendingPrice 977；universe.tracked 1,295；hourlyPoints 15（00–16，03/13 点无观测）。Top：安东尼·戈登(83) 92（基础+进化 Believe 并列）、若昂·坎塞洛(83) 85、芭芭拉·班达(88) 83。
- 相对 T15：Console 中位 +3.94%（涨 130 / 跌 34 / 平 22）、PC 中位 +6.06%（涨 130 / 跌 28 / 平 8）——本日首次普涨形态；≥40% 3 处（Chawinga PC +85.2%、Safonov PC +43.9%、Graham Hansen PC −54.1%）。热度可比 226：涨 110 / 跌 104，≥60% 以 Pulisic +150.0%、Rogers +136.4%、Camavinga +120.8% 领涨。
- 译名补 10 条（埃斯图皮尼安/凯西·博斯/菲达尔戈/哈伊达拉/哈桑·卡马拉/凯文·罗德里格斯/马特乌斯·弗兰萨/奥佩里/尼亚姆·皮亚科克/雷察）后 140/140 命中 0 未命中；词库 1650→1660（只增不改、无空值）。
- 渲染 watch/scan 成功（头像落盘 77 张含新处理 8 张）；6a 重合并（20.5 MB，内联「15 个观测点（00–16 时）」+ 追踪卡数 1,295 + 名单生成于 08:15:31.676Z + 头像 132/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 连查 2 次均 200 且 generatedAt 一致（retryCount=0），并加验线上页面正文构建期字段（21.7 MB 首查即新）；publish-hourly.json 记 T16（T00–T15 保留，T03/T13 缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 15:1x（15 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 205 / PC 187 有效价，both 184）、进化榜 500 张全有热度。
- current.json 2,331 张、generatedAt 07:12:08.653Z（北京 15:12:08）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 316 / undervalued 93 / trending 217 / hotEvo 500 / pendingPrice 967；universe.tracked 1,283；hourlyPoints 14（00–15，03/13 点无观测）。Top：安东尼·戈登(83) 88（基础+进化 Believe 并列）、埃尔林·哈兰德(91) 85（挂单价 +5.05%）、芭芭拉·班达(88) 84（+4.76%）。
- 相对 T14（342 可比平台价）：中位 −0.81%，涨 119 / 跌 180 / 平 43；≥40% 仅 Graham Hansen PC +163.2%。热度可比 213：涨 83 / 跌 116，≥60% 以 Wirtz +119.0%、Marcos Llorente +105.9%、Álvaro Carreras +89.2% 领涨。
- 译名补 9 条（哈利勒·阿亚里/阿兰/安吉丽娜/布萨内洛/曼迪·弗里曼/斯塔夫罗斯·皮里奥斯/雷纳·雷耶斯/马茨·维费尔/莱尼·约罗）后 140/140 命中 0 未命中；词库 1641→1650（无空值）。
- 渲染 watch/scan 成功（头像落盘 86 张含新处理 17 张）；6a 重合并（20.7 MB，内联「14 个观测点（00–15 时）」+ 追踪卡数 1,283 + 名单生成于 07:12:12Z + 头像 135/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0），并加验线上页面正文构建期字段（20.6 MB 首查即新）；publish-hourly.json 记 T15（T00–T14 保留，T03/T13 缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 14:0x（14 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 200 / PC 183 有效价，both 181）、进化榜 500 张全有热度。
- current.json 2,329 张、generatedAt 06:01:53.301Z（北京 14:01:53）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 312 / undervalued 102 / trending 202 / hotEvo 500 / pendingPrice 966；universe.tracked 1,278（psValid 310 / pcValid 265）；hourlyPoints 13（00–14，03 与 13 点无观测）。Top：布冯(92) 99、安东尼·戈登(83) 90 ×2（其一进化 Believe）、安娜·巴耶(87) 86（挂单价上行 +17.46%）。
- 相对上一有效观测 T12（T13 无快照，331 可比平台价）：上涨 165 / 下跌 113 / 持平 53；≥40% 仅 Openda PC +65.0%（2,000→3,300）。热度可比 206：涨 99 / 跌 98，≥60% 以 Hemp +168.4%、Kimmich/Beerensteyn/Laimer +125%、Donnarumma +94.7% 领涨。
- 译名补 8 条（alexandre-zurawski=阿莱芒【百科专条/BooScore 简称】；robin-yadav=罗宾·亚达夫【四源一致】；michy-batshuayi=米奇·巴舒亚伊；supachai-chaided=素巴猜·贾德【纳米/球迷屋】；remi-himbert=雷米·安贝尔【懂球帝专条】；adriana-leon=阿德里亚娜·莱昂【百科/快懂/360 一致，纳米「利昂」分歧】；james-mcconnell=詹姆斯·麦康奈尔【百科/雷速/纳米】；sergio-reguilon-rodriguez=塞尔希奥·雷吉隆）后 140/140 命中 0 未命中；词库 1633→1641（无空值）。
- 渲染 watch/scan 两页成功（头像落盘 80 张含新处理 12 张）；6a 重合并（21.7 MB，内联「13 个观测点（00–14 时）」+ 追踪卡数 1,278 + 头像 128/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0），线上页面正文构建期字段首查即新（22.8 MB）；publish-hourly.json 记 T14（T00–T12 保留，T03/T13 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:23:15）。

## 2026-09-20 12:5x（12 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 201 / PC 181 有效价，both 178）、进化榜 500 张全有热度。
- current.json 2,324 张、generatedAt 04:55:42.529Z（北京 12:55:42）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 292 / undervalued 96 / trending 195 / hotEvo 500 / pendingPrice 973；universe.tracked 1,265（psValid 289 / pcValid 248）；hourlyPoints 12（00–12 全连）。Top3：安东尼·戈登(83) 89、哈兰德(91) 84（挂单价回落 −3.62%）、马特乌斯·努内斯(83) 84（挂单价上行 +11.11%）。
- 相对 T11（342 可比平台价）：中位 0.00%，上涨 131 / 下跌 154 / 持平 57，无 ≥40% 变动。热度可比 217 点：中位 −2.63%，涨 96 / 跌 113；≥60% 变动以 Malen +138.5%、Quiñones +107.7%、Mbeumo +94.7%、Lookman +92.8% 领涨。
- 译名补 8 条（kyogo-furuhashi=古桥亨梧【常识级】；anna-gerhardt=安娜·格哈特【网易体育专条，科隆女足】；lukas-klostermann=卢卡斯·克洛斯特曼【常识级】；mostafa-mohamed=穆斯塔法·穆罕默德【常识级】；luis-muriel=路易斯·穆里尔【常识级】；louis-patris=路易斯·帕特里斯【纳米/直播吧一致，圣吉罗斯联合后卫，澳客简称「帕特里斯」】；anass-salah-eddine=阿纳斯·萨拉赫-埃丁【百度百科专条/懂球帝一致，虎扑「萨拉丁」分歧】；axel-witsel=阿克塞尔·维特塞尔【常识级】）后 140/140 命中 0 未命中；词库 1625→1633（新增 8、无空值）。
- 渲染 watch/scan 两页成功（头像落盘 74 张含新处理 12 张）；6a 重合并（21.7 MB index.html，内联正文「12 个观测点（00–12 时）」+ 追踪卡数 1,265 + 头像 129/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0），并加验线上页面正文构建期字段（22.8 MB 首查即新）；publish-hourly.json 记 T12（T00–T12，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:23:15）。

## 2026-09-20 11:50（11 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 200 / PC 177 有效价，both 177）、进化榜 500 张全有热度。
- current.json 2318 张、generatedAt 03:50:06.553Z（北京 11:50:06）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留，observedAt 02:52:57Z）；daily-merged 镜像一致。
- watchlist：watch 283 / undervalued 88 / trending 198 / hotEvo 500 / pendingPrice 965；universe.tracked 1,248；hourlyPoints 11（00–11 全连）。Top3：安东尼·戈登(83) 91、安东尼·戈登(82) 84、马特乌斯·努内斯(83) 84（挂单价上行 +8%）。
- 相对 T10（292 可比平台价）：上涨 133 / 下跌 159；≥40% 变动仅 1 处（Chawinga PC +43.5%，6.9 万→9.9 万）。热度可比 210 点：涨 113 / 跌 97；≥60% 变动以 Tchouaméni +178.9%、Nuno Mendes +100%、De Paul +100%、Diomande +91.2% 领涨。
- 译名补 4 条（tom-bischof=汤姆·比朔夫【百度百科专条/快懂/球迷屋一致，纳米「比肖夫」分歧】；jae-min-ahn=安在民【捷报/雷速/网易/新浪/BooScore 五源一致】；eljif-elmas=埃尔吉夫·埃尔马斯【百度百科专条，快懂「埃利夫」分歧】；nathan-walker=内森·沃克【纳米数据，惠灵顿凤凰 2006 前锋】）后 140/140 命中 0 未命中；词库 1621→1625（新增 4、无空值）。
- 渲染 watch/scan 两页成功（头像落盘 79 张含新处理 10 张）；6a 重合并（21.8 MB index.html，内联正文「11 个观测点（00–11 时）」+ 追踪卡数 1,248 + 名单生成于 03:50:31Z）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0），并加验线上页面正文构建期字段（22.6 MB 首查即新）；publish-hourly.json 记 T11（T00–T11，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 10:46（10 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 198 / PC 178 有效价，both 178）、进化榜 500 张全有热度（collectedAt 02:46:44Z，priceBasis partial-live）。
- current.json 2315 张、generatedAt 02:46:45.415Z（北京 10:46:45）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留，observedAt 01:35:20Z，即传奇 T10 本轮尚未跑）；daily-merged 镜像一致。
- watchlist：watch 276 / undervalued 85 / trending 196 / hotEvo 500 / pendingPrice 957；universe.tracked 1,233；hourlyPoints 10（00–10 全连）。Top3：安东尼·戈登(83) 91、安东尼·戈登(82) 88、若昂·坎塞洛(83) 84。
- 相对 T09（338 可比平台价）：中位 −0.87%，上涨 105 / 下跌 181 / 持平 52；≥40% 变动仅 1 处（Quiñones PC +42.9%，1400→2000 低值卡）。热度可比 219 点：涨 108 / 跌 103、中位 0.00%；≥60% 变动以 Pablo Barrios +106.7%、Rabiot +100%、Reijnders +91.7%、Murillo +89.5%、Marquinhos +80.6% 领涨。
- 译名补 9 条（matisse-didden=马蒂斯·迪登【纳米/球迷屋一致】；will-mckay=威尔·麦凯【纳米/BooScore/球迷屋一致】；ilias-akhomach=伊利亚斯·阿霍马奇【球迷屋/百度体育一致，百科词条名「阿克霍马奇」分歧】；kamil-dankowski=卡米尔·丹科夫斯基【百科专条/球探/纳米一致】；gustavo-da-silva-sousa=古斯塔沃【百科专条/纳米/腾讯新闻一致，且 FUTBIN 自家球员页即用该 slug，上海海港→河南】；lucia-rivas-moure=卢西亚·里瓦斯【BooScore，worldfootball 全名吻合，拉科鲁尼亚女足】；jack-marriott=杰克·马里奥特【百科专条/雷速/球迷屋一致】；connor-metcalfe=康纳·梅特卡夫【百科/快懂/纳米/球迷屋一致】；oliver-norwood=奥利弗·诺伍德【百科/快懂/维基一致，360百科「诺尔伍德」分歧】）后 140/140 命中 0 未命中；词库 1612→1621（新增 9、无空值）。
- 6a 重合并（21.7 MB index.html，内联正文「10 个观测点（00–10 时）」+ 追踪卡数 1,233 + 头像 127/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 连查 2 次均 200 且 generatedAt 一致（retryCount=0），并加验线上页面正文构建期字段（20.4 MB 首查即新，防「只有价格是活的」）；publish-hourly.json 记 T10（T00–T10，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:23:15）。
- 新踩坑（跨文件比对通用）：提取 cardId 不能用宽松正则 `/(\d+)(?:_[\w]+)*\//`——它会**先命中 URL 里的 `/27/`**，250 张卡全落到键 "27"，可比点从 ~338 静默塌成 1 个（表现像「行情无变化」而非报错）。须用 `/\/player\/(\d+)/` 锚定，且比对前先打印 1 条样本核验键提取。

## 2026-09-20 09:3x（09 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 199 / PC 176 有效价，both 176）、进化榜 500 张全有热度。
- current.json 2313 张、generatedAt 01:38:13.855Z（北京 09:38:13）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留，判据「存在 priceRange」）；daily-merged 镜像一致。
- watchlist：watch 273 / undervalued 85 / trending 197 / hotEvo 500 / pendingPrice 948；hourlyPoints 9（00–09 全连）。Top3：安东尼·戈登(83) 90、安东尼·戈登(82) 82、艾娃·帕约尔(89) 82（C 罗 82 并列、马特乌斯·努内斯 81）。
- 相对 T08（356 可比平台价）：上涨 109 / 下跌 172，无 ≥40% 变动（最大 Rogers PC +30.0% 为 1000→1300 低值、Caicedo Console +24.0%、Álvaro Carreras PC +22.7%）；热度可比 233 点，涨 114 / 跌 103，≥60% 变动以 Aitana Bonmatí +70.7%、Lacroix +67.3% 领涨。
- 译名补 10 条（louie-barry=路易·巴里【常识级】；ines-belloumou=伊内斯·贝鲁穆【网易/雷速/BooScore 一致，阿尔及利亚/西汉姆女足】；marius-bulter=马里乌斯·布尔特【常识级】；kamil-glik=卡米尔·格利克【常识级】；marco-grull=马尔科·格吕尔【百科/快懂/中文百科一致，BooScore「马克」分歧】；million-manhoef=米利翁·曼霍夫【7M/智云「曼霍夫」一致，Million 音译米利翁】；ricardo-luis-chaby-mangas=里卡多·曼加斯【百科/懂球帝一致，纳米「马加斯」球探「门加斯」分歧】；kevin-van-den-kerkhof=凯文·范登克霍夫【纳米/球迷屋一致，球探/智云「范登科霍夫」分歧】；luca-waldschmidt=卢卡·瓦尔德施密特【常识级】；narubadin-weerawatnodom=纳鲁巴丁·维拉瓦诺丹【百科+Wikiwand 一致，纳米两处「威拉瓦通/韦拉瓦特诺多姆」分歧】）后 140/140 命中 0 未命中；词库 1602→1612。
- 6a 重合并（内联正文「9 个观测点（00–09 时）」+ 追踪卡数 1,221 + 名单生成于 01:38:18Z + 头像 83/84）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T09（T00–T08 保留，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:23）。

## 2026-09-20 08:2x（08 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 203 / PC 179 有效价，both 178）、进化榜 500 张全有热度。
- current.json 2312 张、generatedAt 00:26:11.957Z（北京 08:26:11）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留——注意该结构无 `scope` 键，检测判据应为「存在 priceRange」而非 `scope==='card'`，本轮首查误报 0 后已修正口径）；daily-merged 镜像一致。
- watchlist：watch 269 / undervalued 92 / trending 194 / hotEvo 500 / pendingPrice 948；hourlyPoints 8（00–08 全连）。Top3：安东尼·戈登(83) 91、安东尼·戈登(82) 84、芭芭拉·班达(88) 83（挂单价上行 +2.5%）。
- 相对 T07（354 可比平台价）：中位 −0.97%，上涨 104 / 下跌 250，无 ≥40% 变动（最大亚马尔 Console +31.6%）；热度可比 232 点，中位 +3.14%，≥60% 变动以 Rafael Leão +130.0%、C 罗 +92.9%、Laimer +80.0%、van de Ven +75.6% 领涨。
- 译名补 7 条（ashley-phillips=阿什利·菲利普斯【百科/纳米/直播吧一致】；jeremy-sarmiento=杰里米·萨缅托【百科/纳米一致，Wikiwand「赫雷米」分歧】；ovie-ejeheri=奥维·耶赫里【雷速/纳米/网易/百度体育一致，titan007「奥维埃杰赫里」分歧】；evan-ferguson=埃文·弗格森【常识级】；will-lankshear=威尔·兰克希尔【百科/百度体育一致，新浪简称「兰克希尔」】；manuel-sanchez-de-la-pena=马努·桑切斯【腾讯新闻「马努-桑切斯/曼努埃尔-桑切斯-德拉佩尼亚」】；amir-sayoud=阿米尔·萨尤德【百科/雷速/网易/球迷屋一致】）后 140/140 命中 0 未命中；词库 1595→1602。
- 6a 重合并（内联正文「8 个观测点（00–08 时）」+ 追踪卡数 1,217 + 名单生成于 00:26:20Z + 头像 132/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T08（T00–T07 保留，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 07:2x（07 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 196 / PC 180 有效价，both 178）、进化榜 500 张全有热度。
- current.json 2310 张、generatedAt 23:22:18.029Z（北京 07:22:18）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 267 / undervalued 86 / trending 188 / hotEvo 500 / pendingPrice 935；hourlyPoints 7（00–07 全连）。Top3：安东尼·戈登(83) 91、哈兰德(91) 88、安东尼·戈登(82) 86。
- 相对 T06（358 可比平台价）：上涨 110 / 下跌 183，无 ≥40% 变动（最大 Iñaki Williams PC +30.0%）；热度可比 230 点，涨 125 / 跌 91，≥60% 变动以 Courtois +86.7%、Ngumoha −86.0%、Ødegaard +84.6% 领先。
- 译名补 5 条（贝赫鲁兹·卡里莫夫/里奥·卡丁斯/亚当·达吉姆/迭戈·拉伊内斯/泰勒·莫顿）后 140/140 命中 0 未命中；词库 1590→1595。
- 6a 重合并 + 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T07（T00–T07 保留，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 06:1x（06 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 199 / PC 182 有效价，both 181）、进化榜 500 张全有热度。
- current.json 2309 张、generatedAt 22:17:55.319Z（北京 06:17:55）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 266 / undervalued 81 / trending 193 / hotEvo 500 / pendingPrice 922；hourlyPoints 6（00–06 全连）。Top3（去重后）：恩古莫哈(75) 95（基础+进化双条目）、安东尼·戈登(83) 92、哈兰德(91) 89。
- 相对 T05（358 可比平台价）：中位 0.00%，上涨 129 / 下跌 176，无 ≥40% 变动；热度可比 233 点，涨 125 / 跌 93，≥60% 变动以 Debinha +126.3%、Kerolin Nicoli +108.3%、亚马尔 +69.2% 领涨（恩古莫哈 −66.1% 为 254→86 高基数回落）。
- 译名补 4 条（alex-nicolao-telles=阿莱士·特莱斯【百科/快懂/懂球百科一致，360百科「阿莱克斯」分歧】；jessica-anderson=杰西卡·安德森【网易/BooScore 一致，曼联女足】；vladimir-lorona=弗拉基米尔·洛罗尼亚【直播吧/网易/BooScore/24直播网一致，百科「洛罗纳」分歧】；mark-natta=马克·纳塔【纳米×2/智云/雷速/百度体育一致】）后 140/140 命中 0 未命中；词库 1586→1590。
- 6a 重合并（内联正文「6 个观测点（00–06 时）」+ 名单生成于 22:18:00Z + 头像落盘 77 张含新处理 5 张）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T06（T00–T05 保留，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 05:1x（05 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 201 / PC 182 有效价，both 182）、进化榜 500 张全有热度。
- current.json 2309 张、generatedAt 21:08:16.302Z（北京 05:08:16）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 269 / undervalued 65 / trending 197 / hotEvo 500 / pendingPrice 879；hourlyPoints 5（00–05 全连）。Top3（去重后）：恩古莫哈(75) 99（基础+3 进化双条目，新晋榜首）、安东尼·戈登(83) 91、艾娃·帕约尔(89) 88（挂单价上行 +17.69%）。
- 相对 T04（353 可比平台价）：中位 −1.28%，上涨 104 / 下跌 198，无 ≥40% 变动；热度可比 230 点，≥60% 变动以 Raphinha +574.5%（低基数）、Vini Jr. +90.9%、Pato +83.3% 领涨。
- 译名补 9 条（will-ferry=威尔·费里【雷速/网易/BooScore 一致，球探「维尔」分歧】；giovana-queiroz-costa=乔瓦娜【球探/球天下一致】；zidane-iqbal=齐达内·伊克巴尔【纳米/懂球帝一致】；javier-guerra-moreno=哈维·格拉【百科主词条/纳米一致，另一词条「古埃拉」分歧】；bendeguz-kovacs=本德古兹·科瓦奇【球探/直播吧/网易/腾讯多源一致】；mexx-meerdink=梅克斯·梅尔丁克【百科专条/球迷屋/网易一致】；ernest-nuamah=欧内斯特·努阿马【央视/球探一致，7M/雷速「努瓦马」分歧】；juan-manuel-rengifo=胡安·伦吉福【球探/超爆一致】；basar-onal=巴沙尔·厄纳尔【懂球帝/雷速一致，球探「奥纳尔」分歧】）后 140/140 命中 0 未命中；词库 1577→1586。
- 6a 重合并（内联正文「5 个观测点（00–05 时）」+ 名单生成于 21:08:19Z + 追踪卡数 1,148 + 头像 133/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T05（T00–T05 保留，T03 历史缺口如实保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。
- 小坑：对 22.8MB index.html 用 Python 正则 `[^><]*(pat)[^><]*` 扫描发生灾难性回溯（5 分钟无输出，已 kill）；改用 Node `indexOf` 上下文切片秒回。大文件字段核验用 indexOf，不用正则。

## 2026-09-20 04:0x（04 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 194 / PC 182 有效价，both 182）、进化榜 500 张全有热度。
- current.json 2309 张、generatedAt 20:02:28.422Z（北京 04:02:28）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 255 / undervalued 66 / trending 190 / hotEvo 500 / pendingPrice 696；hourlyPoints 4（00–02、04，03 点无观测）。Top3：安东尼·戈登(83) 92、艾娃·帕约尔(89) 84（挂单价上行 +4.26%）、哈兰德(91) 84。
- 相对 T02（350 可比平台价）：中位 −2.86%，上涨 75 / 下跌 241，无 ≥40% 变动；热度可比 227 点，涨 109 / 跌 99，≥60% 涨幅以 Diaby +100%、Anderson +98%、Bremer +76.9% 领涨。
- 译名补 3 条（laureta-elmazi=劳雷塔·埃尔马齐【网易体育专条】；omar-sillah=奥马尔·西拉【雷速/懂球帝/球探/超爆/BooScore 五源一致】；illia-zabarnyi=伊利亚·扎巴尔尼【常识级】）后 140/140 命中 0 未命中；词库 1574→1577。
- 6a 重合并（内联正文「4 个观测点（00–02、04 时）」+ 名单生成于 20:02:40Z + 头像落盘 85 张含新处理 7 张）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T04（T00/T01/T02 保留，**T03 键缺失**——当日 03 点轮无记录且目录无 failed 留证，如实保留缺口未填充）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 02:5x（02 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 201 / PC 181 有效价，both 181）、进化榜 500 张全有热度。
- current.json 1924 张、generatedAt 18:50:52.470Z（北京 02:50:52）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 243 / undervalued 61 / trending 188 / hotEvo 500 / pendingPrice 537；hourlyPoints 3（00–02）。Top3：安东尼·戈登(83) 92、艾娃·帕约尔(89) 84、哈兰德(91) 84。
- 相对 T01（330 可比平台价）：上涨 73 / 下跌 257（中位小幅下行），无 ≥40% 变动（最大跌幅 −23.1%、最大涨幅 cardId 738 PC +29.7%）；热度可比 223 点，涨 143 / 跌 80，≥60% 变动 10 余处以 cardId 738 +228.2%、623 +130.0%、13 +127.3% 领涨。
- 译名补 2 条（stephen-mfuni=斯蒂芬·姆富尼【百度百科专条/纳米/球迷屋/新浪一致】；nathaniel-mendez-laing=纳撒尼尔·门德斯-莱恩【百度百科专条/快懂一致，球迷屋「拉昂」新浪「莱恩」分歧】）后 140/140 命中 0 未命中；词库 1447→1449。
- 6a 重合并（内联正文「3 个观测点（00–02 时）」+ generatedAt 18:50 命中 + 头像落盘 82 张含新处理 24 张）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T02（T00/T01 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 01:4x（01 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 205 / PC 193 有效价，both 191）、进化榜 500 张全有热度。
- current.json 1924 张、generatedAt 17:46:25.791Z（北京 01:46:25）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 238 / undervalued 47 / trending 189 / hotEvo 500 / pendingPrice 532；hourlyPoints 2（00–01）。Top3：长谷川唯(88) 87（挂单价上行 +15.29%）、哈兰德(91) 84、芭芭拉·班达(88) 82。
- 相对 T00（375 可比平台价）：上涨 49 / 下跌 308（中位小幅下行），无 ≥40% 变动；热度可比 230 点，涨 46 / 跌 173，≥40% 变动 10 余处（cardId 29 +66.7%、738 +57.8% 领涨，516 −46.2%、21752 −45.5% 领跌）。
- 译名补 6 条（ola-aina=奥拉·艾纳、allan-saint-maximin=阿兰·圣-马克西曼、santiago-arias=圣地亚哥·阿里亚斯、jhon-lucumi=约翰·卢库米【常识级】；adriano-jagusic=阿德里亚诺·贾古西奇【懂球帝专条全名，球探/网易/新浪「贾古西奇」一致】；denso-kasius=登索·卡修斯【百度百科专条，纳米「德索/丹索」分歧】）后 140/140 命中 0 未命中；词库 1441→1447。
- 6a 重合并（内联正文「2 个观测点（00–01 时）」+ 追踪卡数 770 + 名单生成于 17:46:29Z + 头像落盘 81 张）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T01（T00 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 00:4x（00 点整点，新日期首点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 202 / PC 195 有效价，both 190）、进化榜 500 张全有热度。
- current.json 1920 张、generatedAt 16:41:22.308Z（北京 00:41:22）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 226 / undervalued 62 / trending 0（新日期首点无相邻观测，属预期）/ hotEvo 500 / pendingPrice 524；hourlyPoints 1（00）。Top3：安东尼·戈登(83) 93、哈兰德(91) 91、安东尼·戈登(82) 90。
- 译名补 3 条（derrick-etienne-jr=德里克·艾蒂安【球迷屋/新浪一致，懂球帝「埃蒂安」为简称分歧】；paulina-krumbiegel=宝琳娜·克鲁比格尔【网易专条全名「宝琳娜·凯特·克鲁比格尔」，取常用名】；korede-osundina=科雷德·奥松迪纳【纳米数据】）后 120/120 命中 0 未命中；词库 1438→1441。
- 6a 重合并（新日期首版 index.html 2.8 MB，内联正文「1 个观测点（00–00 时）」+ generatedAt 16:41 命中 + 头像落盘 68 张）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 新日期首键 T00。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 23:3x（23 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 204 / PC 191 有效价，both 186）、进化榜 500 张全有热度。
- current.json 1918 张、generatedAt 15:36:19.719Z（北京 23:36:19）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留、0 异常）；daily-merged 镜像一致。
- watchlist：watch 315 / undervalued 85 / trending 220 / hotEvo 500 / pendingPrice 960；hourlyPoints 19（00–23 全连，07/14/15/16 为历史失败缺口）。Top3：卢卡·科莱奥肖(72) 99（连续第 8 轮榜首）、安东尼·戈登(83) 91、芭芭拉·班达(88) 86（挂单价上行 +2.22%）。
- 相对 T22（362 可比平台价）：中位小幅下行，上涨 127 / 下跌 170；≥40% 变动仅 1 处（cardId 750 PC +53.7%，2.7 万→4.15 万）；热度可比 226 点，涨 109 / 跌 104，≥60% 涨幅以 Vini Jr. +81.3%、O'Reilly +76.7%、Brugts +66.7% 领涨。
- 译名补 10 条（daniel-anyembe=丹尼尔·安耶姆贝【纳米/直播吧/竞彩多数，捷报/球探「安耶姆比」分歧】；olavio-vieira-dos-santos-junior=儒尼尼奥·维埃拉【BooScore/雷速/百度全名奥拉维奥·维埃拉·多斯桑托斯·胡尼奥、简称儒尼尼奥】；charly-nouck=沙利·努克【懂球帝专条】；tay-abed=泰·阿比德【纳米，球迷屋「泰·阿贝」分歧】；thierno-barry=蒂尔诺·巴里【百科/球迷屋/快懂一致】；devid-eugene-bouah=德维德·布阿【网易专条「德维德·尤金·布阿」，新浪「鲍哈」懂球帝「布瓦」分歧】；joan-sastre-vanrell=霍安·萨斯特雷【百科专条/搜狗一致，网易「琼」分歧】；enrique-lofolomo=恩里克·洛夫洛莫【雷速/网易一致，球探「洛莫洛莫」超爆「洛弗洛莫」懂球帝「罗夫洛莫」分歧】；ainsley-maitland-niles=安斯利·梅特兰-奈尔斯【常识级】；pedro-ferreira=佩德里尼奥【百度/球探/雷速一致】）后 140/140 命中 0 未命中；词库 1428→1438。
- 6a 重合并（内联正文「19 个观测点（00–23 时）」+ generatedAt 15:36 命中 + 头像落盘 79 张含新处理 6 张）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T23（T00–T22 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。

## 2026-09-19 22:3x（22 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 200 / PC 189 有效价，both 187）、进化榜 500 张全有热度。
- current.json 1917 张、generatedAt 14:32:39.185Z（北京 22:32:39）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 310 / undervalued 72 / trending 218 / hotEvo 500 / pendingPrice 961；hourlyPoints 18（00–22，07/14/15/16 为历史失败缺口）。Top3：卢卡·科莱奥肖(72) 99（连续第 7 轮榜首）、安东尼·戈登(83) 91、芭芭拉·班达(88) 87。
- 相对 T21（313 可比平台价）：中位 −1.52%，上涨 127 / 下跌 186；≥40% 变动 2 处 Console/PC 背离（Mateo Console −20.7% vs PC +117.0%、Debinha Console +62.2%）；热度可比 210 点，涨以 Debinha +139.3%、Rodman +130.2%、Kane +64.7% 领涨。
- 译名补 4 条（kamil-grosicki=卡米尔·格罗西茨基【百科/纳米/Wikidata 一致】；stefano-moreo=斯蒂法诺·莫雷奥【百科专条】；amanda-nilden=阿曼达·尼尔登【百科专条/tipsme 一致】；luka-stojkovic=卢卡·斯托伊科维奇【纳米/fifawatch 一致】）后 140/140 命中 0 未命中；词库 1424→1428。
- 6a 重合并（内联正文「18 个观测点（00–22 时）」+ 名单生成于 14:32:43Z + 头像 134/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T22（T00–T21 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 21:3x（21 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 200 / PC 190 有效价，both 184）、进化榜 500 张全有热度。
- current.json 1917 张、generatedAt 13:26:32.134Z（北京 21:26:32）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 326 / undervalued 76 / trending 212 / hotEvo 500 / pendingPrice 947；hourlyPoints 17（00–21 全连，07/14/15/16 为历史失败缺口）。Top3：卢卡·科莱奥肖(72) 99（连续第 6 轮榜首）、安东尼·戈登(83) 92、阿莱西娅·鲁索(88) 91（挂单价上行 +32.73%）。
- 相对 T20（367 可比平台价）：中位 0.00%，上涨 140 / 下跌 156；≥40% 变动 3 处 Console 侧（Mateo +87.8%、Anyomi +53.5%、Unai Simón +40.6%）；热度可比 226 点，涨 108 / 跌 105，≥40% 涨幅以 Unai Simón +108.3%、Stanway +100.0%、Matheus Cunha +85.7% 领涨。
- 译名补 12 条（rayan-vitor-simplicio-rocha=拉扬【百科专条+雷速一致，7M「拉扬·维托」分歧】；laura-wienroither=劳拉·维恩罗伊特【网易专条】；keelan-adams=基兰·亚当斯【纳米×2/球探/网易/雷速一致】；samuel-akere=塞缪尔·阿克雷【纳米×2 一致，懂球帝「阿凯雷」titan007「艾基利」分歧】；carlos-eduardo-borges-parente=卡洛斯·爱德华多【球探专条，生日/身高/俱乐部全吻合】；luke-chambers=卢克·钱伯斯【百科/纳米/澳客一致】；riccardo-ciervo=里卡尔多·切尔沃【百科主词条，另一词条/雷速/球迷屋「理查德」超爆「里卡多」分歧】；simen-kvia-egeskog=西门·克维亚-埃格斯科格【纳米×2+新浪一致，球迷屋「西蒙·科维亚」分歧】；kjell-scherpen=谢尔·舍尔彭【百科主词条，搜狗「克耶尔」分歧】；benito-souza=贝尼·索萨【懂球帝「贝尼-索萨」+EA FC27 专页同人确认】；simon-straudi=西蒙·斯特拉迪【纳米×2/球探/网易一致】；zion-suzuki=铃木彩艳【常识级】）后 140/140 命中 0 未命中；词库 1412→1424。
- 6a 重合并（内联正文「17 个观测点（00–21 时）」+ 名单生成于 13:26:37Z + 头像 87 落盘）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T21（T00–T20 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。

## 2026-09-19 20:2x（20 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 204 / PC 195 有效价，both 190）、进化榜 500 张全有热度。
- current.json 1916 张、generatedAt 12:21:47.602Z（北京 20:21:47）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 329 / undervalued 79 / trending 214 / hotEvo 500 / pendingPrice 933；hourlyPoints 16（00–20 全连，07/14/15/16 为历史失败缺口）。Top3：卢卡·科莱奥肖(72) 99（连续第 5 轮榜首）、安东尼·戈登(83) 91、哈兰德 87（挂单价上行 +5.74%）。
- 相对 T19（303 可比平台价）：中位 +1.32%，上涨 173 / 下跌 130，无 ≥40% 变动；涨以 Kelly Console +71.9%、巴尔韦德 PC +30.1% 领先；热度可比 218 点、中位 +1.54%，≥60% 变动以 Barcola +76.5%、Raphinha +66.7% 领涨。
- 译名补 4 条（aaron-anselmino=阿隆·安塞尔米诺【直播吧专页，纳米「亚伦」维基「阿龙」分歧】；yann-aurel-bisseck=扬·奥雷尔·比塞克【百科专条+快懂一致，纳米「雅恩」分歧】；andre-brooks=安德烈·布鲁克斯【百科+球迷屋+直播吧+雷速多源一致】；jarell-quansah=贾雷尔·夸安萨【百科专条，纳米「昆萨/宽萨」央视「匡萨」分歧】）后 140/140 命中 0 未命中；词库 1408→1412。
- 6a 重合并（内联正文「16 个观测点（00–20 时）」+ 名单生成于 12:21:51Z + 头像 134/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T20（T00–T19 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。
- 小坑复现：热门榜 hourly 快照逐卡是 `psPrice/pcPrice` + url 内 cardId（非 `id`/`current{console,pc}` 结构），对比脚本两次按错误字段算出 0 可比后按实际结构修正——跨文件校验前先探明字段结构的老教训再验证一次。

## 2026-09-19 19:1x（19 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 210 / PC 191 有效价，both 190）、进化榜 500 张全有热度。
- current.json 1914 张、generatedAt 11:16:52.698Z（北京 19:16:52）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 315 / undervalued 80 / trending 221 / hotEvo 500 / pendingPrice 950；hourlyPoints 15（00–19，07/14/15/16 点为历史失败缺口）。Top3：卢卡·科莱奥肖(72) 99（连续第 4 轮榜首）、安东尼·戈登(83) 91、长谷川唯(88) 83（挂单价回落 −3.26%）。
- 相对 T18（313 可比平台价）：中位 +1.50%，上涨 177 / 下跌 136，无 ≥30% 大幅变动；热度可比 215 点，涨 102 / 跌 113，≥60% 变动以 Laimer +94.1%、Dumfries +93.8%、Brown +75.0%、Wirtz +73.8% 领涨。
- 译名补 5 条（jacob-ramsey=雅各布·拉姆齐【百科/雷速/纳米/快懂一致】；bryan-reynolds=布赖恩·雷诺兹【百科/纳米一致，快懂「布莱恩」分歧】；hugo-cuypers=雨果·屈佩尔【纳米/球迷屋/雷速一致，百科「古伯斯」分歧】；olivier-deman=奥利维尔·德曼【百科/球探/7M/纳米一致】；carlos-emiro-garces=卡洛斯·埃米罗·加西斯【雷速/网易/BooScore 主体一致，BooScore 简称「加尔塞斯」分歧】）后 140/140 命中 0 未命中；词库 1403→1408。
- 6a 重合并（内联正文「15 个观测点（00–19 时）」+ 名单生成于 11:16:56Z + 头像 132/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T19（T00–T18 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。

## 2026-09-19 18:1x（18 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 206 / PC 191 有效价，both 190）、进化榜 500 张全有热度。T14/T15 两轮来源页拦截连续第 3 轮未复现。
- current.json 1914 张、generatedAt 10:11:32.124Z（北京 18:11:32）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 311 / undervalued 83 / trending 221 / hotEvo 500 / pendingPrice 952；hourlyPoints 14（00–18，07/14/15/16 点为历史失败缺口）。Top3：卢卡·科莱奥肖(72) 98（连续第 3 轮榜首，基础+进化双条目）、安东尼·戈登(83) 91、长谷川唯(88) 86。
- 相对上一有效观测 T17（17:05，308 可比平台价）：上涨 180 / 下跌 128；涨幅 Top：Paralluelo PC +44.6%、亚马尔 PC +33.9%（同轮 Console −16.8%，两平台背离）、Kelly PC +33.3%；热度可比 215 点，Alexia Putellas +118.8%、Iñaki Williams +114.3%、Bellingham +100% 领涨。
- 译名补 11 条（史蒂夫·康戈/奥努尔·布卢特/德文·哈恩/哈维·埃尔南德斯/奥马尔·埃尔·希拉利/巴勃罗·加维安/皮帕/罗伯托·费尔南德斯/托尼·马丁内斯/马西斯·图瑞恩/维克托·戈麦斯，均多源核验留痕）后 140/140 命中 0 未命中；词库 1392→1403。
- 6a 重合并（内联正文「14 个观测点（00–18 时）」+ 名单生成于 10:11:43Z + 头像 125/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T18（T00–T16 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。

## 2026-09-19 17:0x（16 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 204 / PC 194 有效价，both 191）、进化榜 500 张全有热度。T14/T15 连续两轮来源页拦截本轮未复现。
- current.json 1913 张、generatedAt 09:05:24.818Z（北京 17:05:24）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 05:38Z）；daily-merged 镜像一致。
- watchlist：watch 311 / undervalued 84 / trending 224 / hotEvo 500 / pendingPrice 951；hourlyPoints 13（00–17，14/15/16 点为历史失败缺口）。Top3：卢卡·科莱奥肖(72) 98（连续第 2 轮榜首）、芭芭拉·班达(88) 93、安东尼·戈登(83) 90。
- 相对上一有效观测 T13（321 可比平台价）：中位 +5.13%，上涨 222 / 下跌 99；大幅变动：Kobel PC +50.9%、Konsa Console +47.4%、Dembélé PC −42.7%、Kanté PC +41.7%、Araujo PC +41.4%、Güler PC +40.0%。
- 译名补 6 条（yuri-berchiche-izeta=尤里·贝尔奇切 常识级；sergio-cubero-ezcurra=塞尔希奥·库韦罗 百度百科专条/懂球帝一致；pasquale-mazzocchi=帕斯夸莱·马佐基 常识级；stefan-opris=斯特凡·奥普里斯 网易体育；niko-sigur=尼科·西古尔 百度百科专条/纳米一致；okay-yokuslu=奥凯·约库什卢 常识级）后 140/140 命中 0 未命中；词库 1386→1392。
- 6a 重合并（内联正文「13 个观测点（00–17 时）」）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T16（T00–T13 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。
- 小坑复现：`json.load()` 不接受 `object_pairs_hook`（须 `json.loads(open().read(),...)`），本轮首跑 TypeError 后按既有记录改写成功。

## 2026-09-19 15:5x（15 点整点）— 失败（来源页取数失败，未渲染未发布）
- triage OK / exit 0 无自愈，通道健康；故障在来源页：/27/popular 与 /27/popular/evolutions 各 2 次导航（含 45 秒退避重试）均「等待 45 秒后仍无卡片元素」，0 卡采到，采集器退出码 1（非 403 明示，同 09-18 13 点 / 09-19 14 点形态）。
- 按契约未执行 watchlist/译名/渲染/重合并/发布；current.json 本轮未被触碰（保留 T13，generatedAt 05:45:29Z，1911 张）；线上保留 T13 版本。
- 证据：automation/runs/2026-09-19/market/hourly-15-failed.json。当日 T14/T15 连续两轮失败（14/15 两个整点无有效观测）；按历史经验下个整点重跑通常自动恢复，未动任何通道组件。

## 2026-09-19 14:5x（14 点整点）— 失败（来源页取数失败，未渲染未发布）
- triage OK / exit 0 无自愈，通道健康；故障在来源页：/27/popular 与 /27/popular/evolutions 各 2 次导航（含 45 秒退避重试）均「等待 45 秒后仍无卡片元素」，0 卡采到，采集器退出码 1（非 403 明示，同 09-18 13 点形态）。
- 按契约未执行 watchlist/译名/渲染/重合并/发布；current.json 本轮未被触碰（保留 T13，generatedAt 05:45:29Z）；线上保留 T13 版本。
- 证据：automation/runs/2026-09-19/market/hourly-14-failed.json。按历史经验下个整点重跑通常自动恢复，未动任何通道组件。

## 2026-09-19 13:4x（13 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 209 / PC 187 有效价，both 185）、进化榜 500 张全有热度。
- current.json 1911 张、generatedAt 05:45:29.765Z（北京 13:45:29）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 286 / undervalued 79 / trending 211 / hotEvo 500 / pendingPrice 966；hourlyPoints 12（00–13，07 点缺失属历史）。Top3：卢卡·科莱奥肖(72) 98（本轮新入榜首）、安东尼·戈登(83) 91、哈里·凯恩 88（挂单价上行 +15.83%）。
- 相对 T12（347 可比平台价）：上涨 84.7% 顶部为登贝莱 PC +84.7%（222 万→410 万）；下跌以亚马尔 PC −27.3%、霍安·加西亚 PC −21.4%；热度可比 216 点，涨跌两极以多纳鲁马 +184.6%、姆巴佩 +176.9% 领涨。
- 译名补 13 条（luca-koleosho=卢卡·科莱奥肖【百科专条/懂球帝一致，纳米「科列修/科雷索」快懂「科利奥肖」分歧】；amario-cozier-duberry=阿马里奥·科齐尔·杜贝里【捷报/纳米一致，澳客「科泽尔」百科「杜伯里」分歧】；kellen-fisher=凯伦·费舍尔【纳米/网易/懂球帝一致】；tunmise-sobowale=托米塞·索博瓦莱【百科专条/网易一致，懂球帝「勒」球探「尔」分歧】；daisuke-yokota=横田大祐【百科专条/维基一致，纳米「大辅」分歧】；ryotaro-araki=荒木辽太郎【百科/快懂/搜狗/捷报一致】；john-egan=约翰·伊根【纳米/直播吧一致，百科主词条「埃根」为分歧、伊根为其别名】；jacob-italiano=雅各布·伊塔利亚诺【快懂/纳米/网易一致，百科「意大利诺」分歧】；juan-luis-sanchez-velasco=胡安卢·桑切斯【百科/快懂/懂球帝一致，纳米「胡安·桑切斯」分歧】；natalia-kuikka=纳塔利娅·库伊卡【百科/懂球帝一致，网易「奎卡」分歧】；kaito-mizuta=水多海斗【新浪/雷速/球迷屋一致，Wikiwand 日文原名水多海斗证澳客「水田佳藤」为错译】；jeremiah-st-juste=杰里迈亚·圣朱斯特【百科专条/新浪一致，百度体育「圣杰斯特」分歧】；shin-yamada=山田新【百科/直播吧/球探/雷速一致】）后 140/140 命中仅余 miku-kojima（Miku 对应汉字无法核实，按规则保留英文记入 missing）；词库 1373→1386。
- 6a 重合并（内联正文「12 个观测点（00–13 时）」+ 名单生成于 05:45:34Z + 头像 120/140）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T13（T00–T12 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 12:4x（12 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 202 / PC 179 有效价，both 179）、进化榜 500 张全有热度。
- current.json 1904 张、generatedAt 04:39:48.044Z（北京 12:39:48）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 266 / undervalued 90 / trending 213 / hotEvo 500 / pendingPrice 969；hourlyPoints 11（00–12）。Top3：安东尼·戈登(83) 91、C 罗 86（挂单价上行 +21.43%）、芭芭拉·班达 85。
- 相对 T11（303 可比平台价）：上涨 148 / 下跌 155；价 ≥40% 变动 2 处（Matheus Cunha PC +50.0%、Robinson PC +76.9%，均为万级低价卡）；热度可比 205 点，涨 95 / 跌 110，≥60% 变动以 Doué +134.8%、Brugts +126.3%、Vitinha +108.7% 领涨。
- 译名补 13 条（melvin-bard=梅尔文·巴尔德【百科专条，纳米「巴德/马尔文·巴德」分歧】；kaiki-bruno-da-silva=凯基【纳米/新浪一致】；brandon-bye=布兰登·拜【球探，纳米「布伦丹·拜」分歧】；eduardo-delmas=爱德华多·德尔马斯【纳米】；derlis-gonzalez=德里斯·冈萨雷斯、hector-bellerin-moruno=埃克托·贝莱林、marc-guiu-paz=马克·吉乌【常识级】；jade-le-guilly=杰德·勒·吉利【网易】；leonardo-da-silva-lopes=莱昂纳多·洛佩斯【纳米/雷速一致，球探「李奥纳多」分歧】；gideon-mensah=吉迪恩·门萨【百科/快懂/纳米一致】；noe-carrillo-collazo=诺埃·卡里略【球迷屋全名+新浪姓一致】；matisse-samoise=马蒂斯·萨莫瓦斯【纳米多数，捷报「萨莫兹」分歧】；joaquin-seys=华金·塞斯【百科专条+捷报+球探一致，百科「若阿金」分歧】）后 140/140 命中 0 未命中；词库 1360→1373。
- 6a 重合并（内联正文「11 个观测点（00–12 时）」+ 名单生成于 04:40:14Z）+ 6b 发布 verified=true（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T12（T00–T11 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 11:3x（11 点整点）— 成功（含重合并 + 重发布；线上 current.json 两轮复验均为 T10 旧值，判定边缘缓存漂移、如实记录）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 191 / PC 180 有效价，both 178）、进化榜 500 张全有热度。
- current.json 1903 张、generatedAt 03:32:58.340Z（北京 11:32:58）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 03:26:31Z）；daily-merged 镜像一致。
- watchlist：watch 265 / undervalued 94 / trending 199 / hotEvo 500 / pendingPrice 967；hourlyPoints 10（00–11）。Top3：安东尼·戈登(83) 92、安东尼·戈登(82) 88（挂单价上行 +14.29%）、布卡约·萨卡 85。
- 相对 T10（可比 Console 170 / PC 163）：上涨 110 / 下跌 172，无 ≥40% 价格变动；热度可比 216 点，上涨 98 / 下跌 110，≥60% 变动 16 处以 Courtois +150%、Semenyo +142.1%、McTominay +119% 领涨。
- 译名补 9 条（noahkai-banks=诺亚凯·班克斯【百科/球探/7M/BooScore 多源一致】；erik-lira=埃里克·利拉【纳米，Futmetrix「里拉」分歧】；lucas-lopes-beraldo=卢卡斯·贝拉尔多【纳米/百科/快懂/搜狗一致】；diego-luna=迭戈·卢纳【纳米/雷速一致，直播吧「鲁纳」分歧】；felipe-rodrigues-da-silva=费利佩·莫拉托【纳米/百科两专条一致】；oihane-hernandez-zurbano=奥伊哈内·埃尔南德斯【百科/懂球帝一致，「奥雅妮」分歧旧译】；santiago-ramos-mingo=桑蒂亚戈·拉莫斯·明戈【百科专条，央视「圣地亚哥」分歧】；riley-tiernan=赖利·蒂尔南【网易/BooScore 一致】；linus-wahlqvist-egnell=利努斯·瓦赫奎斯特【雷速/网易一致，百科「瓦赫尔奎斯特」/澳客「瓦尔奎斯特」分歧、取两源一致者留痕】）后 140/140 命中 0 未命中；词库 1351→1360。
- 6a 重合并（内联正文「10 个观测点（00–11 时）」+ 名单生成于 03:33:03Z）+ 6b 发布 verified=true（应用/链接不变）；**线上 current.json 首查 200 但 generatedAt 仍为 T10（02:26:18.916Z），重试部署 1 次后 20 秒复验仍为旧值（retryCount=1，契约上限）→ 按契约判定为边缘缓存短时漂移、不判发布失败，已如实记入 publish-hourly.json T11 的 error 字段，下次整点发布自然覆盖**。
- 未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 10:2x（10 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 190 / PC 186 有效价，both 182）、进化榜 500 张全有热度。
- current.json 1899 张、generatedAt 02:26:18.916Z（北京 10:26:18）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 02:21:00Z）；daily-merged 镜像一致。
- watchlist：watch 256 / undervalued 77 / trending 200 / hotEvo 500 / pendingPrice 964；hourlyPoints 9（00–10）。Top3：安东尼·戈登(83) 93、安东尼·戈登(82) 84、长谷川唯 88（挂单价上行 +3.85%）。
- 相对 T09（353 可比平台价）：中位 −2.50%，上涨 80 / 下跌 229；≥40% 价格变动仅 1 处（Rogers PC +50.0%，1200→1800 万级低价卡）；热度 ≥40% 变动 35 处，以 Mateo +161.5%、C 罗 +150.0%、Reijnders +127.3% 领涨。
- 译名补 11 条（aristide-zossou=阿里斯蒂德·佐苏【纳米×2/直播吧一致】；ben-house=本·豪斯【纳米×3】；frederic-guilbert=弗雷德里克·吉尔贝【百科专条，澳客「吉尔伯特」分歧】；junior-dina-ebimbe=朱尼尔·迪纳·埃比贝【网易/百度体育/球迷屋一致，百科「埃班贝/埃宾贝」分歧】；lucas-buades=卢卡斯·布阿德斯【nowscore 简体，繁体「布迪斯」分歧】；min-hyeok-yang=梁民革【百度体育/滚球一致，注意非「梁民赫」】；paul-joly=若利【百科专条】；philip-otele=菲利普·奥特尔【纳米×2/球探/球迷屋一致，百科「奥特莱」分歧】；rodinei-marcelo-de-almeida=罗迪内【百科/快懂/懂球帝一致】；sandro-ramirez-castillo=桑德罗·拉米雷斯【百科专条】；zoran-moco=佐兰·莫科【球探/纳米/直播吧一致】）后 140 名中 138 命中；**marina-marti-serna（Marina Martí，瓦伦西亚女足边缘球员）两轮检索均无任何中文来源，按规则保留英文并记入 missing**，未猜测填充。词库 1340→1351。
- 6a 重合并（内联正文「9 个观测点（00–10 时）」+ 名单生成于 02:26:23Z + 头像 124/140）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T10（T00–T09 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 09:1x（09 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 196 / PC 192 有效价，both 187）、进化榜 500 张全有热度。
- current.json 1897 张、generatedAt 01:13:53Z（北京 09:13:53）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 255 / undervalued 74 / trending 199 / hotEvo 500 / pendingPrice 966；hourlyPoints 8（00–09）。Top3：安东尼·戈登(83) 92、安东尼·戈登(82) 85（挂单价上行 +3.7%）、芭芭拉·班达 84。
- 相对 T08（314 可比平台价）：中位 −2.06%，上涨 115 / 下跌 199；≥40% 变动 4 处（Pickford Console +90%/PC +75%、Mateo PC +80%、Stanway Console +78.2%，均为万级低价卡）；热度 ≥60% 变动以 Lookman +88.7%、Joan García +83.6% 领涨。
- 译名补 4 条（george-ilenikhena=乔治·伊列尼肯【纳米/球探两源一致，雷速/中文百科「伊列尼赫纳」为分歧】；theo-corbeanu=西奥·科尔贝亚努【百度百科专条，球探「科尔比亚努」/纳米「科比努」分歧】；cristiano-da-silva-leite=克里斯蒂亚诺·达席尔瓦·莱特【球探简体名「克里斯蒂亚诺」+葡语姓氏音译】；renato-palma-veiga=雷纳托·韦加【央视专页/纳米/快懂三源一致，央视新闻稿「维加」为分歧】）后 140/140 命中 0 未命中；词库 1336→1340。
- 6a 重合并（内联正文「8 个观测点（00–09 时）」+ 名单生成于 01:14:01Z + 头像 136/140）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T09（T00–T08 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 08:0x（08 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 192 / PC 186 有效价，both 183）、进化榜 500 张全有热度。
- current.json 1895 张、generatedAt 00:02:50Z（北京 08:02:50）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 252 / undervalued 62 / trending 196 / hotEvo 500 / pendingPrice 962；hourlyPoints 7（00–08，07 点快照缺失属相位跳过）。Top3：安东尼·戈登(83) 92、艾娃·帕约尔 86（挂单价上行 +4.76%）、芭芭拉·班达 86。
- 相对 T06（356 可比平台价）：上涨 122 / 下跌 188；≥40% 变动 5 处（Bacha PC +114.3%、Geyoro PC +94.2%、Kelly Console +79.7%/PC +69.2%、Anyomi PC +51.9%）；热度 ≥60% 变动以 Kelly +176.9%、Bacha +125.0% 领涨。
- 译名补 4 条（benjamin-dominguez=本哈明·多明格斯【百科/虎扑「本哈明」、纳米/球探「本杰明」分歧，取百度百科专条留痕；格斯/戈斯亦分歧】；henrik-heggheim=亨里克·海格海姆 纳米多数/球迷屋一致；risa-shimizu=清水梨沙 百科/快懂/中文百科一致；taha-sahin=塔哈·沙欣 懂球帝/BooScore/网易一致）后 140/140 命中 0 未命中；词库 1332→1336。
- 6a 重合并（内联正文「7 个观测点（00–08 时）」+ 名单生成于 00:02:58Z + 头像 137/140）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T08（T00–T06 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 06:53（06 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 202 / PC 189 有效价，both 186）、进化榜 500 张全有热度。
- current.json 1894 张、generatedAt 22:53:56Z（北京 06:53:56）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 248 / undervalued 68 / trending 187 / hotEvo 500 / pendingPrice 960；hourlyPoints 6（00–06）。Top3：艾娃·帕约尔 89（挂单价上行 +23.53%）、若昂·坎塞洛 89（+18.75%）、安东尼·戈登(82) 84。
- 译名补 8 条（panos-katseris=帕诺斯·卡瑟里斯【纳米两处一致，百科「卡采里斯」/球探「卡塞里斯」分歧、取纳米留痕】；idjessi-metsoko=伊杰西·梅佐科 百科/纳米一致；paul-pogba=保罗·博格巴 常识级；yoan-bonny=安热-约安·博尼 百科/快懂一致【FUTBIN slug 省略 Ange-】；laurin-curda=劳林·库尔达 百科/纳米一致、球探「库达」分歧；samuel-dahl=萨穆埃尔·达尔 纳米/球迷屋一致、球探「塞缪尔」分歧；davidson-da-luz-pereira=戴维森·达卢斯·佩雷拉【百科两条「松/森」分歧、取懂球帝常用「森」留痕】；gabriela-nunes-da-silva=加比·努内斯 纳米/懂球帝一致）后 140/140 命中 0 未命中；词库 1324→1332。
- 6a 重合并（内联正文「6 个观测点（00–06 时）」+ 名单生成于 22:53:59Z + 头像 133/140 + 追踪 1,208）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T06（T00–T05 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。

## 2026-09-19 05:52（05 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 202 / PC 190 有效价，both 186）、进化榜 500 张全有热度。
- current.json 1894 张、generatedAt 21:49:39Z（北京 05:49:39）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 264 / undervalued 72 / trending 192 / hotEvo 500 / pendingPrice 912；hourlyPoints 5（00–05）。Top3：安东尼·戈登(82) 89、艾娃·帕约尔 87、芭芭拉·班达 87。
- 相对 T04（307 可比平台价）：中位 −1.02%，≥40% 变动 2 处（Brugts PC +71.6%、亚马尔 PC +68.5%）；热度 ≥60% 变动 6 处（Martínez +84.2%、Nuno Mendes +81.8%、Rúben Dias +77.8% 领涨）。
- 译名补 4 条（simon-colyn=西蒙·科林 百科/纳米一致；evren-eren-elmal=埃伦·埃尔马勒 央视；deandre-kerr=迪安德·克尔 纳米×2/网易一致；gokhan-sazdag=萨兹达吉 百科/球探一致）后 140/140 命中 0 未命中；词库 1320→1324。
- 6a 重合并（内联正文「6 个观测点（00–05 时）」+ 名单生成于 21:49:47Z）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T05（T00/T01/T03/T04 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。

## 2026-09-19 04:4x（04 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 197 / PC 188 有效价，both 184）、进化榜 500 张全有热度。
- current.json 1892 张、generatedAt 20:45:06Z（北京 04:45:06）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 258 / undervalued 71 / trending 188 / hotEvo 500 / pendingPrice 870；hourlyPoints 4（00–04）。Top3：艾娃·帕约尔 92、安东尼·戈登 91、马特乌斯·努内斯 84（挂单价上行 +17.65%）。
- 相对 T03（305 可比平台价）：无 ≥40% 价格变动；热度 ≥60% 变动 8 处（Olise +338.1%、Marquinhos +110.8%、Isak +92.7% 领涨）。
- 译名补 1 条（facundo-mura=法昆多·穆拉，纳米/雷速多源一致）后 140/140 命中 0 未命中；词库 1319→1320。
- 6a 重合并（内联正文「4 个观测点（00–04 时）」+ 名单生成于 20:45:19Z + 头像 139/140）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T04。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:52）。

## 2026-09-19 01:56（01 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 190 / PC 185 有效价，both 182）、进化榜 500 张全有热度。
- current.json 1463 张、generatedAt 17:51:31Z（北京 01:51:31）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 17:49:43Z）；daily-merged 镜像一致。
- watchlist：watch 226 / undervalued 61 / trending 174 / hotEvo 500 / pendingPrice 548；hourlyPoints 2（00–01）。Top3：安东尼·戈登 91、长谷川唯 87（挂单价上行 +11.43%）、哈兰德 83。
- 译名补 9 条（jonathan-clauss=乔纳森·克劳斯、mauricio-cuevas=毛里西奥·奎瓦斯、maxim-de-cuyper=马克西姆·德屈佩、nuno-tavares=努诺·塔瓦雷斯、sergi-cardona=塞尔吉·卡多纳、kyle-walker=凯尔·沃克、davide-bartesaghi=达维德·巴尔特萨吉、diego-leon=迭戈·莱昂、givairo-read=吉瓦罗·里德；均为常识级知名球员通用译名）后 140/140 命中 0 未命中；词库 1074→1083。
- 渲染隔离确认：market.json 当日不存在（03:05 每日任务未到点），扫描页如实空状态属预期。
- 6a 重合并（内联正文「2 个观测点（00–01 时）」+ 名单生成于 17:51:36Z + 头像 136/140）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T01。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 00:47（00 点整点，新日期首点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 190 / PC 181 有效价，both 177）、进化榜 500 张全有热度。
- current.json 1459 张、generatedAt 16:44:54Z（北京 00:44:54）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像同步一致。
- watchlist：watch 208 / undervalued 71 / trending 0（新日期首点无相邻观测，属预期）/ hotEvo 500 / pendingPrice 542；hourlyPoints 1（00）。Top3：安东尼·戈登 90、芭芭拉·班达 90、哈兰德 89。
- 译名补 3 条（michael-cheek=迈克尔·奇克 纳米/球探/懂球帝三源一致；juan-camilo-hernandez-suarez=库乔·埃尔南德斯 百科/纳米多源一致；kacper-urbanski=卡茨佩尔·乌尔班斯基 百度百科/中文百科/直播吧多数一致、快懂百科「卡佩尔」为分歧）后 120/120 命中 0 未命中；词库 1071→1074。
- 6a 重合并（新日期首版 index.html 2.9 MB，内联正文「1 个观测点（00–00 时）」+ 名单生成于 16:45:06Z；当日仅市场栏目已有产物，新闻/足球等尚未到点属预期）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 新日期首键 T00。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-18 23:41（23 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 185 / PC 178 有效价，both 173）、进化榜 500 张全有热度。
- current.json 1458 张、generatedAt 15:38:05Z（北京 23:38:05）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留）。
- watchlist：watch 289 / undervalued 87 / trending 199 / hotEvo 500 / pendingPrice 1003；hourlyPoints 16（01–23 全连）。Top3：安东尼·戈登 91、普比尔 87、若昂·坎塞洛 86。
- 译名补 2 条（antoine-hainaut=安托万·海诺、jordan-houston=乔丹·休斯顿；Hainaut 源间分歧——百科「艾诺」、纳米+BooScore「海诺」，按先例取两源一致者留痕；Houston 纳米/网易/BooScore 三源一致）后 140/140 命中 0 未命中；词库 1069→1071。
- 6a 重合并（内联正文 16 观测点 01–23 时 / 名单生成于 15:38:14Z）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T23。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-18 20:17（20 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 179 / PC 174 有效价，both 169）、进化榜 500 张全有热度。
- current.json 1453 张、generatedAt 12:17:38Z（北京 20:17:38）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留，observedAt 12:15:26Z）。
- watchlist：watch 274 / undervalued 73 / trending 205 / hotEvo 500 / pendingPrice 1009；hourlyPoints 13（01–20）。Top3：安东尼·戈登 91、马里奥·希拉 87、安东尼·戈登(82) 85。
- 相对 T19（325 可比平台价）：中位 0.00%，≥40% 变动 2 处（Geyoro PC +56.1%、亚马尔 PC −45.9%）；热度 ≥60% 变动 3 处（Miley +88.2%、Ødegaard +78.6%、B费 +63.4%）。
- 译名补 1 条（ryanne-brown=赖安·布朗，网易/BooScore 两源一致）后 140/140 命中 0 未命中；词库 1062→1063。
- 6a 重合并（内联正文 13 观测点/最新 20 时/追踪 1,283）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T20。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-18 19:11（19 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 183 / PC 184 有效价，both 177）、进化榜 500 张全有热度。
- current.json 1452 张、generatedAt 11:12:03Z（北京 19:12:03）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 11:09:43Z）。
- watchlist：watch 269 / undervalued 74 / trending 204 / hotEvo 500 / pendingPrice 1005；hourlyPoints 12（01–19 全连）。Top3：安东尼·戈登 91、长谷川唯 90（挂单价上行 +15.07%）、格雷茨卡 85。
- 相对 T18（221 张可比卡）：价格中位 +1.86%，≥40% 变动 4 处（Caicedo PS +133.8% / PC +44.0%、Yılmaz PC +57.1%、Safonov PC −48.6%）；热度 ≥40% 变动 28 处（C 罗、汉茨科 +94% 领涨，属开服前热度基数小的正常波动）。
- 译名补 3 条（albert-eames=阿尔伯特·伊姆斯、camryn-biegalski=卡姆林·比加尔斯基、ryan-metu=瑞安·梅图，均纳米数据/球探体育/网易多源一致）后 140/140 命中 0 未命中；词库 1059→1062。
- 6a 重合并 + 6b 发布成功（应用/链接不变）；发布前已验内联正文构建期字段：12 个观测点（01–19 时）、追踪卡数 1,274、球员头像 136、生成于 2026-09-18T11:12:08Z。线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T19（T01–T18 保留）。
- 未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:35）。
- 小坑：`json.load()` 不接受 `object_pairs_hook` 关键字（须 `json.loads(open().read(), object_pairs_hook=...)`），写 publish-hourly.json 时首跑报 TypeError、修正后成功。

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

## 2026-09-18 21:23（21 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 185 / PC 181 有效价，both 179）、进化榜 500 张全有热度。
- current.json 1454 张、generatedAt 13:23:57Z（北京 21:23:57）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 13:21:43Z）。
- watchlist：watch 288 / undervalued 86 / trending 207 / hotEvo 500 / pendingPrice 995；hourlyPoints 14（01–21）。Top3：安东尼·戈登 91、格雷茨卡 88（挂单价回落 −47.37% 待整点确认）、恩德里克 85。
- 相对 T20（321 可比平台价 / 225 可比热度点）：价格与热度中位均 0.00%，无 ≥40% 价格变动；热度 ≥60% 变动 2 处（cardId 21965 +73.3%、21977 +60.9%）。
- 译名补 3 条（tyler-fletcher=泰勒·弗莱彻、mathys-tel=马蒂斯·特尔、norbert-wojtuszek=诺伯特·沃伊图泽克，纳米/BooScore/网易多源一致）后 140/140 命中 0 未命中；词库 1063→1066。
- 6a 重合并（内联正文 14 观测点 01–21 时 / 名单生成于 13:24:02Z）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T21。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:35）。

## 2026-09-18 22:41（22 点整点）— 成功（含重合并 + 重发布；线上核对 1 次缓存漂移、重试 1 次后一致）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 187 / PC 183 有效价，both 178）、进化榜 500 张全有热度。
- current.json 1455 张、generatedAt 14:30:32Z（北京 22:30:32）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 14:27:48Z）。
- watchlist：watch 286 / undervalued 77 / trending 205 / hotEvo 500 / pendingPrice 1005；hourlyPoints 15（01–22）。Top3：安东尼·戈登 91、芭芭拉·班达 88（挂单价上行 +9.09%）、长谷川唯 84。
- 相对 T21（339 可比平台价 / 226 可比热度点）：价格与热度中位均 0.00%；价格 ≥40% 变动 1 处（Asencio Console +53.8%）；热度 ≥40% 变动以女足系为主（Hemp +93.3%、Athenea +84.6%、Stanway +65.0%、Gyökeres +63.2%）。
- 译名补 3 条（martha-harris=玛莎·哈里斯、momoko-tanikawa=谷川萌萌子、justin-von-der-hitz=贾斯汀·冯·德·希茨，分别经很多球/百度百科多源、纳米/懂球帝/直播吧/雷速一致核验）后 140/140 命中 0 未命中；词库 1066→1069。
- 6a 重合并（内联正文 15 观测点 01–22 时）+ 6b 首次发布成功（应用/链接不变）；线上 current.json 首查 200 但 generatedAt 仍为 T21（13:23:57Z，边缘缓存漂移形态），按契约不判失败、重试部署 1 次后 20 秒复验即与本地一致（retryCount=1）；publish-hourly.json 记 T22。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-19 03:0x（03 点整点）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次导航成功（无 403）：热门榜 250 张（Console 186 / PC 180 有效价，both 177）、进化榜 500 张全有热度。
- current.json 1464 张、generatedAt 19:00:59Z（北京 03:00:59）；幂等合并复核通过（同相位传奇任务 131 条 card-scope priceRange 完整保留，observedAt 18:59:10Z）；daily-merged 镜像一致。
- watchlist：watch 240 / undervalued 64 / trending 179 / hotEvo 500 / pendingPrice 540；hourlyPoints 3（00–03）。Top3：安东尼·戈登(83) 92、哈兰德 87（挂单价上行 +13.91%）、安东尼·戈登(82) 84。
- 译名补 2 条（connor-roberts=康纳·罗伯茨、jose-diogo-dalot-teixeira=迪奥戈·达洛特，百科/央视/纳米/搜狗多源一致）后 140/140 命中 0 未命中；词库 1083→1085。
- 渲染隔离确认：market.json 当日不存在（03:05 每日任务未到点），扫描页如实空状态属预期；内联正文「3 个观测点（00–03 时）」+ 名单生成于 19:01:03Z + 头像 136/140、追踪 780（新日期无 market.json 参与的 universe，属预期）。
- 6a 重合并（index.html 3.1 MB）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T03（T00/T01 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-20 17:21（T17 轮）：采集失败（来源页 Uncaught ×4），未合并/未渲染/未发布
- triage OK / exit 0，通道健康；collect-market-prices.mjs 两页各 2 次导航（含 45 秒退避重试）均报「Uncaught」，0 卡采到，采集器退出码 1。按契约未执行后续 ③–⑥ 步，current.json 未被触碰。
- 留证：automation/runs/2026-09-20/market/hourly-17-failed.json + prices/fc27/last-attempt.json。错误特征为 Uncaught（区别于 09-18/09-19 的超时/403 形态），属 FUTBIN 侧临时异常，等 18 点下轮自动恢复。
- lastValid：current.json 保留 T16（generatedAt 2026-09-20T08:15:29Z，2331 卡）；线上站点保留 T16 版本。今日快照至 T16（T13 当日既有缺失）。

## 2026-09-20 23:36（T23 轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 Uncaught/403）：热门榜 250 张（Console 198 / PC 181 有效价，both 179）、进化榜 500 张全有热度。
- current.json 2387 卡、generatedAt 2026-09-20T15:36:45Z（北京 23:36:45）；幂等合并复核通过（传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 334 / undervalued 92 / trending 218 / hotEvo 500 / pendingPrice 960；观测点 16 个（00–23）。Top3：安东尼·戈登(83) 89、哈兰德 88（进化 OTW Retro 18）、安托万·塞梅诺 85（挂单价上行 +59.09%）。
- 相对 T16（7 小时前，228 卡可比）：价格变动 314 处，最大 Semenyo PC +122.7%、Console +59.1%、Clara Mateo PC +52.8%；热度变动 212 处，Semenyo +657.1%（28→212）最显著。
- 译名补 7 条（montrell-culbreath=蒙特雷尔·卡尔布雷斯、henry-martin=亨利·马丁、rahim-ali=拉希姆·阿里、amadou-ba-sy=阿马杜·巴赛、olimpiu-morutan=奥林皮乌·莫鲁坦、malang-sarr=马朗·萨尔、edon-zhegrova=埃东·泽格罗瓦）后 140/140 命中 0 未命中；词库 1660→1667。
- 6a 重合并（index.html 3.3 MB，内联正文 16 观测点 00–23 时）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T23。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-21 03:47（T03 轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 Uncaught/403）：热门榜 250 张（Console 198 / PC 181 有效价，both 180）、进化榜 500 张全有热度。
- current.json 2827 卡、generatedAt 2026-09-20T19:48:17.616Z（北京 03:48:17）；幂等合并复核通过（传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 240 / undervalued 58 / trending 154 / hotEvo 506 / pendingPrice 744。Top3：安东尼·戈登(83) 94 ×2 卡、芭芭拉·班达 92。
- 相对 T23（09-20，4.5 小时前，237 卡可比）：价格变动 313 处，最大 Temwa Chawinga PC +98.6%、Rutter Console −60.0%/PC −58.1%、Nicole Anyomi PC +45.1%、Diani PC +39.8%；热度 ≥40% 变动 23 处。
- 译名补 1 条（arthur-atta=亚瑟·阿塔，纳米/球迷屋一致、百科作阿蒂尔·阿塔）后 140/140 命中 0 未命中；词库 1883→1884。
- 6a 重合并（index.html 3.0 MB）+ 6b 发布成功（应用/链接不变）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T03。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-21 07:5x（07 点整点，新日期首轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次尝试成功（无 403、无挑战页）：热门榜 250 张（Console 195 / PC 172 有效价，both 171）、进化榜 500 张全有热度。
- current.json 2,830 张、generatedAt 23:54:46.616Z（北京 07:54:46）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 269 / undervalued 61 / trending 171 / hotEvo 521 / pendingPrice 913；universe.tracked 1,182；当日观测点 2 个（03、07）。Top3：安东尼·戈登(83) 93 ×2（基础+进化 Believe 并列）、长谷川唯(88) 90。
- 相对 T03（当日 03:05 日任务观测）：平台价可比 527 点，涨 160 / 跌 131 / 平 236；≥40% 仅 2 处（Chawinga PC −46.8% 69,500→37,000、Caicedo PC +60% 16,250→26,000）。热度可比 499 点：涨 140 / 跌 75 / 平 284；≥60% 以 Quiñones +120%、Palestra +91.7%、O'Reilly +75%、Barella +74.1%、Tonali +73.9% 领涨。
- 译名补 6 条（lucas-cepeda=卢卡斯·塞佩达【百科/捷报/球探/纳米一致】；findlay-curtis=芬德利·柯蒂斯【百科/纳米/球探/澳客一致】；shaquil-delos=沙奎尔·德洛斯【纳米两处「夏奎尔/沙奎尔」分歧，取沙奎尔】；daizen-maeda=前田大然【常识级，凯尔特人】；teddy-okou=泰迪·奥库【纳米×2，捷报「特迪·奥科」分歧，利雅得体育】；caylan-vickers=凯兰·维克斯【百科/中文百科一致】）后 140/140 命中 0 未命中；词库 1884→1890（新增 6、无空值）。
- 渲染 watch/scan 成功（头像落盘 74 张含新处理 7 张）；6a 重合并（index.html 3.1 MB，新增/更新共享资源 1 个文件）+ 6b 发布 verified=true（应用/链接不变，domainPrefix 按 query 用 fc27-daily-intel）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0），2,830 张；publish-hourly.json 记 T07（T03 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。
- 备注：昨日 17/18 点两轮连续失败后，今日宿主页路线正常，未复现挑战页问题。

## 2026-09-21 12:0x（T12 轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / actions [] 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 403、无挑战页）：热门榜 250 张（Console 193 / PC 180 有效价，both 177）、进化榜 500 张全有热度；priceBasis partial-live。
- current.json 2,836 卡、generatedAt 2026-09-21T04:01:16.394Z（北京 12:01:16）；幂等合并复核通过（同相位传奇任务 131 条 priceRange 完整保留，该任务 11:56 刚写过 icon-detail）；daily-merged 镜像一致。注意本轮起始态由传奇任务 11:56 写入（generatedAt 被它推进过），市场价仍是 T07 的 23:54:42Z——两任务共写同一文件属既定设计。
- watchlist：watch 275 / undervalued 87 / trending 186 / hotEvo 524 / pendingPrice 946；universe.tracked 1,221（psValid 270 / pcValid 234）；当日观测点 3 个（03、07、12）。Top3（按 cardId 去重）：安东尼·戈登(83) 91 ×2（基础+进化 Believe 并列）、长谷川唯(88) 88 ×3、德克兰·赖斯(88) 82。
- 相对 T07（4.2 小时前，222 卡可比）：Console 可比 173 中位 0.00%（涨 68 / 跌 79 / 平 26）、PC 可比 155 中位 −2.54%（涨 46 / 跌 96 / 平 13）；≥40% 仅 2 处（Hernández PC +63.1% 21,000→34,250、Caicedo Console +43.2% 20,250→29,000）。热度可比 222 中位 0.00%（涨 110 / 跌 108 / 平 4），无 ≥60% 变动，最大 David Luiz +156.5%、Mbappé +147.1%、Bühl +135.7%、Lacroix 92→200。
- 译名补 2 条（sarah-mattner=莎拉·马特纳【捷报比分网 nowscore，德籍拜仁女足前锋，奥地利 SKN 圣珀尔滕转会】；sara-agrez=萨拉·阿格雷兹【网易体育 + 纳米数据一致，斯洛文尼亚后卫，科隆女足】）后 140/140 命中 0 未命中；词库 1890→1892（新增 2、无空值）。
- 渲染 watch/scan 成功（头像落盘 78 张全为新处理 / 扫描页 547 张含新处理 477 张）；6a 重合并（index.html 2.90 MB，内联「3 个观测点（03–12 时）」+ 追踪卡数 1,221 + 名单生成于 04:01:22.248Z + 头像 134/140；逐日资源副本清理 692 文件 / 2.56 MB）+ 6b 发布 verified=true（应用/链接不变，domainPrefix 按 query 用 fc27-daily-intel）；线上 current.json 连查 2 次均 200 且 generatedAt 一致（retryCount=0，2,836 卡），并加验线上页面正文构建期字段（2.90 MB 首查即新，含新译名）；publish-hourly.json 记 T12（T03/T07 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-21 16:13（T16 轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 403、无挑战页）：热门榜 250 张（Console 197 / PC 181 有效价，both 181）、进化榜 500 张全有热度；priceBasis partial-live。
- current.json 2,837 卡、generatedAt 2026-09-21T08:13:45.479Z（北京 16:13:45）；幂等合并复核通过（传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 285 / undervalued 76 / trending 196 / hotEvo 522 / pendingPrice 942；universe.tracked 1,227；当日观测点 4 个（03、07、12、16）。Top3：安东尼·戈登(83) 92、长谷川唯(88) 90、德克兰·赖斯(88) 85。
- 相对 T12（333 个可比平台价点）：涨 206 / 跌 92 / 平 35，中位 +2.33%；≥40% 仅 4 处（Márquez PC +108.8%、Milito PC +96.7%、Anyomi PC +79.3%、Chiesa PC +42.9%）。热度可比 222 点中位 −4.95%；≥60% 共 12 处，Zaïre-Emery +233.3% 领涨。
- 译名补 5 条（埃斯特拉·卡尔波内尔、贝利·卡达马特里、伊萨克·汉森-奥勒恩、佐野航大、斯科特·特温）后 140/140 命中 0 未命中；词库 1892→1897（无空值）。
- 6a 重合并（index.html 2.90 MB）+ 6b 发布 verified=true（应用/链接不变，domainPrefix=fc27-daily-intel）；线上 current.json 连查 2 次均 200 且 generatedAt 一致（retryCount=0）；publish-hourly.json 记 T16。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-21 20:2x（T20 轮）— 采集失败（宿主页路线页内 fetch 403 ×4），未合并/未渲染/未发布
- triage OK / exit 0 / actions [] 无自愈；collect-market-prices.mjs 两页各 2 次尝试（含 45 秒退避重建宿主页）均报「页内 fetch 返回 HTTP 403」，0 卡采到，退出码 1。首次出现宿主页路线被 403 拦截的形态（此前 09-20 T17 为 Uncaught 挑战页形态）。
- 按契约未执行 ③–⑥，current.json 未被触碰（保留 T16，generatedAt 2026-09-21T08:13:45.479Z，2837 卡）；线上站点保留 T16 版本。留证：automation/runs/2026-09-21/market/hourly-20-failed.json + prices/fc27/last-attempt.json。
- 未重启代理/Chrome、未密集重试、未用历史或 FC26 填充。今日观测点至 T16（03、07、12、16）。下轮自动重试。

## 2026-09-22 00:29（T00 轮）：采集失败 —— 宿主页 fetch 403 连续第二轮
- triage OK / exit 0 / actions []，通道健康。collect-market-prices.mjs：两页页内 fetch 均 HTTP 403，每页 2 次（含 45 秒退避重建宿主页）合计 4 次全败，0 卡采到，exit 1。与 09-21 T20 同形态（连续第二轮采集侧 403）。
- 按契约终止本轮：未执行 ③④⑤⑥，未渲染、未发布；current.json 保留 09-21 T16（generatedAt 08:13:45.479Z，2837 卡）未动。
- 留证：automation/runs/2026-09-22/market/hourly-00-failed.json + prices/fc27/last-attempt.json。
- 若下轮再 403 即连续第 3 轮，按契约只追加时间戳与结论；观察是否为整段拦截窗口（参考 09-19 /players 403 时限性先例）。

## 2026-09-22 04:38（T04 轮）— 成功（含重合并 + 重发布），403 连败中断
- triage OK / exit 0 / 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 403、无挑战页）：热门榜 250 张（Console 212 / PC 200 有效价，both 199）、进化榜 500 张全有热度。09-21 T20 与 09-22 T00 连续两轮 403 后本轮恢复，确认为时段性拦截窗口而非持久封锁。
- current.json 3,233 卡、generatedAt 2026-09-21T20:35:48.108Z（北京 04:35:48）；幂等合并复核通过（传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 253 / undervalued 72 / trending 177 / hotEvo 515 / pendingPrice 840；universe.tracked 1,093；当日观测点 2 个（03、04）。Top3：Brugui(74) 94 ×2（基础+进化 Intro to Pathway 并列）、安东尼·戈登(83) 92。
- 相对 T03（1 小时前，330 平台价可比）：涨 123 / 跌 207，无 ≥40% 跳变；热度可比 206：涨 151 / 跌 55，低基数翻倍（Güler / Vini Jr. / Nmecha +100%）为主。
- 译名补 3 条（josimar-alcocer=霍西马尔·阿尔科塞尔【快懂百科官方中文名，球迷屋作祖斯马，分歧点在名不在姓】、jae-hee-jeong=郑在熙【百度百科/纳米/雷速/球迷屋一致，大田韩亚市民】、iker-moreno=伊克尔·莫雷诺【纳米/球探/网易一致，墨西哥普埃布拉】）后 140/140 命中 0 未命中；词库 2012→2015（无空值）。

## 2026-09-22 08:4x（T08 轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 403、无挑战页）：热门榜 250 张（Console 213 / PC 198 有效价，both 198）、进化榜 500 张全有热度。T00 轮 403 拦截窗口确认解除。
- current.json 3,235 卡、generatedAt 2026-09-22T00:41:38.687Z（北京 08:41:38）；幂等合并复核通过（传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 270 / undervalued 75 / trending 199 / hotEvo 515 / pendingPrice 926；universe.tracked 1,196；当日观测点 3 个（03、04、08）。Top3（按 cardId 去重）：安东尼·戈登(83) 91 ×2（基础+进化 Believe 并列）、安东尼·戈登(82) 89、罗丝·拉韦尔(87) 84。
- 相对 T04（376 平台价可比）：涨 107 / 跌 243；≥40% 仅 1 处（Athenea PC 10,500→17,000 +61.9%）。热度可比 228：≥40% 变动 78 处、以低基数翻倍为主（Rogers +190%、Brugui +177.4%、Ferran Torres +140%）。
- 译名补 7 条（leandro-antonetti=莱安德罗·安东内蒂【纳米/百科/捷报/球探一致】；jason-ceka=杰森·塞卡【球探+纳米多数；雷速作切卡】；rafik-el-arguioui=拉菲克·埃尔·阿尔古伊【纳米/球迷屋/雷速一致；澳客作阿吉维】；tim-lemperle=蒂姆·伦佩勒【球探/森盛一致；纳米作伦珀勒、百科作伦佩尔】；romain-perraud=罗曼·佩罗【纳米/百科/风暴一致】；maximiliano-salas=马克西米利亚诺·萨拉斯【百科；纳米/球迷屋作马西米里亚诺】；nicky-souren=尼基·苏伦【球迷屋/网易一致；T足球作索伦】）后 140/140 命中 0 未命中；词库 2015→2022（无空值）。
- 6a 重合并（index.html 2.87 MB，内联「3 个观测点（03–08 时）」+ 追踪卡数 1,196 + 名单生成于 00:41:47Z；逐日资源副本清理 662 文件 / 2.46 MB）。注意：merge_daily_report.mjs 不接受字面量 D（报「无效日报日期: D」），须传实际日期 2026-09-22——与市场脚本族不同，已记入长期记忆。+ 6b 发布 verified=true（应用/链接不变，domainPrefix=fc27-daily-intel）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0，3,235 卡）；publish-hourly.json 记 T08（T04 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。
- 渲染 watch/scan 成功（头像落盘 82 张、新处理 10 张）；6a 重合并（index.html 2.8 MB，共享资源 0 更新，逐日副本清理 736 文件 / 3.82 MB）+ 6b 发布 verified=true（应用/链接不变，domainPrefix=fc27-daily-intel）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0，3,233 卡）；publish-hourly.json 记 T04（当日首条，T00 失败轮无发布记录）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。

## 2026-09-22 12:5x（T12 轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 403、无挑战页）：热门榜 250 张（Console 210 / PC 198 有效价，both 198）、进化榜 500 张全有热度。
- current.json 3,239 卡、generatedAt 2026-09-22T04:51:30.446Z（北京 12:51:30）；幂等合并复核通过（传奇任务 131 条 priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 285 / undervalued 109 / trending 214 / hotEvo 517 / pendingPrice 946；universe.tracked 1,231；当日观测点 4 个（03、04、08、12）。Top3（按 cardId 去重）：安东尼·戈登(83) 91 ×2（基础+进化 Believe 并列）、长谷川唯(88) 89、芭芭拉·班达(88) 87（戈登 82 卡 87 并列第四）。
- 相对 T08（329 平台价可比）：涨 169 / 跌 160，无 ≥40% 跳变；热度可比 203：涨 120 / 跌 83，≥100% 跳变 8 处（Szoboszlai 67→162、James 54→153、Khusanov 36→76 等低基数翻倍）。
- 译名补 5 条（rasheedat-ajibade=拉什达特·阿吉巴德【百度百科/纳米一致】；lado-akhalaia=拉多·阿卡莱亚【纳米（2002 摩尔多瓦瓦杜兹前锋）；另有同名 1982 格鲁吉亚球员】；sarah-gorden=莎拉赫·戈登【网易/BooScore 一致；懂球帝作萨拉-戈登】；jordyn-huitema=乔丁·海特玛【求闻百科/维基中文一致】；javier-lopez-carballo=哈维·洛佩斯【7M 一致；澳客作贾维】）后 140/140 命中 0 未命中；词库 2022→2027（无空值）。
- 渲染 watch/scan 成功（头像落盘 617 张、新处理 547 张）；6a 重合并（index.html 2.8 MB，共享资源 0 更新，逐日副本清理 664 文件 / 2.47 MB）+ 6b 发布 verified=true（应用/链接不变，domainPrefix=fc27-daily-intel）；线上 current.json 首查 200 且 generatedAt 一致（retryCount=0，3,239 卡）；publish-hourly.json 记 T12（T04/T08 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html。
- 注意：series/popular.json 的 price[].h 是全时间戳（如 2026-09-22T08），按「小时位」查询会得到 0 可比项（本轮实测踩到，已修正）。

## 2026-09-22 16:57（T16 轮）— 成功（含重合并 + 重发布）
- triage OK / exit 0 / 无自愈；采集第 1 次尝试成功（宿主页 + 页内 fetch，无 403、无挑战页）：热门榜 250 张（Console 211 / PC 200 有效价，both 198）、进化榜 500 张全有热度。
- current.json 3,240 卡、generatedAt 2026-09-22T08:57:20.101Z（北京 16:57:20）；幂等合并复核通过（传奇任务 131 条 card-scope priceRange 完整保留）；daily-merged 镜像一致。
- watchlist：watch 286 / undervalued 80 / trending 219 / hotEvo 517 / pendingPrice 955；universe.tracked 1,241；当日观测点 5 个（03、04、08、12、16）。Top3（按 cardId 去重）：安东尼·戈登(83, Believe) 91、长谷川唯(88, OW Retro 20) 91、马尔穆什(83, Believe) 87。
- 相对 T12（Console 180 / PC 172 可比平台价）：Console 中位 +0.37%（涨 92/跌 70/平 18）、PC 中位 0.00%（涨 72/跌 80/平 20），无 ≥40% 跳变；热度可比 213 中位 −9.26%，≥40% 变动 45 处（Salah +139%、Nico Williams +118%、Chawinga +107% 领涨，低基数翻倍形态）。
- 译名补 9 条（clara-jepsen=克拉拉·杰普森、erik-ahlstrand=埃里克·阿尔斯特兰德、abdoulie-ceesay=阿卜杜利·塞赛、taichi-hara=原大智、juan-cruz-diaz-esposito=胡安·克鲁斯、nikolas-nartey=尼古拉斯·纳尔泰、annamaria-serturini=安娜玛丽亚·塞尔图里尼、jules-stawiecki=朱尔斯·斯塔维茨基、myron-van-brederode=迈伦·范布雷德罗德；均多源核验，纳米/百科分歧已择多数）后 140/140 命中 0 未命中；词库 2027→2036（无空值）。
- 渲染 watch/scan 成功（头像 128/140 与 578/582，新处理 77 + 475 张）；6a 重合并（index.html 2.70 MB，内联「5 个观测点（03–16 时）」+ 名单生成于 08:57:26.324Z）+ 6b 发布 verified=true（应用/链接不变，domainPrefix=fc27-daily-intel）；线上 current.json 连查 2 次均 200 且 generatedAt 一致（retryCount=0），并加验线上页面正文构建期字段首查即新（2.99 MB）；publish-hourly.json 记 T16（T04/T08/T12 保留）。未跑 run-state / verify-publication / coordinate，未渲染 market.html（mtime 仍 03:21）。
- 契约冲突（未触发处置，仅备案）：自动化提示词正文仍要求「预检失败写 hourly-<HH>-failed.json」，与本地契约 market-hourly.md 第 1 步（禁止该写法、改走 record-attempt.mjs）冲突；按「本地文件优先」以本地契约为准，建议后续同步自动化提示词文本。
