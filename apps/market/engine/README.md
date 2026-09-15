# FUTBIN FC27 vs FC26 球员 1V1 截图

本目录同时是 FC27 每日市场扫描的数据引擎。扫描模块定义在
`modules/market-segments.json`，分为本周活动卡与周黑、价格分层、热门进化卡，
并以传奇卡与英雄卡作为第二观察维度。每日成品输出到
`reports/daily/D/market.html`，执行规则见项目根目录的 `automation/prompts/market.md`。

统一球员库位于 `data/players/database/`。运行 `npm run data:build` 可从现有原始数据
重新生成 FC26、FC27 两份去重后的查询库；原始历史价格与进化数据不会被覆盖。

这个脚本会完成五件事：

1. 从 FC27 对应位置的金卡列表收集当前排序前 100 名：前锋为 `ST/RW/LW`，中场为 `CAM/CM/CDM/LM/RM`，后卫为 FUTBIN 实际支持的 `CB/LB/RB`。
2. 抓中场时排除前锋名单；抓后卫时排除前锋与中场名单，确保同一名球员只进入最早的位置组截图队列。
3. 在 FC26 同位置金卡前 100 名中按 slug/姓名匹配；找不到的记录到匹配清单，可用 `overrides.json` 补充直达链接。
4. 持久维护 `player-index.json` 和 `player-links.csv`，保存姓名、FC27/FC26 链接、来源位置组、排名和去重状态。
5. 分别截取两年的球员卡、价格、Skills、Weak Foot、身高、惯用脚、PlayStyles/Roles 区域，再生成左右并排的 1V1 PNG。

## 安装

需要 Node.js 20+ 和本机 Google Chrome：

```bash
cd /Users/wuyanzu/Desktop/FC/apps/market/engine
npm install
```

## 先跑一名球员

```bash
npm run capture -- --only alexia-putellas-segura
```

## 位置组

前锋金卡前 100：

```bash
npm run capture:forward
```

中场金卡前 100，并自动去掉前锋前 100 中已出现的球员：

```bash
npm run capture:midfield
```

只生成/更新中场索引和去重结果，不截图：

```bash
npm run index:midfield
```

后卫金卡前 100，并自动去掉前锋/中场前 100 中已出现的球员：

```bash
npm run capture:defender
```

只生成/更新后卫索引和去重结果，不截图：

```bash
npm run index:defender
```

默认上限是 100。临时改变列表人数可使用 `--list-limit`；`--limit` 只限制本次实际截图数量，不改变球员索引：

```bash
npm run capture:midfield -- --list-limit 100 --limit 5
```

首次访问 FUTBIN 时，Cloudflare 可能在 Chrome 窗口里显示安全验证。请手动完成一次，脚本会自动继续，并把会话保存在 `.futbin-browser-profile/`。脚本不会尝试绕过安全验证，所以首次运行不要加 `--headless`。

如果不希望全量运行期间 Chrome 占用前台，可以先只做一次短暂验证：

```bash
npm run capture -- --verify-only
```

验证窗口会在通过后自动关闭。FUTBIN 如果允许无界面会话，可用：

```bash
npm run capture -- --headless
```

如果 FUTBIN 对 `--headless` 再次触发验证，请改用最小化后台模式。它使用正常 Chrome 渲染，但只最小化脚本自己的窗口，不占用前台：

```bash
npm run capture -- --background
```

先小批量检查效果：

```bash
npm run capture -- --limit 5
```

确认裁剪正确后处理全部球员：

```bash
npm run capture
```

## 项目数据与截图输出

```text
data/players/                 # 可提交、可供其他功能使用的稳定项目数据
├── player-index.json         # 去重后的球员主索引、链接、排名和状态
├── player-links.csv          # 同一索引的表格版本
├── source/                   # FC26/FC27 各位置组前 100 原始列表
├── matches/                  # 各位置组跨年匹配
└── duplicates/               # 跨位置组去重记录

gold/                         # FC26 金卡历史价格域
├── src/                      # 价格抓取与分析代码
├── data/prices/              # 首周、前三周、首月逐日价格与指标
└── outputs/                  # Excel 工作簿与预览图

evolution/                    # FC26 进化任务域
├── src/                      # 进化任务与热门球员抓取代码
└── data/fc26/                # 按日期区间和 FUTBIN 类别归档

dashboard/                    # 球员交易分析仪表盘（Sites / Vinext）

output/                       # 可重新生成的截图产物，已被 git 忽略
├── 1v1/                      # 最终左右对比图
├── single/                   # FC27、FC26 原始截图
└── manifest.json             # 截图状态、URL、裁剪坐标和错误
```

其他功能可以直接使用查询模块：

```js
import { openPlayerRepository } from './src/player-data.mjs';

const players = await openPlayerRepository();
const player = players.get('alexia-putellas-segura');
const defenders = players.listByGroup('defender');
const unmatched = players.listByGroup('defender', { matched: false });
```

