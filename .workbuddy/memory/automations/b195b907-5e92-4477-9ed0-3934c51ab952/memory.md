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
