# FC 模块与引擎说明合集

> 文档类型：项目知识库条目（由项目内 Markdown 文档按主题合并）
> 生成日期：2026-09-16 14:03
> 来源项目：/Users/wuyanzu/Desktop/FC

本合集收录以下原始文件，按顺序完整保留原文；每个文件之间以 `---` 分隔。

1. `README.md`
2. `apps/football/README.md`
3. `apps/news/README.md`
4. `apps/portal/README.md`
5. `automation/README.md`
6. `shared/README.md`
7. `apps/market/engine/README.md`
8. `apps/market/engine/data/players/README.md`
9. `apps/market/engine/data/players/database/README.md`
10. `apps/market/engine/evolution/README.md`
11. `apps/market/engine/gold/README.md`
12. `apps/market/engine/modules/evolutions/README.md`
13. `apps/market/engine/modules/icons-heroes/README.md`
14. `apps/market/engine/modules/price-tiers/README.md`
15. `apps/market/engine/modules/weekly-cards/README.md`

---

## 附录 1：`README.md`

# FC 内容与市场情报项目

本目录只保留四个日常任务、可复用数据、自动化协调代码和按日期归档的报告。

## 目录结构

```text
apps/
├── football/          足球日报模板与生成资源
├── news/              FC27 资讯采集、翻译、去重数据
├── market/            FC27 市场扫描（engine/ 本地引擎 + 浏览器采集 FUTBIN）
└── portal/            每日合并页与固定入口生成器
automation/            调度契约、运行状态、测试
shared/                四任务与未来 WorkBuddy 共用的配置、运行库和展示层
reports/daily/D/       指定日期的四份最终报告
daily-merged/index.html 固定发布源（只含当日内容 + 历史日报链接列表）
daily-merged/archive/   历史日报独立归档（每日一个 dashboard 风格文件）
```

## 日常任务顺序

1. `apps/football`：足球日报（积分榜 / 射手榜 / 助攻榜三榜必做）
2. `apps/news`：FC27 资讯采集
3. `apps/market/engine`：FC27 市场扫描（价格维度 × 热门球员维度）
4. `apps/portal`：合并当日报告并刷新固定汇总入口

四个任务统一使用 Asia/Shanghai 日期 `D`。前三项分别写入
`reports/daily/D/football.html`、`news.html`、`market.html`；汇总任务写入
`reports/daily/D/summary.html`，生成历史日报 `daily-merged/archive/D.html`，
并刷新 `daily-merged/index.html`（固定入口只含当日内容 + 历史日报链接列表）。

首页与每日日报共用 `apps/portal/dashboard.mjs` 同一模板；右栏固定保留
「进化专栏」，若存在 `reports/daily/D/evolution.html` 会自动收录，未就绪时显示
如实空状态（由后续进化任务补充）。

- 足球三榜校验闸门：`node automation/verify-football-boards.mjs D`（拦截射手榜/助攻榜被误填为积分榜）。
- FC27 市场每天产出两个**并列、互不覆盖**的文件，由 `apps/market/engine/scripts/render-market.mjs D` 从 `automation/runs/D/market/market.json` 一次渲染：
  - `reports/daily/D/market.html` — **市场概览**（四段式）：① 本周活动卡与本周周黑 ② 价格分层 ≥100万 / 30-100万 / 10-30万 / 1-10万，每档 Top 50 按 `/27/players` 的 Rating 排序 ③ 传奇卡与英雄卡 ④ 热门进化卡
  - `reports/daily/D/market-scan.html` — **市场扫描**：价格维度 × 热门球员维度
  站点上以「市场概览 / 市场扫描」子标签切换。

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
node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs
```

---

## 附录 2：`apps/football/README.md`

# 足球日报

本项目负责核验比赛、积分榜与新闻来源，并生成
`reports/daily/D/football.html`。每日执行规则见
`automation/prompts/football.md`；可复用版式位于 `templates/football-daily.html`。

最终报告只进入按日期目录。试排页面、截图、临时渲染和一次性修补脚本不放在本目录。

---

## 附录 3：`apps/news/README.md`

# FC27 资讯采集

从 `sources.txt` 列出的 X 账号采集近 24 小时的 FC27 资讯，过滤、聚类去重、翻译，生成
`reports/daily/D/news.html`。完整规则见 `automation/prompts/news.md` 与 `AGENTS.md`。

## 采集流程

```
DOM 抽取 ──► 媒体解析 ──► 生成报告 ──► 校验提交
extract-timeline.js   enrich-tweet-media.mjs   generate_report.mjs   run-state.mjs
      │                       │                        │
      └── data/tweets-D.json ─┘   （同一文件，原地原子更新）
