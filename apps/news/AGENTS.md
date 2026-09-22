# FC27 资讯采集任务约定

本目录负责从 `sources.txt` 列出的 X（推特）账号采集近 24 小时的 FC27 资讯，过滤、聚类去重、翻译，并生成 `../../reports/daily/D/news.html`。

- 执行前必须完整读取根 `../../AGENTS.md` 与 `../../automation/prompts/news.md`；后者是唯一完整业务契约，本文件补充模块内的实现约束。
- 每次执行先回读根 `../../AGENTS.md` 的「浏览器强制规则」：先运行 `node automation/browser-triage.mjs`，再通过 `web-access` 的 CDP Proxy 直连独立调试 profile `Chrome-FC-Debug` :9333。X 需在该 profile 中单独登录一次。**日常 Chrome 和 extension 模式均不使用**；`auto_news.sh`、`automation/collect-news.mjs` 是旧入口，不得调用。
- X 是强反爬且依赖登录态的站点，**不得**用 WebSearch / WebFetch / curl 代替浏览器采集。

## 数据流水线（固定四步，不要自创步骤）

| 步骤 | 命令 / 文件 | 职责 |
|---|---|---|
| 1. DOM 抽取 | `extract-timeline.js`（读取后用 Web Access 的 `/eval` 执行） | 只取推文 ID、链接、作者、时间、正文与 `hasVideo/hasPhoto/hasCard` 三个媒体存在标记 |
| 2. 媒体解析 | `node apps/news/enrich-tweet-media.mjs D` | 经 X syndication 接口补齐 `images` / `video` / `card` / `quoted` 与 `mediaResolved` |
| 3. 生成报告 | `node apps/news/generate_report.mjs D` | 过滤、聚类去重、翻译、落盘图片、渲染 `news.html` |
| 4. 提交 | `node ../../automation/run-state.mjs finish news D RUN_ID …` | 见根契约的提交与时限要求 |

第 1 步的产物写入 `data/tweets-D.json` 后立刻进入第 2 步；第 2 步原地原子更新同一个文件，第 3 步以它为准。

### 为什么媒体不能从 DOM 取

X 在后台标签页（`document.visibilityState === 'hidden'`，`requestAnimationFrame` 不推进）只把推文媒体渲染成模糊骨架占位符：实测打开一条 5 图推文的固定链接，`document.querySelectorAll('img').length === 0`，`[data-testid="tweetPhoto"]` 有 6 个但内部没有 `<img>`；执行一次 `Page.captureScreenshot` 强制出帧后 `img` 才从 0 变成 6。链接卡片更彻底，DOM 里既无图也无 href。**因此 DOM 图片既不可靠也不完整，媒体一律以接口为准。**

### 媒体接口

`apps/news/x-media.mjs` 封装 X 公开的 `https://cdn.syndication.twimg.com/tweet-result?id=<推文ID>&token=a`（带常规 UA 即可，**不需要登录态**），返回：

- `mediaDetails[]`：`type` 为 `photo` / `video` / `animated_gif`；`media_url_https` 对视频/动图就是首帧海报；`video_info.variants[]` 提供可下载的 mp4 直链与 `duration_millis`。
- `card.binding_values`：链接卡片缩略图（`player_image_original` / `thumbnail_image_original` 等 IMAGE 键）、`title`、`description`、目标地址。
- `quoted_tweet`：被引用推文（含其自己的配图，必须与主推文分开统计）。
- `created_at`、`text`、`user`。

解析与规范化由纯函数 `normalizeTweetMedia()` / `normalizeCard()` / `collectTweetImageUrls()` 完成，逐条失败写 `mediaResolved: false`，**绝不用其他推文的媒体顶替**，也不因接口为空对象就判定「这条推文没有媒体」。

## 媒体规则

