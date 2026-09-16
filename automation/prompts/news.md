# news 单项执行契约（2026-09-16 修订：媒体改走 syndication 接口）

本文件为实际执行入口规则。每日 03:00 调度，每个单项只采集和生成自己的数据；绝不执行合并、发布、修改首页、修补布局、修改其他模块文件或再次启动任务。

1. 第一条命令运行 `node automation/run-state.mjs begin news D`（D 在开始时固定 Asia/Shanghai 日期）。保存返回的 runId 与 deadlineAt。**accepted=false 要区分两种情况**：reason 为「本日任务已启动或已完成」说明当日已有终态运行——调度场景下立即最终回复“本日已有运行”并停止；**仅当用户在本轮明确要求同日重跑时**，改用 `node automation/run-state.mjs begin news D --rerun`（先把旧 attempt 归档到 `automation/runs/D/news/attempts/<旧runId>/`，仅 rename，非破坏性）。reason 为「当前运行仍在进行」时一律不得重跑，立即停止并回报。
2. 总预算 15 分钟，前 10 分钟采集，随后只完成当前已有证据的数据、一次校验和提交。**注意 `finish` 的硬上限是 `startedAt + 20 分钟`**（返回的 `deadlineAt` 15 分钟只是提示），超过会被「超过提交期限，不接受迟到版本」拒绝：最迟第 14 分钟必须收口，宁可提交覆盖不全的 `partial`。每个阶段查看当前时间；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
3. HTML 只作为内部数据产物。保留既有模板结构，展示由合并器统一处理；日报任务不得重构 CSS、补齐设计要求或恢复旧页面。有效数据不足时提交 partial，不能以旧日期改写冒充新报告。
4. 将本轮证据写入 `automation/runs/D/news/evidence.json`，至少有 date、sources（原文 URL、打开时间、数据截止时间）、缺失项。每个 `openedAt` 必须晚于本轮 `startedAt`；不得通过 `touch` 报告或复制旧 run 的来源记录伪造新运行。运行 `node automation/run-state.mjs finish news D RUN_ID success或partial 证据路径`。脚本检查所有者、文件修改时间、日期与完整性，保存不可覆盖快照及 SHA-256。证据字段只是记录，不能代替实际打开来源。
5. 失败则把原因写入证据文件并运行同一 finish 命令，状态 failed；只有用户已明确暂停且 `shared/config/project.json` 中该任务为 `enabled: false` 时才可提交 skipped。启用中的任务不能用 skipped 掩盖浏览器、采集或生成失败。提交完成后立即最终回复状态和路径，不再调用任何工具。单项不读 publish.md，不查认证，不尝试发布。

## 采集与数据要求

在 /Users/wuyanzu/Desktop/FC 生成 FC27 资讯雷达。日期 D 使用总任务提供的 Asia/Shanghai 日期；独立执行时在开始时固定日期。

