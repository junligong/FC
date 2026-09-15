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
  { id: 'market-analysis', title: 'FC27 市场分析', icon: '📊', fileName: 'market.html', desc: '双维度：价格分层（大卡/中卡/热门卡/适用卡）× 热门球员（进化卡/价值卡）' },
];

// 进化专栏：独立于三个主板块，作为首页右栏 / 独立视图的可选内容源。
// 由后续进化任务写入 reports/daily/D/evolution.html；未就绪时如实显示空状态。
const EVOLUTION_SOURCE = { id: 'evolution-column', title: '进化专栏', fileName: 'evolution.html' };

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

// 读取并处理单个板块：主题化 + 本地图片内联 + srcdoc 转义
function buildPanel(source, dateStr) {
  const reportPath = findReport(source, dateStr);
  if (!reportPath) return null;
  let raw;
  try {
    raw = readFileSync(reportPath, 'utf8');
  } catch {
    return null;
  }
  if (!/<html[\s>]/i.test(raw) || !/<\/html>/i.test(raw) || !raw.includes(dateStr)) return null;
  try {
    const themed = inlineLocalReportImages(themeReport(raw), path.dirname(reportPath));
    return themed.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  } catch {
    return null;
  }
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
function ensureAssets() {
  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
  if (existsSync(POSTER_SRC)) {
    const target = path.join(ASSETS_DIR, POSTER_NAME);
    try { copyFileSync(POSTER_SRC, target); } catch { /* 已存在或无权限时忽略 */ }
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
  for (const src of SOURCES) {
    const panel = buildPanel(src, dateStr);
    if (panel) panels[src.id] = panel;
  }
  // 进化专栏为可选板块：存在 evolution.html 时内嵌，否则由模板给出占位空状态。
  const evolutionPanel = buildPanel(EVOLUTION_SOURCE, dateStr);
  if (evolutionPanel) panels[EVOLUTION_SOURCE.id] = evolutionPanel;
  const archiveLinks = buildArchiveLinks(dateStr, linkBase);
  return dailyReport({ date: dateStr, panels, archiveLinks, assetBase });
}

// ========== 主流程 ==========
const dateStr = getDate(process.argv[2]);
console.log(`=== 每日综合报告合并（dashboard 单日日报）===`);
console.log(`日期: ${dateStr}`);

mkdirSync(ARCHIVE_DIR, { recursive: true });
ensureAssets();

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
console.log(`历史日报链接数: ${listReportDates(dateStr).length}`);