FC26 开服首周价格（2025-09-18 至 2025-09-24）也可以直接查询：

```js
import { openLaunchWeekPriceRepository } from './src/player-data.mjs';

const prices = await openLaunchWeekPriceRepository();
const alexia = prices.get('alexia-putellas-segura');
console.log(alexia.prices.cross['2025-09-18']);
console.log(alexia.metrics.cross.changePct);
```

连续前三周的逐日价格与趋势使用：

```js
import { openThreeWeekPriceRepository } from './src/player-data.mjs';

const prices = await openThreeWeekPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-08']);
console.log(haaland.analysis.cross.trend);
```

开服首月（2025-09-18 至 2025-10-17）的 30 天逐日价格与交易指标使用：

```js
import { openFirstMonthPriceRepository } from './src/player-data.mjs';

const prices = await openFirstMonthPriceRepository();
const haaland = prices.get('erling-haaland');
console.log(haaland.prices.cross['2025-10-17']);
console.log(haaland.analysis.cross.trading.maxDrawdown);
console.log(haaland.analysis.cross.signal);
```

重新抓取或补齐价格时运行：

```bash
npm run prices:fc26-launch
npm run prices:fc26-3weeks:analyze
npm run prices:fc26-month:analyze
```

交易分析仪表盘位于 `dashboard/`。其构建前会自动同步首月 JSON 与 CSV：

```bash
cd dashboard
npm run dev
```

价格命令按张保存检查点并支持续跑；默认使用最小化的项目 Chrome。`cross` 表示 PlayStation/Xbox 跨平台市场，`pc` 表示 PC 市场。FUTBIN 返回的 0 会作为缺失值处理。

FC26 进化任务已整理为 2025-09-18 至 2026-08-24 的完整时间线，按发布日期升序、同日按 FUTBIN ID 升序保存：

```bash
npm run evolution:sort
npm run evolution:fetch
npm run evolution:fetch -- --normalize-only
```

完整说明和文件清单见 `evolution/README.md`。其他功能可通过 `openEvolutionRepository()` 按 ID、slug、名称或分类查询。

再次运行会自动跳过已经生成的 1V1 图片。需要重截时使用：

```bash
npm run capture -- --force
```

图片使用稳定的球员 slug 命名，所以先用 `--only` 或 `--limit` 生成的结果，在之后全量运行时也会被正确识别并跳过。

FUTBIN 球员列表变化后刷新索引：

```bash
npm run capture -- --refresh-index
```

只检查链接和匹配、不截图：

```bash
npm run capture -- --dry-run
```

## 配置与手工匹配

复制示例配置后可以修改列表 URL、项目数据目录、输出目录、等待时间、页面尺寸或裁剪方式：

```bash
cp config.example.json config.json
```

如果 `data/players/matches/` 中有未匹配球员，在项目根目录新建 `overrides.json`：

```json
{
  "alexia-putellas-segura": "https://www.futbin.com/26/player/105/alexia-putellas-segura"
}
```

Alexia 的映射已经包含在内置默认配置里；上面只是展示格式。

自动裁剪会从 `SKILLS / WEAK FOOT / HEIGHT / FOOT` 和 `PLAYER STATS` 等文字定位详情头图。FUTBIN 改版后若自动裁剪不准，可以在 `config.json` 中设置页面元素选择器：

默认使用 `1229 × 900` 的桌面布局；这是参考图对应的内容宽度，也能把右下角悬浮视频移出属性区域。脚本还会隐藏 Venatus 视频和底部粘性广告，并等待球员头像资源实际完成渲染后再截图。

```json
{
  "captureSelector": ".player-header"
}
```

也可以直接指定固定裁剪区域（CSS 像素）：

```json
{
  "captureClip": { "x": 0, "y": 200, "width": 2458, "height": 772 }
}
```

固定坐标只适合页面布局稳定的情况，优先使用自动裁剪或 `captureSelector`。

## 常用参数

```text
--only <slug,...>  只处理指定球员
--group <name>     forward（前锋）、midfield（中场）或 defender（后卫）
--list-limit <n>   每个位置列表最多收集人数，默认 100
--limit <n>        只处理前 n 名
--force            覆盖已有截图
--refresh-index    重新抓取列表
--dry-run          只抓列表并匹配
--verify-only      只完成安全验证并保存会话
--background       正常渲染并最小化脚本 Chrome 窗口
--headless         无界面运行（通过安全验证后再用）
--headed           显示浏览器
--output <dir>     改变输出目录
--config <file>    使用其他配置文件
```

脚本默认每次页面请求之间等待 1.5 秒，既降低 FUTBIN 压力，也减少触发安全验证的概率。可以在 `config.json` 里增大 `requestDelayMs`。