浏览器只使用本任务已绑定的 `Web Access（浏览器自动化）` 技能（CDP Proxy 直连用户日常已登录 Chrome），**不再使用 Chrome 插件 / `extension` 模式**。采集前先运行 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs`：`exit 0` 才继续；`exit 1` 表示 Chrome 远程调试开关未开，只能请用户勾选，不得改用其他浏览器。不得运行 `dumate-browser-cli`、`automation/browser-env.sh`、`apps/news/auto_news.sh` 或 `automation/collect-news.mjs`，也不得因缺少 `DUMATE_*` 环境变量把本轮误判为失败。是否能采集以本轮实际打开来源并读取页面为准。不得打印、复制或改写任何认证文件。

每次重新读取 `apps/news/sources.txt`，不硬编码账号数量。采集按下面四步走，不要自创步骤：

1. **时间线抽取（DOM）**：用 Web Access 技能逐个访问账号主页，对页面执行 `apps/news/extract-timeline.js` 的内容（可直接读取该文件后 `/eval`）。它只负责拿推文 ID、链接、作者、时间和正文，以及 `hasVideo/hasPhoto/hasCard` 三个媒体存在标记。**不要**在 DOM 里抠图片地址——X 在后台标签页把媒体渲染成模糊骨架占位符（`[data-testid="tweetPhoto"]` 内没有 `<img>`），DOM 里的图既不可靠也不完整。
2. **媒体解析（接口）**：把第 1 步的结果写入 `apps/news/data/tweets-D.json`，再运行 `node apps/news/enrich-tweet-media.mjs D`。它调用 X 公开 syndication 接口，补齐权威的 `images`（正文配图）、`video`（封面 + mp4 直链 + 时长 + kind）、`card`（链接卡片标题/缩略图/目标地址）、`quoted`（被引用推文及其配图）与 `mediaResolved` 标记。
3. **生成报告**：`node apps/news/generate_report.mjs D`。
4. **翻译与校验**：见下文。

总采集阶段以 10 分钟为上限，剩余时间用于翻译、原图保存、校验和提交；**提交的硬上限是 `startedAt + 20 分钟`**，超时会因「超过提交期限」被拒，故最迟第 14 分钟必须收口转 `partial`。遇到运行锁先核实原任务是否仍运行，不盲目删除；同日重跑用 `node automation/run-state.mjs begin news D --rerun`。

只收录可核对发布时间、原始推文链接和正文的 FC27 相关信息。排除纯预测、纯推广，以及**除视频封面外没有任何信息文本**的纯视频/纯 GIF 内容；**带信息量的视频推文正常收录**，并在卡片上标注「视频 / 动图 GIF + 时长」与在原推中观看的入口（历史上「带 video 元素整条丢弃」的做法导致视频内容长期缺失，不要再那样做）。同一账号转发与同一推文 ID 去重。同一球员或同一 SBC 主题不能直接当作同一事件合并。官方公告与未经证实的爆料分开标注，不把 FC26 消息自动当作 FC27。

每张卡片包含博主、时间、完整中文翻译、可折叠原文、媒体区、原推链接，保留多列网格与移动端单列布局。媒体区按下面三态之一渲染，且所有媒体与占位都链接到原推：① 有配图/视频封面/链接卡片 → 正常展示，视频额外标注「视频 / 动图 GIF + 时长」；② `mediaResolved=false` → 显示「本条推文的媒体信息本轮未能解析，不代表原推没有配图」；③ 有 `hasVideo/hasPhoto/hasCard` 但未取到地址 → 显示「原推含媒体，本轮未取到媒体地址」；只有三者皆无才可写「原推为纯文本，无配图」。翻译服务失败时由执行任务的 AI 完成翻译，使用当日 `data/tweets-D.json` 保存完整数据；「术语替换」和英文混排不算翻译完成，未完成项必须明确标记为「待翻译，请查看原文」。

凡是 `pbs.twimg.com` 上的推文媒体都要落盘到 `reports/daily/D/assets/news/` 后再写入报告：正文配图（`/media/`，规范为 `name=orig`）、视频/动图封面（`/media/` 或 `/amplify_video_thumb/`）、链接卡片缩略图（`/card_img/`）。放行规则由 `shared/lib/report-assets.mjs` 的 `isCacheableXImage()` 统一判定，**不要**再自己写 `/media/` 正则。下载是两级：`generate_report.mjs` 先用 curl 直连，**本机拉不下来的会自动经用户浏览器（CDP）补下**——本运行环境的出口代理到 `pbs.twimg.com` 不通（直连被 reset、走代理 TLS 握手失败），所以「curl 报 SSL_ERROR_SYSCALL」属预期现象，不要据此判定图片无法保存。浏览器兜底需要 CDP Proxy 在线（本任务采集阶段本就在用），若 proxy 不可用则报告至少为 `partial` 并记录未落盘数量。合并器负责把这些本地资产内嵌到单文件汇总。不得只保留远程热链，也不得用 `onerror` 隐藏加载失败。媒体接口解析失败（`mediaResolved=false`）时，报告必须显示「媒体未解析」，**不得**写成「原推为纯文本，无配图」。

data/seen_tweets.json 是历史资产，禁止重置。只有 `generate_report.mjs` 可在报告校验通过后原子更新它；执行 AI、临时 Python/Node 脚本和手动翻译步骤均不得直接写此文件。生成器更新前必须保留 `data/seen_tweets.json.bak`。损坏时先从该备份核实恢复；备份不可用时可从 Git 中已跟踪的基线与各日 `tweets-D.json` 快照合并恢复，仍无法恢复就停止该子任务，绝不能创建空 seed 继续。报告成功生成后才提交去重记录；同日重跑合并当日已有内容，不因全部推文已看过就覆盖为空。保留原始采集文件和备份用于追溯。

输出 `reports/daily/D/news.html`。提交前按下表自检，任何一项不达标都要写进 `missingItems` 并按 `partial` 提交，不得声称已完整覆盖：

| 检查项 | 通过标准 |
|---|---|
| 当日日期 | 报告与快照的 `date` 均为 D |
| 卡片数量 | 与 `data/tweets-D.json` 的条目数一致，非 0（除非确实无内容） |
| 中文完整性 | 每条卡片都有中文翻译或明确的「待翻译」标记 |
| 媒体解析 | `enrich-tweet-media.mjs` 输出的失败条数与报告中的「媒体未解析」卡片数吻合 |
| 图片落盘 | 报告里的 `src` 全部指向 `assets/news/`，无远程热链；未落盘数量记入证据 |
| 账号覆盖 | 记录本轮成功打开 / 总数，未打开账号逐个列明 |
| 来源链接 | 每张卡片都有可点的原推链接 |

只有全部来源成功且确实无相关内容时才可写「本期无新资讯」；访问失败、媒体解析失败、图片落盘失败、翻译失败分别记录，不得合并成一句「部分失败」。失败时保留上次有效报告。

浏览器强制规则：每次先读取根 AGENTS.md 对应段落；直接调用定时任务已绑定的 `Web Access（浏览器自动化）` 技能，复用用户日常 Chrome 登录态。禁止调用或探测 `dumate-browser-cli`、`DUMATE_*`、`automation/browser-env.sh`、`apps/news/auto_news.sh`、`automation/collect-news.mjs`、`fc-browser-channel-check` 历史探针、`agent-browser`、IAB、临时浏览器或新 profile；是否成功只以本轮实际打开来源并读取页面为准。
