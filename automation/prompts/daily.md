# 综合任务执行入口（2026-09-15 · WorkBuddy 发布版）

每天 Asia/Shanghai 03:00 启动。固定日期 D。此任务不采集新闻或足球，不启动独立任务，不写子报告，不修改子报告布局，不探索发布接口。

## 一、本地合并

只运行 `node /Users/wuyanzu/Desktop/FC/automation/coordinate.mjs D`。工具返回后台进程时以每次最多 60 秒的等待轮询该进程，不新建同一命令。协调脚本最多等待 20 分钟，仅读取本日各单项 run-state 的完成快照，拒绝用旧状态或运行中报告作成功产物，在隔离目录完成合并并原子更新首页与历史日报归档，合并限制 60 秒。

合并成功后，本地应存在：
- `daily-merged/index.html`（固定入口，只含当日内容 + 历史日报链接列表）
- `daily-merged/archive/D.html`（当日历史日报独立文件，并保证全部历史日期版式统一）
- `daily-merged/assets/yanzu-banner.jpg`（共享海报资源）

协调器等待足球日报、FC27资讯和FC27市场监控三个单项快照；`evolution`（进化专栏）为**可选模块**：有已完成快照则从快照收录，没有也不影响合并。缺失板块按真实状态显示，不使用旧数据冒充。即使全部采集失败，只要各任务生成了当日失败状态快照，也要合并并发布 D 的状态页，让固定入口始终显示当天日期和真实失败原因；不得继续展示昨天内容造成“仍是昨天”的误解。合并前确认足球三榜校验通过（`node automation/verify-football-boards.mjs D`），市场报告已由 `render-market.mjs` 输出概览 + 扫描两份产物。五个日常任务均为 03:00，禁止新增重复调度。历史去重数据不得修改。每日输出目录为 `reports/daily/D/`。

## 二、发布到 WorkBuddy（自动发布）

合并成功后，使用 WorkBuddy 站点发布能力发布本地目录：

- 发布目录：`/Users/wuyanzu/Desktop/FC/daily-merged`
- 入口页：`index.html`
- 发布清单：`index.html` + `archive/*.html` + `assets/*`（多文件静态站点，相对路径必须可用）
- 目标是**更新已发布的同一个应用**（应用名：FC27每日情报台），保持分享链接不变；不要创建新的重复入口。

发布后用 `node /Users/wuyanzu/Desktop/FC/automation/verify-publication.mjs D` 复核线上与本地逐字节一致、当日历史日报链接存在、HTML 完整。线上缓存未刷新时做实际刷新验证，不能只凭发布工具返回成功判定完成。若发布能力不可用，如实记录“本地已生成、线上未更新”，保留原线上版本，不伪造成功、不下线旧页、不更换入口。

收尾：将发布日期、线上链接、验证结果及失败原因保存到 `automation/publish-status-D.json`（不含认证信息），并向用户提供固定入口与本次发布状态。

旧 DuMate 单文件 artifact 通道已废弃，不要再探索或调用。

浏览器强制规则：每次先读取根 AGENTS.md 对应段落。本任务只做本地合并与站点发布，不得启动 IAB、Chrome 或其他浏览器；发布核验仅由既有验证脚本与站点发布能力执行。
