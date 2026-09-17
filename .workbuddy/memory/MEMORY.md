# FC 长期记忆（2026-09-16 精简；详细契约见根 `AGENTS.md` 与 `automation/prompts/*.md`）

## 任务与站点
6 个 WorkBuddy 任务（Asia/Shanghai）：足球日报 / 资讯采集 / 市场监控 / 进化专栏 / 传奇英雄监控 03:00，汇总发布 03:05。产物 `reports/daily/D/`：`football.html`、`news.html`、`market.html`（三段式）+`market-scan.html`、`evolution.html`、`icons-heroes.html`。站点 https://fc27-site.app.workbuddy.host/ （应用「FC27每日情报台」；发布走 WorkBuddy 站点能力，`entryHtml=index.html`+`updateExistingApp`）。
产物一律 `render-*.mjs` 渲染，不手改 HTML；改渲染器或报告后必须走 run-state 重提快照（技能 `fc-run-state-resnapshot`）。栏目结构、子标签接线四处（`merge_daily_report` / `dashboard` / `coordinate` / `run-state`，键为视图名 market/legend）见 `AGENTS.md`。

## FUTBIN 平台口径（实机核验；市场 + 传奇英雄必须遵守）
- 只有 Console（PS/Xbox 合并）与 PC 两档；每行**同时**含 `platform-ps-only` 与 `platform-pc-only` 单元格，一次打开即得两平台价。
- 平台按钮（`form.desktop-platform-change-form`）是**纯前端显隐切换**：不刷新、不改 URL、不重取数。`ps_price`/`pc_price`/`rarity`/`version`/`page` 参数全无效；Icon/Hero 名单须用页面筛选 UI 或全量列表比对台账。
- `td.table-item-score` 是开服前估值列 IS，非成交价。**「开服前两平台价均为 0」不是恒定前提**（2026-09-17 实测已被推翻）：FUTBIN 会在正式开服前开始对部分卡滚动更新平台价，此时 `market.json` 的 `priceBasis` 变为 `partial-live`（当日 750 人中 Console 有效价 193、PC 197；仍为 0 的按占位处理、页面标「估值」）。**每次以当日 `priceBasis` 为准**，不要照抄「均为 0」；无论哪种口径都仍不计算日环比/累计涨跌（昨日基线全 0 时无可比值）。
- 落库：市场 `players[].psPrice`/`pcPrice`；传奇英雄逐卡 `platforms.console`/`platforms.pc`；顶层 `platform='console+pc'`。价格 <1000 视为占位。
- 静态路线不存在（curl 403），必须走 CDP；`?rarity=icon` 首访常命中 Cloudflare，重试等 8–12 秒。

## 传奇/英雄监控
入口 `render-icons-heroes.mjs`（传奇区块由 `render-market-icons.mjs` 拼入）。链路：`base-icons.json` → `record-icons-daily.mjs D` → `icons/data/prices/fc27/daily/<DATE>.json` → `render-icons-heroes.mjs D`。台账 `fc27-icons-playstyles.json`（131 张）；英雄卡在 `heroes/data/**` 递归扫。快照一天一份、同日只覆盖当天、原子写、禁止删改历史。`launchDate=2026-09-25` 前不算日环比/累计涨跌；缺失如实空状态，不用 FC26 或旧日期填充。市场任务不再采/渲染/提交传奇英雄内容。

## 浏览器通道（可用）
唯一通道 = `web-access` 技能（CDP Proxy :3456 直连用户日常 Chrome）。自检 `check-deps.mjs`：0 可用 / 2 需 `WEB_ACCESS_BROWSER=chrome`（已固化）/ 1 需用户手勾 `chrome://inspect/#remote-debugging`（Agent 不得代勾）。`curl :9222/json/version` 在开关模式下返回空，不能判可用性。禁用：Chrome 插件/extension（无 native messaging 宿主，永远连不上）、`dumate-browser-cli`、`DUMATE_*`、`browser-env.sh`、:19228/:19222、`agent-browser`、IAB、新 profile。通道不可用即 failed/partial + 留证，不回退、不填充旧数据。

## 汇总发布 `coordinate.mjs`
只等待 football/news/market；evolution、icons-heroes 为可选模块（缺失不算失败）。`merge` 三态：`no_current_snapshot`（都无快照→不发布，**有意设计**）/`status_only`/`success`；本任务 failed 通常不是独立故障，**先查采集任务的浏览器通道**。`unattendedPublishingVerified` 恒 false，不代表失败；权威记录在 `automation/publish-status-D.json`。发布后根路径有边缘缓存，显式 `…/index.html` 立即最新。归档逐文件 `copyFileSync`，EIO 缺档时 `--rerun` 恢复。栏目在 iframe `srcdoc` 内，卡片在 `iframe.contentDocument`，父文档查不到别误判空白。

