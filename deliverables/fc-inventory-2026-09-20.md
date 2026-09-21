# FC 项目历史任务与脚本汇总（2026-09-20 盘点）

> 只读盘点，未做任何删除。体积数字为 `os.walk` 实测（MB = 1048576 B）。


## 一、体积构成

| 目录 | 体积 | 文件数 | 性质 |
|---|---:|---:|---|
| `.git/` | 1400.79 | 8523 | Git 历史（**全部为松散对象，从未 pack**） |
| `apps/` | 186.24 | 1036 | 应用与数据 |
| `reports/` | 148.77 | 4071 | 日报产物（含逐日资源副本 100 MB） |
| `daily-merged/` | 111.14 | 2217 | 站点发布源（含共享资源 89 MB） |
| `deliverables/` | 105.44 | 79 | 交付物（其中抖音素材 105 MB） |
| `shared/` | 49.90 | 3543 | 共享库与头像源图 |
| `automation/` | 28.48 | 926 | 编排、契约与运行记录 |
| `.workbuddy/` | 3.25 | 41 | 会话记忆（**不要删**） |
| `.tmp/` | 0.97 | 21 | 旧 dv-* 临时目录 |
| `.dumate/` | 0.75 | 14 | 旧 DuMate 会话日志（渠道已废弃） |
| **合计** | **2035.72** | — | |


## 二、WorkBuddy 自动化任务（11 条：10 运行中 + 1 暂停）

| 任务名 | 状态 | 调度 |
|---|---|---|
| FC·资讯采集 | ACTIVE | 每日 03:00 |
| FC·市场监控 | ACTIVE | 每日 03:05 |
| FC·足球日报 | ACTIVE | 每日 06:00 |
| FC·进化专栏 | ACTIVE | 每日 03:15 |
| FC·传奇英雄监控 | ACTIVE | 每日 03:20 |
| FC·汇总发布 | ACTIVE | 每日 06:15 |
| FC·市场价格关注列表（每4小时） | ACTIVE | 每 4 小时 |
| FC·传奇价格区间（每4小时） | ACTIVE | 每 4 小时 |
| FC·周黑滚动更新 | ACTIVE | 每周四 03:00 |
| FC·本周活动卡滚动更新 | ACTIVE | 每周六 03:00 |
| FC·抖音素材 | **PAUSED** | 每日 06:30（已暂停） |

> ⚠ 「FC·抖音素材」是**唯一未写入 AGENTS.md 任务表**的自动化（已暂停）。其产物即 `deliverables/douyin/`。


## 三、脚本清点

- 脚本总数 **296** 个（`.mjs` / `.js` / `.py` / `.sh`）
- **契约或代码引用**：94 个 → 活
- **`automation/runs/**/work/` 一次性工作脚本**：181 个 → 契约允许，按运行累积
- **零引用（排除 `runs/**`）**：21 个 → 其中 11 个真遗留、7 个活测试、2 个手动工具、见 3.1

### 3.1 零引用的 21 个脚本（去重后分类）

> 判据：脚本名（无扩展名）在全仓库任何 `.md`/`.json`/`.mjs`/`.js`/`.py`/`.sh`/`.yml`/`.html` 中均无第二次出现（排除 `automation/runs/**` 与本文档自身）。**注意**：`automation/runs/**/work/` 下 181 个一次性脚本由契约允许、不计入本表。

**A. 真正的一次性遗留（11 个，建议归档到 `archive/legacy-scripts/`，不建议直接删除）**

