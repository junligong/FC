---
name: fc-run-state-resnapshot
description: FC 日报项目专用。当需要把手动修正或改版后的 reports/daily/<D>/<module>.html 重新并入站点时使用——因为协调器只读不可变运行快照，直接改报告不会被合并。覆盖 prepare-rerun → begin → 真实重开来源 → 刷新 mtime → 写证据 → finish → 重跑 coordinate → 发布 → 核验全流程，以及三个易踩陷阱（时间戳、并行编辑、非快照产物）。
agent_created: true
---

# FC 日报：报告改动后重新提交不可变快照

## 何时使用

改好了 `reports/daily/D/football.html` / `news.html` / `market.html` / `icons-heroes.html`（手改或改了渲染器），但**站点仍是旧内容**。

根因：`automation/coordinate.mjs` 只从每个模块的不可变快照合并：

```
state.snapshotPath  →  automation/runs/D/<module>/report.html
```

**不会**读取 `reports/daily/D/*.html`。所以直接编辑报告对站点无效。

> 适用模块（`run-state.mjs` 的 `outputs`）：`football` / `news` / `market` / `evolution` / `icons-heroes`。
> 其中 `evolution` 与 `icons-heroes` 在 coordinate 里是**可选模块**，不参与合并等待，但**有快照时优先用快照**——所以改了它们的渲染器同样要重提快照，否则线上仍是旧版式。

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
   重新跑渲染器最干净；否则原子重写一次同内容文件也可。
   ```bash
   node apps/market/engine/scripts/render-market.mjs D          # market → market.html + market-scan.html
   node apps/market/engine/scripts/render-icons-heroes.mjs D    # icons-heroes
   # football / news 无生成器：用脚本原子重写（tmp → replace）报告文件
   ```

4. **真实重开来源页并写证据**。只做版式改版、数据未重采时，也要**实际打开一次来源页**再写
   `automation/runs/D/M/evidence.json`——`finish` 会逐条比较 `openedAt`，用旧时间戳会被拒。
   实测可用的最省事做法（CDP Proxy）：
   ```js
   const id = await (await fetch('http://127.0.0.1:3456/new', { method: 'POST', body: url })).text();
   // 等 6–10 秒，再 POST /eval?target=<id> 执行探针 JS，最后 GET /close?target=<id>
   ```
   证据字段：
   ```json
   { "date": "D", "sources": [{ "url": "...", "openedAt": "ISO8601", "dataCutoff": "...", "note": "...", "observed": {} }],
     "dataCutoff": "...", "missingItems": ["..."], "notes": ["本轮为改版后重新提交，采集数据与上一轮一致"] }
   ```
   `observed` 放本轮探针实测结果（标题、平台按钮、行数、单元格数），比空 note 有价值得多。

5. **跑该模块的校验闸门**（有的话）：
   ```bash
   node automation/verify-football-boards.mjs D    # football 必跑，非 0 不得提交
   ```

6. **提交快照**：
   ```bash
   node automation/run-state.mjs finish M D <RUNID> success|partial automation/runs/D/M/evidence.json
   ```

7. **重合并 + 重新发布 + 核验**：
   ```bash
   node automation/coordinate.mjs D --prepare-rerun
   node automation/coordinate.mjs D
   # 然后用 workbuddy_sites_deploy 发布 daily-merged/（entryHtml=index.html, updateExistingApp）
   node automation/verify-publication.mjs D
   ```

## 三个必踩陷阱

### 1. 时间戳（报错信息 → 对策）

| 报错 | 原因 | 对策 |
|---|---|---|
| `不是本轮新生成的完整报告` | 报告 `mtimeMs < startedAt` | 在 `begin` **之后**再跑一次渲染器 |
| `来源记录不是本轮实际打开，拒绝复用旧证据` | 有 `sources[].openedAt < startedAt` | 在 `begin` **之后**真实重开来源页，取那一刻的 ISO 时间 |
| `超过提交期限，不接受迟到版本` | `now > startedAt + 20min` | 20 分钟内收口；宁可提交 `partial` |

校验逻辑见 `automation/run-state.mjs` 的 `finish()`。注意 `startedAt` 带毫秒，秒级截断的时间会**小于**它。

### 2. 并行编辑同一文件会被静默覆盖

同一轮里对一个文件发多个编辑，**后一个编辑基于旧内容落盘，前一个被丢掉**，而工具仍回报成功。
表现为：`ReferenceError: xxx is not defined`、文案改了却没生效、渲染出来还是旧标题。

对策：**同一文件一次只发一个编辑**，改完用 `Grep` 复核关键字真的在文件里，再编辑下一处。
批量改多个文件可以并行；改同一文件必须串行。改完生成器后跑一次渲染并 grep 产物，别只看编辑成功回执。

**提交快照前必跑全套回归**（这一条是 2026-09-16 二次踩中换来的）：

```bash
node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs
```

当日实例：`render-market-overview.mjs` 丢了 `const PTOTAL` 声明，`renderOverview()` 直接抛 `ReferenceError`。
危害不止「页面渲染不出来」——**渲染器坏掉 → 该模块拿不到快照 → coordinate 的 `merge=no_current_snapshot` → 汇总发布被连带判失败**。
定位口径：`node --check` 只查语法，查不出未声明变量；必须真跑一次渲染或回归用例才能暴露。
另一类同源缺陷是**逻辑误判**（同日实例：用「单边缺失判据为假」等同于「两平台都已采集」，而两平台全 0 时两者都为假），
所以断言要写**互斥的有限状态**（齐备 / 单边缺失 / 全零），不要只断言「有平台切换按钮」。

### 3. 非快照类的当日产物，coordinate 需要显式复制

`coordinate.mjs` 的隔离 stage **只从模块快照**写出 `football/news/market/evolution/icons-heroes.html`。
其余产物（如 `market-scan.html`）必须显式复制：

```js
// 可选模块（有快照用快照并校验 sha256，否则回退复制当日文件）
const optionalPanels = [{ module: 'evolution', file: 'evolution.html' }, { module: 'icons-heroes', file: 'icons-heroes.html' }];
for (const extra of ['market-scan.html']) { /* copy */ }
```

## 注意

- 模块相互独立，只改了哪个就只重提哪个。
- 全部完成后 `coordinator-state.json` 的 `modules[M].sha256` 应等于 `automation/runs/D/M/report.html` 的 sha256。
- `publish=delegated` 是正常值：发布由 WorkBuddy 站点发布能力完成，不走 publisher。
- `reports/` 只放最终 HTML；采集数据（如 `market.json`）要放 `automation/runs/D/<module>/`。
- **一个栏目可以有多份并列产物**：`apps/portal/dashboard.mjs` 的 `dailyReport({ subPanels })` 支持栏目内子标签，
  键是**视图名**（不是 source id）：`subPanels.market` → 市场概览 / 市场扫描；`subPanels.legend` → 传奇/英雄监控 / 传奇卡研究。
  新增并列产物时，改产物路径**不要覆盖原文件**，再在 `merge_daily_report.mjs` 里用 `buildPanelByFile()` 读入。
  当前接线四处：`merge_daily_report.mjs`（subPanels）、`dashboard.mjs`（TABS / LEGEND_TAB / buildViewBody）、
  `coordinate.mjs`（optionalPanels / extras）、`run-state.mjs`（outputs）。
