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
- 待办（需用户侧操作）：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主），否则所有依赖浏览器的任务（news/market/evolution）会持续失败。
