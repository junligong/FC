# FC 内容与市场情报项目 — 项目总览

> 文档类型：项目知识库条目（总览）
> 记录日期：2026-09-16
> 信息来源：项目根 `AGENTS.md`、`README.md`、`automation/task-definitions.json`、`shared/config/project.json`、各子目录 `AGENTS.md`

## 一、项目定位

FC 项目（工作目录 `/Users/wuyanzu/Desktop/FC`）是一套**每日自动化情报流水线**，用四个独立采集任务加一个合并发布任务，产出面向足球赛事与 EA SPORTS FC 27（FC27）的内容与市场情报，并发布为一个固定链接的日期化站点。

站点对外名称：**FC27每日情报台**
固定公开入口：**https://fc27-site.app.workbuddy.host/**

项目核心特征：

1. **日期化**：所有产物按 Asia/Shanghai 日期 `D` 归档，目录为 `reports/daily/D/`。
2. **证据化**：每个任务必须留下本轮实际打开来源的证据（URL + 打开时间 + 数据截止时间），不允许用旧数据冒充当日更新。
3. **不可覆盖**：完成快照带 SHA-256，同日重跑必须先归档旧 attempt，不静默覆盖。
4. **失败诚实**：数据缺失保留空状态并标 `partial` / `failed`，禁止静默兜底（例如"某联赛缺数据自动回退英超"）。

## 二、目录结构与职责边界

```text
apps/               四个（含进化共五个）业务任务，只做自身采集与生成
├── football/       足球日报：赛况、新闻、积分榜 / 射手榜 / 助攻榜
├── news/           FC27 资讯：X 账号采集、翻译、去重
├── market/         FC27 市场：本地引擎 + 浏览器采集 FUTBIN
│   ├── engine/     市场引擎（卡片数据、渲染脚本、模块配置）
│   └── integrations/wechat/   公众号发布集成（人工触发，不由日报任务调用）
└── portal/         合并入口：读三份已完成报告，生成 summary + 固定首页
automation/         编排契约、运行状态、证据、合并与校验
├── prompts/        五个任务的完整提示词（唯一完整任务规则来源）
├── runs/D/<module>/   单次运行的 owner / state / evidence / work / 不可变快照
├── run-state.mjs   单次运行状态机（begin / finish）
├── coordinate.mjs  只读已完成快照并合并
└── verify-*.mjs    校验闸门（三榜校验、发布核验）
shared/             任务与 WorkBuddy 共用的唯一共享层
├── config/project.json   任务 ID、路径模式、固定链接的唯一配置源
├── lib/                  日期、路径、原子写入等通用能力
└── presentation/         合并阶段共用主题与布局适配器
reports/            只保存可交付报告
├── daily/D/        football.html / news.html / market.html / market-scan.html / evolution.html / summary.html
└── analysis/       跨日期研究产物
daily-merged/       WorkBuddy 站点发布的本地发布源
├── index.html     固定入口（只含当日内容 + 历史日报链接列表）
├── archive/D.html 历史日报独立归档（版式与首页一致）
└── assets/        共享静态资源（含 yanzu-banner.jpg 海报）
```

架构原则：**不复制共享实现**。路径、主题、通用函数只存在于 `shared/`；业务专属逻辑留在各自 `apps/<task>/`。新脚本文件开头必须有中文注释，说明用途、输入与主要输出。

## 三、每日任务链路

五个任务均为每日 **03:00**（Asia/Shanghai）触发，汇总发布在合并成功后立即执行。所有任务共用同一个日期 `D`。

| 顺序 | 任务 ID | 名称 | 输出产物 |
|---|---|---|---|
| 1 | `football` | 足球日报 | `reports/daily/D/football.html` |
| 2 | `news` | FC27 资讯采集 | `reports/daily/D/news.html` |
| 3 | `market` | FC27 市场监控 | `reports/daily/D/market.html` + `market-scan.html` |
| 4 | `evolution` | FC27 进化专栏 | `reports/daily/D/evolution.html`（可选模块） |
| 5 | `portal` | 汇总链接（prompt 为 `daily.md`） | `reports/daily/D/summary.html`、`daily-merged/index.html`、`daily-merged/archive/D.html` |

调度约定：`automation/task-definitions.json` 只保存短启动提示，**完整任务规则只维护在 `automation/prompts/*.md`**，每个任务启动时先读根 `AGENTS.md`，再读自己的 prompt 文件。禁止新增重复调度任务。

### 3.1 足球日报（football）

固定交付 **三榜**：积分榜、射手榜、助攻榜，必须逐联赛分别核验，三类数据块内容互不相同。

