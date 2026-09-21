# 每日报告自动发布（2026-09-15 · WorkBuddy 版）

用户已授权每次总任务生成报告后自动发布及更新固定入口，不需要日常手动确认。只发布本项目的日报与汇总站点，不上传原始采集数据、密钥、去重历史或整个工作目录。

- 固定本地发布源：`/Users/wuyanzu/Desktop/FC/daily-merged/`
- 固定公开入口：https://fc27-site.app.workbuddy.host/
- 每日归档快照：`reports/daily/D/summary.html`
- 历史日报独立归档：`daily-merged/archive/D.html`
- 共享静态资源：`daily-merged/assets/`（含 `yanzu-banner.jpg`）
- 日期 D 使用总任务固定的 Asia/Shanghai 日期。

## 发布方式（WorkBuddy 站点发布）

使用 WorkBuddy 的站点发布能力（sites / App Publishing）发布本地目录 `/Users/wuyanzu/Desktop/FC/daily-merged`，入口页 `index.html`。这是**多文件静态站点**：`index.html` + `archive/*.html` + `assets/*` 一起发布，站内相对链接（`archive/D.html`、`../assets/yanzu-banner.jpg`）才能正常访问。更新的是**同一个已发布应用**（应用名：FC27每日情报台），分享链接保持 `https://fc27-site.app.workbuddy.host/` 不变，不新建重复入口、不下线旧页。

`daily-merged/assets/data/current.json` 必须随站点一起发布；它是各市场页面刷新时按 cardId 读取的唯一当前行情。发布任务不得重新分析或复制价格，只核对该资源存在并随目录部署。

**职责分工（2026-09-17 起 / 2026-09-20 修订）**：本任务（每日 **06:15**，2026-09-20 起由 03:35 顺延）负责**全量合并 + 发布**——`index.html` 与 `archive/D.html` 的更新只由本任务完成，`automation/publish-status-D.json` 是它的权威记录。每 4 小时的行情资源热更新由「FC·市场价格关注列表（每4小时）」在每轮采集后重发布同一应用完成（只上传已存在的合并目录 + 最新 `assets/data/current.json`，不重跑 `coordinate.mjs`、不运行 `verify-publication.mjs`）。因此本任务**不要**以「线上 `current.json` 的 `generatedAt` 是今天更晚的时间」判定异常——那是高频任务在正常工作。

发布清单：
1. `daily-merged/index.html` → 固定入口（只含当日内容 + 历史日报链接列表，控制在 50M 以内）。
2. `daily-merged/archive/D.html` → 历史日报独立文件（每个日期一个文件，版式与入口一致）。
3. `daily-merged/assets/yanzu-banner.jpg` → 海报资源（sidebar 与首页卡片引用）。

## 发布边界

- 发布阶段只使用已验证的站点发布能力，失败最多重试两次；失败时记录“生成成功、发布失败/阻塞”，保留原线上版本，结束本轮。不得探索接口、猜测参数、循环登录或临时编写发布程序。
- 不在命令行参数、日志、对话、项目文件或公开网页中写入 Cookie、密钥和令牌。
- 发布前运行合并脚本，确认入口 HTML 完整、三个板块视图存在、历史日报链接与海报资源齐全。允许明确标记缺失内容的部分日报，不将失败板块标为成功；没有任何有效板块时保留线上旧版本。

## 验证

发布后执行 `node /Users/wuyanzu/Desktop/FC/automation/verify-publication.mjs D`，比对本地 `daily-merged/index.html` 与固定公网入口的 SHA-256、当日历史链接与 HTML 完整性。再从公网打开固定入口，确认本次日期、三个板块视图与历史日报链接出现，点击当日链接核对内容；确保所有链接都不依赖本机路径。首页缓存未刷新时做实际刷新验证。

将发布日期、线上链接、验证结果及失败原因保存到 `automation/publish-status-D.json`（不含认证信息），并向用户提供固定入口与本次发布状态。

## 历史

旧 DuMate 单文件 artifact 通道（`www.dumate.cn/artifacts/7vbc68mkblkg`）自 2026-09-15 起废弃，不再使用；发布统一走 WorkBuddy 站点发布能力。