```

```bash
node apps/news/enrich-tweet-media.mjs 2026-09-16   # 补齐权威媒体
node apps/news/generate_report.mjs 2026-09-16      # 过滤/翻译/落图/渲染
```

## 文件职责

| 文件 | 用途 |
|---|---|
| `extract-timeline.js` | 在浏览器里对时间线做确定性抽取（ID/链接/作者/时间/正文 + `has*` 媒体标记）。**不抠图片地址** |
| `x-media.mjs` | 媒体解析库：把 X syndication 接口响应规范化为 `images` / `video` / `card` / `quoted` |
| `enrich-tweet-media.mjs` | 给当日快照补齐媒体，原地原子更新，逐条失败写 `mediaResolved:false` |
| `generate_report.mjs` | 过滤、聚类去重、翻译、图片落盘、渲染报告；唯一可更新去重库的脚本 |
| `fetch-images-browser.mjs` | 图片下载兜底：curl 拉不动时经用户浏览器（CDP）取回并落盘 |
| `sources.txt` | X 账号清单（名称 + 主页 URL），每轮重新读取，不硬编码数量 |
| `data/tweets-D.json` | 当日结构化快照（含媒体字段与 `localImages` 本地资产映射） |
| `data/seen_tweets.json` | 跨日历史去重库，禁止清空或重建 |
| `auto_news.sh` | 旧 DuMate 兼容入口，**不属于 WorkBuddy 日常流程，不得调用** |

## 两个容易踩的坑

1. **媒体不要从 DOM 取**：后台标签页里 X 只渲染骨架占位符（`[data-testid="tweetPhoto"]` 内部没有
   `<img>`），必须强制出帧才会补图；视频与链接卡片的图在 DOM 里根本不存在。
2. **curl 拉不到图不等于图不存在**：本运行环境出口代理到 `pbs.twimg.com` 不通（`SSL_ERROR_SYSCALL`），
   报告生成器会自动改由浏览器下载（需 CDP Proxy 在线）。仅当两级都失败才记为未落盘。

浏览器通道只使用 `web-access` 技能（CDP 直连用户日常 Chrome）。**不使用 Chrome 插件 /
`extension` 模式**——该扩展依赖的 native messaging 宿主在 WorkBuddy 桌面端未实现，永远显示
「未连接」，已在用户机器上禁用。

临时翻译与修补文件不得写入项目根目录，请放进 `automation/runs/D/news/work/`。

---

## 附录 4：`apps/portal/README.md`

# 汇总链接

`merge_daily_report.mjs D` 读取 `reports/daily/D/` 下三个单项报告，生成
`summary.html`，并刷新固定本地发布源 `daily-merged/index.html`。

历史日报按日期倒序嵌入固定入口。缺失单项显示真实空状态，不使用旧日报冒充。
固定公开地址由 `shared/config/project.json` 管理；本项目不自行猜测或创建发布接口。

---

## 附录 5：`automation/README.md`

# FC 自动执行契约（2026-09-15 · WorkBuddy 版）

四个内容任务（足球、资讯、市场、进化）与一个汇总发布任务均使用 Asia/Shanghai 日期并按每日 03:00 配置；汇总发布在 03:05 执行。不要创建重复调度。市场采集已按用户要求启用。项目已从 DuMate 迁移到 WorkBuddy，发布统一走 WorkBuddy 站点发布能力。

WorkBuddy 从 `task-definitions.json` 读取短启动提示，再加载 `prompts/` 中对应的完整本地提示词；业务规则只维护一份。

- 资讯、足球、市场、进化先执行 run-state.mjs begin，保存 runId。相同日期同一模块只允许一个所有者。
- 单项只生成自身报告，15 分钟内完成或提交部分结果。资讯、足球、市场、进化都通过 `Web Access（浏览器自动化）` 技能（CDP 直连用户日常 Chrome）采集；资讯采集阶段最多 10 分钟。足球是 AI 采集，15 分钟是执行指令预算，并非平台硬限制。
- **提交硬上限是 `startedAt + 20 分钟`**（`run-state.mjs` 的 `finish` 会拒绝迟到版本）；返回的 `deadlineAt` 15 分钟只是提示，最迟第 14 分钟应收口转 `partial`。
- 完成时通过 run-state.mjs finish 提交证据与快照，记录 SHA-256。完成后立即结束对话。不能继续合并、发布或修改布局。
- 总任务只运行 coordinate.mjs：等待本轮快照，最多20分钟；隔离合并，60秒上限。发布由 WorkBuddy 站点发布能力在同一会话内完成；公网验证30秒。
- 缺失单项不使用旧日期或旧运行中间文件填补。完成快照不会随工作区后续修改而变化。

## 当前状态位置

`automation/runs/D/<news|football|market|evolution>/state.json` 为单项状态，`report.html` 为冻结的内部快照。
`automation/runs/D/coordinator-state.json` 为合并与发布状态（`publish=delegated` 表示本地已合并、发布交由 WorkBuddy 站点发布能力执行）。

同日重复启动默认拒绝，避免两个任务同时写入。需要重跑时，先确认现有运行已结束，再归档当日 runs 目录并启动新一轮；不得在活动运行中删除锁。

`skipped` 只表示用户已明确暂停、且 `shared/config/project.json` 已将对应任务设为 `enabled: false`。启用任务遇到数据源、浏览器或生成故障时必须提交 `failed`；有可核验的部分结果时提交 `partial`。

## 产物与发布

本地产物：
- `reports/daily/D/{football,news,market,summary}.html`
- `daily-merged/index.html`（固定入口）、`daily-merged/archive/D.html`（历史日报）、`daily-merged/assets/`（海报等共享资源）

发布方式：用 WorkBuddy 站点发布能力发布目录 `daily-merged/`（多文件静态站点，入口 `index.html`），更新同一应用，保持公开链接不变。发布后用 `automation/verify-publication.mjs D` 复核。

固定入口：https://fc27-site.app.workbuddy.host/

旧的 DuMate 单文件 artifact 通道（`automation/publisher` + `probe-console-session.mjs`）自 2026-09-15 起废弃，不再参与日常流程；相关脚本仅作为历史记录保留，不要恢复使用。

## 明确的同日重跑

自动调度仍使用普通 `begin` 防止重复。**同日重跑有两种等价写法，任选其一：**

1. 一步式：`node automation/run-state.mjs begin <football|news|market|evolution> D --rerun` —— 自动归档旧 attempt 后直接开新 run。
2. 两步式：先 `node automation/run-state.mjs prepare-rerun <module> D`（只归档、不启动，可用于排查），再执行普通 `begin`。

旧运行会移入对应任务的 `attempts/<runId>/`（仅 rename，非破坏性）。协调器使用 `node automation/coordinate.mjs D --prepare-rerun` 后再执行 `--rerun`。历史报告和去重库不会被清空。

**注意锁的语义**：上一轮结束后 `owner.json` 仍会残留 `status:"running"`，因此同日不带 `--rerun` 的 `begin` 必定返回 `accepted=false`（「本日任务已启动或已完成」）；只有 `state.json` 的 `status` 仍为 `running` 时才表示运行真的在进行中，此时 `--rerun` 同样会被拒绝。

## 验证

运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs`。测试数据使用隔离目录，不修改真实历史去重文件。

