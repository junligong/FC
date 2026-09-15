# 汇总链接

`merge_daily_report.mjs D` 读取 `reports/daily/D/` 下三个单项报告，生成
`summary.html`，并刷新固定本地发布源 `daily-merged/index.html`。

历史日报按日期倒序嵌入固定入口。缺失单项显示真实空状态，不使用旧日报冒充。
固定公开地址由 `shared/config/project.json` 管理；本项目不自行猜测或创建发布接口。
