#!/usr/bin/env node
/**
 * 每日综合报告合并脚本（dashboard 单日日报版）
 * 功能：读取 FC27资讯、足球日报、FC27市场分析 三个任务的当日 HTML，
 *       生成统一 dashboard 风格的「单日日报」，并维护：
 *       - reports/daily/D/summary.html  当日日报（dashboard 风格，归档副本）
 *       - daily-merged/archive/D.html   历史日报独立归档文件
 *       - daily-merged/index.html       固定入口（仅当日内容 + 历史日报链接列表）
 *       - daily-merged/assets/          海报等共享静态资源
 *
 * 用法：node merge_daily_report.mjs [YYYY-MM-DD]
 *   不传日期则默认使用当天日期
 *
 * 体积策略（2026-09-20 重构）：
 *   1) 面板里的本地图片不再内联成 base64，而是改写为指向 daily-merged/assets/ 的相对路径，
 *      同一张图在所有页面（index / archive/<D>.html / summary.html）共用一份。
 *      旧写法把 base64 复制进每一份文档，实测 daily-merged 达 191 MB（9,336 处 data:image / 170.5 MB，
 *      单篇 archive 最高 46 MB）；改写后同一份内容不再随文档数与出现次数重复膨胀。
 *   2) 图片文件名本身是内容寻址的（players 按 cardId、news 按内容哈希），同名必同图，
 *      因此各日资源可安全合并进同一目录，而不必按日各存一份。
 *   3) index.html 只内嵌当日板块，历史日报保持独立文件链接。
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { dailyReport } from './dashboard.mjs';
import { themeReport } from '../../shared/presentation/report-theme.mjs';
import { root, reportDate, atomicWrite } from '../../shared/lib/runtime.mjs';
import { rewriteLocalReportAssets } from '../../shared/lib/report-assets.mjs';
import { pruneReportAssets } from '../../shared/lib/prune-report-assets.mjs';

// ========== 配置 ==========
const BASE_DIR = root;
const SOURCES = [
  { id: 'football-daily', title: '足球日报', icon: '⚽', fileName: 'football.html', desc: '七大联赛+欧冠，积分榜/射手榜/助攻榜三榜齐备' },
  { id: 'fc27-news', title: 'FC27 资讯雷达', icon: '📡', fileName: 'news.html', desc: 'X.com 信息源自动采集，智能过滤翻译' },
  { id: 'market-analysis', title: 'FC27 市场分析', icon: '📊', fileName: 'market.html', desc: '两个子标签：市场概览（PC / Console 双平台切换） / 市场扫描' },
];

// 进化专栏：独立于三个主板块，作为首页右栏 / 独立视图的可选内容源。
// 由后续进化任务写入 reports/daily/D/evolution.html；未就绪时如实显示空状态。
const EVOLUTION_SOURCE = { id: 'evolution-column', title: '进化专栏', fileName: 'evolution.html' };

// 传奇/英雄专栏：跨日期常驻的独立栏目（左侧导航），承载原「FC27 市场」中的传奇/英雄内容。
// 两个子标签：监控（当日产物 icons-heroes.html，由「FC27 传奇/英雄卡监控」任务产出）+
// 研究（跨日期研究底稿 fc27-icon-analysis.html）。视图键为 'legend'，与 dashboard.mjs 的 LEGEND_TAB.view 对齐。
const LEGEND_SOURCE = { id: 'legend-column', title: '传奇/英雄专栏' };

// FC26 球员回顾：跨日期常驻的离线复盘栏目（左侧导航 / 首页卡片 / 独立视图）。
// 内容源为 apps/market/engine/gold/reports/fc26-season-review.html，由
// node apps/market/engine/scripts/render-fc26-review.mjs 只读项目内本地 FC26 数据生成，
// 不采集、不联网，也不随日报日期变化 —— 因此不参与当日日期校验，存在即收录。
// 视图键为 'fc26'，与 dashboard.mjs 的 FC26_TAB.view 对齐。
const FC26_SOURCE = {
  id: 'fc26-review-column',
  title: 'FC26 球员回顾',
  file: path.join('apps', 'market', 'engine', 'gold', 'reports', 'fc26-season-review.html'),
};

const REPORT_ROOT = path.join(BASE_DIR, 'reports', 'daily');
const MERGED_DIR = path.join(BASE_DIR, 'daily-merged');
const ARCHIVE_DIR = path.join(MERGED_DIR, 'archive');
const ASSETS_DIR = path.join(MERGED_DIR, 'assets');
const PORTAL_ASSETS_DIR = path.join(BASE_DIR, 'apps', 'portal', 'assets');

// ========== 日期处理 ==========
const getDate = reportDate;

// ========== 查找产出文件 ==========
function findReport(source, dateStr) {
  const fullPath = path.join(REPORT_ROOT, dateStr, source.fileName);
  if (existsSync(fullPath)) return fullPath;
  return null;
}

// 读取并处理单个报告：主题化 + 本地图片改指共享资源目录 + srcdoc 转义
// assetBase：本页回到 daily-merged/ 的相对前缀（见 generateDaily 的三个 view）。
function themedPanel(raw, assetBase) {
  if (!/<html[\s>]/i.test(raw) || !/<\/html>/i.test(raw)) return null;
  try {
    const themed = rewriteLocalReportAssets(themeReport(raw), assetBase);
    return themed.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  } catch {
    return null;
  }
}

// 读取并处理单个板块（当日产物必须自带当日日期，防止拿旧报告冒充当天内容）
function buildPanel(source, dateStr, assetBase) {
  const reportPath = findReport(source, dateStr);
  if (!reportPath) return null;
  let raw;
  try {
    raw = readFileSync(reportPath, 'utf8');
  } catch {
    return null;
  }
  if (!raw.includes(dateStr)) return null;
  return themedPanel(raw, assetBase);
}

// 按文件名直接构建面板（用于栏目内子标签内容，如 market-scan.html）
function buildPanelByFile(fileName, dateStr, assetBase) {
  return buildPanel({ id: fileName, fileName }, dateStr, assetBase);
}

// 传奇卡研究：跨日期保留的常驻研究底稿（自带成稿日期，不参与当日日期校验）。
// 供给「传奇/英雄专栏」的「传奇卡研究」子标签（已从 FC27 市场栏迁出）。
// 优先使用当日同名产物 reports/daily/D/market-icons-research.html，否则回退到 icons/reports/ 下的底稿。
function buildIconResearchPanel(dateStr, assetBase) {
  const candidates = [
    path.join(REPORT_ROOT, dateStr, 'market-icons-research.html'),
    // 高频刷新的「传奇卡研究」常驻底稿（FC26 开服价 vs FC27 当前价/最高价的实时投资建议，
    // 由 icons-pricerange-hourly 任务刷新）。放在静态预测底稿之前，保证往期日期也能看到最新研究。
    path.join(BASE_DIR, 'apps', 'market', 'engine', 'icons', 'reports', 'fc27-icon-live-research.html'),
    path.join(BASE_DIR, 'apps', 'market', 'engine', 'icons', 'reports', 'fc27-icon-analysis.html'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const panel = themedPanel(readFileSync(p, 'utf8'), assetBase);
      if (panel) return panel;
    } catch { /* 读取失败则尝试下一个来源 */ }
  }
  return null;
}

