# evolution 自动化运行记忆（f366055d）

## 2026-09-16 03:00 (Asia/Shanghai) · 状态 failed
- runId `643732d2-e91b-4417-9c44-a370768e9151`，03:00:22 启动，03:02:45 提交 failed（未超期）。
- 结果：**0 张进化卡**。原因不是「页面无数据」，而是浏览器扩展通道不可用，采集在第一步即中止。
- 四个已确证事实（下次执行可先复跑这些探针，2 分钟内即可判定）：
  1. `dumate-browser-cli init --mode extension` → `RelayUnreachable`，需 `DUMATE_HOST_URL`，WorkBuddy 运行时不注入。
  2. `dumate-browser-cli doctor` → `relay.connected=false`（relay 在 127.0.0.1:19228）。
  3. Chrome 已装 WorkBuddy 扩展 `ajnnogdfpilbhkeggdjlcokgglijmdde`，但 `com.workbuddy.extension` 本机消息宿主**未注册**（NativeMessagingHosts 下无清单）。
  4. CDP `127.0.0.1:19222` 是 `--user-data-dir` 独立 profile 实例，**禁止使用**；127.0.0.1:18488 穷举 20 条路由全 404。
- 处置：按 evolution.md 提交 failed，未回退 IAB、未新建 profile、未用 FC26/旧日期填充。
- 产物：`automation/runs/2026-09-16/evolution/evolution.json`、`evidence.json`、`reports/daily/2026-09-16/evolution.html`（FAILED 空状态）。
- ~~待办（需用户侧操作）：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主）~~ —— **该待办作废，见下方更正。**

## 2026-09-16 13:40 更正（覆盖上文所有「待用户侧修复」结论）
- **WorkBuddy 桌面端 v5.5.6 根本没有实现 `com.workbuddy.extension` 原生消息宿主**（`app.asar` 中 `connectNative`/`NativeMessaging`/扩展 ID 命中数全为 0），属产品侧缺口，用户侧无法修复；该扩展已在用户机器上禁用。不要再排查或配置它，也不要用 Chrome 插件 / `extension` 模式。
- **现行唯一通道 = `Web Access（浏览器自动化）` 技能**（CDP Proxy :3456 直连用户日常 Chrome）。上文 12:51 记录的 exit 1「没有任何浏览器打开远程调试开关」已解决：用户已勾选该开关，且**跨重启持久**（`Local State → devtools.remote_debugging={"user-enabled":true}`，`DevToolsActivePort` 端口 9222）；`config.env` 已固化 `WEB_ACCESS_BROWSER=chrome`。
- 自检：`node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → exit 0 才继续；exit 1 时才需 `open -a "Google Chrome" chrome://inspect/#remote-debugging`（勾选必须人工完成）。FUTBIN 静态路线仍不存在（curl 403），必须走 CDP。
- 同日重跑用 `node automation/run-state.mjs begin evolution D --rerun`；`finish` 硬上限 `startedAt + 20 分钟`。
- 2026-09-16 13:30 重跑结果：提交 `partial`，采集 456 张进化卡（去重后），`evolution.html` 223,685 B。评分口径：榜单 Rating 是「进化后 OVR」（已用 Savona 球员页交叉核验 75 → 79）。

## 2026-09-16 12:51 (Asia/Shanghai) · 状态 failed（同日重跑）
- runId `a0101bcd-735b-45a6-b3f5-68fd8b15ee8b`，12:51:33 启动，12:53:06 提交 failed（期限 13:06:33，未超期）；上轮 03:00 的 runId `643732d2` 已自动归档进 attempts/。
- 结果：**0 张进化卡**。本轮起改用契约规定的 **web-access（CDP Proxy → 用户日常 Chrome）** 技能，失败点与上轮不同，且**一步可修**：
  - `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → exit 1「没有任何浏览器打开远程调试开关」；
  - 四个 profile（Chrome / Chrome Canary / Chromium / Edge）均无 `DevToolsActivePort`；兜底端口 9222/9229/9333 全关；`127.0.0.1:3456/health` 无响应；
  - 已执行技能允许的唯一自动补救（`open -a "Google Chrome" chrome://inspect/#remote-debugging`）后复跑，结果不变——**勾选只能人工完成**。
- 诊断补充：`curl futbin.com/27/popular/evolutions` → **403 / 641 B**，FUTBIN 拒绝非浏览器请求，静态路线不存在，不能用 curl/WebFetch 替代浏览器。
- 处置：按 evolution.md 第 5 条提交 failed，未回退 IAB、未新建 profile、未用 FC26 或旧日期数据填充；历史日期报告未覆盖。
- 产物：`automation/runs/2026-09-16/evolution/{evolution.json,evidence.json,report.html}`（快照 SHA-256 `4f2cb9d3…`）、`reports/daily/2026-09-16/evolution.html`（FAILED 空状态，6090 B）。
- **下次执行提示**：先跑 `check-deps.mjs`（约 5 秒）即可判定通道；exit 1 时不要再尝试静态抓取或任何被禁通道，直接留证提交 failed，并在最终回复里提醒用户勾选远程调试开关。
