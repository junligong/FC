# 市场监控 自动化执行记录

## 2026-09-16（首次记录）
- 状态：**failed**
- runId：`4d4ee634-7252-4c9e-a0c9-e44282d3ad3a`
- 失败原因：Chrome 插件 extension 通道不可用（init 返回 RelayUnreachable / 缺 DUMATE_HOST_URL；doctor relay.connected=false、extConnected=false、mode=cdp；NativeMessagingHosts 缺 com.workbuddy.extension.json；Chrome 未开 remote-debugging-port）。
- 处置：按契约未回退 IAB、未用旧日期/FC26 数据填充，四段概览与扫描维度均如实空状态。
- 产物：`reports/daily/2026-09-16/market.html`（概览）+ `market-scan.html`（扫描），均带 FAILED 徽标；证据 `automation/runs/2026-09-16/market/evidence.json`、结构 `.../market/market.json`。
- 需用户侧修复：接通 Chrome 扩展与 WorkBuddy 桌面端 native messaging 宿主，否则后续 news/market/evolution 每日仍会失败。
