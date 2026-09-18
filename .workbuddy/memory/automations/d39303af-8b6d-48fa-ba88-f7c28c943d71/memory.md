# 自动化 d39303af（FC·足球日报）执行记忆

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