---

## 附录 6：`shared/README.md`

# FC共享组件

这里集中维护四个内容任务、汇总发布任务与 WorkBuddy 共用的稳定接口：

- `config/project.json`：任务ID、顺序、启用状态、每日输出和固定汇总地址。
- `lib/runtime.mjs`：项目根目录、Asia/Shanghai日期、路径和原子写入。
- `lib/report-assets.mjs`：X 原图地址、稳定文件名和单文件报告图片内嵌。
- `presentation/`：合并阶段统一主题与足球日报布局适配。

业务任务只引用这些文件，不复制实现。WorkBuddy后续可从共享配置发现报告，或直接读取
`reports/daily/D/`与`reports/research/`中的稳定产物。

WorkBuddy 统一读取 `config/project.json`，不要为执行器复制第二套路径、主题或业务数据库；
旧 DuMate 兼容层不得继续扩散到共享实现。

---

## 附录 7：`apps/market/engine/README.md`

# FUTBIN FC27 vs FC26 球员 1V1 截图

本目录同时是 FC27 每日市场扫描的数据引擎。扫描模块定义在
`modules/market-segments.json`，分为本周活动卡与周黑、价格分层、热门进化卡，
并以传奇卡与英雄卡作为第二观察维度。每日成品输出到
`reports/daily/D/market.html`，执行规则见项目根目录的 `automation/prompts/market.md`。

