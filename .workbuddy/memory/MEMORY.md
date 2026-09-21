# FC 长期记忆（契约正文一律看根 `AGENTS.md` 与 `automation/prompts/*.md`，此处只存踩坑与口径）

## 任务与产物
- 6 个日任务（2026-09-18 起 5 分钟错开）：资讯 03:00 → 市场 03:05 → 足球 03:10 → 进化 03:15 → 传奇英雄 03:20；汇总发布 03:35。时刻表权威源 `shared/config/project.json#dailySchedule`。
- 2 个每小时任务（icons-pricerange-hourly / market-hourly）**分钟相位不可控**：`HOURLY` 不接受 `BYHOUR`，`BYMINUTE` 被静默忽略（nextRunAt = 上次配置更新时间 +1h）→ 共用 `current.json` 的并发防护必须做在脚本层（幂等合并 / 原子写），不要依赖调度相位。两者均**不调用 run-state.mjs**（owner.json 是一天一次语义，会拒掉当日全部小时轮次）。
- 预检失败留证：`automation/runs/D/icons-heroes/hourly-<HH>-failed.json`、`automation/runs/D/market/hourly-<HH>-failed.json`；失败轮**不得**写 `pricerange/hourly/` 快照（该目录只放真实成功观测）。
- 产物 `reports/daily/D/`；站点 fc27-site.app.workbuddy.host（`entryHtml=index.html` + `updateExistingApp`）。一律 `render-*.mjs` 渲染，**不手改 HTML**；受 run-state 快照校验的产物（`market.html`）改动后必须重提快照，否则站点静默回退旧版。每小时任务**不得渲染 market.html、不写 run-state**。
- **`daily-merged/index.html` 是整体内联单文件，渲染产物不会自动上线**：market-hourly 第 ⑥ 步必须 **先 `FC_PROJECT_ROOT=… node apps/portal/merge_daily_report.mjs D`（无锁、约 1.6 秒）再发布**，否则线上栏目的页头/统计/榜单会冻结在每日 03:35 那一版，而价格因走客户端 `current.json` 仍是最新——形成「只有价格是活的」这种最易漏检的形态（2026-09-18 实测冻结在 T02 达 13 小时，此前各轮只核对 `current.json` 全部漏检）。`merge_daily_report.mjs` 不写入任何受 `run-state` 校验的产物；有锁的 `coordinate.mjs` 仍禁跑。**核对发布不能只验 JSON，必须验页面正文里的构建期字段**。
- 页面里任何「时间」一律做成客户端实时读取（`render-market-watch.mjs` 的「行情更新于」与逐行「更新于」列即此模式：读 `current.json` 的 `generatedAt`/`updatedAt`/逐平台 `observedAt`），构建期固化值只作兜底，保证合并失败时时间也不会骗人。

