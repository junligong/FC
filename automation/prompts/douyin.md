# FC·抖音素材（任务契约）

日报发布之后的下游内容生产任务：把线上情报台的各栏目**截成分析长图**，并写出**配套的视频讲解稿**，交付给剪映出片。

- 调度：每天 06:00（Asia/Shanghai），在「FC·汇总发布」（03:05）之后，确保线上站点已是当日版本
- 产物：`deliverables/douyin/<日期>/`（截图 + 讲解稿）
- **不参与**日报合并发布链路：不改 `reports/daily/`、不改站点产物、不碰 `automation/runs/`

## 为什么是截图而不是重新渲染

日报栏目本身已经是渲染好的网页报告（表格、榜单、图表都是真实产物）。做视频素材时直接截线上页面，比按 JSON 重新画卡片更忠实，也不会出现「渲染口径和页面口径不一致」。所以本任务只做「截图 + 讲解」，画面由剪映合成。

## 执行步骤

### 第 1 步 · 截图

```bash
/Users/wuyanzu/.workbuddy/binaries/python/envs/fc-video/bin/python apps/douyin/capture-shots.py
```

脚本行为（`apps/douyin/capture-shots.py`）：

1. 通过 Web Access 技能的 CDP Proxy（`http://localhost:3456`）新建后台标签页，打开 `https://fc27-site.app.workbuddy.host/index.html`
2. 依次点 `nav#nav button[data-view=X]` 切栏目（market / legend 还需点 `.subtab[data-subid=Y]` 切子标签）
3. 用 `/eval` 把 `iframe.panel-iframe` 高度撑成内容真实高度，并注入 `position:static` 去掉内部吸顶元素（否则滚动拼接时表头会在长图里重复）
4. 用 `/eval` 绝对滚动 + `/screenshot` 逐屏截图，按实际 `scrollY` 用 Pillow 拼接、裁掉父页面导航、再裁掉尾部纯色空白
5. 输出 `shots/<序号>-<栏目>.png`（3240 宽原图）、`shots/preview/`（1080 宽预览）、`shots/manifest.json`

参数：`--date` 覆盖日期、`--only football,market-ov` 只截指定栏目、`--out` 指定输出目录。

### 第 2 步 · 讲解稿

读 `shots/preview/` 下的预览图（细节不清时用 Pillow 裁切局部再读），写 `讲解稿.md`：

1. 素材清单：文件名、栏目、尺寸、图里有什么
2. 建议成片结构：每段用哪张图、停留时长、口播词
3. 逐图讲解词：画面说明 + 口播词 + 花字建议
4. 口径与合规提醒

口播词按「剪映 AI 配音约 4 字/秒」配比，全片口播总时长不超过成片时长的 80%（留呼吸空间，避免又赶又突兀）。

## 硬性口径

- 数字必须与当日产物一致：`automation/runs/<日期>/`（`market.json` / `evolution.json` / `news/tweets.json` / `icons-heroes/state.json`）与 `reports/daily/<日期>/football.html`
- FC27 `launchDate=2026-09-25`：开服前所有价格是 `listing-estimate` 列表估算口径、两个平台（Console / PC）价均为 0 —— 不得当成交价、不得讲涨跌
- 缺失如实写空状态，不得用旧日期或 FC26 数据填充
- 推文流里第三方的卖课 / 代练 / 金币交易招揽**不要复述**，不得出现任何联系方式
- 某个栏目缺失或空状态时，在素材清单与讲解稿里显式标注

## 浏览器通道

唯一通道是 Web Access 技能（CDP Proxy :3456 直连用户日常 Chrome）。截图前自检：

```bash
node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs    # 退出码 0 才可用
```

通道不可用时把本次标为 `failed` 并留证（尝试的 URL、时间、错误摘要），**不回退**到禁止通道（`dumate-browser-cli`、`agent-browser`、IAB、新 profile），也不用旧日期截图填充。

## 已知约束

| 约束 | 说明 |
|---|---|
| 超长流限高 | 资讯实测 57508px、进化/扫描/传奇 >7000px，超过上限即截断，`manifest.json` 的 `truncated` / `full_h` 会记录；需要更后面的内容可按需调大 `COLUMNS` 里的 `max_h` |
| 首页双栏 | `#view-home` 是双栏，右栏「进化专栏」极长会把 section 撑到 10 万 px，所以 home 单独限高 1400 |
| 视口 dpr=2 | 截图宽度是内容宽度的 2 倍（3240px），对抖音 1080 完全够用，缩放在剪映里做 |
| 逐屏原图 | 放在 `/tmp/fc-shots/<日期>/`，不进项目目录；脚本刻意不做批量删除，避免触发文件删除保护 |