统一球员库位于 `data/players/database/`。运行 `npm run data:build` 可从现有原始数据
重新生成 FC26、FC27 两份去重后的查询库；原始历史价格与进化数据不会被覆盖。

这个脚本会完成五件事：

1. 从 FC27 对应位置的金卡列表收集当前排序前 100 名：前锋为 `ST/RW/LW`，中场为 `CAM/CM/CDM/LM/RM`，后卫为 FUTBIN 实际支持的 `CB/LB/RB`。
2. 抓中场时排除前锋名单；抓后卫时排除前锋与中场名单，确保同一名球员只进入最早的位置组截图队列。
3. 在 FC26 同位置金卡前 100 名中按 slug/姓名匹配；找不到的记录到匹配清单，可用 `overrides.json` 补充直达链接。
4. 持久维护 `player-index.json` 和 `player-links.csv`，保存姓名、FC27/FC26 链接、来源位置组、排名和去重状态。
5. 分别截取两年的球员卡、价格、Skills、Weak Foot、身高、惯用脚、PlayStyles/Roles 区域，再生成左右并排的 1V1 PNG。

## 安装

需要 Node.js 20+ 和本机 Google Chrome：

```bash
cd /Users/wuyanzu/Desktop/FC/apps/market/engine
npm install
```

## 先跑一名球员

```bash
npm run capture -- --only alexia-putellas-segura
```

## 位置组

前锋金卡前 100：

```bash
npm run capture:forward
```

中场金卡前 100，并自动去掉前锋前 100 中已出现的球员：

```bash
npm run capture:midfield
```

只生成/更新中场索引和去重结果，不截图：

```bash
npm run index:midfield
```

后卫金卡前 100，并自动去掉前锋/中场前 100 中已出现的球员：

```bash
npm run capture:defender
```

只生成/更新后卫索引和去重结果，不截图：

```bash
npm run index:defender
```

默认上限是 100。临时改变列表人数可使用 `--list-limit`；`--limit` 只限制本次实际截图数量，不改变球员索引：

```bash
npm run capture:midfield -- --list-limit 100 --limit 5
```

