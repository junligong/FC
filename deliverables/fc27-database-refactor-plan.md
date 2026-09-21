# FC27 球员数据库重构方案

> 状态：待用户确认。本方案只做设计，未改任何代码/数据/契约。
> 生成时间：2026-09-20

## 一、现状（已核实）

| 项目 | 现状 |
|---|---|
| 传奇卡台账 | `apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json`（131 张，字段：id/slug/nameZh/rating/six/playstyles…） |
| 英雄卡台账 | `apps/market/engine/heroes/data/prices/fc27/base-heroes.json`（`players` 50 张，但 `version` 字段为空字符串，分类未真正落地） |
| 周黑 TOTW / 83+卡 | **完全不存在**，代码库零命中 |
| 本周活动卡 | 无独立台账；数据源已确认：每周六从 FUTBIN `/home-tab/new-players`（View all → `/27/latest`）采集，需过滤 SBC/不可交易卡（双平台价恒为 0 者忽略） |
| 价格采集 | 市场任务走 FUTBIN `/27/popular` 热门榜 + 翻页，**不是按固定名单逐卡采集** |
| 分档 | 仅 `render-market-report.mjs` 有市场扫描 6 档（1万以下 ~ 100万以上）；传奇/英雄无独立分档 |
| 自动化任务 | 9 个：6 日任务 + 2 小时任务 + 1 抖音（已暂停） |

## 二、目标数据模型（五类台账）

统一字段（在现有基础上扩展）：

```
category: icon | hero | totw | activity | rating83plus   ← 新增分类主键
id / cardId / slug / name / nameZh / rating / position
version: "Icon" | "Base Heroes" | "TOTW N" | "<活动系列名>" | "83+"
marketUrl / launchDate
prices: { console: {price,valid}, pc: {price,valid} }    ← 沿用双平台口径
```

五类台账落点（新目录 `apps/market/engine/players/fc27/`）：

| 分类 | 台账文件 | 初始来源 |
|---|---|---|
| 传奇卡 | `icons.json`（迁移自现有 131 张） | 现有台账 |
| 英雄卡 | `heroes.json`（迁移自现有 50 张，补 `version:"Base Heroes"`） | 现有台账 |
| 周黑 | `totw.json` + `totw-current.json` | FUTBIN `?version=team_of_the_week`（完整名单） |
| 本周活动卡 | `activity.json` + `activity-current.json` | **FUTBIN `/27/latest` 按日期采集** |
| 83+卡 | `rating83plus.json`（长期池，累加不删） | **现有金卡数据库筛 `ovr ≥ 83`（218 张）+ 周六活动卡归并** |

### 数据源定稿（2026-09-20 用户补充）

1. **周黑（TOTW）完整名单**：`https://www.futbin.com/27/players?version=team_of_the_week`（注意版本参数是 `team_of_the_week`，不是 `totw`）。此页返回**全部 TOTW 卡**（含历史），不是"本周"子集；「本周周黑」需配合 `/27/latest` 的 `Added on` 日期再筛出当天新增的那批。列表为 JS 渲染，采集走 CDP 浏览器通道读 DOM。
2. **83+ 卡**：从**现有金卡数据库** `apps/market/engine/gold/data/players/fc27/fc27-gold-playstyles.json` 筛 `ovr ≥ 83` 得到（实测 227 张金卡中 218 张满足）。字段含 `slug`/`nameZh`/`ovr`/`position`/`six` 等，可直接复用。83+ 池的语义 = **评分 ≥83 的普通金卡池**，周六把「上周活动卡」归并进此池（累加，不删）。

## 本周活动卡采集口径（2026-09-20 实机核验）

**来源页**：`https://www.futbin.com/home-tab/new-players`（首页「New」标签），其「View all」指向 `https://www.futbin.com/27/latest`。

**`/27/latest` 表头**：`Name | Rating | Position | Cross Price | Cross Range | PC Price | PC Range | Added on`。该页直接给双平台价（Cross / PC），且有 `?page=` 分页参数。