## 踩坑（高价值）
- **FUTBIN `td.table-price` 单元格 innerText 自 2026-09-20 起为多行串「币价\n…\n涨跌徽标(如 14.29%)」**：解析价格必须**只取首个非空行**并丢弃 `price-diff` 徽标行；任何整串锚定正则（如 `^([\d.]+)\s*([KM]?)$`）会**静默失配**——实测 300 行只有 50 行解析出价，产物里的 `consoleValid/pcValid` 会呈现为「失真低值」而非报错。同源问题 `collect-icons-list.mjs`（已修）与 market 的 `fetch-players-pages.mjs`（2026-09-20 修）都踩过，新增任何从该列表页取价的脚本都要按此口径。
- **开服日口径存在未裁定的分裂（2026-09-20 发现）**：根 `AGENTS.md`、`prompts/icons-heroes.md`、本文件均写 `2026-09-25`，且 09-17/18/19 三份 daily 快照都是 2026-09-25 / `listing-estimate`；但 `collect-icon-priceranges.mjs`、`record-icons-daily.mjs`、`build-icon-research.mjs`、`build-same-period-advice.mjs` 的常量被改成 `2026-09-18`（注释称「2026-09-19 用户明确口径」，但无任何记忆佐证）。**后果不是报错而是静默改口径**：`date < launchDate` 一旦翻转，`priceBasis` 由 `listing-estimate` 变 `market`，触碰「开服前不计算日环比与累计涨跌」红线（2026-09-20 首次提交时实测发生）。`collect-icons-list.mjs` 已改回 2026-09-25；**其余 4 个待用户一次性裁定后全局同步**，勿单方面来回改。
- **采集器写出必须做「台账补全」**（2026-09-19 修复）：`collect-icons-list.mjs` 原先只写「采到的行」，`/27/players` 11+ 页被 403 截断时会把当日台账从 **131 静默缩到 102**（与 09-17/09-18 不可比、无任何报错）。现改为「采到的行 + 未采到的台账卡以空价保留」（名单基准只取 `fc27-icons-playstyles.json`；价一律 0/valid=false，**不得**用旧日期或 FC26 填充）。已修复后单页低负载重跑即可回填：`--from-page 26 --max-page 26 --merge`（约 15 秒、1 次导航），无需重翻全量。**任何「只写成功项」的采集器都有同类静默缩减风险，新增写出路径时先核对卡数是否等于台账。**
- **三份价格产物的字段结构各不相同，跨文件校验前必须先探明**（混用会产生「131 张全部不一致」这类假告警）：hourly 快照逐卡键 = `id` + `current{console,pc}` + `currentValid{console,pc}` + `priceRange{min,max,updatedText}`；daily 快照逐卡数组键 = `players`，平台价在 `platforms.console/pc={price,valid}`；`current.json` 的卡表是按 cardId 的映射对象 `cards`（键为字符串 cardId），平台价在 `platforms.console/pc={price,valid,observedAt,source}`。
- coordinate stage 只复制白名单目录，新增跨日期底稿必须同步加 `cpSync`，否则栏目静默空白。
- `apply-market-name-zh.mjs --file` 须传实际日期目录 `automation/runs/<YYYY-MM-DD>/...`，传 `D` 字面路径读不到。
- 台账非 ASCII 名防 latin-1 乱码：`Buffer.from(s,'latin1').toString('utf8')` 反解。
- CDP 代理对含 `?.` 的长 eval 偶发返回空对象 → 用 function + 显式判空。Bash grep 中文多分支正则偶发失配 → 改用 Grep 工具。
- **长驻宿主页会劣化**：单宿主页跑到某进度后连续 `Runtime.evaluate` 超时 + `Unexpected end of JSON input`，补采 0 张；check-deps 仍 exit 0、单批试跑永远成功。修法 = 每 N 批关闭重建宿主页（`collect-icon-priceranges.mjs` 内置 `HOST_RECYCLE_EVERY=3`）；该修只是**延后**非根治，依赖内置补采轮。**不要调并发、不要反复手动补采**。前提：页内脚本无状态（fetch + DOMParser）。
- 同一文件禁止并行编辑（症状 `ReferenceError`）；改生成器后跑 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs automation/news-media.test.mjs`。
- /players 403 具时限性（03:00 全拦、09:46 解除）；FUTBIN 403 分钟级退避、禁密集重试；Cloudflare 挑战页约 30 秒自过。

## 口径
- FUTBIN 只有 Console/PC 两档（一行 DOM 同时含两平台价）；`ps_price/pc_price/rarity/version` 参数无效，`page` 翻页在会话建立后有效（30 行/页）；名单判定靠 `td.table-name` 版本标签；`td.table-item-score` 是估值列非成交价。落库 `psPrice`/`pcPrice`（<1000 占位）、`platform='console+pc'`；开服（2026-09-25）前不算日环比/累计涨跌，priceBasis 以当日实测为准。
- 传奇区间是**卡级**字段（`scope:"card"`），Console 与 PC 同值，禁按平台拆；投资建议 condA（FC26 开服价 > FC27 当前价）**仅在当前价有效（≥1000）时参与**，condB 用区间上沿。命中集随实时价滚动**增减**，回报须附触发变化的价格证据，否则易被误读为脚本回归。
- **FUTBIN `slug` 不是唯一键**（2026-09-18 T23 实测）：同轮传奇快照内 `EUSÉBIO`(21548) 与 `LÚCIO`(21815) 共用 slug `da-silva-ferreira`（131 张按 cardId 唯一，slug 有重复）。**跨文件关联（研究/校验/去重/头像）一律按 `cardId`**，禁用 slug 或 name 做键，否则静默错配、产生假阳性差异。研究文件 `rows[].id` = cardId；另 `rows[].maxRatio` 口径是 `fc26Launch/fc27Max`（区间上沿），condA 余量须自算 `fc26Launch/representative`。
- 译名：词库 `name-zh-supplement-fc27.json` 只增不改、禁空字符串；注入顺序 URL slug → 姓名 slug；当日未命中清单译完重跑至 0。资讯译文写 `apps/news/data/translations-D.json`（旧千帆代理已废弃）。
- 头像：键 = EA resourceId，唯一入口 `shared/lib/player-avatar.mjs`；姓氏兜底有双向一致性守卫，宁缺勿错配；FC26 数据一律不配头像。
- 市场每小时评分：0.45 热度 + 0.40 同档相对价 + 0.15 变动分；变动分只取两个真实整点观测（basis=hourly）。顺序红线：build → inject 译名 → render。
- 进化卡无挂牌价，价格 = 基础卡双平台参考价（PC 优先）；`futbinListValue` 实为 Rating。
- 传奇/英雄只监控 FC27，fc26 仅参考对比折叠区；快照原子写、禁删改历史；无当日快照显示 STALE 徽标不回退。
- 红涨绿跌（`--up:#ff6259` `--dn:#4ec08a`）；脚本根锚点 `shared/config/project.json`。