首次访问 FUTBIN 时，Cloudflare 可能在 Chrome 窗口里显示安全验证。请手动完成一次，脚本会自动继续，并把会话保存在 `.futbin-browser-profile/`。脚本不会尝试绕过安全验证，所以首次运行不要加 `--headless`。

如果不希望全量运行期间 Chrome 占用前台，可以先只做一次短暂验证：

```bash
npm run capture -- --verify-only
```

验证窗口会在通过后自动关闭。FUTBIN 如果允许无界面会话，可用：

```bash
npm run capture -- --headless
```

如果 FUTBIN 对 `--headless` 再次触发验证，请改用最小化后台模式。它使用正常 Chrome 渲染，但只最小化脚本自己的窗口，不占用前台：

```bash
npm run capture -- --background
```

先小批量检查效果：

```bash
npm run capture -- --limit 5
```

确认裁剪正确后处理全部球员：

```bash
npm run capture
```

## 项目数据与截图输出

```text
data/players/                 # 可提交、可供其他功能使用的稳定项目数据
├── player-index.json         # 去重后的球员主索引、链接、排名和状态
├── player-links.csv          # 同一索引的表格版本
├── source/                   # FC26/FC27 各位置组前 100 原始列表
├── matches/                  # 各位置组跨年匹配
└── duplicates/               # 跨位置组去重记录

gold/                         # FC26 金卡历史价格域
├── src/                      # 价格抓取与分析代码
├── data/prices/              # 首周、前三周、首月逐日价格与指标
└── outputs/                  # Excel 工作簿与预览图

evolution/                    # FC26 进化任务域
├── src/                      # 进化任务与热门球员抓取代码
└── data/fc26/                # 按日期区间和 FUTBIN 类别归档

dashboard/                    # 球员交易分析仪表盘（Sites / Vinext）

output/                       # 可重新生成的截图产物，已被 git 忽略
├── 1v1/                      # 最终左右对比图
├── single/                   # FC27、FC26 原始截图
└── manifest.json             # 截图状态、URL、裁剪坐标和错误
```

其他功能可以直接使用查询模块：

```js
import { openPlayerRepository } from './src/player-data.mjs';

const players = await openPlayerRepository();
const player = players.get('alexia-putellas-segura');
const defenders = players.listByGroup('defender');
const unmatched = players.listByGroup('defender', { matched: false });
```

FC26 开服首周价格（2025-09-18 至 2025-09-24）也可以直接查询：

```js
import { openLaunchWeekPriceRepository } from './src/player-data.mjs';

const prices = await openLaunchWeekPriceRepository();
const alexia = prices.get('alexia-putellas-segura');
console.log(alexia.prices.cross['2025-09-18']);
console.log(alexia.metrics.cross.changePct);
```

连续前三周的逐日价格与趋势使用：

```js
import { openThreeWeekPriceRepository } from './src/player-data.mjs';

const prices = await openThreeWeekPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-08']);
console.log(haaland.analysis.cross.trend);
```

开服首月（2025-09-18 至 2025-10-17）的 30 天逐日价格与交易指标使用：

```js
import { openFirstMonthPriceRepository } from './src/player-data.mjs';

const prices = await openFirstMonthPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-17']);
console.log(haaland.analysis.cross.trading.maxDrawdown);
console.log(haaland.analysis.cross.signal);
```

重新抓取或补齐价格时运行：

```bash
npm run prices:fc26-launch
npm run prices:fc26-3weeks:analyze
npm run prices:fc26-month:analyze
```

交易分析仪表盘位于 `dashboard/`。其构建前会自动同步首月 JSON 与 CSV：

```bash
cd dashboard
npm run dev
```

价格命令按张保存检查点并支持续跑；默认使用最小化的项目 Chrome。`cross` 表示 PlayStation/Xbox 跨平台市场，`pc` 表示 PC 市场。FUTBIN 返回的 0 会作为缺失值处理。

FC26 进化任务已整理为 2025-09-18 至 2026-08-24 的完整时间线，按发布日期升序、同日按 FUTBIN ID 升序保存：

