# FC·资讯采集 自动化执行记忆

## 2026-09-16（failed）
- runId：`db98e026-c514-4ed7-8b2a-c59f9985999a`
- 状态：**failed**（采集第一步即中止，0 条推文）
- 根因：浏览器 Chrome 插件 extension 通道未建立 —— `init --mode extension` 返回 `RelayUnreachable`（缺 `DUMATE_HOST_URL`）；relay.connected 空；NativeMessagingHosts 无 `com.workbuddy.extension.json`；日常 Chrome 未开 `--remote-debugging-port`。
- 证据：`automation/runs/2026-09-16/news/evidence.json`（4 项探针原始返回记录于 notes）
- 产物：`reports/daily/2026-09-16/news.html`（FAILED 徽标，卡片 0，含「本轮说明」「缺失项记录」）
- 未回退 IAB、未新建 profile、未用历史日期数据填充。

## 结论（持续有效）
- 浏览器通道在 WorkBuddy 运行时无法建立，需用户侧修复（Chrome 扩展与桌面端接通、注册 native messaging 宿主），否则 news/market/evolution 每日均失败。