## 浏览器通道
唯一通道 = `web-access` 技能（CDP :3456）。**2026-09-18 起走「独立调试 profile」**（`Chrome-FC-Debug` + 9333，零弹框），不再走日常 Chrome 开关模式。前置检查唯一入口 = `node automation/browser-triage.mjs`（有界：健康约 1 秒、失败最坏约 85 秒）。`OK`/`OK_RECOVERED` 继续；`TOGGLE_OFF` / `CHANNEL_UNSERVING` → `node automation/start-debug-profile.mjs [--restart]`（零弹框，无需人工）；`CONFIG_MISSING`(2) 需 `WEB_ACCESS_BROWSER=chrome`（已固化）。禁用：Chrome 插件 / extension、dumate-browser-cli、DUMATE_*、browser-env.sh、:19228/:19222、agent-browser、IAB。通道不可用即 failed/partial + 留证，不回退不填充。
- 独立 profile 关键坑：必须 `--no-sandbox --disable-gpu`（否则 GPU 崩溃秒退）；必须 `spawn detached`（`nohup &` / `run_in_background` 会被沙箱回收）；不写 `DevToolsActivePort`，浏览器级 WS 需 `/devtools/browser/<id>` 后缀（从 `/json/version` 取）。无日常登录态（FUTBIN/X 需用户手动重登一次）。
- **补丁风险**：`cdp-proxy.mjs`（含保活心跳 `CDP_KEEPALIVE_INTERVAL` 默认 60s）、`check-deps.mjs`、`config.env` 均为本地补丁，`web-access` 技能更新/重装会**静默覆盖**；备份 `.workbuddy/patches/cdp-proxy.mjs.bak-20260918`。
- 旧开关模式（仅作历史参照，勿回退）：`:9222` 的 `/json/version`、`/json/list`、`/` 返回裸 404（`Content-Length:0`）**是正常表现**，不得据此写诊断（「监听 socket 未接入 DevTools 消息泵」已被证伪）；唯一判据是 check-deps 退出码。带 URL 的 `open -a "Google Chrome" chrome://inspect/...` 返回 `-10820` **完全空转**，有效形式是不带 URL 的 `open -a "Google Chrome"`。`Local State` 的 `user-enabled=true` 与 `DevToolsActivePort` 存在**都只是必要条件**。失败时不得 `pkill -f cdp-proxy.mjs` 反复复跑（4 个独立实例同样 non-101）。通道故障期教训：2026-09-18 06:04 Chrome 被 launchd 以 `--no-startup-window` 重建后失效约 4 小时（T06–T09 四轮空转，06:04–10:20 恢复），「开关跨重启持久生效」不成立。
- 弹框（旧开关模式）：每条新 DevTools 连接弹一次「要允许远程调试吗？」，**授权无法持久化**（官方 wont-fix），官方唯一建议是保持长连接；**按「连接」计、不按「标签页」计**；企业策略 `RemoteDebuggingAllowed` 只管允不允许、**不抑制弹框**，无策略逃生口。⇒ 零弹框只有独立 profile 一条路（已采用）。
- 插件通道已二次实证为死路（扩展已启用，但四款浏览器 `NativeMessagingHosts/` 无 `com.workbuddy.extension`，`app.asar` 命中数全 0），**勿再排查**。
- 测量仪器：`cdp-proxy.mjs` 写连接事件 JSONL 到 `~/.workbuddy/logs/cdp-proxy-journal.jsonl`，用 `node automation/browser-channel-watch.mjs --report` 读；`os.tmpdir()/cdp-proxy.log` **不可当仪器**。本环境 `launchctl bootstrap gui/501` 稳定报 `5: Input/output error`，无法用 LaunchAgent 承载后台采样。

## run-state 硬约束
`evidence.missing` 非空 → success 自动降级 partial；`sources.openedAt` 必须 ≥ 本轮 `startedAt`（`--rerun` 后须重开来源页）；`--rerun` 会把 `runs/D/<module>/` 整体 rename 进 `attempts/`。

## 其他
- 公众号：凭证 `apps/market/integrations/wechat/.env`，未认证只能进草稿箱（48001）。
- FC26 数据集 `engine/gold/data/prices/fc26/`（152 金卡 × 30 天）；fc27-price-matrix 227 人对照；四规律见 prompts。
- ima 知识库 `001aaa7e88002f6a`：仅文档格式、无删除；本地留档 `.workbuddy/exports/`。
- X 媒体：extract 只取文字字段；`enrich-tweet-media.mjs` 走 syndication token=a；下载两级（curl → 自建宿主页串行 fetch）；**严禁因 video 丢推文**。
