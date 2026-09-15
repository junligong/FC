# FC 项目总约定

本项目用于采集足球与FC27资讯、研究FC27市场，并生成一个日期化日报与固定汇总站点。`apps/`只放四个业务任务，`shared/`保存可被四任务和 WorkBuddy 共同调用的配置与代码，`automation/`只负责编排和运行状态，`reports/`只保存最终产物。项目已从 DuMate 迁移到 WorkBuddy，发布统一走 WorkBuddy 站点发布能力。

进入子目录工作前继续读取该目录最近的 `AGENTS.md`；子目录规则补充本文件。不要把共享实现复制到多个任务，先判断能否放入 `shared/`。

## 浏览器强制规则（所有任务每次执行必须读取）

凡任务需要浏览器，必须连接用户已登录的 Chrome 浏览器插件，使用 `extension` 模式和现有登录态；禁止打开内置浏览器（IAB）、未登录浏览器、临时浏览器或新建独立 profile。执行前先确认 Chrome 插件已连接，连接失败只将对应采集步骤标为失败或 `partial`，不得切换到 IAB 绕过。纯本地合并任务不得为了“检查”而打开任何浏览器。

执行每日综合报告前读取 `automation/prompts/daily.md`；执行单项时读取 `automation/prompts/news.md`、`football.md` 或 `market.md`。发布规则读取 `automation/prompts/publish.md`。这些文件补充既有调度描述，若用户给出新的明确要求，以用户要求为准。

WorkBuddy 读取 `automation/task-definitions.json`：调度器只保存短启动提示，完整任务要求只维护在 `automation/prompts/*.md`。

- 运行开始固定 Asia/Shanghai 日期，并将同一个日期传给所有子任务和合并脚本。
- 新闻浏览器失败只终止新闻步骤，继续其他已启用的子任务。区分没有新闻与采集失败。
- 不清空或重建历史去重数据；同日重跑保留当日内容，写入采用临时文件原子替换。
- 市场任务已由用户明确启用；后续只有用户明确要求才可再次暂停，且不得新增重复定时任务。
- 新闻与榜单必须打开本轮来源核验。缺数据标明缺失，不能改旧报告日期冒充更新。
- 旧 `fix_*.py` 等一次性补丁不是日常执行入口。
- 子任务统一输出到 `reports/daily/D/`，完成后刷新综合页与固定归档入口，再发布到 WorkBuddy。路径以 `shared/config/project.json` 为唯一配置源。结构检查通过不代表数据已核实或已发布。
- 足球日报的积分榜/射手榜/助攻榜是固定必做栏目，逐联赛分别核验、内容互不相同；提交前必须运行 `node automation/verify-football-boards.mjs D`，非 0 退出不得提交 success。
- FC27 市场每天产出两个并列文件，互不覆盖，均由 `apps/market/engine/scripts/render-market.mjs` 从 `automation/runs/D/market/market.json` 渲染：
  `reports/daily/D/market.html`（**市场概览**，四段式：本周活动卡与周黑 / 价格分层每档 Top50 按 Rating / 传奇卡与英雄卡 / 热门进化卡）+ `reports/daily/D/market-scan.html`（**市场扫描**，价格维度 × 热门球员维度）。
  站点上以「市场概览 / 市场扫描」子标签切换展示，不得相互覆盖。
- 首页与每日日报共用 `apps/portal/dashboard.mjs` 同一模板；右侧固定保留「进化专栏」，由后续进化任务写入 `reports/daily/D/evolution.html` 后自动收录，未就绪时显示如实空状态。
- 新增或修改脚本时，文件开头必须有中文注释，说明脚本用途、输入和主要输出；Shebang可以位于第一行。
- 临时文件进入 `automation/runs/D/<module>/work/` 或系统临时目录，不得混入源代码、数据库或最终报告目录。
- 修改生成器后运行 `node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs`；测试使用隔离数据，禁止拿真实去重文件做破坏性测试。