- 积分榜覆盖官方当前全部参赛队，美职联分东/西区；射手榜与助攻榜尽量各取前 10，赛季未开赛或不足时如实说明。
- 欧冠按实际阶段展示官方排名；抽签种子、赔率、预测不得冒充积分榜。
- 今日头条目标 6–8 条独立重要事件，其余覆盖转会、战报、伤停、杯赛与俱乐部动态，不为栏目硬凑新闻。
- 联赛/赛事官方数据优先，懂球帝、BBC Sport、ESPN、Sky Sports 用于补充与交叉检查；每条新闻必须打开原文核实。
- 提交前必须运行校验闸门 `node automation/verify-football-boards.mjs D`，退出码非 0 不得提交 `success`。

### 3.2 FC27 资讯采集（news）

- 来源为 `apps/news/sources.txt` 中的 X 账号，采集截至本轮开始时间**最近 24 小时**的推文，每次重新读取账号列表，不硬编码数量。
- 只收录可核对发布时间、原推链接与正文的信息；排除预测、纯推广、视频与 GIF；同账号转发与同推文 ID 去重。
- 官方公告与未经证实的爆料分开标注；**不把 FC26 消息当作 FC27**。
- 每张卡片含博主、时间、完整中文翻译、可折叠原文、原配图或"无图"说明、原推链接。翻译未完成必须明确标记，英文混排不算翻译。
- X 配图必须规范为 `name=orig` 原图并保存到 `reports/daily/D/assets/news/`，不得只保留远程热链，也不得用 `onerror` 隐藏加载失败。
- 去重库 `apps/news/data/seen_tweets.json` 为跨日历史资产，**禁止清空或重建**；只有 `generate_report.mjs` 在校验通过后可原子更新，并保留 `.bak` 备份。

### 3.3 FC27 市场监控（market）

每天产出**两份并列、互不覆盖**的文件，均由渲染器一次生成，站点上以「市场概览 / 市场扫描」子标签切换。

1. `reports/daily/D/market.html` — **市场概览**（四段式固定结构）
   - ① 本周活动卡（Promo）与本周周黑（TOTW）
   - ② 价格分层：≥100 万 / 30–100 万 / 10–30 万 / 1–10 万，每档 Top 50，按 `https://www.futbin.com/27/players` 的 Rating 降序；取数用该页价格筛选参数（`pc_price=1000000%2B`、`300000-1000000`、`100000-300000`、`10000-100000`）
   - ③ 传奇卡（Icon）与英雄卡（Hero）
   - ④ 热门进化卡（`https://www.futbin.com/27/popular/evolutions`）
2. `reports/daily/D/market-scan.html` — **市场扫描**（双维度）
   - 维度一·价格：大卡 ≥100 万 / 中卡 30–100 万 / 热门卡 10–30 万 / 适用卡 1–10 万，万元以下另列
   - 维度二·热门球员：主来源 `https://www.futbin.com/27/popular`，子类为热门进化卡与价值卡（热门榜中的非进化卡）

数据规则：默认 Cross 平台，PC 数据单独保存；每条记录保留稳定卡牌 ID、版本、球员名称与中文译名、评分、位置、卡类型、可交易性、价格单位、源 URL 与采集时间；排除不可交易 SBC、任务、租借与交换卡；**FC26 数据不得冒充 FC27 实时行情**。结构化结果写入 `automation/runs/D/market/market.json`（概览放 `overview`，扫描放顶层），再运行 `node apps/market/engine/scripts/render-market.mjs D` 渲染。

### 3.4 FC27 进化专栏（evolution）

- 主来源 `https://www.futbin.com/27/popular/evolutions`，逐条核验卡名、评分、位置、进化名称、费用、到期时间与前置条件。
- 每张卡保留球员名称/中文译名、Rating、位置、进化名称、费用、到期时间、前置条件、源 URL、采集时间。
- 必须区分「可证实的卡面事实」与「推断的进化路线建议」，路线建议需给出前提条件与失效情形，不输出无依据的精确收益预测。
- 页面无可用进化卡时如实输出空状态并记录核验证据，不得用 FC26 或其他日期数据填充。
- 结构化结果写入 `automation/runs/D/evolution/evolution.json`，运行 `node apps/market/engine/scripts/render-evolution.mjs D` 生成 HTML。

### 3.5 汇总与发布（portal / daily）

