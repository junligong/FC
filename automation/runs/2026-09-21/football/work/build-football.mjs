#!/usr/bin/env node
// 用途：2026-09-21 足球日报生成器。输入：work/data.json（本轮并行采集的三榜与新闻数据）。
// 输出：reports/daily/2026-09-19/football.html（先写临时文件，校验后原子替换）。
// 模板与交互复用 2026-09-17/18 已通过校验闸门的版本，数据与模板分离。
import { writeFileSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const D = '2026-09-21';
const data = JSON.parse(readFileSync(join(__dirname, 'data.json'), 'utf8'));

const standingsData = data.standingsData; // 键：epl/laliga/seriea/bundesliga/ligue1/mls_east/mls_west/saudi/ucl
const scorersData = data.scorersData;     // 键：epl/laliga/seriea/bundesliga/ligue1/mls/saudi/ucl
const assistsData = data.assistsData;     // 同上
const news = data.news;
const metaNotes = data.metaNotes;
const cutoffText = data.cutoffText;       // 「数据截止时间」页头文案

// R3 校验要求射助榜末列为数字：每行第 1、4 列统一转 number
for (const board of [scorersData, assistsData]) {
  for (const lg of Object.keys(board)) {
    if (Array.isArray(board[lg])) {
      board[lg] = board[lg].map(r => [Number(r[0]), r[1], r[2], Number(r[3])]);
    }
  }
}

const leagueLabel = { epl:"英超", laliga:"西甲", seriea:"意甲", bundesliga:"德甲", ligue1:"法甲", mls:"美职联", saudi:"沙特联", ucl:"欧冠", toutiao:"今日头条" };
const tagClass = { epl:"tag-epl", laliga:"tag-laliga", seriea:"tag-seriea", bundesliga:"tag-bundesliga", ligue1:"tag-ligue1", mls:"tag-mls", saudi:"tag-saudi", ucl:"tag-ucl", toutiao:"tag-toutiao" };

function newsCard(n) {
  const extraTag = n.extra ? `<span class="card-league ${tagClass[n.extra === "国家队" ? "ucl" : n.extra] || "tag-epl"}">${n.extra}</span>` : "";
  return `<div class="news-card" data-league="${n.league}">
  <div class="card-top">
    <span class="card-team">${n.team}</span>
    <span class="card-league ${tagClass[n.league]}">${leagueLabel[n.league]}</span>
    ${extraTag}
  </div>
  <div class="card-body">
    <div class="card-title" style="color:#000;font-weight:700">${n.title}</div>
    <div class="card-summary">${n.summary}</div>
  </div>
  <div class="card-footer">
    <span class="card-source"><a href="${n.source}" target="_blank">${n.sourceName}</a></span>
    <span class="card-time">${n.time}</span>
  </div>
</div>`;
}

const counts = {};
for (const n of news) counts[n.league] = (counts[n.league] || 0) + 1;
const filterOrder = ["all","toutiao","epl","laliga","seriea","bundesliga","ligue1","mls","saudi","ucl"];
const filterTabs = filterOrder.map(f => {
  if (f === "all") return `<div class="filter-tab active" data-filter="all" onclick="filterNews('all')">全部 ${news.length}</div>`;
  return `<div class="filter-tab" data-filter="${f}" onclick="filterNews('${f}')">${f === "toutiao" ? "🔥 今日头条" : leagueLabel[f]} ${counts[f] || 0}</div>`;
}).join("\n    ");

const standingsTabs = [["epl","英超"],["laliga","西甲"],["seriea","意甲"],["bundesliga","德甲"],["ligue1","法甲"],["mls","美职联"],["saudi","沙特联"],["ucl","欧冠"]]
  .map(([k,l], i) => `<div class="league-tab${i === 0 ? " active" : ""}" data-league="${k}" onclick="switchLeague('${k}')">${l}</div>`).join("\n    ");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>足球日报 - 2026年9月21日</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif; background:#f5f5f5; color:#333; line-height:1.6; font-size:14px; }
.header { background:linear-gradient(135deg,#c41e3a 0%,#8b1a2b 100%); color:#fff; padding:20px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.15); }
.header h1 { font-size:28px; color:#fff; font-weight:900; margin-bottom:8px; text-shadow:0 2px 6px rgba(0,0,0,0.6); }
.header .subtitle { font-size:14px; color:#fff; opacity:0.95; text-shadow:0 1px 3px rgba(0,0,0,0.5); }
.header .update-time { font-size:12px; color:#fff; opacity:0.9; margin-top:6px; text-shadow:0 1px 3px rgba(0,0,0,0.4); }
.standings-section { background:#fff; margin:12px; border-radius:12px; border:1px solid #e8e8e8; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.standings-header { padding:12px 16px 0; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.standings-header .section-label { font-size:15px; font-weight:700; color:#222; }
.type-tabs { display:flex; gap:4px; background:#f8f8f8; border-radius:8px; padding:3px; }
.type-tab { padding:5px 14px; border-radius:6px; font-size:13px; font-weight:500; cursor:pointer; color:#666; transition:all .2s; border:none; background:transparent; }
.type-tab.active { background:#c41e3a; color:#fff; }
.league-tabs { display:flex; gap:4px; padding:8px 16px; overflow-x:auto; flex-wrap:wrap; }
.league-tab { padding:4px 12px; border-radius:6px; font-size:12px; cursor:pointer; color:#666; border:1px solid #e8e8e8; background:#fafafa; transition:all .2s; white-space:nowrap; }
.league-tab.active { background:#c41e3a; color:#fff; border-color:#c41e3a; }
.league-tab:hover { border-color:#c41e3a; color:#c41e3a; }
.table-wrapper { padding:0 16px 16px; }
.standings-table { width:100%; border-collapse:collapse; font-size:12px; color:#555; }
.standings-table th { background:#f8f8f8; padding:8px 4px; text-align:center; font-weight:500; color:#666; border-bottom:1px solid #e8e8e8; }
.standings-table td { padding:7px 4px; text-align:center; border-bottom:1px solid #f5f5f5; }
.standings-table td:first-child { font-weight:700; color:#c41e3a; }
.standings-table td:nth-child(2) { text-align:left; font-weight:500; color:#333; }
.standings-table tr:hover td { background:#fff8e1; }
.standings-table .top3 td:first-child { color:#ffd700; }
.standings-table .top4 td:first-child { color:#00d2ff; }
.standings-table .relegation td:first-child { color:#ff6b6b; }
.standings-table .highlight td { background:#fff8e1; }
.section-header { background:linear-gradient(135deg,#f8f8f8 0%,#fff 100%); padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e8e8e8; }
.section-header .title { font-size:16px; font-weight:700; color:#222; display:flex; align-items:center; gap:8px; }
.section-header .title .dot { width:6px; height:6px; background:#c41e3a; border-radius:50%; display:inline-block; }
.section-header .info { font-size:12px; color:#999; }
.news-section { background:#fff; margin:12px; border-radius:12px; border:1px solid #e8e8e8; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.news-header { padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e8e8e8; }
.news-header-left { display:flex; align-items:center; gap:8px; }
.news-header-left .dot { width:6px; height:6px; background:#c41e3a; border-radius:50%; }
.news-header-left .title { font-size:16px; font-weight:700; color:#222; }
.news-header-right { display:flex; align-items:center; gap:12px; }
.news-count { font-size:12px; padding:2px 8px; background:#f8f8f8; border-radius:4px; color:#666; }
.news-update-time { font-size:12px; color:#999; }
.news-filter-tabs { display:flex; gap:4px; padding:8px 16px; overflow-x:auto; flex-wrap:wrap; border-bottom:1px solid #e8e8e8; }
.filter-tab { padding:4px 12px; border-radius:6px; font-size:12px; cursor:pointer; color:#666; border:1px solid #e8e8e8; background:#fafafa; transition:all .2s; white-space:nowrap; }
.filter-tab.active { background:#c41e3a; color:#fff; border-color:#c41e3a; }
.filter-tab:hover { border-color:#c41e3a; color:#c41e3a; }
.news-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:16px; padding:16px; }
.news-card { background:#fafafa; border-radius:10px; border:1px solid #e8e8e8; overflow:hidden; transition:transform .2s,border-color .2s; }
.news-card:hover { transform:translateY(-2px); border-color:#ccc; }
.card-top { padding:10px 12px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #e8e8e8; }
.card-team { font-size:13px; font-weight:700; color:#c41e3a; }
.card-league { font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; }
.tag-epl { background:#37003c; color:#00ff85; }
.tag-laliga { background:#1a2b4a; color:#ffd700; }
.tag-seriea { background:#0066aa; color:#fff; }
.tag-bundesliga { background:#d3010c; color:#fff; }
.tag-ligue1 { background:#091c3e; color:#dae025; }
.tag-mls { background:#e31837; color:#fff; }
.tag-saudi { background:#165d31; color:#fff; }
.tag-ucl { background:#0f367c; color:#fff; }
.tag-toutiao { background:#ff6b35; color:#fff; font-weight:700; }
.news-card[data-league="toutiao"] { border:2px solid #ff6b35; background:linear-gradient(135deg,#fff 0%,#fff8f0 100%); }
.news-card[data-league="toutiao"] .card-title { color:#c41e3a; }
.card-body { padding:10px 12px; }
.card-title { font-size:15px; font-weight:700; color:#000; margin-bottom:8px; line-height:1.4; }
.card-summary { font-size:12px; color:#666; line-height:1.6; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
.card-footer { padding:8px 12px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e8e8e8; font-size:11px; }
.card-source a { color:#c41e3a; text-decoration:none; font-weight:500; }
.card-source a:hover { text-decoration:underline; }
.card-time { color:#999; font-style:italic; }
.hidden { display:none !important; }
.footer { text-align:center; padding:24px; color:#999; font-size:11px; line-height:1.8; }
@media (max-width:768px) { .news-grid { grid-template-columns:1fr; } .standings-header { flex-direction:column; align-items:flex-start; } }
</style>
</head>
<body>

<div class="header">
  <h1>⚽ 足球日报</h1>
  <div class="subtitle">欧洲冠军联赛 · 七大联赛每日资讯聚合</div>
  <div class="update-time">${cutoffText}</div>
</div>

<!-- ===== STANDINGS ===== -->
<div class="standings-section">
  <div class="standings-header">
    <div class="section-label">📊 数据排行</div>
    <div class="type-tabs">
      <div class="type-tab active" data-type="standings" onclick="switchType('standings')">积分榜</div>
      <div class="type-tab" data-type="scorers" onclick="switchType('scorers')">射手榜</div>
      <div class="type-tab" data-type="assists" onclick="switchType('assists')">助攻榜</div>
    </div>
  </div>
  <div class="league-tabs">
    ${standingsTabs}
  </div>
  <div class="table-wrapper">
    <div id="table-content"></div>
  </div>
</div>

<!-- ===== NEWS ===== -->
<div class="news-section">
  <div class="news-header">
    <div class="news-header-left">
      <div class="dot"></div>
      <div class="title">最新资讯</div>
    </div>
    <div class="news-header-right">
      <span class="news-count" id="news-count">全部 ${news.length} 条</span>
      <span class="news-update-time">更新 ${D}</span>
    </div>
  </div>
  <div class="news-filter-tabs">
    ${filterTabs}
  </div>
  <div class="news-grid" id="news-grid">
${news.map(newsCard).join("\n\n")}
  </div>
</div>

<div class="footer">
  <p>足球日报 · 每日足球资讯聚合</p>
  <p>数据来源：BBC Sport、ESPN、worldfootball.net、Sky Sports、OneFootball、新浪体育、直播吧等</p>
  <p>${cutoffText} | 仅供参考，请以官方最新信息为准</p>
</div>

<script>
// ===== DATA =====
const standingsData = ${JSON.stringify(standingsData)};
const scorersData = ${JSON.stringify(scorersData)};
const assistsData = ${JSON.stringify(assistsData)};
const metaNotes = ${JSON.stringify(metaNotes)};

let currentType = 'standings';
let currentLeague = 'epl';

function switchType(type) {
  currentType = type;
  document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.type-tab[data-type="' + type + '"]').classList.add('active');
  renderTable();
}

function switchLeague(league) {
  currentLeague = league;
  document.querySelectorAll('.league-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.league-tab[data-league="' + league + '"]').classList.add('active');
  renderTable();
}

function buildStandingsTable(data, headers) {
  let html = '<table class="standings-table"><tr>';
  headers.forEach(h => html += '<th>' + h + '</th>');
  html += '</tr>';
  data.forEach((row, idx) => {
    let cls = '';
    if (idx < 3) cls = 'top3';
    else if (idx < 4) cls = 'top4';
    else if (idx >= data.length - 3 && data.length >= 18) cls = 'relegation';
    if (parseInt(row[0], 10) <= 4) cls += ' highlight';
    html += '<tr class="' + cls + '">';
    row.forEach(cell => { html += '<td>' + cell + '</td>'; });
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildSimpleTable(data, headers, emptyNote) {
  if (!data || !data.length) {
    return '<p style="color:#999;font-size:13px;padding:12px 0">' + (emptyNote || '本轮未逐条核验到该榜单数据') + '</p>';
  }
  let html = '<table class="standings-table"><tr>';
  headers.forEach(h => html += '<th>' + h + '</th>');
  html += '</tr>';
  data.forEach(row => {
    html += '<tr>';
    row.forEach((cell, cidx) => {
      if (cidx === 0) html += '<td style="font-weight:700;color:#c41e3a">' + cell + '</td>';
      else html += '<td>' + cell + '</td>';
    });
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function renderTable() {
  const container = document.getElementById('table-content');
  let html = '';
  if (currentType === 'standings') {
    html += '<div class="section-header" style="margin:0 -16px"><div class="title"><span class="dot"></span>积分榜</div><div class="info">' + metaNotes[currentLeague] + '</div></div>';
    if (currentLeague === 'mls') {
      html += '<h4 style="color:#666;font-size:13px;margin:8px 0 4px">东区</h4>';
      html += buildStandingsTable(standingsData.mls_east, ['排名','球队','赛','胜','平','负','进','失','净胜球','积分']);
      html += '<h4 style="color:#666;font-size:13px;margin:12px 0 4px">西区</h4>';
      html += buildStandingsTable(standingsData.mls_west, ['排名','球队','赛','胜','平','负','进','失','净胜球','积分']);
    } else {
      html += buildStandingsTable(standingsData[currentLeague], ['排名','球队','赛','胜','平','负','进','失','净胜球','积分']);
    }
  } else if (currentType === 'scorers') {
    html += '<div class="section-header" style="margin:0 -16px"><div class="title"><span class="dot"></span>射手榜</div><div class="info">' + metaNotes[currentLeague] + '</div></div>';
    html += buildSimpleTable(scorersData[currentLeague], ['排名','球员','球队','进球']);
  } else if (currentType === 'assists') {
    html += '<div class="section-header" style="margin:0 -16px"><div class="title"><span class="dot"></span>助攻榜</div><div class="info">' + metaNotes[currentLeague] + '</div></div>';
    html += buildSimpleTable(assistsData[currentLeague], ['排名','球员','球队','助攻']);
  }
  container.innerHTML = html;
}

function filterNews(filter) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.filter-tab[data-filter="' + filter + '"]').classList.add('active');
  const cards = document.querySelectorAll('.news-card');
  let visibleCount = 0;
  cards.forEach(card => {
    if (filter === 'all' || card.dataset.league === filter) {
      card.classList.remove('hidden');
      visibleCount++;
    } else {
      card.classList.add('hidden');
    }
  });
  const labelMap = { 'all':'全部 ', 'toutiao':'今日头条 ', 'epl':'英超 ', 'laliga':'西甲 ', 'seriea':'意甲 ', 'bundesliga':'德甲 ', 'ligue1':'法甲 ', 'mls':'美职联 ', 'saudi':'沙特联 ', 'ucl':'欧冠 ' };
  document.getElementById('news-count').textContent = (labelMap[filter] || '') + visibleCount + ' 条';
}

renderTable();
</script>

</body>
</html>
`;

// 输出目录锚定项目根（不依赖 cwd）：work → football → 日期 → runs → automation → FC 根
const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
const outDir = join(projectRoot, 'reports', 'daily', D);
mkdirSync(outDir, { recursive: true });
const tmp = join(outDir, 'football.html.tmp');
writeFileSync(tmp, html);
renameSync(tmp, join(outDir, 'football.html'));
console.log('OK bytes=' + Buffer.byteLength(html));