## X 媒体链路（news）
① `extract-timeline.js` 只取文字类字段 + `hasVideo/hasPhoto/hasCard`，不得抠图（后台标签页只有骨架）；② `enrich-tweet-media.mjs D` 经 `cdn.syndication.twimg.com/tweet-result?id=<ID>&token=a` 补 `images`/`video`/`card`/`quoted`，无需登录态。**严禁因含 video/animated_gif 丢推文。** 图片白名单 `report-assets.mjs#isCacheableXImage`；报告内一律 `size='medium'`；尺寸进哈希，换档位须清旧资产。下载两级：先 curl，失败项交 `fetch-images-browser.mjs` 在**自建宿主页**（`x.com/robots.txt`）**串行** fetch→base64；本环境代理到 `pbs.twimg.com` 不通（curl SSL 错属预期）。时间线上限 5–7 条/账号，不足记 `missingItems` 并提交 partial。契约同步 `prompts/news.md`、`apps/news/AGENTS.md`、`apps/news/README.md`、`task-definitions.json`。

## 其他边界
- **公众号**：凭证 `apps/market/integrations/wechat/.env`，号未认证 → **API 只能进草稿箱**（48001 无发布/群发），脚本 `publish_article.py`，排版走 `gzh-design`。
- **FC26 数据集**：`engine/gold/data/prices/fc26/` 152 金卡×30 天（主入口 `fc26-first-month-dashboard.json`；`maxDrawdown` 在 `trading` 下且存正幅度值）；`fc27-price-matrix.json` 227 人对照，新卡 `ovr_diff` 可能 null 须过滤。四规律：开盘价最强；峰值随档位前移；OVR↔倍率秩相关 0.77；金特技 +1≈1.69× / -1≈0.42×。
- **ima 知识库** `001aaa7e88002f6a`：仅文档格式（JSON/.mjs 须转 txt）；`create_media` → COS 签名 PUT → `add_knowledge`；HTML 单文件 ≤10MB；无删除/改名/移动。本地留档 `.workbuddy/exports/`。

## 工程约定与踩坑
红涨绿跌（`--up:#ff6259` `--dn:#4ec08a`）。脚本定位项目根锚点是 `shared/config/project.json`（`FC_PROJECT_ROOT` 可覆盖），不能用 `AGENTS.md`。新增任务同改 `project.json`、`task-definitions.json`、`prompts/README.md`。**同一文件禁止并行编辑**（互相覆盖且回报成功，症状 `ReferenceError`；同文件串行 + Grep 复核）——2026-09-16 二次踩中：`render-market-overview.mjs` 丢 `const PTOTAL` 致概览渲染抛错，平台提示又把「两平台全 0」误判为「均已采集」，已修为三态提示 + 回归用例。改生成器后跑 `automation/{execution,regression,verify-publication,news-media}.test.mjs`（36 例全绿）。Bash `grep` 对中文多分支正则偶发失配，改用 Grep 工具。

## run-state.mjs 三条硬约束（2026-09-17 固化，6 个任务通用）
1. `evidence.missing` 非空时 `finish success` 被自动降级为 `partial`（run-state.mjs:60）→ 直接提交 partial 并同步产物 JSON 的 `status`，否则报告徽标与权威状态矛盾。
2. `evidence.sources[].openedAt` 必须 ≥ 本轮 `startedAt`，否则「来源记录不是本轮实际打开」；`begin --rerun` 后必须**在本轮内重新打开来源页**。
3. `begin --rerun` 把 `automation/runs/D/<module>/` 内容（含 `work/`、`evidence.json`、`report.html`）整体 rename 进 `attempts/<旧runId>/`，重跑前从 attempts 拷回工作脚本。

## 进化专栏（evolution）采集口径（2026-09-17）
链路 `extract-cards.js`（`/27/popular/evolutions`，`div.popular-cards-wrapper > div.column`）→ `extract-evolutions.js`（`/27/evolutions`，`div.evolutions-overview-wrapper` 含 Requirements+Total Upgrades，不必逐条开详情页）→ `build-json.mjs` → `render-evolution.mjs`，脚本可从 `automation/runs/2026-09-17/evolution/work/` 拷。**去重按 `球员 URL + 进化名称`，不按球员名**（同名不同卡版本是独立条目）。榜单稳定渲染 500 条、无分页，是否截断未证实。`/27/evolutions/expired` 可判过期数。FUTBIN 站点经验见 `~/.workbuddy/skills/web-access/references/site-patterns/futbin.com.md`。
