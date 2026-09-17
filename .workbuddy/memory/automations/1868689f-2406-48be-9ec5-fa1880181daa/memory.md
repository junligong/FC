# FC·传奇英雄监控 自动化执行记忆（1868689f）

## 2026-09-17（首次记录，状态 failed）
- runId `adb415d7-98d7-4c64-9ded-a186c31d1ed5`，03:00:30 启动，03:04 提交 `failed`（未超 deadline 03:15:30）。
- **失败根因：来源侧拦截，不是浏览器通道故障。** `check-deps.mjs` → exit 0（Chrome, port 9222）正常。
  FUTBIN `/players` 列表目录全部返回自有 403 页（`/27/players`、`?page=1`、`?rarity=icon`、`/27/players/evolutions`、乃至 `/26/players`），
  而 `/`（335 KB 正常渲染）、`/27/popular`、`/27/player/21487/maradona`（双平台单元格 11+11）均正常 → 分路径拦截，疑似 IP/会话级反爬。
- 合规处置：未回退任何禁止入口；**未写 2026-09-17 快照**（record-icons-daily 会拿昨日 base-icons.json 生成虚假当日快照）；未用 FC26/旧数据填充；未算涨跌。
- **渲染件主动不发布**：渲染出的 `reports/daily/2026-09-17/icons-heroes.html` 移存到 `automation/runs/2026-09-17/icons-heroes/work/icons-heroes.rendered-notShipped.html`，`reports/daily/2026-09-17/` 保持为空。原因两条：
  1. 渲染器 `today` 回退到最近快照（`snapshots[snapshots.length-1]`），且 `if (!today)` 分支永不触发 → 页面**无任何「本日无新采集」标识**，会把 09-16 价格呈现为 09-17 数据。
  2. 英雄区块由 `heroes/data` **递归扫描**读入 `heroes/data/prices/fc26/base-heroes.json`，把 **93 张 FC26 英雄卡**渲染成「英雄卡（Hero）台账」。
- **既有缺陷（非本轮引入）**：`reports/daily/2026-09-16/icons-heroes.html` 同样含「英雄卡全量 93 张」的 FC26 数据，线上「传奇/英雄监控」子标签的英雄区块自建版起即跨代混入。建议单独修 `render-icons-heroes.mjs` 的英雄数据源约束（限定 `fc27` 路径 + 校验 game 字段）。
- 证据：`automation/runs/2026-09-17/icons-heroes/evidence.json`（含 10 个来源的 URL/打开时间/结果，其中 3 个对照组 ok）。
- 下次执行要点：先单次重试 `/27/players`（该 403 具时限性，09-16 08:17Z 曾正常返回 30 行）；若仍 403，**退避到分钟级**再试，不要秒级密集重试。
