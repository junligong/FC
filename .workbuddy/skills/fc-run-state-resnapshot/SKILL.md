---
name: fc-run-state-resnapshot
description: FC 日报项目专用。当需要把手动修正后的 reports/daily/<D>/<module>.html 重新并入站点时使用——因为协调器只读不可变运行快照，直接改报告不会被合并。覆盖 prepare-rerun → begin → 刷新 mtime → 写证据 → finish → 重跑 coordinate 全流程与两个易踩的时间戳陷阱。
agent_created: true
---

# FC 日报：修正报告后重新提交不可变快照

## 何时使用

手动修好了 `reports/daily/D/football.html` / `news.html` / `market.html`，但**站点仍是旧内容**。

根因：`automation/coordinate.mjs` 只从每个模块的不可变快照合并：

```
state.snapshotPath  →  automation/runs/D/<module>/report.html
```

**不会**读取 `reports/daily/D/*.html`。所以直接编辑报告对站点无效。

## 执行流程（每个模块各做一遍）

假设模块 `M`、日期 `D`：

```bash
cd /Users/wuyanzu/Desktop/FC

# 1. 归档上一次运行的 owner/state/report（存在运行中的 owner 会被拒绝）
node automation/run-state.mjs prepare-rerun M D

# 2. 开始新运行，记下 runId 与 startedAt（之后 20 分钟内必须 finish）
node automation/run-state.mjs begin M D
```

3. **让报告 mtime 晚于本次 `startedAt`**：报告必须是"本轮新生成"的。
   重新跑生成器最干净；否则原子重写一次同内容文件也可。
   ```bash
   # market 有渲染器：
   node apps/market/engine/scripts/render-market-report.mjs D
   # football / news 无生成器：用脚本原子重写（tmp → replace）报告文件
   ```

4. **写证据** `automation/runs/D/M/evidence.json`，字段：
   ```json
   { "date": "D", "sources": [{ "url": "...", "openedAt": "ISO8601", "dataCutoff": "...", "note": "..." }],
     "dataCutoff": "...", "missingItems": ["..."], "notes": ["..."] }
   ```

5. **跑该模块的校验闸门**（有的话）：
   ```bash
   node automation/verify-football-boards.mjs D    # football 必跑，非 0 不得提交
   ```

6. **提交快照**：
   ```bash
   node automation/run-state.mjs finish M D <RUNID> success|partial automation/runs/D/M/evidence.json
   ```

7. **重合并 + 重新发布**：
   ```bash
   node automation/coordinate.mjs D --prepare-rerun
   node automation/coordinate.mjs D
   # 然后用 workbuddy_sites_deploy 发布 daily-merged/（updateExistingApp）
   node automation/verify-publication.mjs D
   ```

## 两个必踩的时间戳陷阱（报错信息与对策）

| 报错 | 原因 | 对策 |
|---|---|---|
| `不是本轮新生成的完整报告` | 报告 `mtimeMs < startedAt` | 在 `begin` 之后再写一次报告文件 |
| `来源记录不是本轮实际打开，拒绝复用旧证据` | 有 `sources[].openedAt < startedAt` | 用**当前时间**（可等于 now）赋 openedAt；`now - 5s` 都可能早于 startedAt，**不要用偏移量** |

校验逻辑见 `automation/run-state.mjs` 的 `finish()`：
- `stat.mtimeMs < Date.parse(startedAt)` → 拒
- `evidence.sources.some(s => Date.parse(s.openedAt) < startedAt)` → 拒
- `now > startedAt + 20min` → 拒（超期）

## 注意

- 三个模块相互独立，只改了两个就只重提两个。
- 全部完成后 `coordinator-state.json` 的 `modules[M].sha256` 应等于 `automation/runs/D/M/report.html` 的 sha256。
- `publish=delegated` 是正常值：发布由 WorkBuddy 站点发布能力完成，不走 publisher。
- 顺带：`reports/` 只放最终 HTML；采集数据（如 `market.json`）要放 `automation/runs/D/<module>/`。
