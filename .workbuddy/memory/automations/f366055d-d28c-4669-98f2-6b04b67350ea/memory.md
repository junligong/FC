# evolution 自动化运行记忆（f366055d）

## 2026-09-17 03:44 (Asia/Shanghai) · 状态 partial（采集成功）
- runId `2ee3c6af-388a-4020-9586-b63d58bd2f2c`，03:46:14 启动，03:47:06 提交 partial（硬上限 04:06:14，远未超期）。全流程约 3 分钟。
- 通道：`check-deps.mjs` exit 0（Chrome :9222 / proxy ready）。**上文的通道故障结论全部作废，不要再排查。**
- 采集结果：500 张进化卡（14 条进化路径，路径数较 09-16 的 5 条新增 9 条）+ 14 条路线。产物 `reports/daily/2026-09-17/evolution.html`（280,470 B，徽标 PARTIAL），快照 SHA-256 `1f7fc5d7…`。
- 三个来源页均在本轮内打开：`/27/popular/evolutions`（500 节点，无分页）、`/27/evolutions`（14 条，全 FREE/REPEATABLE）、`/27/evolutions/expired`（0）。
- 本轮为当日第 2 次运行（首次 `362bfbe5` 已归档 attempts/），重跑原因仅是把状态从 success 对齐为 partial。两次数据一致。

### 下次执行直接照做
1. `node automation/run-state.mjs begin evolution D` → 记 runId/startedAt。
2. `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`，exit 0 才继续。
3. `/new` 打开三个来源页；用 CDP `/eval` 跑 `extract-cards.js`（榜单）与 `extract-evolutions.js`（总览路径）。
4. `node build-json.mjs` → 渲染 → 写 evidence → `finish`。
   - 上述三个脚本可从 `automation/runs/2026-09-17/evolution/work/`（或 09-16 同名目录）直接拷到当日 `work/`。

### 三条硬约束（每次都适用）
1. `evidence.missing` 非空时 `finish success` 会被自动降级为 `partial`（run-state.mjs:60）。**直接提交 partial，并把 evolution.json 的 `status` 与之一致**，否则报告徽标（SUCCESS）与权威状态（partial）矛盾。
2. `evidence.sources[].openedAt` 必须 ≥ 本轮 `startedAt`。`begin --rerun` 会让上一轮的 openedAt 全部失效，**必须在重跑轮内重新打开来源页并记录新时间**。
3. `begin --rerun` 会把 `automation/runs/D/evolution/` 下内容（含 `work/`、`evidence.json`、`report.html`）整体 rename 进 `attempts/<旧runId>/`；重跑前从 attempts 拷回工作脚本。

### 采集口径
- **去重按 `球员 URL + 进化名称`**，不按球员名：同一球员的不同卡版本是独立条目（URL 含版本后缀，估值/热度各异），500 个 URL 全部唯一。09-16 按名去重把 500 条压成 449 条属丢失。
- 榜单 Rating 是「进化后」OVR；费用取自 `/27/evolutions` 卡片的 FREE 标记；榜单卡片数字是热度计数（popularityCount）。FUTBIN 只给 UNLOCK/EXPIRES 相对时长，无绝对到期日。
- `/27/players` 列表目录对当前 IP/会话 403（已知，不要靠它做候选筛选）；榜单是否被服务端截断无法证实（500 条整齐，无「共 N 条」计数），已如实记入 missing。
- 站点经验见 `~/.workbuddy/skills/web-access/references/site-patterns/futbin.com.md`。

### 历史（仅备查）
- 2026-09-16 03:00 failed（扩展通道，作废）；09-16 12:51 failed（远程调试开关未开）；09-16 13:30 partial（456 张卡，5 条路径）。相关「待用户修复」结论均已作废：桌面端 v5.5.6 不实现原生消息宿主，唯一通道是 Web Access CDP。