- 只运行 `node automation/coordinate.mjs D`；协调脚本最多等待 20 分钟，只读取本日各单项 run-state 的**完成快照**，拒绝旧状态或运行中报告；在隔离目录完成合并，原子更新首页与历史归档，合并限时 60 秒。
- 等待 football / news / market 三个必需快照；`evolution` 为可选模块，有已完成快照才收录。
- 合并成功后本地应有：`daily-merged/index.html`、`daily-merged/archive/D.html`、`daily-merged/assets/yanzu-banner.jpg`。
- 发布走 **WorkBuddy 站点发布能力**：目录 `daily-merged/`，入口 `index.html`，多文件站点（`index.html` + `archive/*.html` + `assets/*`），更新同一个应用，公开链接保持不变，不新建重复入口、不下线旧页。
- 发布后运行 `node automation/verify-publication.mjs D` 复核线上与本地逐字节一致（SHA-256）、当日归档链接存在、HTML 完整；缓存未刷新时需做实际刷新验证。
- 结果写入 `automation/publish-status-D.json`（不含认证信息）。发布能力不可用时如实记录"本地已生成、线上未更新"，保留线上旧版本，不伪造成功。
- 旧的 DuMate 单文件 artifact 通道自 2026-09-15 起废弃，不再使用。

## 四、浏览器强制规则（所有任务每次必须遵守）

凡任务需要浏览器，**必须**连接用户已登录的 Chrome 浏览器插件，固定使用 `extension` 模式与现有登录态。

明确禁止：内置浏览器（IAB）、未登录浏览器、临时浏览器、新建独立 profile、`--user-data-dir` 隔离实例。

连接失败时只将对应采集步骤标记为 `failed` / `partial` 并留证，**不得切换到 IAB 绕过**。纯本地合并任务不得为"检查"而打开任何浏览器。

## 五、数据边界与禁止事项

- `apps/news/data/seen_tweets.json`：跨日历史去重库，禁止清空、重建或用于破坏性测试。
- `reports/` 只保存按日期生成的最终 HTML 与跨日期研究产物；缓存、截图、临时渲染与一次性补丁不进入该目录。
- `automation/runs/D/<module>/work/` 或系统临时目录用于临时文件，不得混入源代码、数据库或最终报告目录。
- 浏览器会话状态与公众号上传状态属于本地运行数据，不进入报告目录。
- 不得在命令行参数、日志、对话、项目文件或公开网页写入 Cookie、密钥与令牌。
- 展示版式由渲染器与 `shared/presentation/` 统一维护：**不要手改生成后的 HTML**，也不要手工编辑 `daily-merged/index.html` 与 `archive/*.html`。
- 旧的一次性补丁脚本（如 `fix_*.py`、旧 `publisher`、`probe-console-session.mjs`）不是日常执行入口。

## 六、站点信息架构

| 分类 | 内容 |
|---|---|
| 今日总览 | 当日汇总页（football / news / market / evolution 四板块） |
| 足球动态 | 足球日报（三榜 + 资讯） |
| FC27 资讯 | 资讯雷达卡片流 |
| FC27 市场 | 子标签：市场概览 / 市场扫描 |
| 进化专栏 | 首页右栏 + 独立视图 |
| 历史日报 | `archive/YYYY-MM-DD.html` 逐日归档 |

首页与每日日报共用 `apps/portal/dashboard.mjs` 同一模板；右栏固定保留「进化专栏」，未就绪时显示如实空状态。`index.html` 只含当日内容 + 历史日报链接列表，历史日报不内嵌，保证站点体积稳定控制在 50M 以内。

## 七、当前已知风险

1. **浏览器通道不可用（阻碍采集类任务）**：2026-09-16 实测，Chrome 扩展与 WorkBuddy 桌面端的 native messaging 宿主未注册，`dumate-browser-cli init --mode extension` 返回 `RelayUnreachable`（缺 `DUMATE_HOST_URL`），relay `connected=false`。当日 football / news / market / evolution 四个采集任务全部提交 `failed`，汇总任务 `skipped`（`merge=no_current_snapshot`），线上保留 2026-09-15 旧版本。**需用户侧修复**：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主）。
2. **微信公众号能力边界**：公众号未认证，API 只支持 `draft/*`（草稿箱）、`media/uploadimg`、`material/*` 等；`freepublish/submit`（发布）与 `message/mass/sendall`（群发）返回 48001 未授权。**结论：只能写入草稿箱，发布须在公众号后台手动完成**。复用脚本 `apps/market/integrations/wechat/publish_article.py`，排版走 `gzh-design` 技能。
3. **项目体积**：约 884M，主要来自 `apps/market/engine/node_modules` 与历史资产，入库时不应上传整个工程目录。

## 八、发布状态快照

- 最近一次成功发布：2026-09-15（`automation/publish-status-2026-09-15.json`）
- 最近一次运行：2026-09-16，发布 `false`（`automation/publish-status-2026-09-16.json`），原因见第七章第 1 条。
- 历史归档范围：`daily-merged/archive/` 覆盖 2026-09-03 至 2026-09-15。
