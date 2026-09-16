# 自动化 d39303af（FC·足球日报）执行记忆

## 2026-09-16 执行摘要
- 状态：`failed`，runId `e3b7351d-205c-458b-81d0-b9f313d44547`，03:08:22 启动 → 03:09:42 提交。
- 结果：三大榜单（积分/射手/助攻）与足球资讯全部 0 条。
- 失败原因：Chrome 插件 extension 通道不可用（与同日 news/market/evolution 一致）。4 项探针实测：`init --mode extension` 返回 `RelayUnreachable`（缺 `DUMATE_HOST_URL`）；relay 未连通；Chrome 缺 `com.workbuddy.extension.json` 原生宿主；日常 Chrome 无远程调试端口。
- 三榜校验闸门退出码 1（R6 无射手/助攻数据），按契约不得提交 success，提交 `failed`。
- 产物：`reports/daily/2026-09-16/football.html`（FAILED 徽标 + 三榜空状态 + 本轮说明/缺失项）；证据 `automation/runs/2026-09-16/football/evidence.json`。
- 处置合规：未回退 IAB、未新建 profile、未用旧日期/FC26 数据填充、未做「缺数据回退英超」静默兜底。
- 待用户侧修复：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主），否则 football 每日都会失败。
