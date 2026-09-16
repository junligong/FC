
## 自动化任务总览（2026-09-15 起）
| 任务 | 时间 | 产物 |
|---|---|---|
| FC·足球日报 | 03:00 | reports/daily/D/football.html（三榜：积分/射手/助攻） |
| FC·资讯采集 | 03:00 | reports/daily/D/news.html |
| FC·市场监控 | 03:00 | reports/daily/D/market.html（概览四段）+ market-scan.html（扫描双维度） |
| FC·进化专栏 | 03:00 | reports/daily/D/evolution.html |
| FC·汇总发布 | 03:05 | daily-merged/index.html + archive/D.html，并发布到 WorkBuddy 站点 |

- 发布：https://fc27-site.app.workbuddy.host/ （应用「FC27每日情报台」）
- 站点分类：今日总览 / 足球动态 / FC27 资讯 / FC27 市场（子标签：概览·扫描）/ 进化专栏 / 历史日报
- 所有收集类产物由 `render-*.mjs` 渲染，**不要手改 HTML 版式**；改报告后必须走 run-state 重新提交快照（见技能 fc-run-state-resnapshot）。

## 浏览器通道现状（2026-09-16 实测，影响所有采集任务）⚠️
- 项目规定「Chrome 插件 + extension 模式」，但在当前 WorkBuddy 运行时**通道无法建立**，采集类任务会失败：
  1. `dumate-browser-cli init --mode extension` → `RelayUnreachable`（缺 `DUMATE_HOST_URL`，WorkBuddy 不注入）。
  2. `dumate-browser-cli doctor` → `relay.connected=false`（relay 在 `127.0.0.1:19228`）；用户日常 Chrome 未开 `--remote-debugging-port`。
  3. Chrome 已装 WorkBuddy 扩展 `ajnnogdfpilbhkeggdjlcokgglijmdde`（`connectNative('com.workbuddy.extension')`），但该 native messaging 宿主**未注册**，桥接不通。
  4. `CDP 127.0.0.1:19222` 是 `--user-data-dir` 独立 profile 实例 → 规则禁止；`127.0.0.1:18488` 穷举路由全 404。
- **处置约定**：连接失败即提交 failed/partial + 留证，不回退 IAB、不新建 profile、不用旧日期数据填充。
- **需用户侧修复**：把 Chrome 扩展与 WorkBuddy 桌面端接通（注册 native messaging 宿主），否则 news / market / evolution 每日都会失败。

## 微信公众号能力边界（2026-09-15 实测）
- 凭证 `apps/market/integrations/wechat/.env`（WECHAT_APP_ID/SECRET）；该号**未认证**，API 权限有限：
  - ✅ 可用：stable_token、`media/uploadimg`、`material/add_material`、`draft/*`（草稿箱）、`material/get_materialcount`
  - ❌ 48001 api unauthorized：`freepublish/submit`（发布）、`message/mass/sendall`（群发）、`freepublish/get`、`mass/get`
- **结论：API 只能把文章写进草稿箱，无法直接发布/群发**；发布必须在公众号后台（或公众号助手 App）手动完成。
- 复用脚本：`apps/market/integrations/wechat/publish_article.py`（建草稿全流程，`--no-publish` 仅建草稿）。
- 排版走 `gzh-design` 技能（红白色系主题），产物是 `<section>` 片段 + 校验 0 ERROR。
