# FC26 进化任务数据

这里保存 FC26 FUTBIN 进化任务、发布日期顺序及每项任务的热门球员。完整日期时间线为 2025-09-18 至 2026-08-24（含首尾）；此前抓取的热门球员区间仍保留在 2025-09-18 至 2026-02-14。

## 日期与分类结构

```text
data/fc26/
├── raw/all-tasks.json
├── raw/futmind-evolution-schedule.json
├── by-date/index.json
├── by-date/daily/YYYY-MM-DD.json
├── ranges/2025-09-18_2026-08-24/
│   ├── manifest.json
│   ├── tasks.json
│   ├── tasks-chronological.json
│   ├── tasks-chronological.csv
│   └── by-category/
└── ranges/2025-09-18_2026-02-14/
    ├── manifest.json
    ├── tasks.json
    ├── tasks.csv
    ├── popular-players.json
    ├── popular-players.csv
    ├── tasks-with-popular-players.json
    └── by-category/
```

完整时间线按 `releaseDate` 升序、同日按 FUTBIN Evolution ID 升序排列。第一项是 2025-09-18 的 `Intro to Evolutions`，最后一项是 2026-08-24 的 `The Tenant`。

发布日期优先读取 FUT Mind 页面中的结构化 `created_at`，并用任务名称的最长公共子序列与 FUTBIN 时间线进行一对一匹配。FUT Mind 未保留的奖励类任务使用相邻的精确日期锚点推算，文件中的 `dateConfidence` 会明确标记为 `exact`、`normalized` 或 `inferred`。

## 重新生成日期排序

```bash
npm run evolution:sort
```

这个命令会重新读取 FUT Mind 的公开进化索引并更新每日文件、分类文件和 CSV。日期证据快照会保存到 `data/fc26/raw/futmind-evolution-schedule.json`。

## 抓取与续跑

已打开并验证 Chrome 时，重新抓取 2025-09-18 至 2026-02-14 的任务和热门球员：

```bash
npm run evolution:fetch
```

脚本默认连接 `http://localhost:19222` 的现有 Chrome，会按任务写入 `.popular-players-checkpoint.json`，中断后可续跑。需要使用项目自己的持久化 Chrome 时：

```bash
npm run evolution:fetch -- --profile --background
```

只从已有任务和断点重新生成 JSON/CSV：

```bash
npm run evolution:fetch -- --normalize-only
```

其他日期区间必须同时给出经过验证的 FUTBIN ID 边界：

```bash
npm run evolution:fetch -- --from 2026-02-15 --to 2026-03-01 --start-id 483 --end-id 600
```

## 代码读取

```js
import { openEvolutionRepository } from './src/player-data.mjs';

const evolutions = await openEvolutionRepository();
const task = evolutions.get('inside-edge');
const academy = evolutions.listByCategory('FS ACADEMY');
const launchDay = evolutions.listByDate('2025-09-18');
const withPopularPlayers = evolutions.listWithPopularPlayers();
```
