# 自动化 d39303af（FC·足球日报）执行记忆

## 2026-09-16 执行摘要
- 状态：`failed`，runId `e3b7351d-205c-458b-81d0-b9f313d44547`，03:08:22 启动 → 03:09:42 提交。
- 结果：三大榜单（积分/射手/助攻）与足球资讯全部 0 条。
- 失败原因：Chrome 插件 extension 通道不可用（与同日 news/market/evolution 一致）。4 项探针实测：`init --mode extension` 返回 `RelayUnreachable`（缺 `DUMATE_HOST_URL`）；relay 未连通；Chrome 缺 `com.workbuddy.extension.json` 原生宿主；日常 Chrome 无远程调试端口。
- 三榜校验闸门退出码 1（R6 无射手/助攻数据），按契约不得提交 success，提交 `failed`。
- 产物：`reports/daily/2026-09-16/football.html`（FAILED 徽标 + 三榜空状态 + 本轮说明/缺失项）；证据 `automation/runs/2026-09-16/football/evidence.json`。
- 处置合规：未回退 IAB、未新建 profile、未用旧日期/FC26 数据填充、未做「缺数据回退英超」静默兜底。
- ~~待用户侧修复：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主），否则 football 每日都会失败。~~ —— **该建议作废，见下方更正。**

## 2026-09-16 13:40 更正（覆盖上文）
- **WorkBuddy 桌面端 v5.5.6 根本没有实现 `com.workbuddy.extension` 原生消息宿主**（`app.asar` 中 `connectNative`/`NativeMessaging`/扩展 ID 命中数全为 0），属产品侧缺口，用户侧无法修复；该扩展已在用户机器上禁用。不要再排查或配置它，也不要用 Chrome 插件 / `extension` 模式。
- **现行唯一通道 = `Web Access（浏览器自动化）` 技能**（CDP Proxy :3456 直连用户日常 Chrome）。前置开关 `chrome://inspect/#remote-debugging` 已开启且**跨重启持久**（`Local State → devtools.remote_debugging={"user-enabled":true}`，端口 9222）；`config.env` 已固化 `WEB_ACCESS_BROWSER=chrome`。
- 自检：`node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → exit 0 才继续。
- 同日重跑用 `node automation/run-state.mjs begin football D --rerun`；`finish` 硬上限 `startedAt + 20 分钟`，最迟第 14 分钟收口转 `partial`。
- 2026-09-16 13:30 重跑结果：提交 `partial`，三榜各覆盖 8 个联赛块、30 个来源，`verify-football-boards.mjs` 退出码 **0**。缺失项：意甲/德甲/法甲/欧冠/美职联无单独联赛资讯，伤停 0 条。顺带修复了模板中「美职联积分榜引用未定义变量」的缺陷。
