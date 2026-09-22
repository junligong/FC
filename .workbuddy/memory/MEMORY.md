# FC 长期记忆（契约正文一律看根 `AGENTS.md` 与 `automation/prompts/*.md`，此处只存踩坑与口径）

## 任务与产物
- 日任务 6 个（2026-09-20 起）：资讯 03:00 → 市场 03:05 → 进化 03:15 → 传奇英雄 03:20 → **足球 06:00** → **汇总发布 06:15**。时刻表权威源 `shared/config/project.json#dailySchedule`。
- 高频任务 2 个（icons-pricerange-hourly / market-hourly，**均每 4 小时**）**分钟相位不可控**：`HOURLY` 不接受 `BYHOUR`，`BYMINUTE` 被静默忽略（nextRunAt = 上次配置更新时间 + INTERVAL）。两者同 sourceKey，调度器同时最多放 1 个 → 相遇时后到者记 `skip same-source` 并保持 due，属正常串行。⇒ 共用 `current.json` 的并发防护必须做在脚本层（幂等按 cardId 合并 / 原子写），不要依赖调度相位。两者均**不调用 run-state.mjs**（owner.json 是一天一次语义，会拒掉当日全部高频轮次）。
- 产物 `reports/daily/D/`；站点 fc27-site.app.workbuddy.host（`entryHtml=index.html` + `updateExistingApp`）。一律 `render-*.mjs` 渲染，**不手改 HTML**；受 run-state 快照校验的产物（`market.html`）改动后必须重提快照，否则站点静默回退旧版。高频任务**不得渲染 market.html、不写 run-state**。
- **`daily-merged/index.html` 是整体内联单文件，渲染产物不会自动上线**：market-hourly 第 ⑥ 步必须 **先 `FC_PROJECT_ROOT=… node apps/portal/merge_daily_report.mjs D`（无锁、约 1.6 秒）再发布**，否则线上栏目的页头/统计/榜单会冻结在每日汇总合并所消费的那一版，而价格因走客户端 `current.json` 仍是最新——形成「只有价格是活的」这种最易漏检的形态（2026-09-18 实测冻结在 T02 达 13 小时，此前各轮只核对 `current.json` 全部漏检）。`merge_daily_report.mjs` 不写入任何受 `run-state` 校验的产物；有锁的 `coordinate.mjs` 仍禁跑。**核对发布不能只验 JSON，必须验页面正文里的构建期字段**。
- 页面里任何「时间」一律做成客户端实时读取（`render-market-watch.mjs` 的「行情更新于」与逐行「更新于」列即此模式：读 `current.json` 的 `generatedAt`/`updatedAt`/逐平台 `observedAt`），构建期固化值只作兜底，保证合并失败时时间也不会骗人。

