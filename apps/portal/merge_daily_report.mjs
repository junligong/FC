#!/usr/bin/env node
/**
 * 每日综合报告合并脚本（v3 - iframe srcdoc 单文件版）
 * 功能：读取 FC27资讯、足球日报、FC27市场分析 三个任务的当日 HTML 产出，
 *       合并为一个带 Tab 切换的独立单文件网页，iframe srcdoc 隔离各板块样式。
 *
 * 用法：node merge_daily_report.mjs [YYYY-MM-DD]
 *   不传日期则默认使用当天日期
 *
 * 产出路径：/Users/wuyanzu/Desktop/FC/reports/daily/YYYY-MM-DD/summary.html
 * 特性：单文件、无需外部文件依赖、任何设备都能正常显示
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { dashboard } from './dashboard.mjs';
import { themeReport } from '../../shared/presentation/report-theme.mjs';
import { root, reportDate, atomicWrite } from '../../shared/lib/runtime.mjs';

// ========== 配置 ==========
const BASE_DIR = root;

const SOURCES = [
  {
    id: 'fc27-news',
    title: 'FC27 资讯雷达',
    icon: '📡',
    desc: 'X.com 16个信息源自动采集，智能过滤翻译',
    fileName: 'news.html',
    color: '#1d9bf0',
    accentBg: 'rgba(29,155,240,.12)',
  },
  {
    id: 'football-daily',
    title: '足球资讯日报',
    icon: '⚽',
    desc: '七大联赛+欧冠，积分榜/射手榜/助攻榜全覆盖',
    fileName: 'football.html',
    color: '#c41e3a',
    accentBg: 'rgba(196,30,58,.12)',
  },
  {
    id: 'market-analysis',
    title: 'FC27 市场分析',
    icon: '📊',
    desc: 'FUTBIN 市场扫描，8大板块交易策略',
    fileName: 'market.html',
    color: '#00d4aa',
    accentBg: 'rgba(0,212,170,.12)',
  },
];

const OUTPUT_DIR = `${BASE_DIR}/daily-merged`;
const REPORT_ROOT = `${BASE_DIR}/reports/daily`;

// ========== 日期处理 ==========
const getDate = reportDate;

// ========== 查找产出文件 ==========
function findReport(source, dateStr) {
  const fullPath = path.join(REPORT_ROOT, dateStr, source.fileName);
  if (existsSync(fullPath)) return fullPath;


  return null;
}

// ========== 生成占位内容 ==========
function generatePlaceholder(source, dateStr) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;padding:40px;text-align:center">
      <div style="font-size:64px;margin-bottom:20px;opacity:.3">${source.icon}</div>
      <h3 style="font-size:20px;font-weight:600;color:var(--text2);margin-bottom:8px">${source.title}</h3>
      <p style="color:var(--text3);font-size:14px;max-width:400px;line-height:1.6">
        尚未找到 ${dateStr} 的有效报告。<br>
        可能尚未生成、文件不完整、执行失败或任务未启用；请查看运行记录。
      </p>
      <div style="margin-top:16px;padding:6px 14px;border-radius:20px;font-size:12px;background:rgba(210,153,34,.12);color:#d29922">
        ○ 暂无当日报告
      </div>
    </div>
  `;
}

// ========== 生成合并HTML ==========
function generateMergedHtml(sources, dateStr) {
  // 先检查各源是否有数据
  const stats = sources.map(src => {
    const reportPath = findReport(src, dateStr);
    let content = null;
    if (reportPath) {
      try { const raw = readFileSync(reportPath, 'utf8'); if (/<html[\s>]/i.test(raw) && /<\/html>/i.test(raw) && raw.includes(dateStr)) content = raw; } catch {}
    }
    console.log(`  ${src.title}: ${content !== null ? '有效报告' : reportPath ? '文件存在但内容校验失败' : '无当日报告'}`);
    return { ...src, hasData: content !== null, reportPath, content };
  });
  const dataCount = stats.filter(s => s.hasData).length;
  const pausedCount = stats.length - dataCount;

  // 生成 iframe 嵌入的 sections
  const sections = stats.map((src, idx) => {
    const reportPath = src.reportPath;
    const hasData = src.hasData;

    const statusBadge = hasData
      ? `<span class="section-status section-status-ok">● 有数据</span>`
      : `<span class="section-status section-status-paused">○ 待生成</span>`;

    // 生成"在新窗口打开"链接（指向原始子报告文件）
    const sourceLink = ''; // All content stays inside the unified portal.

    // 读取子HTML完整内容，用 base64 data URL 避免 srcdoc 转义问题
    let srcdocContent = null;
    if (hasData && reportPath) {
      try {
        const raw = themeReport(src.content);
        srcdocContent = Buffer.from(raw, 'utf8').toString('base64');
      } catch (e) {
        srcdocContent = null;
      }
    }

    const innerContent = srcdocContent
      ? `<iframe class="panel-iframe" src="data:text/html;charset=utf-8;base64,${srcdocContent}" title="${src.title}" loading="lazy"></iframe>`
      : generatePlaceholder(src, dateStr);

    return `
      <section class="tab-panel ${idx === 0 ? 'active' : ''}" id="panel-${src.id}" data-panel="${idx}" data-status="${hasData ? 'available' : 'missing'}">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <span class="panel-icon">${src.icon}</span>
            <div>
              <div class="panel-title">${src.title}</div>
              <div class="panel-desc">${src.desc}</div>
            </div>
          </div>
          <div class="panel-actions">
            ${statusBadge}
            ${sourceLink}
          </div>
        </div>
        <div class="panel-body">
          ${innerContent}
        </div>
      </section>
    `;
  }).join('\n');

  const tabs = stats.map((src, idx) => `
    <button class="tab-btn ${idx === 0 ? 'active' : ''}" data-tab="${idx}" data-source="${src.id}">
      <span class="tab-icon">${src.icon}</span>
      <span class="tab-label">${src.title}</span>
      <span class="tab-dot ${src.hasData ? 'tab-dot-ok' : 'tab-dot-paused'}"></span>
    </button>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>每日综合报告 - ${dateStr}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface2: #1c2330;
    --border: #30363d;
    --text: #e6edf3;
    --text2: #8b949e;
    --text3: #6e7681;
    --green: #3fb950;
    --amber: #d29922;
    --blue: #58a6ff;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* ===== Header ===== */
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 20px 24px;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .header-inner {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  .header-left h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -.5px;
    color: var(--text);
  }
  .header-left .date {
    font-size: 13px;
    color: var(--text3);
    margin-top: 2px;
  }
  .header-right {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .header-stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text2);
  }
  .header-stat .num {
    font-size: 18px;
    font-weight: 700;
  }
  .header-stat .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  /* ===== Tabs ===== */
  .tabs-container {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    position: sticky;
    top: 65px;
    z-index: 99;
  }
  .tabs {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--text2);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all .2s;
    white-space: nowrap;
    font-family: inherit;
  }
  .tab-btn:hover {
    color: var(--text);
    background: rgba(255,255,255,.03);
  }
  .tab-btn.active {
    color: var(--text);
    border-bottom-color: var(--blue);
  }
  .tab-icon { font-size: 18px; }
  .tab-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .tab-dot-ok { background: var(--green); }
  .tab-dot-paused { background: var(--amber); }

  /* ===== Tab Panels ===== */
  .panels-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0;
  }
  .tab-panel {
    display: none;
  }
  .tab-panel.active {
    display: block;
    animation: fadeIn .3s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== Panel Header ===== */
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .panel-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .panel-icon {
    font-size: 24px;
  }
  .panel-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .panel-desc {
    font-size: 13px;
    color: var(--text3);
  }
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .section-status {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 20px;
    font-weight: 500;
  }
  .section-status-ok {
    background: rgba(63,185,80,.12);
    color: var(--green);
  }
  .section-status-paused {
    background: rgba(210,153,34,.12);
    color: var(--amber);
  }
  .section-link {
    font-size: 13px;
    color: var(--blue);
    text-decoration: none;
    padding: 4px 10px;
    border: 1px solid rgba(88,166,255,.3);
    border-radius: 6px;
    transition: all .2s;
  }
  .section-link:hover {
    background: rgba(88,166,255,.1);
    border-color: var(--blue);
  }

  /* ===== Panel Body (iframe) ===== */
  .panel-body {
    background: var(--bg);
    min-height: 500px;
  }
  .panel-iframe {
    width: 100%;
    height: calc(100vh - 140px);
    min-height: 600px;
    border: none;
    display: block;
  }

  /* ===== Footer ===== */
  .footer {
    text-align: center;
    padding: 20px;
    color: var(--text3);
    font-size: 13px;
    border-top: 1px solid var(--border);
    margin-top: 0;
  }

  /* ===== Responsive ===== */
  @media (max-width: 768px) {
    .header-inner { flex-direction: column; align-items: flex-start; }
    .header-right { flex-wrap: wrap; }
    .tab-btn { padding: 10px 14px; font-size: 13px; }
    .tab-label { display: none; }
    .panel-header { flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 16px; }
    .panel-iframe { height: calc(100vh - 160px); }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-inner">
    <div class="header-left">
      <h1>📋 每日综合报告</h1>
      <div class="date">${dateStr} · 自动生成</div>
    </div>
    <div class="header-right">
      <div class="header-stat">
        <span class="dot" style="background:var(--green)"></span>
        <span class="num" style="color:var(--green)">${dataCount}</span>
        <span>有数据</span>
      </div>
      <div class="header-stat">
        <span class="dot" style="background:var(--amber)"></span>
        <span class="num" style="color:var(--amber)">${pausedCount}</span>
        <span>暂无报告</span>
      </div>
    </div>
  </div>
</div>

<!-- Tabs -->
<div class="tabs-container">
  <div class="tabs">
    ${tabs}
  </div>
</div>

<!-- Panels -->
<div class="panels-container">
  ${sections}
</div>

<!-- Footer -->
<div class="footer">
  DuMate 每日综合报告 · ${dateStr} · 共 ${sources.length} 个板块 · ${dataCount} 个有数据
</div>

<script>
  // Tab 切换逻辑
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.source).classList.add('active');
    });
  });

  // 键盘快捷键: 1/2/3 切换
  document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '${sources.length}') {
      const idx = parseInt(e.key) - 1;
      if (tabBtns[idx]) tabBtns[idx].click();
    }
  });

  // URL hash 支持直接访问某个板块
  function activateFromHash() {
    const hash = window.location.hash.slice(1);
    const source = document.querySelector('[data-source="' + hash + '"]');
    if (source) {
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      source.classList.add('active');
      document.getElementById('panel-' + hash).classList.add('active');
    }
  }
  if (window.location.hash) activateFromHash();
  window.addEventListener('hashchange', activateFromHash);