- **不得因推文含 `video` / `animated_gif` 就丢弃整条推文。** 历史脚本 `auto_news.sh` 的 `if (videoEl) continue;` 是「带视频的都截取不到」的直接原因（8 天数据里 506 张图 100% 是 `/media/`，视频缩略图命中数为 0）。带信息量的视频推文照常收录，并在卡片上标注「视频 / 动图 GIF + 时长」与在原推中观看的入口。
- **落盘白名单**：`pbs.twimg.com` 上的 `/media/`（正文配图与视频封面）、`/amplify_video_thumb/`、`/ext_tw_video_thumb/`、`/card_img/`（链接卡片缩略图）都要保存到 `reports/daily/D/assets/news/`。放行规则统一由 `../../shared/lib/report-assets.mjs` 的 `isCacheableXImage()` 判定，**不要再自己写 `/media/` 正则**（历史上只认 `/media/`，导致视频封面与卡片缩略图被静默丢弃）。`originalXImageUrl()` 只对尺寸写在 `name=` 上的路径改写为 `name=orig`；视频缩略图的尺寸写在路径里，硬改会 404。
- **图片下载是两级，不要只看 curl 的结果**：`generate_report.mjs` 先用 curl 直连，失败项自动交给 `fetch-images-browser.mjs` 经用户浏览器（CDP Proxy）补下。本运行环境的出口代理到 `pbs.twimg.com` 不通（直连 `Connection reset`、走代理 `SSL_ERROR_SYSCALL`），因此 **curl 报 SSL 错是预期现象，不代表图片不可获取**。浏览器侧必须以 `https://x.com` 为 origin（该 CDN 的 CORS 只放行 x.com，`about:blank` 取不到图）；没有现成 x.com 标签页时用 `https://x.com/robots.txt` 作轻量宿主，用完只关自己开的那个。
- 浏览器兜底要求 CDP Proxy 在线（采集阶段本就在用）；proxy 不可用导致图片未落盘时，报告至少为 `partial` 并记录未落盘数量。
- 报告优先引用本地资产，**不得只保留远程热链**，也不得用 `onerror` 隐藏加载失败。
- **媒体状态必须诚实**（三态，不得笼统写成「原推为纯文本，无配图」）：
  - `mediaResolved === false` → 「本条推文的媒体信息本轮未能解析，不代表原推没有配图」
  - 有 `hasVideo/hasPhoto/hasCard` 但没取到地址 → 「原推含媒体，本轮未取到媒体地址」
  - 三者皆无 → 「原推为纯文本，无配图」

## 覆盖度与失败判定

- 已知限制（实测）：X 时间线虚拟化 + 后台标签页节流，单个账号通常只渲染 3–7 条，滚到底后 `scrollHeight` 不再增长、无加载指示。这是通道固有限制（历史「好」的日子也只有约 7 条/账号），**不是回归**。
- 24 小时覆盖无法保证 100%。不完整必须如实写入 `missingItems` 并提交 `partial`，**不得**声称已完整覆盖。
- 浏览器失败属于**采集失败**，不得写成「没有新闻」；只有全部来源成功且确实无相关内容时，才可写「本期无新资讯」。
- 访问失败、媒体解析失败、图片落盘失败、翻译失败要分别记录，不能合并成一句「部分失败」。

## 数据与快照纪律

- `data/seen_tweets.json` 是跨日历史去重库：禁止清空、重建或用于破坏性测试。
- 仅 `generate_report.mjs` 可原子更新去重库并保留 `seen_tweets.json.bak`；执行 AI 与临时脚本不得直接改写它。恢复失败时**停止任务**而不是创建空库。
- `data/tweets-D.json` 是当日结构化快照，由 `enrich-tweet-media.mjs` 原地原子更新；该脚本只接受与目标日期一致的快照，拒绝改写其他日期。
- 临时翻译、渲染脚本与 pending 文件进入 `../../automation/runs/D/news/work/`，不得写入项目根或最终报告目录。
- 产物固定为 `../../reports/daily/D/news.html`；同日重跑合并当日已有内容，不因全部推文都见过就覆盖为空。

## 报告内容要求

每张卡片包含：博主、时间、完整中文翻译、可折叠原文、媒体区（配图 / 视频封面 / 链接卡片 / 无图说明，均链接到原推）、原推链接。保留多列网格与移动端单列布局。

翻译服务失败时由执行任务的 AI 完成翻译。「术语替换」和英文混排不算翻译完成；未完成的必须在报告中明确标记「待翻译，请查看原文」，不得伪装成中文。

**译文文件通道（2026-09-17 起，必走）**：执行 AI 的翻译结果写成 `data/translations-D.json`，结构为
`{ "schemaVersion": 1, "date": "D", "source": "执行 AI 翻译", "translations": { "<推文ID>": "<完整中文译文>" } }`。
键必须是推文 ID（与 `data/tweets-D.json` 的 `id` 一致）。`generate_report.mjs` 会**优先取该文件**，并在同日重跑时对旧卡片统一补齐翻译。

> 历史坑：原 `translateTweet()` 依赖已废弃的 DuMate 千帆代理（环境变量 `DUMATE_QIANFAN_PROXY`）或 `apps/news/.api_key`，迁移到 WorkBuddy 后两者都不可用（该文件不存在），导致当日 71 条全部显示「待翻译」。**不要再依赖该通道。**
> 提交前自检：`grep -c "待翻译" reports/daily/D/news.html` 必须为 `0`；出现该标记即为 `partial` 并记入 `missingItems`。

## 相关文件

- 共享路径与日期逻辑只从 `../../shared/lib/runtime.mjs` 导入；图片的缓存判定、命名与路径改写从 `../../shared/lib/report-assets.mjs` 导入（图片本身不内联，由合并期改写为指向 `daily-merged/assets/`）。
- 媒体解析的回归测试在 `../../automation/news-media.test.mjs`（随全套测试一起跑）。