```bash
npm run evolution:sort
npm run evolution:fetch
npm run evolution:fetch -- --normalize-only
```

完整说明和文件清单见 `evolution/README.md`。其他功能可通过 `openEvolutionRepository()` 按 ID、slug、名称或分类查询。

再次运行会自动跳过已经生成的 1V1 图片。需要重截时使用：

```bash
npm run capture -- --force
```

图片使用稳定的球员 slug 命名，所以先用 `--only` 或 `--limit` 生成的结果，在之后全量运行时也会被正确识别并跳过。

FUTBIN 球员列表变化后刷新索引：

```bash
npm run capture -- --refresh-index
```

只检查链接和匹配、不截图：

```bash
npm run capture -- --dry-run
```

## 配置与手工匹配

复制示例配置后可以修改列表 URL、项目数据目录、输出目录、等待时间、页面尺寸或裁剪方式：

```bash
cp config.example.json config.json
```

如果 `data/players/matches/` 中有未匹配球员，在项目根目录新建 `overrides.json`：

```json
{
  "alexia-putellas-segura": "https://www.futbin.com/26/player/105/alexia-putellas-segura"
}
```

Alexia 的映射已经包含在内置默认配置里；上面只是展示格式。

自动裁剪会从 `SKILLS / WEAK FOOT / HEIGHT / FOOT` 和 `PLAYER STATS` 等文字定位详情头图。FUTBIN 改版后若自动裁剪不准，可以在 `config.json` 中设置页面元素选择器：

默认使用 `1229 × 900` 的桌面布局；这是参考图对应的内容宽度，也能把右下角悬浮视频移出属性区域。脚本还会隐藏 Venatus 视频和底部粘性广告，并等待球员头像资源实际完成渲染后再截图。

```json
{
  "captureSelector": ".player-header"
}
```

也可以直接指定固定裁剪区域（CSS 像素）：

```json
{
  "captureClip": { "x": 0, "y": 200, "width": 2458, "height": 772 }
}
```

固定坐标只适合页面布局稳定的情况，优先使用自动裁剪或 `captureSelector`。

## 常用参数

```text
--only <slug,...>  只处理指定球员
--group <name>     forward（前锋）、midfield（中场）或 defender（后卫）
--list-limit <n>   每个位置列表最多收集人数，默认 100
--limit <n>        只处理前 n 名
--force            覆盖已有截图
--refresh-index    重新抓取列表
--dry-run          只抓列表并匹配
--verify-only      只完成安全验证并保存会话
--background       正常渲染并最小化脚本 Chrome 窗口
--headless         无界面运行（通过安全验证后再用）
--headed           显示浏览器
--output <dir>     改变输出目录
--config <file>    使用其他配置文件
```

脚本默认每次页面请求之间等待 1.5 秒，既降低 FUTBIN 压力，也减少触发安全验证的概率。可以在 `config.json` 里增大 `requestDelayMs`。

---

## 附录 8：`apps/market/engine/data/players/README.md`

# 球员项目数据

这里是项目内其他功能可以稳定依赖的球员数据层，不存放截图。

## 文件结构

- `player-index.json`：去重后的球员主索引，包含姓名、slug、FC27/FC26 链接、来源位置组、各组排名和排除状态。
- `player-links.csv`：主索引的表格版本。
- `source/`：FC26、FC27 各位置组的金卡前 100 原始列表。
- `matches/`：各位置组的 FC27 与 FC26 匹配结果。
- `duplicates/`：跨位置组去重记录。

金卡历史价格已独立放在 `../../gold/data/prices/`，进化任务放在 `../../evolution/data/fc26/`。球员主索引仍是两个数据域共用的身份与中文名来源。

## 代码读取

```js
import { openPlayerRepository } from '../../src/player-data.mjs';

const players = await openPlayerRepository();
const alexia = players.get('alexia-putellas-segura');
const defenders = players.listByGroup('defender');
const unmatchedDefenders = players.listByGroup('defender', { matched: false });
```

