# FC·资讯采集 自动化执行记忆

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
