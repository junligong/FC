# Gold 金卡历史数据

`gold/` 集中保存 FC26 金卡球员的历史价格代码、规范化数据和分析产物，避免与以后持续增加的 FC27 活动卡数据混在一起。

## 目录

- `src/`：首周、前三周和首月价格抓取/分析脚本。
- `data/prices/`：逐日价格、汇总指标、原始 FUTBIN 时间序列和可恢复检查点。
- `outputs/`：Excel 工作簿及其预览图。

## 更新

```bash
npm run prices:fc26-launch
npm run prices:fc26-3weeks:analyze
npm run prices:fc26-month:analyze
```

价格区间以 FC26 开服日 2025-09-18 为第一天。`cross` 是 PlayStation/Xbox 跨平台市场，`pc` 是 PC 市场。