默认情况下，`listByGroup()` 不返回已从该位置截图队列排除的重复球员。传入 `{ includeExcluded: true }` 可以查看完整原始位置名单。

价格数据也提供独立查询接口：

```js
import { openLaunchWeekPriceRepository } from '../../src/player-data.mjs';

const prices = await openLaunchWeekPriceRepository();
const alexia = prices.get('alexia-putellas-segura');
console.log(alexia.prices.cross['2025-09-18']);
console.log(alexia.metrics.cross.changePct);
```

读取连续三周趋势：

```js
import { openThreeWeekPriceRepository } from '../../src/player-data.mjs';

const prices = await openThreeWeekPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-08']);
console.log(haaland.analysis.cross.weeks.week2.changePct);
console.log(haaland.analysis.cross.trend);
```

读取开服首月交易分析：

```js
import { openFirstMonthPriceRepository } from '../../src/player-data.mjs';

const prices = await openFirstMonthPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-17']);
console.log(haaland.analysis.cross.trading.support7d);
console.log(haaland.analysis.cross.signal);
```

其中 `cross` 是 FUTBIN 的 PlayStation/Xbox 跨平台市场，`pc` 是 PC 市场。FUTBIN 返回的 `0` 表示该日没有有效均价，规范化文件中保存为 `null`，所有涨跌和波动指标都会忽略这些缺失值。

## 更新价格

```bash
npm run prices:fc26-launch
npm run prices:fc26-3weeks:analyze
npm run prices:fc26-month:analyze
```

命令复用项目内 `.futbin-browser-profile/` 会话，默认以最小化 Chrome 窗口运行，并按张保存可恢复检查点。若 FUTBIN 再次要求安全验证，脚本会临时显示自己的 Chrome 窗口；验证完成后会自动继续并重新最小化。

---

## 附录 9：`apps/market/engine/data/players/database/README.md`

# 本地球员数据库

`fc26.json` 与 `fc27.json` 是供市场扫描使用的规范化只读索引，统一按 `game + slug`
去重，并按评分倒序、姓名升序排列。原始抓取数据仍保留在各来源目录，避免规范化过程
丢失字段。运行 `npm run data:build` 可原子重建索引和 `manifest.json`。

- FC26：跨年匹配、金卡特技和首月真实价格摘要。
- FC27：球员基础数据、金卡特技、参考价格和中文名映射。
- 价格字段必须附带来源；FC26 历史价格不能冒充 FC27 当前价格。

---

## 附录 10：`apps/market/engine/evolution/README.md`

# FC26 进化任务数据

这里保存 FC26 FUTBIN 进化任务、发布日期顺序及每项任务的热门球员。完整日期时间线为 2025-09-18 至 2026-08-24（含首尾）；此前抓取的热门球员区间仍保留在 2025-09-18 至 2026-02-14。

## 日期与分类结构

```text
data/fc26/
├── raw/all-tasks.json
├── raw/futmind-evolution-schedule.json
├── by-date/index.json
├── by-date/daily/YYYY-MM-DD.json
├── ranges/2025-09-18_2026-08-24/
│   ├── manifest.json
│   ├── tasks.json
│   ├── tasks-chronological.json
│   ├── tasks-chronological.csv
│   └── by-category/
└── ranges/2025-09-18_2026-02-14/
    ├── manifest.json
    ├── tasks.json
    ├── tasks.csv
    ├── popular-players.json
    ├── popular-players.csv
    ├── tasks-with-popular-players.json
    └── by-category/
```

完整时间线按 `releaseDate` 升序、同日按 FUTBIN Evolution ID 升序排列。第一项是 2025-09-18 的 `Intro to Evolutions`，最后一项是 2026-08-24 的 `The Tenant`。

