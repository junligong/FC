# 自动化 d39303af（FC·足球日报）执行记忆

## 2026-09-21 06:00 执行摘要（最新）
- 状态：`partial`（success 因 evidence.missing 非空自动降级，设计行为），runId `21698108-083e-46e9-9795-40f4fbfe1494`，06:01:10 启动 → 06:16:01 提交（14 分 51 秒，踩线但未超 20 分钟硬上限）。
- 流程：triage OK（无自愈）→ 4 并行子代理（落盘交付）约 5 分钟收齐 → merge+build（46680 字节）→ verify exit 0 → **首次 finish 被拒 → 补证 → 二次 finish 成功**。
- 三榜全覆盖：epl 20 / laliga 20 / seriea 20 / bundesliga 18 / ligue1 18（法甲 2026-27 起 18 队制）/ saudi 18 / ucl 36 / mls_east 15 / mls_west 15；射助榜 8 键各 10-13 条；新闻 14 条（头条 6）。来源 worldfootball.net（英西意德法+MLS 积分榜）+ ESPN API/stats（欧冠/沙特）+ 新闻原文（Goal/头条/新浪/搜狐/AP/腾讯/网易/ManagingMadrid/7M/AOL）。
- **新踩坑（重要，下次必防）**：① **finish 校验要求 evidence.sources 每条 openedAt 可解析且 ≥ startedAt，空字符串也拒**——新闻子代理交付的 JSON 未带 openedAt，首次 finish 被拒（「来源记录不是本轮实际打开，拒绝复用旧证据」）；② **一次性子代理交付后不可恢复**（SendMessage 报「Not in a team」无法续聊），缺字段只能主流程自己补；本轮做法 = 主流程经 CDP 把 14 条新闻 URL 逐条重开（`/new` → 1s → 取 `document.title` → `/close`，实测 28 秒）拿真实 openedAt 回填后二次提交通过——该重开同时完成了原文复核，一举两得；③ **预防**：子代理 prompt 已要求 openedAt，但必须落一条铁律——**主流程在 finish 前本地预校验所有 sources 的 openedAt 非空可解析且 ≥ startedAt，不满足先本地修，不要撞 finish**。
- 生成器复用 09-20 版（sed 改 D 与日期文案）；merge.mjs cutoffText 日期也已同步 09-21。
- 缺失项（partial 依据）：MLS 射助榜无分区独立榜单（用联盟总榜）；美职联/沙特联/欧冠窗口内无满足核实要求的独立新闻；法甲战报（里昂 4-0 雷恩）仅 AP 综合稿提及、原文 403 未单列。
- 产物：`reports/daily/2026-09-21/football.html`（快照 `automation/runs/2026-09-21/football/report.html`）；证据 `evidence.json`（35 sources）；数据 `work/{agent-*.json,data.json}`；生成器 `work/{merge,build-football}.mjs`。

## 2026-09-20 03:10 执行摘要
- 状态：`success`，runId `da46571f-8762-4ab7-8eb2-9d07f5b8ac07`，03:27:39 启动 → 03:37:20 提交（9 分 41 秒收口，历史最快）。
- 触发略迟（03:27 才开始，晚于 03:10 计划），但仍远在 deadline 内。
- 流程：triage OK（无自愈）→ 4 并行子代理（fb-epl-laliga / fb-ita-ger-fra / fb-ucl-mls-saudi / fb-news，**落盘交付**）约 4 分钟全部交付（03:36:44）→ merge+build（45719 字节）→ verify exit 0 → evidence（32 sources、missing=0）→ finish success。
- 三榜全覆盖：epl 20 / laliga 20 / seriea 20 / bundesliga 18 / ligue1 18 / saudi 18 / ucl 36 / mls_east 15 / mls_west 15；射助榜 8 键各前 10；新闻 14 条（verify 提醒 mls_east/mls_west 射助榜未覆盖属预期——mls 用联盟总榜）。
- 本轮子代理走 worldfootball.net（英西意德法）+ ESPN（欧冠/MLS/沙特 standings 与 stats 页）+ ESPN site.api 交叉核对；新闻来源含 thestar/sky/sportslive/搜狐/球迷屋/腾讯/新浪。
- 模板复用 09-19 版（build-football.mjs 改 D 与标题日期）；merge.mjs 为本日重写（4 文件统一 schema，缺块自动降级空数组+metaNotes 标注）。
- 产物：`reports/daily/2026-09-20/football.html`（快照 `automation/runs/2026-09-20/football/report.html`）；证据 `evidence.json`；数据 `work/{agent-*.json,data.json}`。

