# FC 项目运行手册 — 执行契约、命令与故障排查

> 文档类型：项目知识库条目（运行手册）
> 记录日期：2026-09-16
> 适用目录：`/Users/wuyanzu/Desktop/FC`
> 信息来源：`automation/prompts/*.md`、`automation/AGENTS.md`、`automation/run-state.mjs`、`automation/schedule-config.json` 及历次运行记录

## 一、执行契约总则

1. **单项自治**：每个采集任务只采集和生成自己的数据，绝不执行合并、发布、修改首页、修补其他模块布局或再次启动任务。单项运行**不读** `publish.md`、不核查认证、不尝试发布。
2. **统一日期**：运行开始即固定 Asia/Shanghai 日期 `D`，同一日期贯穿所有子任务与合并脚本。独立执行时同样在开始时固定。
3. **时间预算**：单项总预算约 15 分钟——前 10 分钟采集，随后只完成已有证据的数据、一次校验与提交；剩余不足 3 分钟立即收尾，缺失如实标注，不再追查来源或改版。不得等到平台 30 分钟取消。
4. **状态诚实**：启用中的任务不能用 `skipped` 掩盖采集或生成失败，只有 `shared/config/project.json` 中该任务 `enabled: false`（用户明确暂停）时才允许 `skipped`。
5. **提交即结束**：提交完成后立即最终回复状态与产物路径，不再调用任何工具。

## 二、单次运行状态机（run-state.mjs）

每个采集任务（football / news / market / evolution）的第一条命令必须是：

```bash
node automation/run-state.mjs begin <module> D
```

- `accepted=false` 时立即回复"本日已有运行"并终止，不得继续。
- 返回的 `runId` 与 `deadlineAt` 需保存，供提交时使用。

收尾命令：

```bash
node automation/run-state.mjs finish <module> D <RUN_ID> <success|partial|failed|skipped> <证据路径>
```

脚本的校验行为：

- 检查运行所有权（owner）、产物文件修改时间、日期与完整性。
- 生成**不可覆盖快照**并保存 SHA-256。
- 同日重跑必须先显式归档旧 attempt（`automation/runs/D/<module>/attempts/<runId>/`），不得静默覆盖。

目录结构：`automation/runs/D/<module>/` 保存 `owner.json`、`state.json`、`evidence.json`、`work/` 与不可变报告快照。

### 状态取值判定

| 状态 | 适用条件 |
|---|---|
| `success` | 全部必需栏目通过核验，校验闸门退出码为 0 |
| `partial` | 有真实部分数据、缺失已如实标注（含图片来源失败、部分来源访问失败） |
| `failed` | 浏览器通道/来源访问/生成失败，或校验闸门未通过 |
| `skipped` | 仅当用户明确暂停且配置 `enabled: false`（当前 market 已明确启用，不得跳过） |

## 三、证据文件规范

每轮必须写入 `automation/runs/D/<module>/evidence.json`，至少包含：

- `date`
- `sources`：原文 URL、打开时间（`openedAt`）、数据截止时间
- 缺失项清单

硬性要求：

- 每个 `openedAt` 必须**晚于本轮 `startedAt`**。
- 不得通过 `touch` 报告或复制旧 run 的来源记录伪造新运行。
- 证据字段只是记录，**不能代替实际打开来源**；搜索摘要不得作为最终证据，首页或搜索页不得充当原文链接。
- 失败时把原因写入证据文件，并以同一 finish 命令提交 `failed`。

## 四、校验闸门与测试

| 用途 | 命令 |
|---|---|
| 足球三榜校验（拦截射手榜/助攻榜被误填为积分榜） | `node automation/verify-football-boards.mjs D` |
| 发布核验（线上与本地 SHA-256 逐字节比对、归档链接、HTML 完整性） | `node automation/verify-publication.mjs D` |
| 自动化回归测试 | `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs` |

规则：修改生成器、共享代码或路径后必须运行上述测试；测试使用隔离数据，**禁止拿真实去重文件做破坏性测试**。三榜闸门退出码非 0 时不得提交 `success`。

## 五、合并与发布流程

```bash
# 1) 合并（最多等待 20 分钟，合并限时 60 秒）
node automation/coordinate.mjs D

# 2) 渲染市场两份产物（数据先写入 runs/D/market/market.json）
node apps/market/engine/scripts/render-market.mjs D

# 3) 渲染进化专栏
node apps/market/engine/scripts/render-evolution.mjs D

# 4) 发布核验
node automation/verify-publication.mjs D
```

合并要点：

- 协调器串行等待 `football` / `news` / `market` 三个必需快照（`evolution` 为可选，不阻塞）；`news` 失败不阻断其他任务。
- 只接受本日 `state.json` 的**已完成快照**，拒绝旧状态或运行中报告。
- 在系统临时隔离目录完成合并，再原子替换 `daily-merged/index.html` 与 `daily-merged/archive/D.html`。
- 合并成功后 `publish=delegated`，由同一会话用 WorkBuddy 站点发布能力发布 `daily-merged/`（应用名：FC27每日情报台，入口 `index.html`，更新同一应用、公开链接不变）。
- 发布结果写入 `automation/publish-status-D.json`（不含认证信息）。发布失败时如实记录"生成成功、发布失败/阻塞"，保留线上旧版本。

