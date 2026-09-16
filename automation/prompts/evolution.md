# evolution 单项执行契约（2026-09-15）

本文件为进化专栏任务的执行入口规则。每日 03:00 调度，只采集和生成进化专栏数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin evolution D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin evolution D --rerun`（先把旧 attempt 归档到 `automation/runs/D/evolution/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物，版式由渲染器统一，不要手写或改造 HTML。
4. 将本轮证据写入 `automation/runs/D/evolution/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。运行 `node automation/run-state.mjs finish evolution D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

进化专栏服务于站点「进化专栏」（首页右栏 + 独立视图）。数据来源与顺序：

- **热门进化卡主来源**：https://www.futbin.com/27/popular/evolutions （Popular Evolution Players 榜单）。逐条核验卡名、评分、位置、进化名称、费用、到期时间与前置条件（评分上限、位置、卡版本、可交易性等）。
- **候选球员**：需要补充候选时参考 https://www.futbin.com/27/players 的 Rating 列与位置筛选，说明候选口径。
- 每张卡保留：球员名称/中文译名、Rating、位置、进化名称、费用、到期时间、前置条件、源 URL、采集时间。
- 区分「可证实的卡面事实」与「推断的进化路线建议」；路线建议必须给出前提条件与失效情形，不输出无依据的精确收益预测。
- 页面无可列出进化卡时，如实输出空状态并记录核验证据（例如页面显示 No evolutions found），不得用 FC26 或其他日期数据填充。

## 产出流程

1. 把结构化结果写入 `automation/runs/D/evolution/evolution.json`：
   `{ date, status, generatedAt, dataCutoff, evolutions: [{ rank, name, rating, pos, evolutionName, cost, expires, requirements[], url }], routes: [{ name, cost, desc, steps[], note }], sources: [{ url, openedAt, note }], notes: [], missing: [] }`
2. 运行 `node apps/market/engine/scripts/render-evolution.mjs D`，生成 `reports/daily/D/evolution.html`。渲染器对缺失数据一律输出如实空状态。
3. 校验卡牌 ID/名称去重、时间戳、费用与到期字段有效性后再提交。失败保留原始数据和上次有效报告。

浏览器强制规则：每次先读取根 AGENTS.md 对应段落；FUTBIN 及其他网页直接调用定时任务已绑定的 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。**采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选（不得代勾、不得改用其他浏览器）；也不要使用 Chrome 插件 / `extension` 模式（该扩展在产品侧永远连不上）。FUTBIN 拒绝 curl/WebFetch 静态请求（403），必须走 CDP。** 禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。