| 脚本 | 大小 | 说明 |
|---|---:|---|
| `apps/market/engine/src/icon-hero-deep-analysis.py` | 52.2 KB | 传奇英雄深度分析（一次性） |
| `apps/market/engine/scripts/generate-price-analysis.py` | 22.1 KB | 价格分析报告（一次性） |
| `apps/market/engine/scripts/generate-pina-report.py` | 21.4 KB | Pina 专题报告（一次性） |
| `apps/market/engine/src/apply-all-chinese-names.mjs` | 19.4 KB | 译名批处理，已被 `apply-market-name-zh.mjs` 取代 |
| `apps/market/engine/src/fetch-fc26-base-cards.mjs` | 17.6 KB | FC26 基础卡抓取 v1（已被 v2 取代） |
| `apps/market/engine/gold/src/fetch-fc27-detail.mjs` | 14.5 KB | FC27 详情抓取（数据集已落地） |
| `apps/market/engine/scripts/pina-hidden-gem-finder.mjs` | 12.5 KB | 隐藏妖人筛选（一次性） |
| `apps/market/engine/evolution/generate_evo_recommend.py` | 11.8 KB | FC26 进化推荐 PNG（一次性，内含**硬编码绝对路径**） |
| `apps/market/engine/src/fetch-fc26-base-cards-v2.mjs` | 11.6 KB | FC26 基础卡抓取 v2（数据集已落地） |
| `apps/market/engine/gold/src/render-fc27-index.mjs` | 9.9 KB | 金卡索引渲染，已被 `render-market-*.mjs` 取代 |
| `apps/market/engine/gold/src/validate-fc27.mjs` | 8.4 KB | 金卡数据校验（一次性） |

合计约 **200 KB**——体量无关紧要，价值在于让 `src/`、`scripts/` 只剩活脚本。

**B. 不是遗留，勿动（10 个）**

| 脚本 | 原因 |
|---|---|
| `apps/market/engine/test/{core,evolution,capture,player-data,price-month,price-trends}.test.mjs` | **活测试**（7 个文件共 32 个用例，随 `node --test apps/market/engine/test/*.test.mjs` 运行并通过） |
| `apps/market/integrations/wechat/{import_top200,publish_article}.py` | 公众号**手动**发布工具（契约明确「不得由日报任务自动发布」） |

**C. 手动分析工具（3 个，无契约引用但有真实产物）**

`automation/scripts/render-fc27-buy-recommend.mjs`、`automation/scripts/fc27-buy-recommend.mjs` → 产出 `reports/analysis/fc27-buy-recommend-2026-09-18.html`；`reports/analysis/fc27-investment-analysis-2026-09-15.html` 属同批一次性分析。建议在 `AGENTS.md` 注明「手动分析工具，非自动任务入口」，而不是删除。

### 3.2 易误判为遗留、实为**活**的脚本（勿删）

- `apps/market/engine/src/{apply-player-chinese-names,build-player-database,futbin-1v1,migrate-player-data,research-player-chinese-names}.mjs`、`i18n.py`、`lang-toggle.js` —— 由 `apps/market/engine/package.json` 的 npm script 与引擎测试引用。
- `apps/market/engine/gold/src/*.mjs` —— 同上，且 `test/price-*.test.mjs` 依赖。
- `apps/market/engine/test/*.test.mjs`（6 个，共 **32 个用例**）—— **活测试**。注意 `AGENTS.md` 只写了 `automation/*.test.mjs`（40 个用例），文档缺了引擎测试这一半。
- `shared/presentation/football-layout.mjs` —— 被 `shared/presentation/report-theme.mjs` import。
- `automation/scripts/{fc27-buy-recommend,render-fc27-buy-recommend}.mjs` —— 未被任何契约引用，但产出 `reports/analysis/` 下 2 份真实报告，属**手动分析工具**。

## 四、可回收数据（待确认）