**SBC / 不可交易卡过滤（用户明确要求，关键红线）**：
- 判据：**SBC 卡在列表页双平台价格恒为 `0`**（不可交易，无市场价）；市场流通卡价格 `>0`。
- 详情页佐证：SBC 卡标题区显示 `Player is untradeable`，价格区显示 `Estimated SBC price`（SBC 成本）而非 `Market` 成交价；市场流通卡则无 `untradeable` 标记。
- 例：`/27/player/22923/ayyoub-bouaddi`（Ones to Watch SBC）与 `/27/player/22926/rodrigo-mora-de-carvalho`（同为 OTW 活动卡）在 `/27/latest` 中 Cross/PC Price 均为 `0` → **必须忽略**；`/27/player/22922/seymour-reid` 等普通新卡 Price `>0` → 保留。
- **活动卡版本标签**：详情页/卡面有 `Ones to Watch`、`Hall of FUT` 等活动系列标签（`?version=ones_to_watch` 等），用于区分「本周活动卡」与「普通新卡」。同一球员可能有基础卡（低价）与活动卡（高价）两张，按 cardId 分别记账，不得混并。

## 二·补充：周黑与活动卡统一的「日期 + 版本」采集口径（2026-09-20 用户定稿）

**唯一数据源**：`https://www.futbin.com/27/latest`（`?page=` 翻页，最后一列 `Added on` 为新增日期）。周黑与活动卡**都从这里按日期筛**，不走独立 TOTW 页。

| 场景 | 触发日 | 过滤规则 |
|---|---|---|
| 周黑（TOTW） | 每周四 03:00 | `Added on = 周四当天` **且** 卡面版本 = `totw` |
| 本周活动卡 | 每周六 03:00 | `Added on = 周六当天` 的**所有卡**，**仅排除 SBC**（周六不会出现 TOTW） |

**三条硬判据**（均已实机核验）：
1. **日期精确匹配当天**：只看 `Added on = 更新日当天` 的卡，不做「上次~本次」区间。
2. **版本识别靠卡面图 URL 文件名**（列表页无文字版本标签）：`img/cards/tiny/150_ones_to_watch.png`、`0_bronze.png`、`0_silver.png`、`<n>_totw.png` 等。复用项目既有 `cardVersion` 提取逻辑（`extract-market-prices.js` 从 `img/cards/hd/<版本>.png` 取版本）。
3. **SBC 过滤 = 双平台价恒为 0**：`Cross Price = 0 且 PC Price = 0` 的卡是不可交易 SBC 卡，一律忽略；其余（价格 >0）保留。

## 三、滚动合并逻辑（需求 2/3）

- **每周四 03:00**：`totw-current.json`（上周周黑）并入 `totw.json` 历史库 → 从 `?version=team_of_the_week` 取完整名单 + `/27/latest` 按 `Added on = 周四` 筛出本周新增 TOTW，覆盖 `totw-current.json`。
- **每周六 03:00**：`activity-current.json`（上周活动卡）并入 `rating83plus.json`（83+ 池，累加）→ 从 `/27/latest` 按 `Added on = 周六` 且排除 SBC 采集本周活动卡，覆盖 `activity-current.json`。

> 83+ 池语义已定：**评分 ≥83 的普通金卡池**（初始 218 张，来自 `fc27-gold-playstyles.json`），周六归并上周活动卡累加，不删。

## 四、价格监控重排（需求 4、8）

- 现有「FC·市场价格关注列表」任务（2026-09-20 由每小时改为每 4 小时）改为**按五类台账逐卡采集价格**，不再只抓热门榜。
- 采集通道沿用 Web Access（CDP 独立 profile 9333），逐卡读 FUTBIN 列表页双平台价格单元格（Console + PC）。
- 传奇/英雄卡沿用「FC·传奇价格区间（每 4 小时）」任务；新增三类卡纳入同一价格监控链路。

## 五、分档口径（需求 5/6/7，已全部定稿）

| 专栏 | 档位 |
|---|---|
| 传奇卡 | 30W以下 / 30~100W / 100~200W / 200~500W / 500W+ |
| 英雄卡 | 10W以下 / 10~30W / 30~50W / 50~100W / 100W+ |
| 周黑+活动卡+83+（统一） | 1W以下 / 1~5W / 5~10W / 10~50W / 50~100W / 100~200W / 200W+ |

> 分档已定稿：英雄卡补 `10~30W`（原缺口为笔误）；统一栏 `100W+` 拆为 `100~200W / 200W+`。

## 六、网页专栏重组（需求 8，已细化）

