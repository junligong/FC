# 自动化执行记录：激活 cdp-proxy 连接事件日志（弹框频率量测）

## 任务性质
一次性任务：重启一次 cdp-proxy 让新增的「连接事件日志」代码生效，用于量测 Chrome「要允许远程调试吗？」授权弹框的真实频率。**不采集、不渲染、不发布。**

## 2026-09-18 11:20 执行结果：成功

### 前置检查（空闲判定）通过
- `automation/runs/2026-09-18/` 近 5 分钟 / 15 分钟内 **无任何文件更新**；最新产物为 10:53 的 `market/publish-hourly.json`、`market/watchlist.json`（已过去 27 分钟）。
- 无采集脚本进程（仅 WorkBuddy Electron 进程 + cdp-proxy）。
- 结论：确认空闲，允许重启。

### 激活动作
1. 激活前基线：journal 文件**不存在**（新代码未生效）；状态样本 7 条（10:36:03 → 11:17:03），含 1 次 `ws-reset(疑似重连)`（11:17:03，managedTabs 1 → 0）。
2. `pkill -f cdp-proxy.mjs`（仅一次）→ 旧 PID 71979 终止，3456 端口释放。
3. `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → **一次通过**，输出 `proxy: ready (Chrome)`，exit 0（未出现失败轮次，无需二次复跑）。
4. 验证 journal：`~/.workbuddy/logs/cdp-proxy-journal.jsonl` 已生成，含
   - `proxy-start`（11:20:48，pid 95844，port 3456）
   - `connect-ok`（11:20:50，pid 95844，chromePort 9222）
5. `browser-channel-watch.mjs --report` 正确解析：预期弹框次数「按连接计 = 1 次」。

### 结果状态
- 新代理 PID **95844**（11:20 启动），常驻运行，**不要再 pkill**。
- 日志已激活，自此刻起每次新建 DevTools 连接（= 一次授权弹框）都会追加一条 `connect-ok`。
- 核查确认：本次执行期间 `automation/runs/2026-09-18/` 无新文件写入，未触碰采集链路。

### 后续观察方法（下次直接跑）
`node automation/browser-channel-watch.mjs --report`
- 看 `connect-ok` 的**按小时分布**（北京时间）即可验证首要假设「每小时任务首请求各触发一次重连 = 每小时一次弹框」。
- 注意：journal 只记录**新代理启动之后**的事件，11:20:48 之前的重连只能用「状态样本重连反推」区段看。

### 经验
- check-deps 在代理已被 kill 的情况下会**自行拉起**新代理，无需手动启动；且成功轮秒级完成，不必按失败预算（2m17s）预留。
- 本次无需用户点「允许」即直接通过（Chrome 侧授权可能仍有效或弹框被自动放行），未出现阻塞。