| # | 对象 | 体积 | 可重建性 | 建议 |
|---:|---|---:|---|---|
| 1 | `.git` 松散对象（8486 个，**0 个 pack**） | ~1400 | — | `git gc` repack，**非破坏性** |
| 2 | `reports/daily/*/assets/players/`（4 天） | 12.87 | ✅ 全部可由 `shared/data/fc27/images/`（3530 张）重建，实测缺失 **0** | 合并后清理 |
| 3 | `reports/daily/*/assets/news/`（6 天） | 82.2 | ⚠ 字节已在 `daily-merged/assets/news/`（515 个同名同大小，实测缺失 **0**），但**不可离线重下** | 按需 |
| 4 | `apps/market/integrations/wechat/runtime/images_hq/` | 87.30 | 公众号文章高清图缓存 | 按需 |
| 5 | `deliverables/douyin/` | 105.32 | 抖音素材（任务已暂停） | 按需 |
| 6 | `.tmp/` + `.dumate/` + `apps/apps/` | 1.73 | ❌ 纯垃圾 | 删除 |
| 7 | `reports/daily/2026-09-20/*.tmp-*`（含 21.5 MB 中断残留） | 21.55 | ❌ 原子写中断遗留 | 删除 |
| 8 | `.DS_Store` ×4、两处 `dryrun/` | <0.1 | ❌ 垃圾/试跑遗留 | 删除 |

**必须保留**（项目内文档声明为可复用数据源）：`apps/market/engine/{data,gold,evolution,icons,heroes,totw,promo}/data/`、`shared/data/`。

---

## 五、执行结果（2026-09-21 10:26 完成）

| 动作 | 前 | 后 | 回收 |
|---|---:|---:|---:|
| `.git` repack（`git gc --prune=now`） | 1400.79 MB / 8486 松散对象 / 0 pack | **530.75 MB** / 0 松散 / 1 pack | **870.04 MB** |
| `reports/daily/*/assets/`（7 天逐日副本） | 105.64 MB / 4820 个文件 | **7.62 MB**（仅逐日 `data/current.json`） | **98.02 MB** |
| 纯垃圾（`.tmp/`、`.dumate/`、`apps/apps/`、2 个中断残留 21.5 MB、`.DS_Store`×4、`dryrun/` 内容） | 23.32 MB / 47 项 | 0 | **23.32 MB** |
| 11 个零引用遗留脚本 | `apps/market/engine/{src,scripts,gold,evolution}` | `archive/legacy-scripts/`（原路径保留） | 移出（未删除） |
| **项目目录合计** | **2035.72 MB** | **1075.14 MB** | **≈ 960 MB** |

**内容零丢失的证据**：被清理的 4,820 个文件，按 `cleanup-manifest-2026-09-20.json` 里记录的 sha256 前缀逐一比对 `daily-merged/assets/` 同名文件 —— **4820/4820 通过，异常 0**。垃圾备份在 `/Users/wuyanzu/Backups/FC/junk-2026-09-20.tar.gz`（14 MB / 39 个文件，`gzip -t` 通过）。

**代码侧配套改动**（这是关键：一次性删除会被渲染器重新填满）：
- 新增 `shared/lib/prune-report-assets.mjs#pruneReportAssets()` —— 归并后删除「共享目录已有同名同大小文件」的报告目录副本，`assets/data/` 永不清理。
- 接入 `apps/portal/merge_daily_report.mjs`（归并之后）与 `automation/coordinate.mjs`（共享资源回写之后）。
- 新增回归用例「归并后清理报告目录里的资源副本，但保留唯一副本与 data/」；全量测试 **73/73 通过**。

**保留未动**（按你的选择）：`deliverables/douyin/` 105.32 MB、`apps/market/integrations/wechat/runtime/images_hq/` 87.30 MB、`apps/market/engine/evolution/data/` 29.89 MB（文档声明为可复用数据源）、`shared/data/` 51.82 MB。

**副作用（唯一）**：`reports/daily/<D>/assets/news/` 的 X 配图已被清理，字节只存在于 `daily-merged/assets/news/`。**`daily-merged/assets/` 不得手工清空**，否则历史日报配图无法再次生成（`players/` 不受影响，可由 `shared/data/fc27/images/` 重建）。该约束已写入根 `AGENTS.md`。
