# FC·抖音素材日更 —— 自动化执行记忆

任务 ID：c1b3d126-a386-437d-8eb0-ac01a8912702
契约：`automation/prompts/douyin.md`｜技能：`fc-daily-douyin-video`

## 执行概要（按日期倒序，只记高层结果与踩坑）

### 2026-09-17（06:00，成功 · 7/8 栏目）
- 产物：`deliverables/douyin/2026-09-17/`（shots + preview + manifest.json、讲解稿.md、口播稿.txt）。
- 截图 7/8：00 今日总览 3240×2800(截断) / 01 足球动态 3240×2477 / 02 资讯 3240×14000(截断) / 03 市场概览 3240×8048 / 04 市场扫描 3240×14000(截断) / 05 进化 3240×14000(截断) / 07 传奇卡研究 3240×14000(截断)。
- `06-传奇英雄监控` = `missing_subtab`：上游 icons-heroes 任务 failed（FUTBIN /27/players 403），站点当日未挂 monitor 子标签。未填充旧数据，证据写进 manifest `notes`。
- 通道：`check-deps.mjs` exit 0，未用任何禁止入口。
- 讲解稿配比：成片 55s / 口播 43s = 78.2%，8 段。
- **踩坑并修复**：`apps/douyin/capture-shots.py` 未创建 `shots/` 输出目录 → 新日期首跑全栏目 `FileNotFoundError`。已补 `os.makedirs(outdir, exist_ok=True)`。**下次若新日期首跑报同类错，优先查这个。**
- 当日渲染侧瑕疵（已写入讲解稿，未改站点）：首页传奇徽标误显「当日已收录」；market 页静态提示与 `partial-live` 数据矛盾；football.html 的 `<title>` 日期陈旧。

## 稳定结论（跨日期复用）

1. 唯一通道 = Web Access CDP Proxy :3456；先跑 `check-deps.mjs`（退出码 0 才继续）。
2. 截图限高（`COLUMNS` 里的 max_h）：home 1400、football 6000、news/market-sc/evolution/legend 7000，超出即截断并在 manifest 记 `truncated`/`full_h`。
3. 上游栏目缺失会表现为 `missing_subtab`（不是通道故障）——如实记录，禁止用旧日期或 FC26 数据补齐。
4. 讲解稿必须逐段自证口播占比 ≤80%（4 字/秒）；缺失栏目要单独成段或在素材清单显式标注。
5. 推文流夹带的卖课/代练/金币交易招揽一律不复述、不出现联系方式。
