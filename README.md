# FC 内容与市场情报项目

本目录只保留四个日常任务、可复用数据、自动化协调代码和按日期归档的报告。

## 目录结构

```text
apps/
├── football/          足球日报模板与生成资源
├── news/              FC27 资讯采集、翻译、去重数据
├── market/engine/     FC27 市场扫描、FC26/FC27 球员数据库
└── portal/            每日合并页与固定入口生成器
automation/            调度契约、运行状态、测试
shared/                四任务与未来 WorkBuddy 共用的配置、运行库和展示层
reports/daily/D/       指定日期的四份最终报告
daily-merged/index.html 固定发布源
```

## 日常任务顺序

1. `apps/football`：足球日报
2. `apps/news`：FC27 资讯采集
3. `apps/market/engine`：FC27 市场扫描
4. `apps/portal`：合并当日报告并刷新固定汇总入口

四个任务统一使用 Asia/Shanghai 日期 `D`。前三项分别写入
`reports/daily/D/football.html`、`news.html`、`market.html`；汇总任务写入
`reports/daily/D/summary.html`，并刷新 `daily-merged/index.html`。

任务配置以 `shared/config/project.json` 为准；单项运行证据与不可覆盖快照统一
保存到 `automation/runs/D/<module>/`，不再散落到项目根目录。

## 固定链接

- 固定公开入口：https://www.dumate.cn/artifacts/7vbc68mkblkg
- 固定本地发布源：`daily-merged/index.html`
- 每日归档目录：`reports/daily/YYYY-MM-DD/`
- 汇总页按日期倒序展示，最新日期在前；历史日期使用 `#report-YYYY-MM-DD`。

## 数据边界

- 新闻历史去重：`apps/news/data/seen_tweets.json`，禁止清空或重建。
- FC26/FC27 球员与价格数据库：`apps/market/engine/data`、`gold/data`、
  `icons/data`、`heroes/data`、`totw/data`、`evolution/data`。
- 浏览器会话和公众号上传状态属于本地运行数据，不进入报告目录。
- `reports/` 只保存按日期生成的最终 HTML；缓存、截图、临时渲染和一次性补丁不进入该目录。
- 可重建的市场截图和分析页面写入 `apps/market/engine/output/`，不作为数据库保存。

## 验证

修改自动化或生成器后运行：

```bash
node --test automation/execution.test.mjs automation/regression.test.mjs automation/verify-publication.test.mjs
```
