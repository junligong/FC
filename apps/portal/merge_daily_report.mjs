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
 * 体积策略：index.html 只内嵌当日三板块，历史日报全部改为独立文件链接，
 *          避免 index 随历史日报数量无限膨胀，稳定控制在 50M 以内。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { dailyReport } from './dashboard.mjs';
import { themeReport } from '../../shared/presentation/report-theme.mjs';
import { root, reportDate, atomicWrite } from '../../shared/lib/runtime.mjs';
import { inlineLocalReportImages } from '../../shared/lib/report-assets.mjs';

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
const POSTER_SRC = path.join(BASE_DIR, 'apps', 'portal', 'assets', 'yanzu-banner.jpg');
const POSTER_NAME = 'yanzu-banner.jpg';

// ========== 日期处理 ==========
const getDate = reportDate;

// ========== 查找产出文件 ==========
function findReport(source, dateStr) {
  const fullPath = path.join(REPORT_ROOT, dateStr, source.fileName);
  if (existsSync(fullPath)) return fullPath;
  return null;
}

// 读取并处理单个报告：主题化 + 本地图片内联 + srcdoc 转义
function themedPanel(raw, baseDir) {
  if (!/<html[\s>]/i.test(raw) || !/<\/html>/i.test(raw)) return null;
  try {
    const themed = inlineLocalReportImages(themeReport(raw), baseDir);
    return themed.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  } catch {
    return null;
  }
}

// 读取并处理单个板块（当日产物必须自带当日日期，防止拿旧报告冒充当天内容）
function buildPanel(source, dateStr) {
  const reportPath = findReport(source, dateStr);
  if (!reportPath) return null;
  let raw;
  try {
    raw = readFileSync(reportPath, 'utf8');
  } catch {
    return null;
  }
  if (!raw.includes(dateStr)) return null;
  return themedPanel(raw, path.dirname(reportPath));
}

// 按文件名直接构建面板（用于栏目内子标签内容，如 market-scan.html）
function buildPanelByFile(fileName, dateStr) {
  return buildPanel({ id: fileName, fileName }, dateStr);
}

// 传奇卡研究：跨日期保留的常驻研究底稿（自带成稿日期，不参与当日日期校验）。
// 供给「传奇/英雄专栏」的「传奇卡研究」子标签（已从 FC27 市场栏迁出）。
// 优先使用当日同名产物 reports/daily/D/market-icons-research.html，否则回退到 icons/reports/ 下的底稿。
function buildIconResearchPanel(dateStr) {
  const candidates = [
    path.join(REPORT_ROOT, dateStr, 'market-icons-research.html'),
    // 逐小时「传奇卡研究」常驻底稿（FC26 开服价 vs FC27 当前价/最高价的实时投资建议，
    // 由 icons-pricerange-hourly 任务刷新）。放在静态预测底稿之前，保证往期日期也能看到最新研究。
    path.join(BASE_DIR, 'apps', 'market', 'engine', 'icons', 'reports', 'fc27-icon-live-research.html'),
    path.join(BASE_DIR, 'apps', 'market', 'engine', 'icons', 'reports', 'fc27-icon-analysis.html'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const panel = themedPanel(readFileSync(p, 'utf8'), path.dirname(p));
      if (panel) return panel;
    } catch { /* 读取失败则尝试下一个来源 */ }
  }
  return null;
}

