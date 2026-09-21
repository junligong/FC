# FC·资讯采集 自动化执行记忆

## 2026-09-20（success，一次通过）
- runId：`179693fb-5d8f-4b17-9634-e503f5f7a905`；03:00:47 启动，03:09:12 提交 success。复用 09-19 的 v2 驱动脚本（sed 改 DAY 常量到当日 work/ 即可），全程无需重跑。
- browser-triage 首次即 OK（独立 profile 9333），16/16 账号打开成功（@Fut_scoreboard 窗口内 0 条如实记录）；合并 75 条原始抽取，媒体 enrich 75/75 全解析（61 配图/12 视频/15 被引用带图），24h 窗口过滤（syndication created_at 权威回填）后入库 41 条（丢弃 34，见 work/window-dropped.json）。
- 图片落盘 44/44（curl 直连失败 44 张全部经 CDP 浏览器兜底补齐）、远程热链 0、「待翻译」0（translations-2026-09-20.json 41 条全量 AI 译文）。
- 一次成型流程无新坑；X 关键内容：晚 6 点内容 = OTW 莫拉 vs 贡萨尔维斯二选一 SBC（20k 积分，两者 Meta 评分完全相同）+ 新进化；Destined for Glory 泄露名单持续更新（全场最低 85、15 人阵容）；大力抽射被传为新版本答案；TOTW 预告（皮娜帽子戏法）。

## 2026-09-19（success，经同日重跑）
- 终态 runId：`8d64d5c5-15c6-41d7-8ccf-289956934ab2`；03:23:34 begin --rerun，03:34:22 提交 success。首次运行 `55d42f4c`（03:04:37–03:22:19）因译文未完成提交 partial，归档于 `attempts/55d42f4c…/`。
- **重大平台变更：X 全局移除 data-testid 与 `<time>`**。旧 extract-timeline.js 0 命中（16 账号全 0）。已重写 v2 并固化回 `apps/news/extract-timeline.js`：任意 `<article>` + `a[href=/handle/status/id]` 取 ID；正文 `div.font-chirp`；头部行 `div.flex.items-start.justify-between`；时间 DOM 已无 `<time>`，只保留 timeText 并粗筛，**精确 timestamp 由驱动经 syndication `created_at` 回填**（权威，24h 窗口按它过滤：65/77）。
- 采集脚本：`automation/runs/2026-09-19/news/work/collect-news-run-v2.mjs`（滚动累积抽取 + enrich + created_at 回填一体化，改 DAY 常量可复用；注意 v1 版本内残留过一行 copyFileSync no-op 守卫会崩溃，已删）。
- 数据：16/16 打开成功（@Fut_scoreboard 0 条如实记录）；入库 65 条；媒体 77/77 全解析（80 配图/8 视频/21 被引用带图）；图片落盘 73/73、0 热链；「待翻译」0（translations-2026-09-19.json 65 条全量 AI 译文）。
- 坑①：`preTranslationOf` 要求译文**含至少一个汉字**（CJK 正则）——纯表情推文给「👀」会被判「待翻译」，需写成「👀（原推仅含表情符号，无文字内容）」。
- 坑②：`--rerun` 会把 `runs/D/news/` 整体 rename 进 attempts/，work/ 下的临时脚本随之搬家，重跑前先恢复脚本。
- 坑③：同一 JSON 多个 Edit **并行**会丢更新（本次 3 条译文编辑丢失、65 键变 64 键）——逐个顺序编辑。
- 赶硬限的用法：首次 partial 后立即 `--rerun`，后台重采集（证据 openedAt 自动满足 ≥ 新 startedAt），采集期间写译文文件，全程 ~11 分钟完成 success，赶在 03:35 汇总发布前。
- X 关键内容：FC27 Early Access 开放（世界之_game→The Grounds 社交足球场）；EASFC Tracker 更新（自定义按键误触发等问题）；每日登录消耗品礼包暂停（含非消耗品）；Emotes 与开幕球场 11v11 暂时下架；新 SBC 积分制（可用低评卡）；6PM 内容 = OTW Bouaddi SBC（20k 评分）+ LB/RB 进化（max79）+ 拼图 SBC + 25k 礼包（限 5）；防守机制好评（AI 防守/二人包夹削弱）；失衡盘带（灵活/平衡/盘带均 75+）克制 Bruiser；Destined for Glory 预告：Isak、Bissek 下周五。