</script>

</body>
</html>`;
}

// ========== 主流程 ==========
const dateArg = process.argv[2];
const dateStr = getDate(dateArg);

console.log(`=== 每日综合报告合并 ===`);
console.log(`日期: ${dateStr}`);

// 创建输出目录
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 生成合并HTML
const html = generateMergedHtml(SOURCES, dateStr);
const outputFile = path.join(REPORT_ROOT, dateStr, 'summary.html');
atomicWrite(outputFile, html);

console.log(`\n合并报告已生成: ${outputFile}`);
console.log(`文件大小: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);

// ========== 自动更新索引页 ==========
const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];

function generateIndexPage() {
  // 扫描 reports/daily/YYYY-MM-DD/summary.html，最新日期在前。
  const files = readdirSync(REPORT_ROOT)
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && existsSync(path.join(REPORT_ROOT, date, 'summary.html')))
    .sort().reverse()
    .map(date => `daily-report-${date}.html`);

  const items = files.map(f => {
    const dateMatch = f.match(/daily-report-(\d{4})-(\d{2})-(\d{2})\.html/);
    if (!dateMatch) return null;
    const [, y, m, d] = dateMatch;
    const dateStr = `${y}-${m}-${d}`;
    const dateObj = new Date(`${y}-${m}-${d}T00:00:00+08:00`);
    const weekday = WEEKDAYS[new Date(`${y}-${m}-${d}T00:00:00Z`).getUTCDay()] || '';
    const filePath = path.join(REPORT_ROOT, dateStr, 'summary.html');

    // 尝试读取文件内容，检测各板块状态
    let hasNews = false, hasFootball = false, hasMarket = false;
    let newsCount = '', footballCount = '';
    try {
      const raw = readFileSync(filePath, 'utf8');
      const available = id => {
        const section = raw.match(new RegExp(`<section[^>]*id="panel-${id}"[\\s\\S]*?</section>`));
        return !!section && /<iframe\b/.test(section[0]);
      };
      hasNews = available('fc27-news');
      hasFootball = available('football-daily');
      hasMarket = available('market-analysis');

      // 尝试提取新闻条数
      const newsMatch = raw.match(/(\d+)\s*条/);
      if (newsMatch) newsCount = newsMatch[1] + '条';
    } catch(e) {}

    const tags = [];
    let descParts = [];
    if (hasNews) { tags.push('<span class="tag tag-news">📡 资讯</span>'); }
    if (hasFootball) { tags.push('<span class="tag tag-football">⚽ 足球</span>'); }
    if (hasMarket) {
      tags.push('<span class="tag tag-market">📊 市场</span>');
    } else {
      tags.push('<span class="tag tag-paused">📊 暂无报告</span>');
    }

    return `    <a class="report-item" href="#report-${dateStr}" data-report="${dateStr}">
      <div class="date-badge">${m}-${d} ${weekday}</div>
      <div class="report-info">
        <div class="report-title">每日综合报告 — ${y}年${parseInt(m)}月${parseInt(d)}日</div>
        <div class="report-desc">${descParts.join(' · ') || '综合日报'}</div>
      </div>
      <div class="tags">${tags.join('')}</div>
      <div class="arrow">↗</div>
    </a>`;
  }).filter(Boolean);

  const embeddedReports = Object.fromEntries(files.map(file => { const date=file.slice(13,23); return [date, Buffer.from(readFileSync(path.join(REPORT_ROOT,date,'summary.html'),'utf8')).toString('base64')]; }));
  const latestDate = files[0]?.match(/daily-report-(\d{4}-\d{2}-\d{2})/)?.[1] || '—';
  const standaloneIndex = dashboard({root: BASE_DIR, latestDate, files, embeddedReports, items});
  const indexPath = path.join(OUTPUT_DIR, 'index.html');
  atomicWrite(indexPath, standaloneIndex);
  console.log(`\n索引页已更新: ${indexPath}`);
  console.log(`共 ${files.length} 篇报告`);
}

generateIndexPage();
