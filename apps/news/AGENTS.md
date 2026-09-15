# FC27资讯任务约定

本目录负责从 `sources.txt` 的X账号采集24小时内FC27资讯，过滤、翻译、去重并生成 `../../reports/daily/D/news.html`。

- 执行前读取 `../../automation/prompts/news.md`。
- 每次执行先回读根 `../../AGENTS.md` 的“浏览器强制规则”；`auto_news.sh`固定以 `dumate-browser-cli init --mode=extension` 连接已登录Chrome插件。
- `data/seen_tweets.json` 是跨日历史去重库，禁止清空、重建或用于破坏性测试。
- `data/tweets-D.json` 是当日结构化快照；临时翻译、渲染脚本和pending文件进入 `../../automation/runs/D/news/work/`。
- 浏览器失败属于采集失败，不得写成“没有新闻”。
- 共享路径与日期逻辑只从 `../../shared/lib/runtime.mjs`导入。