发布日期优先读取 FUT Mind 页面中的结构化 `created_at`，并用任务名称的最长公共子序列与 FUTBIN 时间线进行一对一匹配。FUT Mind 未保留的奖励类任务使用相邻的精确日期锚点推算，文件中的 `dateConfidence` 会明确标记为 `exact`、`normalized` 或 `inferred`。

## 重新生成日期排序

```bash
npm run evolution:sort
```

这个命令会重新读取 FUT Mind 的公开进化索引并更新每日文件、分类文件和 CSV。日期证据快照会保存到 `data/fc26/raw/futmind-evolution-schedule.json`。

## 抓取与续跑

已打开并验证 Chrome 时，重新抓取 2025-09-18 至 2026-02-14 的任务和热门球员：

```bash
npm run evolution:fetch
```

脚本默认连接 `http://localhost:19222` 的现有 Chrome，会按任务写入 `.popular-players-checkpoint.json`，中断后可续跑。需要使用项目自己的持久化 Chrome 时：

```bash
npm run evolution:fetch -- --profile --background
```

只从已有任务和断点重新生成 JSON/CSV：

```bash
npm run evolution:fetch -- --normalize-only
```

其他日期区间必须同时给出经过验证的 FUTBIN ID 边界：

```bash
npm run evolution:fetch -- --from 2026-02-15 --to 2026-03-01 --start-id 483 --end-id 600
```

## 代码读取

```js
import { openEvolutionRepository } from './src/player-data.mjs';

const evolutions = await openEvolutionRepository();
const task = evolutions.get('inside-edge');
const academy = evolutions.listByCategory('FS ACADEMY');
const launchDay = evolutions.listByDate('2025-09-18');
const withPopularPlayers = evolutions.listWithPopularPlayers();
```

---

## 附录 11：`apps/market/engine/gold/README.md`

# Gold 金卡历史数据

`gold/` 集中保存 FC26 金卡球员的历史价格代码、规范化数据和分析产物，避免与以后持续增加的 FC27 活动卡数据混在一起。

## 目录

- `src/`：首周、前三周和首月价格抓取/分析脚本。
- `data/prices/`：逐日价格、汇总指标、原始 FUTBIN 时间序列和可恢复检查点。
- `outputs/`：Excel 工作簿及其预览图。

## 更新

```bash
npm run prices:fc26-launch
npm run prices:fc26-3weeks:analyze
npm run prices:fc26-month:analyze
```

价格区间以 FC26 开服日 2025-09-18 为第一天。`cross` 是 PlayStation/Xbox 跨平台市场，`pc` 是 PC 市场。

---

## 附录 12：`apps/market/engine/modules/evolutions/README.md`

# 热门进化卡

按进化任务逐项核验限制、费用、到期时间、位置、评分和卡牌版本。热门排序必须
说明指标及采集时间；没有可靠热度来源时，只展示符合条件的候选，不虚构热度。

---

## 附录 13：`apps/market/engine/modules/icons-heroes/README.md`

# 传奇卡与英雄卡

作为市场扫描的第二维度，分别跟踪 Icon 与 Hero。保留卡牌版本、评分、价格平台、
实际采集时间和历史样本；不要把 FC26 历史价格直接标成 FC27 当前价格。

---

## 附录 14：`apps/market/engine/modules/price-tiers/README.md`

# 价格分层

Cross 平台默认分层：大卡不低于 100 万；中卡 30 万至 100 万；实用卡 10 万至
30 万；小卡 1 万至 10 万；1 万以下单列。边界采用左闭右开，100 万归大卡，
30 万归中卡，10 万归实用卡，1 万归小卡。

---

## 附录 15：`apps/market/engine/modules/weekly-cards/README.md`

# 本周活动卡与周黑

每日检查新活动卡和 TOTW，不依赖预设星期。记录稳定卡牌 ID、版本、发布时间、
可交易性、Cross/PC 价格、来源 URL 和采集时间。活动卡与周黑分别展示，重复球员按卡牌版本保留。

---