// FC26 球员回顾：读项目内本地底稿并主题化。跨日期常驻（自带成稿口径，不参与当日日期校验），
// 底稿由 render-fc26-review.mjs 离线生成，缺失时返回 null 交由模板给出如实空状态。
function buildFc26ReviewPanel(assetBase) {
  const p = path.join(BASE_DIR, FC26_SOURCE.file);
  if (!existsSync(p)) return null;
  try {
    return themedPanel(readFileSync(p, 'utf8'), assetBase);
  } catch {
    return null;
  }
}

function reportStatus(fileName, dateStr) {
  const reportPath = path.join(REPORT_ROOT, dateStr, fileName);
  if (!existsSync(reportPath)) return 'none';
  const raw = readFileSync(reportPath, 'utf8');
  if (/(采集失败|\bFAILED\b|data-status=["']failed)/i.test(raw)) return 'failed';
  if (/(部分完成|\bPARTIAL\b|data-status=["']partial)/i.test(raw)) return 'partial';
  return 'ok';
}

// 扫描所有存在日报的日期（倒序）。以 summary.html 为准；当前正在生成的日期尚未落盘，单独补入。
function listReportDates(currentDate) {
  const dates = new Set();
  if (existsSync(REPORT_ROOT)) {
    for (const d of readdirSync(REPORT_ROOT)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(path.join(REPORT_ROOT, d, 'summary.html'))) dates.add(d);
    }
  }
  if (currentDate) dates.add(currentDate);
  return Array.from(dates).sort().reverse();
}

// 按「仅在缺失或大小不同时写入」复制目录树。
// 合并日报会被每日任务与每 4 小时的市场任务反复调用，而共享资源目录有 40 MB 以上，
// 无条件整树覆盖会每轮白拷一次；按大小比对可让重复调用几乎零成本。
function copyTreeIfChanged(srcDir, dstDir, counter) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      copyTreeIfChanged(src, dst, counter);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
      copyFileSync(src, dst);
      counter.copied++;
    } catch { /* 单个文件失败不阻断整体合并 */ }
  }
}

// 确保共享资源就位（从各日 reports/daily/<D>/assets 合并到 daily-merged/assets）。
// 图片文件名本身就是内容寻址的（players 按 cardId、news 按内容哈希），同名必同图
// ——已核对 4 天数据 0 例冲突——所以可以合并共用，而不必按日各存一份。
function ensureAssets(dateStr) {
  mkdirSync(ASSETS_DIR, { recursive: true });
  const counter = { copied: 0 };

  // 1) 海报等共享素材（apps/portal/assets → daily-merged/assets）
  if (existsSync(PORTAL_ASSETS_DIR)) {
    copyTreeIfChanged(PORTAL_ASSETS_DIR, ASSETS_DIR, counter);
  }

  // 2) 各日报告素材：除 data/ 外全部合并进同一目录（同名即同图，重复出现只留一份）
  if (existsSync(REPORT_ROOT)) {
    for (const d of readdirSync(REPORT_ROOT)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const dayAssets = path.join(REPORT_ROOT, d, 'assets');
      if (!existsSync(dayAssets)) continue;
      for (const sub of readdirSync(dayAssets, { withFileTypes: true })) {
        // data/ 是运行时可变资源（页面加载时 fetch 同一份 current.json），只认当日
        if (!sub.isDirectory() || sub.name === 'data') continue;
        const src = path.join(dayAssets, sub.name);
        const dst = path.join(ASSETS_DIR, sub.name);
        mkdirSync(dst, { recursive: true });
        copyTreeIfChanged(src, dst, counter);
      }
    }
  }

  // 3) 运行时行情资源：各市场页面统一读取这一份，取当日版本
  const currentSrc = path.join(REPORT_ROOT, dateStr, 'assets', 'data', 'current.json');
  if (existsSync(currentSrc)) {
    const target = path.join(ASSETS_DIR, 'data', 'current.json');
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(currentSrc, target);
  }
  return counter.copied;
}

// 生成历史日报链接列表（指向 archive/D.html 或同目录 D.html）
// linkBase: index 页为 'archive/'，archive 页（自身在 archive 目录）为 ''
function buildArchiveLinks(currentDate, linkBase) {
  const dates = listReportDates(currentDate);
  const prefix = linkBase;
  return dates.map(d => {
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${d}T00:00:00Z`).getUTCDay()];
    const [, m, day] = d.split('-');
    const isCurrent = d === currentDate;
    const tag = isCurrent ? '<span class="tag">当前</span>' : '';
    return `<a class="report-item" href="${prefix}${d}.html" ${isCurrent ? 'aria-current="date"' : ''}><span class="date-badge">${m}-${day} ${weekday}</span><span class="report-info"><span class="report-title">每日综合报告 — ${d}</span><span class="report-desc">${tag}</span></span><span class="arrow">↗</span></a>`;
  }).join('');
}

// ========== 生成单日日报（dashboard 风格） ==========
// linkBase: ''=本页在 archive 目录；assetBase: ''=本页在 daily-merged 根目录（素材前缀）
function generateDaily(dateStr, { linkBase, assetBase }) {
  const panels = {};
  const panelStates = {};
  // 栏目内子标签容器：键为 dashboard.mjs 的视图名（market / legend）
  const subPanels = {};
  for (const src of SOURCES) {
    const panel = buildPanel(src, dateStr, assetBase);
    if (panel) { panels[src.id] = panel; panelStates[src.id] = reportStatus(src.fileName, dateStr); }
  }
  // 进化专栏为可选板块：存在 evolution.html 时内嵌，否则由模板给出占位空状态。
  const evolutionPanel = buildPanel(EVOLUTION_SOURCE, dateStr, assetBase);
  if (evolutionPanel) { panels[EVOLUTION_SOURCE.id] = evolutionPanel; panelStates[EVOLUTION_SOURCE.id] = reportStatus(EVOLUTION_SOURCE.fileName, dateStr); }

  // 传奇/英雄专栏：两个子标签——「监控」为当日产物 icons-heroes.html（须自带当日日期），
  // 「研究」为跨日期研究底稿（自带成稿日期，不参与当日日期校验）。全部缺稿时由模板给出如实空状态。
  const legendSubs = [];
  const iconsHeroesPanel = buildPanelByFile('icons-heroes.html', dateStr, assetBase);
  if (iconsHeroesPanel) legendSubs.push({ id: 'monitor', label: '传奇/英雄监控', html: iconsHeroesPanel });
  const researchPanel = buildIconResearchPanel(dateStr, assetBase);
  if (researchPanel) legendSubs.push({ id: 'research', label: '传奇卡研究', html: researchPanel });
  // 球员数据库三专栏（2026-09-20 重构新增）：传奇卡独立 / 英雄独立 / 周黑+活动卡+83+ 合一，
  // 由 render-database-columns.mjs 渲染 reports/daily/D/database-columns.html。
  const dbColumnsPanel = buildPanelByFile('database-columns.html', dateStr, assetBase);
  if (dbColumnsPanel) legendSubs.push({ id: 'dbcolumns', label: '球员数据库', html: dbColumnsPanel });
  if (legendSubs.length) {
    subPanels.legend = legendSubs;
    panels[LEGEND_SOURCE.id] = legendSubs[0].html;
    panelStates[LEGEND_SOURCE.id] = legendSubs[0].id === 'monitor'
      ? reportStatus('icons-heroes.html', dateStr) : 'ok';
  }

  // FC27 市场：保留原版布局 market.html 作为主视图，另加「市场扫描」与「关注列表」两个子标签。
  // 传奇/英雄相关内容已整体迁出至「传奇/英雄专栏」，此处不再收录。
  // 多份并存时用子标签切换；只有一份时直接作为该栏目内容，不显示多余的标签条。
  const marketSubs = [];
  const overviewPanel = buildPanelByFile('market.html', dateStr, assetBase);
  if (overviewPanel) marketSubs.push({ id: 'overview', label: '市场概览', html: overviewPanel });
  const scanPanel = buildPanelByFile('market-scan.html', dateStr, assetBase);
  if (scanPanel) marketSubs.push({ id: 'scan', label: '市场扫描', html: scanPanel });
  // 关注列表由「FC·市场价格关注列表（每4小时）」任务刷新的 reports/daily/D/market-watch.html 提供（热度 + 价格 + 本日挂单价变动）
  const watchPanel = buildPanelByFile('market-watch.html', dateStr, assetBase);
  if (watchPanel) marketSubs.push({ id: 'watch', label: '关注列表', html: watchPanel });
  if (marketSubs.length >= 2) subPanels.market = marketSubs;
  else if (marketSubs.length === 1) panels['market-analysis'] = marketSubs[0].html;
  else delete panels['market-analysis'];

  // FC26 球员回顾：离线常驻栏目，只要底稿存在即收录（无当日日期校验），跨日期一致。
  const fc26Panel = buildFc26ReviewPanel(assetBase);
  if (fc26Panel) { panels[FC26_SOURCE.id] = fc26Panel; panelStates[FC26_SOURCE.id] = 'ok'; }

  const archiveLinks = buildArchiveLinks(dateStr, linkBase);
  return dailyReport({ date: dateStr, panels, panelStates, archiveLinks, assetBase, subPanels });
}

// ========== 主流程 ==========
const dateStr = getDate(process.argv[2]);
console.log(`=== 每日综合报告合并（dashboard 单日日报）===`);
console.log(`日期: ${dateStr}`);

mkdirSync(ARCHIVE_DIR, { recursive: true });
const copiedAssets = ensureAssets(dateStr);
console.log(`共享资源已就位: daily-merged/assets（本轮新增/更新 ${copiedAssets} 个文件）`);
// 归并完成后立即清理报告目录里的副本：同一张图不再「报告目录 + 共享目录」各存一份。
// 判据是「共享目录已有同名同大小文件」，所以只能在归并之后做；`data/` 永不清理。
pruneReportAssets({ reportRoot: REPORT_ROOT, assetsDir: ASSETS_DIR, log: console.log });

// archive 页视角：本页位于 archive 目录，历史链接用同目录文件名，素材前缀 '../'
const archiveView = { linkBase: '', assetBase: '../' };
// index 页视角：本页位于 daily-merged 根目录，历史链接前缀 'archive/'，素材前缀 ''
const indexView = { linkBase: 'archive/', assetBase: '' };
// summary 页视角：本页位于 reports/daily/D/，回指 daily-merged/（上溯 3 级到项目根）
const summaryView = { linkBase: '../../../daily-merged/archive/', assetBase: '../../../daily-merged/' };

// 1. 生成当日日报 HTML（archive 视角，用于 daily-merged/archive/D.html）
const dailyHtml = generateDaily(dateStr, archiveView);

// 2. 写入 reports/daily/D/summary.html（当日日报快照，路径回指 daily-merged/）
const summaryPath = path.join(REPORT_ROOT, dateStr, 'summary.html');
mkdirSync(path.dirname(summaryPath), { recursive: true });
atomicWrite(summaryPath, generateDaily(dateStr, summaryView));
console.log(`当日日报已生成: ${summaryPath}`);

// 3. 写入 daily-merged/archive/D.html（历史日报独立归档）
const archivePath = path.join(ARCHIVE_DIR, `${dateStr}.html`);
atomicWrite(archivePath, dailyHtml);
console.log(`历史日报已归档: ${archivePath}`);

// 4. 生成 index.html（固定入口 = 当日日报内容，历史链接前缀 archive/）
const indexHtml = generateDaily(dateStr, indexView);
atomicWrite(path.join(MERGED_DIR, 'index.html'), indexHtml);
console.log(`固定入口已更新: daily-merged/index.html`);

// 5. 重建全部历史归档文件，使历史日报与最新版式保持一致（无有效板块时保留原文件，避免误清空）
//    同时刷新 reports/daily/<D>/summary.html 这份本地归档副本：它与 archive/<D>.html 是同一份内容
//    （只差素材前缀），若不同步，历史日报会长期滞留在「整篇内联 base64」的旧版式上，
//    继续占据大量本地磁盘（2026-09-20 实测 reports/daily 因此达 297 MB）。
let rebuilt = 0;
for (const d of listReportDates(dateStr)) {
  if (d === dateStr) continue;
  const target = path.join(ARCHIVE_DIR, `${d}.html`);
  try {
    const histHtml = generateDaily(d, archiveView);
    if (!histHtml.includes('<iframe class="panel-iframe"')) { console.log(`  跳过 ${d}: 无有效板块`); continue; }
    atomicWrite(target, histHtml);
    atomicWrite(path.join(REPORT_ROOT, d, 'summary.html'), generateDaily(d, summaryView));
    rebuilt++;
  } catch (e) {
    console.log(`  跳过 ${d}: ${e.message}`);
  }
}
console.log(`历史日报版式已统一: ${rebuilt} 篇（archive/<D>.html + reports/daily/<D>/summary.html）`);

const sizeMb = (Buffer.byteLength(indexHtml) / 1024 / 1024).toFixed(1);
console.log(`固定入口大小: ${sizeMb} MB`);
// 图片已改为共享资源目录的相对引用，index.html 只剩 HTML 文本（正常在 1 MB 量级）。
// 若仍显著偏大，说明有产物把图片内联回了页面（例如某渲染器自行 base64），应去该渲染器排查，
// 而不是靠压缩图片掩盖。
if (Number(sizeMb) > 5) console.warn(`⚠ 固定入口 ${sizeMb} MB 明显超过预期（共享资源模式应在 1 MB 量级）：请检查是否有产物自行内联了图片。`);
console.log(`历史日报链接数: ${listReportDates(dateStr).length}`);
console.log(`历史日报链接数: ${listReportDates(dateStr).length}`);