## 2026-09-19 03:10 执行摘要
- 状态：`failed`（**迟到处置**，非采集失败），runId `9cbe7afc-4e52-491d-ac67-e0d091d30553`，03:55:05 启动 → 04:19:04 终结。
- **采集与校验本身全部成功**：浏览器 triage OK（无自愈）；4 并行子代理（英超西甲 / 意德法 / 欧冠MLS沙特 / 新闻）约 15 分钟收齐；三榜 9 联赛块全覆盖（EPL 第5轮、西甲第6轮、意甲第4轮完赛、德甲第3轮完赛、法甲第4轮完赛、UCL 联赛阶段第1轮 36 队、MLS 东西区各15、沙特联第7轮）；射助榜 8 键全覆盖；新闻 18 条逐条核实；`verify-football-boards.mjs` exit 0。
- **迟到根因（务必防复发）**：① 子代理通过消息回报大 JSON 不可靠（内容需反复重发确认），**改用落盘交付**（子代理 Write 到 `work/agent-*.json`，主流程 Read 合并）后 45 秒内三路齐备；② 构建/合并脚本用 `process.cwd()` 当输出锚点，在 work 目录下执行时产物写偏到 `work/reports/`，移动复验耗尽窗口 → **构建脚本必须用 `__dirname` 上溯锚定项目根**（本轮已修，未来生成器照抄该写法）；③ 意德法子代理回报较晚 + 主流程对每路 JSON 做二次确认往返，合计吃掉约 10 分钟。
- **run-state 关键事实（实测）**：`finish` 的 `startedAt+20min` 硬上限**只对 success/partial 生效**（run-state.mjs L53-54），`failed` 不查期限可随时收口；success/partial 被拒后该 runId **永久无法**以成功态提交（owner.json 锁仍在，同日 begin/--rerun 均被拒）。契约对策：最迟第 14 分钟必须收口的红线要再提前——**主流程合并与构建留给前 12 分钟，最后 3 分钟只做 verify+evidence+finish**。
- 产物：`reports/daily/2026-09-19/football.html`（44550 字节，内容完整、校验通过，但因 failed 未写 run-state 快照）；证据 `automation/runs/2026-09-19/football/evidence.json`（含 lateSubmission 全记录）；数据 `work/{data,agent-*.json}`、生成器 `work/build-football.mjs`（模板数据分离 + 项目根锚定）。
- 上游后果：03:35 汇总合并时 football.html 尚未生成，今日线上足球栏未收录本产物，次日 03:10 自然恢复。
- 其余缺失项：MLS 射助榜无分区独立榜单（用联盟总榜）；意德法分联赛新闻未入卡（避免转述误差）；沙特联第7轮后休赛期至 10/9。

## 2026-09-18 03:00 执行摘要（最新）
- 状态：`partial`，runId `cfa681a3-4694-4cea-871d-a0dbf04516e8`，03:37:35 启动 → 03:48:50 提交（11 分钟收口）。
- 浏览器通道：web-access CDP（check-deps exit 0）正常。4 个并行子代理（英超+西甲 / 意德法 / 欧冠+MLS+沙特 / 新闻），约 7 分钟收齐。
- 数据：三榜 9 个联赛块全覆盖（英超第4轮、西甲第6轮、意甲4轮、德甲3轮、法甲4轮、欧冠联赛阶段第1轮 36 队、MLS 东西区各15队、沙特联第7轮）；射手/助攻 8 联赛各前10；新闻 14 条（头条6+分联赛8）逐条打开原文。
- `verify-football-boards.mjs` 退出码 0。
- 终态 partial 原因（evidence.missing 非空自动降级，设计行为）：法甲/沙特联窗口内无独立新闻；MLS 射助榜无东西分区拆分；英超 Calvert-Lewin 进球 BBC(3)/ESPN(2) 冲突按 BBC 记录；维拉欧冠战报仅单一自媒体来源。
- **踩坑（新增）**：`verify-football-boards.mjs` R3 要求射助榜每行 `r[3]` 为 **number 类型**（字符串数字会被判「不是 [排名,球员,球队,数字] 结构」）；生成器里统一 `Number()` 转换后通过。
- 产物：`reports/daily/2026-09-18/football.html`（47382 字节，快照 SHA-256 4a8ec4cc…）；证据 `automation/runs/2026-09-18/football/evidence.json`；生成器 `automation/runs/2026-09-18/football/work/build-football.mjs`。