## 六、同日重跑

- 重跑必须显式归档旧 attempt，例如 `node automation/coordinate.mjs D --prepare-rerun` 或 `run-state.mjs begin <module> D --rerun`。
- 新闻同日重跑要合并当日已有内容，不能因"推文已全部看过"而把报告覆盖为空。
- 历史报告默认不可修改；同日明确重跑也必须先归档再原子替换。

## 七、故障排查

### 7.1 浏览器通道（最高频故障）

现象与判定顺序：

1. `dumate-browser-cli init --mode extension` 返回 `RelayUnreachable`（缺 `DUMATE_HOST_URL`）→ 通道不可用。
2. `dumate-browser-cli doctor` 显示 `relay.connected=false`（relay 期望在 `127.0.0.1:19228`）。
3. 用户日常 Chrome 未开启 `--remote-debugging-port`；`127.0.0.1:19222` 属于 `--user-data-dir` 独立 profile 实例，**规则禁止使用**。
4. Chrome 已安装 WorkBuddy 扩展，但 native messaging 宿主未注册，桥接不通。

处置约定：

- 连接失败即提交 `failed` / `partial` 并留证，**不回退 IAB、不新建 profile、不用旧日期数据填充**。
- 采集前可先跑浏览器通道自检（技能 `fc-browser-channel-check`），在 2 分钟内判定 `extension` 通道是否可用。
- 每次新 shell 需先 `source /Users/wuyanzu/Desktop/FC/automation/browser-env.sh`；`apps/news/auto_news.sh` 已自动加载。
- 需用户侧修复：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主），否则 news / market / football / evolution 每日都会失败。

### 7.2 常见错误对照

| 现象 | 处置 |
|---|---|
| `accepted=false`（本日已有运行） | 立即终止，回复"本日已有运行"，不重复采集 |
| 同任务互斥锁存在 | 先核实原任务是否仍在运行，不盲目删除锁 |
| 去重库（`seen_tweets.json`）损坏 | 先从 `.bak` 恢复；不可用时从 Git 基线与各日 `tweets-D.json` 快照合并恢复；仍无法恢复则停止该子任务，**绝不创建空 seed** |
| 三榜校验退出码非 0 | 修正数据后重跑；仍不通过则提交 `partial` 并在证据中记录未通过项 |
| 翻译服务失败 | 由执行任务的 AI 完成翻译；未完成项必须明确标记，英文混排不算完成 |
| 市场数据未开放 | 各档输出如实空状态并附核验证据，不用 FC26 价格填充 |
| 进化页面无数据 | 如实空状态并记录核验证据（如页面显示 No evolutions found） |
| 发布能力不可用 | 至多重试两次，记录失败原因，保留线上旧版本，不探索接口、不猜参数 |

### 7.3 公众号集成（非日报流程）

`apps/market/integrations/wechat/publish_article.py` 为人工触发的草稿箱写入脚本（`--no-publish` 仅建草稿）。因公众号未认证，`freepublish/submit` 与群发接口返回 48001，API 只能写草稿，发布须在公众号后台手动完成。该集成**不得由日报任务自动调用**。

## 八、命令速查

```bash
cd /Users/wuyanzu/Desktop/FC

# 采集类任务标准三步
node automation/run-state.mjs begin football 2026-09-16
node automation/verify-football-boards.mjs 2026-09-16
node automation/run-state.mjs finish football 2026-09-16 <RUN_ID> success automation/runs/2026-09-16/football/evidence.json

# 资讯采集（含浏览器通道自检）
source automation/browser-env.sh
node automation/collect-news.mjs 2026-09-16

# 市场与进化渲染
node apps/market/engine/scripts/render-market.mjs 2026-09-16
node apps/market/engine/scripts/render-evolution.mjs 2026-09-16

# 合并与发布核验
node automation/coordinate.mjs 2026-09-16
node automation/verify-publication.mjs 2026-09-16

# 回归测试
node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs
```

## 九、关键文件索引

| 用途 | 路径 |
|---|---|
| 项目总约定 | `AGENTS.md`（根）、各子目录 `AGENTS.md` |
| 任务定义（调度器读） | `automation/task-definitions.json` |
| 任务完整提示词 | `automation/prompts/{football,news,market,evolution,daily,publish}.md` |
| 唯一路径与链接配置源 | `shared/config/project.json` |
| 调度记录 | `automation/schedule-config.json` |
| 运行状态与证据 | `automation/runs/D/<module>/{owner,state,evidence}.json` |
| 发布状态 | `automation/publish-status-D.json` |
| 去重历史库 | `apps/news/data/seen_tweets.json`（禁清空） |
| 公众号集成 | `apps/market/integrations/wechat/publish_article.py` |