## 踩坑（高价值）
- **FUTBIN `td.table-price` 单元格 innerText 自 2026-09-20 起为多行串「币价\n…\n涨跌徽标(如 14.29%)」**：解析价格必须**只取首个非空行**并丢弃 `price-diff` 徽标行；任何整串锚定正则（如 `^([\d.]+)\s*([KM]?)$`）会**静默失配**——实测 300 行只有 50 行解析出价，产物里的 `consoleValid/pcValid` 会呈现为「失真低值」而非报错。同源问题 `collect-icons-list.mjs`（已修）与 market 的 `fetch-players-pages.mjs`（2026-09-20 修）都踩过，新增任何从该列表页取价的脚本都要按此口径。
- **开服日 = `2026-09-18`**（2026-09-22 闭环；`2026-09-25` 是**正式全球发售日**、不是开服日，勿改回）。根 `AGENTS.md`「FUTBIN 平台口径强制规则」为唯一出处；`collect-icons-list` / `record-icons-daily` / `collect-icon-priceranges` / `build-icon-research` / `build-same-period-advice` 五个脚本常量已统一。**教训仍有效**：`date < launchDate` 这类日期分支一旦翻转会**静默改口径**（`priceBasis` 由 `listing-estimate` 翻成 `market`，触碰「开服前不计算日环比与累计涨跌」红线，2026-09-20 首次提交时实测发生）。现在 `priceBasis` 一律按**当日实测有效价**判定（`'market'` 已废弃，判据写 `basis !== 'listing-estimate'`），不再按日期一刀切——改任何相关脚本前先确认没有残留的日期分支。
- **采集器写出必须做「台账补全」**（2026-09-19 修复）：`collect-icons-list.mjs` 原先只写「采到的行」，`/27/players` 11+ 页被 403 截断时会把当日台账从 **131 静默缩到 102**（与 09-17/09-18 不可比、无任何报错）。现改为「采到的行 + 未采到的台账卡以空价保留」（名单基准只取 `fc27-icons-playstyles.json`；价一律 0/valid=false，**不得**用旧日期或 FC26 填充）。修复后单页低负载重跑即可回填：`--from-page 26 --max-page 26 --merge`（约 15 秒、1 次导航）。**任何「只写成功项」的采集器都有同类静默缩减风险，新增写出路径时先核对卡数是否等于台账。**
- **三份价格产物字段结构各不相同，跨文件校验前必须先探明**（混用会产生「131 张全部不一致」这类假告警）：`pricerange/latest.json` 逐卡键 = `id` + `current{console,pc}` + `currentValid{console,pc}` + `priceRange{min,max,updatedText}`；daily 快照 `daily/<D>.json` 逐卡数组键 = `players`，平台价在 `platforms.console/pc={price,valid}`，区间在 `priceRange{min,max,updatedText,fetchedAt}`；`current.json` 的卡表是按 cardId 的映射对象 `cards`（键为字符串 cardId），平台价在 `platforms.console/pc={price,valid,observedAt,source}`。
- `apply-market-name-zh.mjs --file` 须传实际日期目录 `automation/runs/<YYYY-MM-DD>/...`，传 `D` 字面路径读不到。`apps/portal/merge_daily_report.mjs` 同理**不收字面量 D**（报「无效日报日期: D」，2026-09-22 T08 实测）；market 脚本族（build/render/apply 第一参数）可收 D。
- coordinate stage 只复制白名单目录，新增跨日期底稿必须同步加 `cpSync`，否则栏目静默空白。
- 台账非 ASCII 名防 latin-1 乱码：`Buffer.from(s,'latin1').toString('utf8')` 反解。
- CDP 代理对含 `?.` 的长 eval 偶发返回空对象 → 用 function + 显式判空。Bash grep 中文多分支正则偶发失配 → 改用 Grep 工具。
- **长驻宿主页会劣化**：单宿主页跑到某进度后连续 `Runtime.evaluate` 超时 + `Unexpected end of JSON input`，补采 0 张；check-deps 仍 exit 0、单批试跑永远成功。修法 = 每 N 批关闭重建宿主页（`collect-icon-priceranges.mjs` 内置 `HOST_RECYCLE_EVERY=3`）；该修只是**延后**非根治，依赖内置补采轮。**不要调并发、不要反复手动补采**。前提：页内脚本无状态（fetch + DOMParser）。
- 同一文件禁止并行编辑（症状 `ReferenceError`）；改生成器后跑 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs`。
- **403 / Cloudflare 拦截具时限性，判据必须同日对照**：`/players` 与 FUTBIN 榜单页的 403 按页滚动（03:00 全拦、09:46 解除）；2026-09-22 03:25 进化任务同口径三页全 200 而 03:28 传奇英雄页 11–26 全 403 ⇒ 同一小时内差异只可能来自**页/热度维度**，不是站点级故障；反之跨轮连续失败也**不能**推断全天不可采。FUTBIN 403 分钟级退避、禁密集重试；Cloudflare 挑战页约 30 秒自过。**恢复判据最省的一招 = 看同 sourceKey 的 `series/popular.json` 末点时间**（比逐个探针省 3 请求），末点停住才是拦截仍在。
- **恢复探针的 `challenge` 字段是正则误报**（`challenge-platform` 会出现在正常页里），正判据 = `status 200` + 真实 `title` + 响应头 `cf-mitigated` 为空。`robots.txt` 字节数不必等于历史值（上游改过规则文本）。
- **宿主页被下发挑战页时无代码级逃生口**（2026-09-22 T00 实测：连 `robots.txt` 都返回 `Just a moment...`）⇒ 该轮如实失败留证，不填充、不回退。

## 口径
- FUTBIN 只有 Console/PC 两档（一行 DOM 同时含两平台价）；`ps_price/pc_price/rarity/version` 参数无效，`page` 翻页在会话建立后有效（30 行/页）；名单判定靠 `td.table-name` 版本标签；`td.table-item-score` 是估值列非成交价。落库 `psPrice`/`pcPrice`（<1000 占位）、`platform='console+pc'`。
- 传奇区间是**卡级**字段（`scope:"card"`），Console 与 PC 同值，禁按平台拆；投资建议 condA（FC26 开服价 > FC27 当前价）**仅在当前价有效（≥1000）时参与**，condB 用区间上沿。命中集随实时价滚动**增减**，回报须附触发变化的价格证据，否则易被误读为脚本回归。
- **FUTBIN `slug` 不是唯一键**（2026-09-18 T23 实测）：同轮传奇快照内 `EUSÉBIO`(21548) 与 `LÚCIO`(21815) 共用 slug `da-silva-ferreira`（131 张按 cardId 唯一，slug 有重复）。**跨文件关联（研究/校验/去重/头像）一律按 `cardId`**，禁用 slug 或 name 做键，否则静默错配、产生假阳性差异。研究文件 `rows[].id` = cardId；另 `rows[].maxRatio` 口径是 `fc26Launch/fc27Max`（区间上沿），condA 余量须自算 `fc26Launch/representative`。研究顶层**无 `summary`**，汇总是 `counts{compared,advice,condA,condB,both,noFc26,noRange}`。
- **上游会「反向修复」slug**（2026-09-22 T04 首次实测，21488/21492/21495/21501 改回 FC26 全名式）⇒ 这类卡已能直连命中，**桥回增量必须与 `noFc26` 求交**（判据 `rows[id].fc26Launch == null`），否则重复计数。
- 逐卡区间值集合做「是否有变动」统计时**必须先过滤 `rmin/rmax` 为空的行**，否则 `'undefined|undefined'` 会被当成一个合法值（实测把 1 张误算成 9 张）。
- 译名：词库 `name-zh-supplement-fc27.json` 只增不改、禁空字符串；注入顺序 URL slug → 姓名 slug；当日未命中清单译完重跑至 0。资讯译文写 `apps/news/data/translations-D.json`（旧千帆代理已废弃）。
- 头像：键 = EA resourceId，唯一入口 `shared/lib/player-avatar.mjs`；姓氏兜底有双向一致性守卫，宁缺勿错配；FC26 数据一律不配头像。
- 市场评分：0.45 热度 + 0.40 同档相对价 + 0.15 变动分；变动分只取两个真实整点观测（basis=hourly）。顺序红线：build → inject 译名 → render。
- 进化卡无挂牌价，价格 = 基础卡双平台参考价（PC 优先）；`futbinListValue` 实为 Rating。
- 传奇/英雄只监控 FC27，fc26 仅参考对比折叠区；快照原子写、禁删改历史；无当日快照显示 STALE 徽标不回退。
- 红涨绿跌（`--up:#ff6259` `--dn:#4ec08a`）；脚本根锚点 `shared/config/project.json`。