// FC26 球员回顾：读项目内本地底稿并主题化。跨日期常驻（自带成稿口径，不参与当日日期校验），
// 底稿由 render-fc26-review.mjs 离线生成，缺失时返回 null 交由模板给出如实空状态。
function buildFc26ReviewPanel() {
  const p = path.join(BASE_DIR, FC26_SOURCE.file);
  if (!existsSync(p)) return null;
  try {
    return themedPanel(readFileSync(p, 'utf8'), path.dirname(p));
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

// 确保海报等共享资源已就位（从 apps/portal/assets 复制到 daily-merged/assets）
function ensureAssets(dateStr) {
  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
  if (existsSync(POSTER_SRC)) {
    const target = path.join(ASSETS_DIR, POSTER_NAME);
    try { copyFileSync(POSTER_SRC, target); } catch { /* 已存在或无权限时忽略 */ }
  }
  // 运行时行情资源：各市场页面在加载/刷新时统一读取这一份 current.json。
  const currentSrc = path.join(REPORT_ROOT, dateStr, 'assets', 'data', 'current.json');
  if (existsSync(currentSrc)) {
    const target = path.join(ASSETS_DIR, 'data', 'current.json');
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(currentSrc, target);
  }
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
    const panel = buildPanel(src, dateStr);
    if (panel) { panels[src.id] = panel; panelStates[src.id] = reportStatus(src.fileName, dateStr); }
  }
  // 进化专栏为可选板块：存在 evolution.html 时内嵌，否则由模板给出占位空状态。
  const evolutionPanel = buildPanel(EVOLUTION_SOURCE, dateStr);
  if (evolutionPanel) { panels[EVOLUTION_SOURCE.id] = evolutionPanel; panelStates[EVOLUTION_SOURCE.id] = reportStatus(EVOLUTION_SOURCE.fileName, dateStr); }

  // 传奇/英雄专栏：两个子标签——「监控」为当日产物 icons-heroes.html（须自带当日日期），
  // 「研究」为跨日期研究底稿（自带成稿日期，不参与当日日期校验）。全部缺稿时由模板给出如实空状态。
  const legendSubs = [];
  const iconsHeroesPanel = buildPanelByFile('icons-heroes.html', dateStr);
  if (iconsHeroesPanel) legendSubs.push({ id: 'monitor', label: '传奇/英雄监控', html: iconsHeroesPanel });
  const researchPanel = buildIconResearchPanel(dateStr);
  if (researchPanel) legendSubs.push({ id: 'research', label: '传奇卡研究', html: researchPanel });
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
  const overviewPanel = buildPanelByFile('market.html', dateStr);
  if (overviewPanel) marketSubs.push({ id: 'overview', label: '市场概览', html: overviewPanel });
  const scanPanel = buildPanelByFile('market-scan.html', dateStr);
  if (scanPanel) marketSubs.push({ id: 'scan', label: '市场扫描', html: scanPanel });
  // 关注列表由每小时任务刷新的 reports/daily/D/market-watch.html 提供（热度 + 价格 + 本日挂单价变动）
  const watchPanel = buildPanelByFile('market-watch.html', dateStr);
  if (watchPanel) marketSubs.push({ id: 'watch', label: '关注列表', html: watchPanel });
  if (marketSubs.length >= 2) subPanels.market = marketSubs;
  else if (marketSubs.length === 1) panels['market-analysis'] = marketSubs[0].html;
  else delete panels['market-analysis'];

  // FC26 球员回顾：离线常驻栏目，只要底稿存在即收录（无当日日期校验），跨日期一致。
  const fc26Panel = buildFc26ReviewPanel();
  if (fc26Panel) { panels[FC26_SOURCE.id] = fc26Panel; panelStates[FC26_SOURCE.id] = 'ok'; }

  const archiveLinks = buildArchiveLinks(dateStr, linkBase);
  return dailyReport({ date: dateStr, panels, panelStates, archiveLinks, assetBase, subPanels });
}

// ========== 主流程 ==========
const dateStr = getDate(process.argv[2]);
console.log(`=== 每日综合报告合并（dashboard 单日日报）===`);
console.log(`日期: ${dateStr}`);

mkdirSync(ARCHIVE_DIR, { recursive: true });
ensureAssets(dateStr);

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
let rebuilt = 0;
for (const d of listReportDates(dateStr)) {
  if (d === dateStr) continue;
  const target = path.join(ARCHIVE_DIR, `${d}.html`);
  try {
    const histHtml = generateDaily(d, archiveView);
    if (!histHtml.includes('<iframe class="panel-iframe"')) { console.log(`  跳过 ${d}: 无有效板块`); continue; }
    atomicWrite(target, histHtml);
    rebuilt++;
  } catch (e) {
    console.log(`  跳过 ${d}: ${e.message}`);
  }
}
console.log(`历史日报版式已统一: ${rebuilt} 篇`);

const sizeMb = (Buffer.byteLength(indexHtml) / 1024 / 1024).toFixed(1);
console.log(`固定入口大小: ${sizeMb} MB`);
// index 体积只由「当日」三个板块决定（几乎全部是当日资讯的内嵌图片），
// 与历史日报数量无关（历史日报是独立文件，此处只放链接）。
if (Number(sizeMb) > 50) console.warn(`⚠ 固定入口 ${sizeMb} MB 已超过 50MB 目标：主因是当日资讯内嵌图片过多，请在资讯侧压缩或减少内嵌图片后重跑。`);
console.log(`历史日报链接数: ${listReportDates(dateStr).length}`);
