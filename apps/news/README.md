# FC27 资讯采集

从 `sources.txt` 列出的 X 账号采集近 24 小时的 FC27 资讯，过滤、聚类去重、翻译，生成
`reports/daily/D/news.html`。完整规则见 `automation/prompts/news.md` 与 `AGENTS.md`。

## 采集流程

```
DOM 抽取 ──► 媒体解析 ──► 生成报告 ──► 校验提交
extract-timeline.js   enrich-tweet-media.mjs   generate_report.mjs   run-state.mjs
      │                       │                        │
      └── data/tweets-D.json ─┘   （同一文件，原地原子更新）
```

```bash
node apps/news/enrich-tweet-media.mjs 2026-09-16   # 补齐权威媒体
node apps/news/generate_report.mjs 2026-09-16      # 过滤/翻译/落图/渲染
```

## 文件职责

| 文件 | 用途 |
|---|---|
| `extract-timeline.js` | 在浏览器里对时间线做确定性抽取（ID/链接/作者/时间/正文 + `has*` 媒体标记）。**不抠图片地址** |
| `x-media.mjs` | 媒体解析库：把 X syndication 接口响应规范化为 `images` / `video` / `card` / `quoted` |
| `enrich-tweet-media.mjs` | 给当日快照补齐媒体，原地原子更新，逐条失败写 `mediaResolved:false` |
| `generate_report.mjs` | 过滤、聚类去重、翻译、图片落盘、渲染报告；唯一可更新去重库的脚本 |
| `fetch-images-browser.mjs` | 图片下载兜底：curl 拉不动时经用户浏览器（CDP）取回并落盘 |
| `sources.txt` | X 账号清单（名称 + 主页 URL），每轮重新读取，不硬编码数量 |
| `data/tweets-D.json` | 当日结构化快照（含媒体字段与 `localImages` 本地资产映射） |
| `data/seen_tweets.json` | 跨日历史去重库，禁止清空或重建 |
| `auto_news.sh` | 旧 DuMate 兼容入口，**不属于 WorkBuddy 日常流程，不得调用** |

## 两个容易踩的坑

1. **媒体不要从 DOM 取**：后台标签页里 X 只渲染骨架占位符（`[data-testid="tweetPhoto"]` 内部没有
   `<img>`），必须强制出帧才会补图；视频与链接卡片的图在 DOM 里根本不存在。
2. **curl 拉不到图不等于图不存在**：本运行环境出口代理到 `pbs.twimg.com` 不通（`SSL_ERROR_SYSCALL`），
   报告生成器会自动改由浏览器下载（需 CDP Proxy 在线）。仅当两级都失败才记为未落盘。

浏览器通道只使用 `web-access` 技能（CDP 直连用户日常 Chrome）。**不使用 Chrome 插件 /
`extension` 模式**——该扩展依赖的 native messaging 宿主在 WorkBuddy 桌面端未实现，永远显示
「未连接」，已在用户机器上禁用。

临时翻译与修补文件不得写入项目根目录，请放进 `automation/runs/D/news/work/`。