## 2026-09-17 03:00 执行摘要
- 状态：`partial`，runId `6faaafbd-51f1-4c0a-aa74-135d3f427ebc`，03:30:20 启动 → 03:42:41 提交。
- 浏览器通道：web-access CDP（check-deps exit 0）正常。4 个并行子代理分治采集（英超+西甲 / 意德法 / 欧冠+美职联+沙特 / 新闻），约 8 分钟收齐。
- 数据：三榜覆盖 9 个联赛块（英超第4轮、西甲第6轮、意甲4轮、德甲3轮、法甲4轮、欧冠联赛阶段第1轮、MLS 东西区、沙特联第7轮）；新闻 14 条（头条6+分联赛8，均打开原文核实）。来源：BBC/ESPN/worldfootball.net/ESPN-MLS-沙特。
- `verify-football-boards.mjs` 退出码 0。
- 终态 partial 的原因：run-state.mjs 第 60 行——`status=success 且 evidence.missing 非空 → 自动降级 partial`。本轮缺失项：欧冠/沙特联助攻榜无可靠来源（占位行）、欧冠无独立战报、MLS 射手/助攻无分区拆分。这是设计行为，不算故障。
- **关键经验**：① finish 证据校验要求 `sources[].openedAt` 为可解析 ISO 时间且 ≥ startedAt（`03:31-03:35 (北京时间)` 这类区间文本会被拒）；② 用模板拼接生成时注意 news-grid 闭合 `</div>` 配平（初次拼接丢 1 个，已修，产物与模板 grid region diff=0）；③ 官方站 premierleague.com/laliga.com/uefa.com 直连均不可用，BBC/ESPN/worldfootball 是可靠替代并交叉核验。
- 产物：`reports/daily/2026-09-17/football.html`（64698 字节，快照 SHA-256 7f3b26a4…）；证据 `automation/runs/2026-09-17/football/evidence.json`；生成器 `automation/runs/2026-09-17/football/work/build-football.mjs`。

## 2026-09-16 执行摘要
- 状态：`failed`，runId `e3b7351d-205c-458b-81d0-b9f313d44547`，03:08:22 启动 → 03:09:42 提交。
- 结果：三大榜单（积分/射手/助攻）与足球资讯全部 0 条。
- 失败原因：Chrome 插件 extension 通道不可用（与同日 news/market/evolution 一致）。4 项探针实测：`init --mode extension` 返回 `RelayUnreachable`（缺 `DUMATE_HOST_URL`）；relay 未连通；Chrome 缺 `com.workbuddy.extension.json` 原生宿主；日常 Chrome 无远程调试端口。
- 三榜校验闸门退出码 1（R6 无射手/助攻数据），按契约不得提交 success，提交 `failed`。
- 产物：`reports/daily/2026-09-16/football.html`（FAILED 徽标 + 三榜空状态 + 本轮说明/缺失项）；证据 `automation/runs/2026-09-16/football/evidence.json`。
- 处置合规：未回退 IAB、未新建 profile、未用旧日期/FC26 数据填充、未做「缺数据回退英超」静默兜底。
- ~~待用户侧修复：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主），否则 football 每日都会失败。~~ —— **该建议作废，见下方更正。**

## 2026-09-16 13:40 更正（覆盖上文）
- **WorkBuddy 桌面端 v5.5.6 根本没有实现 `com.workbuddy.extension` 原生消息宿主**（`app.asar` 中 `connectNative`/`NativeMessaging`/扩展 ID 命中数全为 0），属产品侧缺口，用户侧无法修复；该扩展已在用户机器上禁用。不要再排查或配置它，也不要用 Chrome 插件 / `extension` 模式。
- **现行唯一通道 = `Web Access（浏览器自动化）` 技能**（CDP Proxy :3456 直连用户日常 Chrome）。前置开关 `chrome://inspect/#remote-debugging` 已开启且**跨重启持久**（`Local State → devtools.remote_debugging={"user-enabled":true}`，端口 9222）；`config.env` 已固化 `WEB_ACCESS_BROWSER=chrome`。
- 自检：`node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` → exit 0 才继续。
- 同日重跑用 `node automation/run-state.mjs begin football D --rerun`；`finish` 硬上限 `startedAt + 20 分钟`，最迟第 14 分钟收口转 `partial`。
- 2026-09-16 13:30 重跑结果：提交 `partial`，三榜各覆盖 8 个联赛块、30 个来源，`verify-football-boards.mjs` 退出码 **0**。缺失项：意甲/德甲/法甲/欧冠/美职联无单独联赛资讯，伤停 0 条。顺带修复了模板中「美职联积分榜引用未定义变量」的缺陷。