## 浏览器通道（细节见根 AGENTS.md「浏览器强制规则」，此处只存非显然项）
唯一通道 = `web-access` 技能（CDP :3456）；采集走**独立调试 profile**（`Chrome-FC-Debug` + 9333，零弹框）。前置检查唯一入口 `node automation/browser-triage.mjs`（有界：健康约 1 秒、失败最坏约 85 秒），**exit 0 是唯一判据**。独立 profile 关键坑：必须 `--no-sandbox --disable-gpu`（否则 GPU 崩溃秒退）；必须 `spawn detached`（`nohup &` / `run_in_background` 会被沙箱回收）；不写 `DevToolsActivePort`，浏览器级 WS 需 `/devtools/browser/<id>` 后缀（从 `/json/version` 取）。无日常登录态（FUTBIN/X 需用户手动重登一次）。
- **补丁风险**：`cdp-proxy.mjs`（含保活心跳 `CDP_KEEPALIVE_INTERVAL` 默认 60s）、`check-deps.mjs`、`config.env` 均为本地补丁，`web-access` 技能更新/重装会**静默覆盖**；备份 `.workbuddy/patches/cdp-proxy.mjs.bak-20260918`。
- 测量仪器：`cdp-proxy.mjs` 写连接事件 JSONL 到 `~/.workbuddy/logs/cdp-proxy-journal.jsonl`，用 `node automation/browser-channel-watch.mjs --report` 读；`os.tmpdir()/cdp-proxy.log` **不可当仪器**。本环境 `launchctl bootstrap gui/501` 稳定报 `5: Input/output error`，无法用 LaunchAgent 承载后台采样。
- 已死路、勿再排查：Chrome WorkBuddy 扩展（宿主未实现）、插件通道、旧开关模式（:9222 + `chrome://inspect`，每连接弹一次授权且无法持久化）、`:19222` 旧独立 profile。**日常 Chrome 不得 kill / 重启**。

## run-state 硬约束
`evidence.missing` 非空 → success 自动降级 partial；`sources.openedAt` 必须 ≥ 本轮 `startedAt`（`--rerun` 后须重开来源页）；`--rerun` 会把 `runs/D/<module>/` 整体 rename 进 `attempts/`。

## 其他
- 公众号：凭证 `apps/market/integrations/wechat/.env`，未认证只能进草稿箱（48001）。
- FC26 数据集 `engine/gold/data/prices/fc26/`（152 金卡 × 30 天）；fc27-price-matrix 227 人对照。
- ima 知识库 `001aaa7e88002f6a`：仅文档格式、无删除；本地留档 `.workbuddy/exports/`。
- X 媒体：extract 只取文字字段；`enrich-tweet-media.mjs` 走 syndication token=a；下载两级（curl → 自建宿主页串行 fetch）；**严禁因 video 丢推文**。