## 2026-09-18（success，首次 success）
- runId：`86edccb1-2780-4286-ab59-74574960dcf8`；03:00:42 启动，03:09:27 提交 success。
- 16/16 账号全部打开成功（@Fut_scoreboard 当日 DOM 内 0 条，如实记录），入库 89 条推文。
- 媒体解析 89/89（配图 72 张 / 11 视频 / 4 卡片 / 17 被引用带图）；图片落盘 83/83，0 远程热链；「待翻译」0。
- **流程定型（本轮起为 success 基线）**：单 tab 顺序采集（每页开→探 article 数→eval→close，共约 4 分钟）→ 合并 tweets-D.json → enrich（syndication 全成）→ **enrich 进行期间即读正文写 translations-D.json**（键=推文 ID 全量 89 条）→ generate_report 一次成型 → 自检（待翻译/媒体未解析/热链均 0）→ finish success。采集驱动脚本留存于 `automation/runs/2026-09-18/news/work/collect-news-run.mjs`，可复用（改 DAY 常量）。
- X 关键节点内容：预购传奇包（Pre-Order Icons）12:30 起 Xbox/PS 全开放；Xbox 提前解锁（NZ 地区）争议；新 SBC 积分制系统明日上线；EASFCDirect 两条 SBC 补偿公告（TOTW 金卡误发、金卡升级修复）。

## 2026-09-17（partial，成功采集）
- runId：`a1cb95c8-11f8-4614-b3a6-d1cd877555ac`；03:05:42 启动，03:16:39 提交 partial。
- 16/16 账号全部打开成功（@EASFCDirect 24h 窗口 0 条，如实记录），入库 71 条推文。
- 媒体解析 71/71（52 配图 / 9 视频 / 4 卡片 / 17 被引用带图）；图片落盘 61/61，0 远程热链；news-media 回归 14/14 绿。
- **新坑①**：CDP Proxy `/eval` 返回包裹为 `{"value": "..."}`（不是 `result`），解析脚本必须同时兼容两键，否则会把成功抽取误判为异常。
- **新坑②**：syndication 给动图（animated_gif）封面的路径是 `pbs.twimg.com/tweet_video_thumb/…`，不在 `isCacheableXImage` 白名单 → 报告残留远程热链。已修 `shared/lib/report-assets.mjs`（新增 `/tweet_video_thumb/`）并重跑生成器补齐。
- partial 原因：翻译服务本轮 0 条译文，71 条卡片按契约标「待翻译，请查看原文」。下次可考虑在 enrich 后由 AI 批量补 `translations_patch.json`。

## 2026-09-16（failed）

- runId：`db98e026-c514-4ed7-8b2a-c59f9985999a`
- 状态：**failed**（采集第一步即中止，0 条推文）
- 根因：浏览器 Chrome 插件 extension 通道未建立 —— `init --mode extension` 返回 `RelayUnreachable`（缺 `DUMATE_HOST_URL`）；relay.connected 空；NativeMessagingHosts 无 `com.workbuddy.extension.json`；日常 Chrome 未开 `--remote-debugging-port`。
- 证据：`automation/runs/2026-09-16/news/evidence.json`（4 项探针原始返回记录于 notes）
- 产物：`reports/daily/2026-09-16/news.html`（FAILED 徽标，卡片 0，含「本轮说明」「缺失项记录」）
- 未回退 IAB、未新建 profile、未用历史日期数据填充。