左侧导航调整为**三个数据库专栏**（传奇卡、英雄卡各独立一栏，其余三小类合一栏）：

| 专栏 | 内容 | 子标签/分栏 |
|---|---|---|
| 传奇卡专栏 | Icon（131 张） | 单栏，5 档 |
| 英雄专栏 | Hero（50 张） | 单栏，5 档 |
| 其他卡专栏 | 周黑 + 本周活动卡 + 83+ | 三个子分类同栏展示，统一 7 档 |

- 每个专栏按差异化档位展示，价格列随 Console/PC 切换。
- **球员点开展示价格变化图**（需求补充）：点击任一球员行，用该球员的历史价格序列绘制折线图。
  - 数据源：`popular/daily/<D>.json` 的逐卡逐小时价格点（`ps[]`/`pc[]`，格式 `{h, v}`），以及 `current.json` 的最新价。
  - 实现复用 `render-fc26-review.mjs` 已有的惰性 SVG 逐日价格曲线（`data-curve` 编码 + 点开后由页内脚本画 SVG），不重复造轮子。

## 七、价格数据重新分组（需求补充 3）

- **沿用项目现有采集链路**（Web Access CDP 通道 + `extract-market-prices.js` 的 `cardVersion` 提取 + `current.json` 落库），**不新造采集方式**。
- 在上述采集结果之上，按五类台账的 cardId/slug 归属**重新分组**到「传奇 / 英雄 / 周黑+活动卡+83+」三个专栏。
- 分组判据（复用已定稿口径）：传奇=现有 131 台账、英雄=现有 50 台账、周黑=`team_of_the_week` 名单∩周四新增、活动卡=`/27/latest` 周六新增（排除 SBC）、83+=金卡库 `ovr≥83`（218 张）+周六归并。

## 八、AGENTS.md 精简（需求 9）

原则：去重、合并同类、保留口径红线，不删踩坑与硬约束。候选清理项：
- 浏览器规则中「旧开关模式」长段落（已废弃，可压缩为一行历史参照）。
- 与 `prompts/*.md` 重复的采集细节（契约正文以 prompts 为准）。
- 已被 memory 固化的过程性叙述。

## 九、待你确认的口径清单（阻塞项）

已确认（2026-09-20）：
1. ~~FC23 → FC27~~ 笔误。
2. ~~数据来源 → FUTBIN 采集~~。
3. ~~合并方向~~ 正确。
4. ~~活动卡来源 → `/home-tab/new-players`（View all → `/27/latest`）~~。
5. ~~SBC 过滤 → 双平台价恒为 0 者忽略~~。
6. ~~周黑/活动卡统一走 `/27/latest`，按 `Added on` 当天精确匹配~~；周黑需卡面版本 = `totw`，活动卡 = 周六当天全部（仅排除 SBC）。
7. ~~周黑完整名单 → `?version=team_of_the_week`~~（注意参数名是 `team_of_the_week`）。
8. ~~83+ 卡 → 现有金卡数据库筛 `ovr ≥ 83`（218 张）~~；语义 = 评分≥83 的普通金卡池，周六归并活动卡累加。
9. ~~英雄卡档位补 `10~30W`~~（原缺口为笔误）。
10. ~~统一栏 `100W+` 拆为 `100~200W / 200W+`~~。

**所有口径已关闭，无剩余阻塞项。**

## 十、落地顺序（确认后执行）

1. 建五类台账骨架 + 迁移现有传奇/英雄数据 + 从金卡库筛出 83+ 池。
2. 写 FUTBIN TOTW（`team_of_the_week`）/ 活动卡（`/27/latest`）采集脚本（先跑通，再挂定时）。
3. 写周四/周六滚动合并脚本（周黑并入历史库、活动卡归并 83+ 池）。
4. 改造价格监控脚本：沿用现有采集链路，按五类台账 cardId/slug 重新分组。
5. 改渲染器 + portal 专栏：三专栏（传奇独立 / 英雄独立 / 周黑+活动卡+83+ 合一）+ 三套分档 + 球员点开价格变化图（复用 FC26 惰性 SVG 曲线）。
6. 新增/调整自动化任务（automation_update：周四 03:00 周黑、周六 03:00 活动卡）。
7. 精简 AGENTS.md。
8. 跑回归测试 + 发布。
