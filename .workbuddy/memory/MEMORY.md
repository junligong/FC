
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
