# FC 内容与市场情报项目

本目录保留每日采集任务（足球日报 / 资讯采集 / 市场监控 / 进化专栏 / 传奇英雄监控，对应 6 个 WorkBuddy 定时任务，最后一个是汇总发布）、可复用数据、自动化协调代码和按日期归档的报告。业务契约以根 `AGENTS.md` 与 `automation/prompts/*.md` 为准。

## 目录结构

```text
apps/
├── football/          足球日报模板与生成资源
├── news/              FC27 资讯采集、翻译、去重数据
├── market/            FC27 市场扫描（engine/ 本地引擎 + 浏览器采集 FUTBIN）
└── portal/            每日合并页与固定入口生成器
automation/            调度契约、运行状态、测试
shared/                四任务与未来 WorkBuddy 共用的配置、运行库和展示层
reports/daily/D/       指定日期的当日报告（football / news / market / market-scan / icons-heroes / evolution）
daily-merged/index.html 固定发布源（只含当日内容 + 历史日报链接列表）
daily-merged/archive/   历史日报独立归档（每日一个 dashboard 风格文件）
```

## 日常任务顺序

1. `apps/football`：足球日报（积分榜 / 射手榜 / 助攻榜三榜必做）
2. `apps/news`：FC27 资讯采集
3. `apps/market/engine`：FC27 市场监控（市场概览 + 市场扫描；**Console（PS/Xbox 合并）与 PC 双平台口径**）
4. `apps/market/engine`（传奇/英雄）：传奇卡与英雄卡监控，2026-09-16 起从市场任务拆出为独立任务
5. `apps/market/engine`（进化）：进化专栏
6. `apps/portal`：合并当日报告并刷新固定汇总入口（汇总发布）

六个任务统一使用 Asia/Shanghai 日期 `D`。采集任务分别写入
`reports/daily/D/` 下的 `football.html`、`news.html`、`market.html` + `market-scan.html`、
`icons-heroes.html`、`evolution.html`；汇总任务写入
`daily-merged/archive/D.html`，并刷新 `daily-merged/index.html`（固定入口只含当日内容 +
历史日报链接列表）。

首页与每日日报共用 `apps/portal/dashboard.mjs` 同一模板；左侧导航固定为
「今日总览 / 足球动态 / FC27 资讯 / FC27 市场 / 进化专栏 / 传奇/英雄专栏 / 历史日报」。
`reports/daily/D/evolution.html` 会自动收录进「进化专栏」，未就绪时显示如实空状态。

- 足球三榜校验闸门：`node automation/verify-football-boards.mjs D`（拦截射手榜/助攻榜被误填为积分榜）。
- FC27 市场每天产出两个**并列、互不覆盖**的文件，由 `apps/market/engine/scripts/render-market.mjs D` 从 `automation/runs/D/market/market.json` 一次渲染：
  - `reports/daily/D/market.html` — **市场概览**（三段式）：① 本周活动卡与本周周黑 ② 价格分层 ≥100万 / 30-100万 / 10-30万 / 1-10万，每档 Top 50 按 `/27/players` 的 Rating 排序 ③ 热门进化卡
  - `reports/daily/D/market-scan.html` — **市场扫描**：价格维度 × 热门球员维度
  站点上以「市场概览 / 市场扫描」子标签切换。
- 两页均有 **Console 与 PC 平台切换**（FUTBIN 只提供这两档）。列表页每行同时渲染
  `td.table-price.platform-ps-only`（Console）与 `td.table-price.platform-pc-only`（PC），
  一次打开即可读到两个平台价，分别落库 `psPrice` / `pcPrice`；不要依赖 `ps_price` / `pc_price` URL 参数。
- `reports/daily/D/icons-heroes.html` — **传奇/英雄监控**（独立任务产出），挂在站点
  「传奇/英雄专栏」下；同栏目第二个子标签「传奇卡研究」是跨日期常驻底稿
  `apps/market/engine/icons/reports/fc27-icon-analysis.html`。市场任务不再产出 `market-icons.html`。

任务配置以 `shared/config/project.json` 为准；单项运行证据与不可覆盖快照统一
保存到 `automation/runs/D/<module>/`，不再散落到项目根目录。

## 固定链接

- 固定公开入口：https://fc27-site.app.workbuddy.host/ （WorkBuddy 站点发布，多文件）
- 固定本地发布源：`daily-merged/index.html`
- 每日归档目录：`reports/daily/YYYY-MM-DD/`
- 历史日报独立归档：`daily-merged/archive/YYYY-MM-DD.html`（每个日报独立文件，格式与 index 一致）
- 共享静态资源：`daily-merged/assets/`（含 `yanzu-banner.jpg` 海报）
- 汇总页按日期倒序展示，最新日期在前；历史日报通过 `archive/YYYY-MM-DD.html` 链接访问。

## 发布

发布统一走 WorkBuddy 站点发布能力，发布目录 `daily-merged/`（`index.html` + `archive/` + `assets/`）。旧的 DuMate 单文件 artifact 通道已废弃。规则见 `automation/prompts/publish.md`。

## 数据边界

- 新闻历史去重：`apps/news/data/seen_tweets.json`，禁止清空或重建。
- FC27 市场数据源：`apps/market/engine`（本地引擎、脚本与配置）+ 浏览器采集 FUTBIN 实时页面；历史研究产物位于 `reports/research/`。
- 浏览器会话和公众号上传状态属于本地运行数据，不进入报告目录。
- `reports/` 只保存按日期生成的最终 HTML；缓存、截图、临时渲染和一次性补丁不进入该目录。
- 市场报告写入 `reports/daily/D/market.html`；可重建的市场截图/分析页由 engine 生成，不作为数据库保存。

## 验证

修改自动化或生成器后运行：

```bash
node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs
```
