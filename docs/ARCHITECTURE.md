# FC 项目架构与数据边界

## 一句话架构

`apps/` 负责采集和分析，`shared/` 提供共享能力，`automation/` 只管编排与证据，`reports/` 保存当日报告，`daily-merged/` 是唯一站点发布源。

## 数据流

```text
已批准浏览器通道
  ↓
常驻采集脚本
  ├─ 当前行情 → current.json（唯一共享主表）
  ├─ 历史观测 → series/*.json（固定文件内 upsert）
  └─ 业务原始表 → 各模块稳定数据文件
  ↓
结构化分析（watchlist / market / evidence）
  ↓
渲染器生成 reports/daily/D/*.html
  ↓
portal 合并为 daily-merged/
  ↓
WorkBuddy 更新同一个站点
```

## 数据单一真相源

| 数据 | 唯一权威文件 | 写入方式 |
|---|---|---|
| FC27 当前价、热度、价格区间 | `apps/market/engine/data/prices/fc27/current.json` | 按 `cardId` 原子 upsert |
| 热门榜历史 | `apps/market/engine/data/prices/fc27/series/popular.json` | 按观测小时 upsert |
| 进化榜历史 | `apps/market/engine/data/prices/fc27/series/evolutions.json` | 按观测小时 upsert |
| 传奇价格区间历史 | `apps/market/engine/icons/data/prices/fc27/series/icons.json` | 按观测小时 upsert |
| 当日关注评分 | `automation/runs/D/market/watchlist.json` | 同日覆盖 |
| 高频任务运行记录 | `automation/runs/D/<module>/attempts.json` | 按小时键 upsert |

`latest.json` 若存在只是可重建的性能缓存，不是另一份数据库。页面展示当前价时不得读它。

## 文件增长规则

- 每天允许新建一个日期目录和固定名报告；这是日报归档，不是高频快照。
- 每 4 小时任务只更新既有文件，不得为轮次创建新 JSON、脚本或报告副本。
- 一次性页面、探针、验证脚本只能出现在 `automation/runs/D/<module>/work/`，任务成功后清理。
- 失败证据写入同一个 `attempts.json`，详细浏览器日志复用 `browser-channel-log/D.jsonl`。
- 用 `node automation/audit-file-growth.mjs` 检查 Git 工作区的新文件数量。

## 站点信息架构

首页是“决策工作面”，顺序固定为：

1. 当日日期与数据语境。
2. 追踪卡、有效价、热度和观测点覆盖。
3. 今日关注表：中英文名、OVR、Console / PC 当前价、热度、相邻观测变动与关注分。
4. 足球、资讯、市场、进化、传奇/英雄、FC26 回顾入口。
5. 历史日报。

各模块保留自己的专业表格和筛选，但不得再创建一份当前行情。

## 文档分工

- 根 `AGENTS.md`：跨项目的强制口径和红线。
- `apps/*/AGENTS.md`：该模块的输入、输出和业务规则。
- `automation/prompts/*.md`：定时任务可执行步骤，不重复定义全局口径。
- `README.md`：面向人的入口和常用命令。
- 本文：只讲边界、数据流和文件生命周期。
