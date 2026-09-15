# 球员项目数据

这里是项目内其他功能可以稳定依赖的球员数据层，不存放截图。

## 文件结构

- `player-index.json`：去重后的球员主索引，包含姓名、slug、FC27/FC26 链接、来源位置组、各组排名和排除状态。
- `player-links.csv`：主索引的表格版本。
- `source/`：FC26、FC27 各位置组的金卡前 100 原始列表。
- `matches/`：各位置组的 FC27 与 FC26 匹配结果。
- `duplicates/`：跨位置组去重记录。

金卡历史价格已独立放在 `../../gold/data/prices/`，进化任务放在 `../../evolution/data/fc26/`。球员主索引仍是两个数据域共用的身份与中文名来源。

## 代码读取

```js
import { openPlayerRepository } from '../../src/player-data.mjs';

const players = await openPlayerRepository();
const alexia = players.get('alexia-putellas-segura');
const defenders = players.listByGroup('defender');
const unmatchedDefenders = players.listByGroup('defender', { matched: false });
```

默认情况下，`listByGroup()` 不返回已从该位置截图队列排除的重复球员。传入 `{ includeExcluded: true }` 可以查看完整原始位置名单。

价格数据也提供独立查询接口：

```js
import { openLaunchWeekPriceRepository } from '../../src/player-data.mjs';

const prices = await openLaunchWeekPriceRepository();
const alexia = prices.get('alexia-putellas-segura');
console.log(alexia.prices.cross['2025-09-18']);
console.log(alexia.metrics.cross.changePct);
```

读取连续三周趋势：

```js
import { openThreeWeekPriceRepository } from '../../src/player-data.mjs';

const prices = await openThreeWeekPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-08']);
console.log(haaland.analysis.cross.weeks.week2.changePct);
console.log(haaland.analysis.cross.trend);
```

读取开服首月交易分析：

```js
import { openFirstMonthPriceRepository } from '../../src/player-data.mjs';

const prices = await openFirstMonthPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-17']);
console.log(haaland.analysis.cross.trading.support7d);
console.log(haaland.analysis.cross.signal);
```

其中 `cross` 是 FUTBIN 的 PlayStation/Xbox 跨平台市场，`pc` 是 PC 市场。FUTBIN 返回的 `0` 表示该日没有有效均价，规范化文件中保存为 `null`，所有涨跌和波动指标都会忽略这些缺失值。

## 更新价格

```bash
npm run prices:fc26-launch
npm run prices:fc26-3weeks:analyze
npm run prices:fc26-month:analyze
```

命令复用项目内 `.futbin-browser-profile/` 会话，默认以最小化 Chrome 窗口运行，并按张保存可恢复检查点。若 FUTBIN 再次要求安全验证，脚本会临时显示自己的 Chrome 窗口；验证完成后会自动继续并重新最小化。