## 结论（2026-09-16 13:40 更正，覆盖上文）
- **上文「浏览器通道在 WorkBuddy 运行时无法建立，需用户侧修复（接通 Chrome 扩展 / 注册 native messaging 宿主）」的结论作废。** 逐字节核查确认：WorkBuddy 桌面端 v5.5.6 根本没有实现 `com.workbuddy.extension` 原生消息宿主（`app.asar` 中 `connectNative` / `NativeMessaging` / 扩展 ID 命中数全为 0），属产品侧缺口，用户侧无法修复；该扩展已在用户机器上禁用。**不要再排查或配置它，也不要用 Chrome 插件 / `extension` 模式。**
- **现行唯一通道 = `Web Access（浏览器自动化）` 技能**：CDP Proxy(:3456) 直连用户日常已登录 Chrome。前置开关 `chrome://inspect/#remote-debugging` 的 *Allow remote debugging for this browser instance* 已由用户开启，且**跨 Chrome 重启持久生效**（`Local State → devtools.remote_debugging={"user-enabled":true}`；`DevToolsActivePort` 端口 9222）。已固化 `~/.workbuddy/skills/web-access/config.env` → `WEB_ACCESS_BROWSER=chrome`（此前为空会让任务拿到 exit 2「needs decision」而卡住）。
- 自检：`node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → **exit 0 才继续**；exit 1 才是开关未开（唯一自动补救是 `open -a "Google Chrome" chrome://inspect/#remote-debugging`，勾选必须人工完成）；`curl 127.0.0.1:9222/json/version` 返回空不能作为判据。
- 同日重跑必须带 `--rerun`：`node automation/run-state.mjs begin news D --rerun`（不带时必然被残留的 `owner.json` 锁拒绝）。`finish` 的**硬上限是 `startedAt + 20 分钟`**，最迟第 14 分钟收口转 `partial`。
- 2026-09-16 13:30 重跑结果：**16/16 账号全部打开成功**（14 个有内容），入库 31 条推文，提交 `partial`。已知限制：X 主页时间线虚拟化 + 后台标签页节流，单账号仅渲染 3–7 条，24 小时覆盖不保证 100%；配图常因懒加载未进 DOM。

## 2026-09-21（partial，采集与产物全绿，因证据字段降级）
- runId：`9c368481-49eb-463b-818e-4a48a3845888`；03:00:56 启动，03:11:16 提交。v2 驱动复用一次通过（改 DAY 常量），16/16 账号打开成功；原始抽取 67 条，24h 窗口过滤后入库 48 条（丢弃 19，见 work/window-dropped.json）。
- 数据全绿：媒体 enrich 67/67（48 配图条/4 报告视频/14 被引用带图）；图片落盘 49/49（curl 全败、CDP 浏览器兜底全补）；「待翻译」0（translations-2026-09-21.json 48 条全量 AI 译文）。
- **新教训（重要）**：如实注记（「账号当日 0 条」「全部在 24h 窗口外」）**不得写进 evidence.missingItems**——非空即触发 success 自动降级 partial；应放 `evidence.notes`。此类注记属正常运行事实，历史上同情况均按 success。且 finish 终态后重提被拒（「运行所有者不匹配或已经结束，拒绝覆盖」），无法升级。
- 4 条推文 DOM 与 syndication 同点位截断（「Show more」），按可见内容全译，未臆造。
- X 关键内容：晚 6 点 = 卢卡斯·罗萨阵型任务（82 罗萨+四档升级包）+ 拼图 SBC + 新进化（CAM max79：属性升级+银手术刀直塞/银低平抽射+影子前锋+）；EasySBC 首次 Meta 评分更新（Rapid 削弱、Power Shot 加强、属性权重上调）；荣耀之路爆料新增翁达夫、奥巴梅扬、基卡（「新的皮娜」）；西甲 POTM 竞争：亚马尔 5 球 4 助、拉菲尼亚 7 球 2 助；防守教学好评；FC27 整体口碑佳、担心补丁毁环境。
