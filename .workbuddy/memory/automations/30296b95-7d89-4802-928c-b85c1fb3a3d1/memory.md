# FC·资讯采集 自动化执行记忆

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
