# FC27 资讯采集

`auto_news.sh` 通过已连接的浏览器环境访问 `sources.txt` 中的信息源，
`generate_report.mjs` 负责过滤、去重、翻译并生成
`reports/daily/D/news.html`。每日执行规则见 `automation/prompts/news.md`。

`data/seen_tweets.json` 是跨日历史去重库，禁止清空或重建；
`data/tweets-D.json` 是当日结构化快照。临时翻译和修补文件不得写入项目根目录。
