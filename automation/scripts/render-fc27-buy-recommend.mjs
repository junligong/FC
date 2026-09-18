#!/usr/bin/env node
/**
 * FC27 球员价格 × FC26 历史价格 购买推荐报告渲染器
 *
 * 用途：读取 fc27-buy-recommend.mjs 生成的结构化结果 JSON，渲染成单文件中文 HTML 报告：
 *       支持按推荐分级/卡种/位置/总评/关键词筛选，表头点击排序，本地头像（项目相对路径），
 *       FUTBIN 详情页链接点击跳转。全部 CSS/JS 内联，不引用任何远程 CDN 或热链。
 *
 * 输入：
 *   - automation/runs/<DATE>/analysis/fc27-buy-recommend.json（结构化推荐结果）
 *
 * 输出：
 *   - reports/analysis/fc27-buy-recommend-<DATE>.html
 *
 * 口径提示：报告不含 FC27 日环比/累计涨跌（开服前 listing-estimate/partial-live 口径）；
 *   FC26 开服价 = 2025-09-18 Console 均价；FC26 首月末 = 2025-10-17 Console 均价。
 *   本报告为分析研究用途，不构成任何投资或交易建议。
 *
 * 用法：node automation/scripts/render-fc27-buy-recommend.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const DATE = isDate(process.argv[2]) ? process.argv[2] : todayShanghai();

const IN_PATH = path.join(ROOT, 'automation/runs', DATE, 'analysis/fc27-buy-recommend.json');
const OUT_PATH = path.join(ROOT, 'reports/analysis', `fc27-buy-recommend-${DATE}.html`);

if (!existsSync(IN_PATH)) { console.error(`缺少输入文件: ${IN_PATH}`); process.exit(1); }
const data = JSON.parse(readFileSync(IN_PATH, 'utf8'));

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coins = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? `¥ ${v.toLocaleString('en-US')}` : '—');
const pct = v => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');

const GRADE_META = {
  S: { label: 'S 强推', color: '#f87171' },
  A: { label: 'A 推荐', color: '#fb923c' },
  B: { label: 'B 观察', color: '#facc15' },
  C: { label: 'C 谨慎', color: '#94a3b8' },
  NA: { label: '— 无对照', color: '#64748b' },
};

const kindOf = r => {
  if (r.version === 'icons' || r.version === 'icon' || r.fc26?.kind === 'icon') return 'Icon';
  if (r.fc26?.kind === 'hero' || r.version === 'heroes' || r.version === 'hero') return 'Hero';
  if (r.version === 'gold' || (r.fc26?.kind === 'gold' && !r.version)) return 'Gold';
  return r.cardType || '其他';
};

const rows = data.all.map(r => ({
  cardId: r.cardId,
  name: r.name || '',
  nameZh: r.nameZh || '',
  rating: r.rating ?? 0,
  position: r.position || '',
  kind: kindOf(r),
  club: r.club || '',
  league: r.league || '',
  nation: r.nation || '',
  avatar: r.avatarPath ? `../../shared/data/fc27/${r.avatarPath}` : '',
  futbin: r.futbinUrl || `https://www.futbin.com/27/player/${r.cardId}`,
  cPrice: r.fc27?.console?.price ?? null,
  pPrice: r.fc27?.pc?.price ?? null,
  ref: r.fc27?.refPrice ?? null,
  pop: r.fc27?.popularity ?? null,
  f26Launch: r.fc26?.launchPrice ?? null,
  f26End: r.fc26?.monthEndPrice ?? null,
  f26Min: r.fc26?.monthMin ?? null,
  ratio: r.ratio,
  trend: r.trend,
  grade: r.grade,
  reason: r.gradeReason || '',
}));

// 供前端筛选的枚举
const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
const clubs = uniq(rows.map(r => r.club));
const leagues = uniq(rows.map(r => r.league));
const nations = uniq(rows.map(r => r.nation));
const positions = uniq(rows.map(r => r.position));
const kinds = uniq(rows.map(r => r.kind));

const counts = data.counts || {};
const repeated = rows.filter(r => r.grade === 'S' || r.grade === 'A');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC27 球员价格 × FC26 历史价格 · 购买推荐报告 · ${DATE}</title>
<style>
  :root {
    --bg: #0f172a; --card: #1e293b; --card2: #263449; --border: #334155;
    --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8;
    --red: #ef4444; --green: #22c55e; --amber: #f59e0b;
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: var(--bg); color: var(--text); line-height: 1.6; }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 28px 20px 80px; }
  .hero { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #8b5cf6 100%); border-radius: 20px; padding: 34px 30px; margin-bottom: 24px; color: #fff; box-shadow: 0 8px 30px rgba(14,165,233,.25); }
  .hero h1 { margin: 0 0 8px; font-size: 28px; }
  .hero .sub { opacity: .92; font-size: 14px; }
  .hero .tags { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { background: rgba(255,255,255,.18); padding: 5px 12px; border-radius: 20px; font-size: 12px; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 20px; }
  .gcell { background: rgba(255,255,255,.14); border-radius: 12px; padding: 12px 14px; }
  .gcell .k { font-size: 12px; opacity: .85; }
  .gcell .v { font-size: 20px; font-weight: 700; }
  .notice { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; font-size: 13px; color: var(--muted); }
  .filters { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; }
  .filters .row { display: flex; flex-wrap: wrap; gap: 10px 18px; margin-bottom: 10px; }
  .filters .row:last-child { margin-bottom: 0; }
  .filters label { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .filters select, .filters input { background: var(--card2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 5px 8px; font-size: 13px; }
  .filters input[type=range] { width: 120px; }
  .tbl-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 1120px; }
  th { position: sticky; top: 0; background: var(--card2); color: var(--muted); padding: 10px 8px; text-align: left; cursor: pointer; user-select: none; white-space: nowrap; font-weight: 600; border-bottom: 1px solid var(--border); }
  th:hover { color: var(--accent); }
  td { padding: 8px; border-bottom: 1px solid #283449; vertical-align: middle; }
  tr:hover td { background: rgba(56,189,248,.05); }
  .pimg { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; background: var(--card2); display: block; }
  .pname { font-weight: 600; color: var(--text); }
  .pname .en { font-weight: 400; color: var(--muted); font-size: 12px; display: block; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; color: #0f172a; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th.num { cursor: pointer; }
  .up { color: var(--green); } .down { color: var(--red); }
  .reason { font-size: 12px; color: var(--muted); max-width: 220px; }
  a.fut { color: var(--accent); text-decoration: none; font-size: 12px; white-space: nowrap; }
  a.fut:hover { text-decoration: underline; }
  .foot { margin-top: 18px; font-size: 12px; color: var(--muted); }
  .sort-arrow { font-size: 10px; margin-left: 2px; }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
  .sum { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 0; font-size: 12px; color: var(--muted); }
  @media (max-width: 900px) { .grid4 { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>FC27 球员价格 × FC26 历史价格 · 购买推荐报告</h1>
    <div class="sub">数据日期 ${DATE} · FC27 当前价（开服前 listing-estimate / partial-live 口径）对照 FC26 历史价（开服日 2025-09-18 与首月末 2025-10-17，Console 均价）</div>
    <div class="grid4">
      <div class="gcell"><div class="k">有有效价的 FC27 卡</div><div class="v">${counts.totalCardsWithValidPrice ?? rows.length}</div></div>
      <div class="gcell"><div class="k">关联到 FC26 价格</div><div class="v">${counts.matchedFC26 ?? 0}</div></div>
      <div class="gcell"><div class="k">S / A 级推荐</div><div class="v">${repeated.length}</div></div>
      <div class="gcell"><div class="k">缺口（FC26 无对照）</div><div class="v">${counts.byGrade?.NA ?? 0}</div></div>
    </div>
    <div class="sum">分级分布：S=${counts.byGrade?.S ?? 0} · A=${counts.byGrade?.A ?? 0} · B=${counts.byGrade?.B ?? 0} · C=${counts.byGrade?.C ?? 0} · NA=${counts.byGrade?.NA ?? 0}　对照来源：金卡 ${counts.byKind?.gold ?? 0} · 传奇 ${counts.byKind?.icon ?? 0} · 英雄 ${counts.byKind?.hero ?? 0}</div>
  </div>

  <div class="notice">
    <b>口径与免责声明</b>：① FC27 未开服（launchDate ${data.fc27LaunchDate}），当前价为估值/部分实况滚动价，<b>不计算日环比与累计涨跌</b>；参考价取 Console / PC 两平台有效价（≥${data.minValidPrice.toLocaleString()}）较大者。② FC26 开服价为该卡 2025-09-18 Console 均价，首月末价为 2025-10-17 Console 均价，两代按 FUTBIN slug 关联。③ 折价比 = FC27 参考价 ÷ FC26 开服价；走势比 = FC26 首月末价 ÷ FC26 开服价。④ FC26 历史价格不代表 FC27 会重演，本报告仅作跨代市场研究参考，<b>不构成任何投资或交易建议</b>。
  </div>

  <div class="filters">
    <div class="row">
      <label>分级 <select id="f-grade"><option value="">全部</option><option value="S">S 强推</option><option value="A">A 推荐</option><option value="B">B 观察</option><option value="C">C 谨慎</option><option value="NA">NA 无对照</option></select></label>
      <label>卡种 <select id="f-kind"><option value="">全部</option>${kinds.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></label>
      <label>位置 <select id="f-pos"><option value="">全部</option>${positions.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></label>
      <label>总评 ≥ <input type="number" id="f-rating-min" min="0" max="99" value="" style="width:56px" placeholder="0"></label>
      <label>总评 ≤ <input type="number" id="f-rating-max" min="0" max="99" value="" style="width:56px" placeholder="99"></label>
      <label>关键词（中/英文）<input type="text" id="f-q" placeholder="如 哈兰德 / Haaland" style="width:150px"></label>
      <label><button id="btn-reset" style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:5px 14px;cursor:pointer">重置</button></label>
    </div>
    <div class="row">
      <label>俱乐部 <select id="f-club"><option value="">全部</option>${clubs.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></label>
      <label>联赛 <select id="f-league"><option value="">全部</option>${leagues.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></label>
      <label>国籍 <select id="f-nation"><option value="">全部</option>${nations.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></label>
      <label>仅看有 FC26 对照 <input type="checkbox" id="f-only26" checked></label>
      <label>仅看有头像 <input type="checkbox" id="f-onlyimg"></label>
    </div>
  </div>

  <div class="tbl-wrap">
    <table id="tbl">
      <thead><tr>
        <th data-k="name">球员</th>
        <th data-k="kind">卡种</th>
        <th data-k="rating" class="num">总评</th>
        <th data-k="position">位置</th>
        <th data-k="club">俱乐部</th>
        <th data-k="league">联赛</th>
        <th data-k="nation">国籍</th>
        <th data-k="cPrice" class="num">FC27 Console</th>
        <th data-k="pPrice" class="num">FC27 PC</th>
        <th data-k="ref" class="num">FC27 参考价</th>
        <th data-k="f26Launch" class="num">FC26 开服价</th>
        <th data-k="f26End" class="num">FC26 首月末</th>
        <th data-k="ratio" class="num">折价比</th>
        <th data-k="trend" class="num">走势比</th>
        <th data-k="grade">分级</th>
        <th data-k="reason">判定依据</th>
        <th data-k="futbin">FUTBIN</th>
      </tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <div class="foot" id="foot"></div>
</div>

<script>
const ROWS = ${JSON.stringify(rows)};
const GRADE_COLOR = ${JSON.stringify(Object.fromEntries(Object.entries(GRADE_META).map(([k, v]) => [k, v.color])))};
const GRADE_LABEL = ${JSON.stringify(Object.fromEntries(Object.entries(GRADE_META).map(([k, v]) => [k, v.label])))};
const coins = v => (typeof v === 'number' && v > 0 ? '¥ ' + v.toLocaleString('en-US') : '—');
const pct = v => (typeof v === 'number' && isFinite(v) ? (v * 100).toFixed(0) + '%' : '—');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let sortKey = 'grade'; let sortDir = 1;
const $ = id => document.getElementById(id);

function gradeRank(g) { return { S: 0, A: 1, B: 2, C: 3, NA: 4 }[g] ?? 5; }

function filtered() {
  const g = $('f-grade').value, k = $('f-kind').value, p = $('f-pos').value;
  const rmin = parseInt($('f-rating-min').value || '0', 10);
  const rmax = parseInt($('f-rating-max').value || '99', 10);
  const q = $('f-q').value.trim().toLowerCase();
  const club = $('f-club').value, league = $('f-league').value, nation = $('f-nation').value;
  const only26 = $('f-only26').checked, onlyimg = $('f-onlyimg').checked;
  return ROWS.filter(r => {
    if (g && r.grade !== g) return false;
    if (k && r.kind !== k) return false;
    if (p && r.position !== p) return false;
    if (r.rating < rmin || r.rating > rmax) return false;
    if (club && r.club !== club) return false;
    if (league && r.league !== league) return false;
    if (nation && r.nation !== nation) return false;
    if (only26 && (r.f26Launch == null)) return false;
    if (onlyimg && !r.avatar) return false;
    if (q && !(r.nameZh.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q))) return false;
    return true;
  });
}

function numVal(r, key) {
  const v = r[key];
  if (key === 'grade') return gradeRank(v);
  if (key === 'name') return (r.nameZh || r.name).localeCompare('', 'zh');
  if (key === 'ratio' || key === 'trend') return typeof v === 'number' ? v : (key === 'ratio' ? 9 : -9);
  if (key === 'kind') return r.kind.localeCompare('', 'zh');
  return (typeof v === 'number' && isFinite(v)) ? v : -1;
}

function sortRows(list) {
  return list.sort((a, b) => {
    const va = numVal(a, sortKey), vb = numVal(b, sortKey);
    if (va < vb) return -1 * sortDir;
    if (va > vb) return 1 * sortDir;
    return gradeRank(a.grade) - gradeRank(b.grade);
  });
}

function render() {
  const list = sortRows(filtered());
  const tb = $('tbody');
  tb.innerHTML = list.map(r => {
    const img = r.avatar
      ? '<img class="pimg" loading="lazy" src="' + esc(r.avatar) + '" onerror="this.style.visibility=&quot;hidden&quot;">'
      : '<div class="pimg" style="line-height:34px;text-align:center;color:var(--muted);font-size:10px">—</div>';
    const color = GRADE_COLOR[r.grade] || '#64748b';
    const arrow = (r.trend == null) ? '' : (r.trend >= 1 ? ' ▲' : ' ▼');
    return '<tr>' +
      '<td><div style="display:flex;gap:8px;align-items:center"><div>' + img + '</div><div><span class="pname">' + esc(r.nameZh || r.name) + '</span><span class="en">' + esc(r.name) + '</span></div></div></td>' +
      '<td>' + esc(r.kind) + '</td>' +
      '<td class="num">' + r.rating + '</td>' +
      '<td>' + esc(r.position) + '</td>' +
      '<td>' + esc(r.club) + '</td>' +
      '<td>' + esc(r.league) + '</td>' +
      '<td>' + esc(r.nation) + '</td>' +
      '<td class="num">' + coins(r.cPrice) + '</td>' +
      '<td class="num">' + coins(r.pPrice) + '</td>' +
      '<td class="num"><b>' + coins(r.ref) + '</b></td>' +
      '<td class="num">' + coins(r.f26Launch) + '</td>' +
      '<td class="num">' + coins(r.f26End) + '</td>' +
      '<td class="num"><span style="color:' + (r.ratio == null ? 'var(--muted)' : r.ratio <= 1 ? 'var(--green)' : 'var(--red)') + '">' + pct(r.ratio) + '</span></td>' +
      '<td class="num"><span style="color:' + (r.trend == null ? 'var(--muted)' : r.trend >= 1 ? 'var(--green)' : 'var(--red)') + '">' + pct(r.trend) + arrow + '</span></td>' +
      '<td><span class="badge" style="background:' + color + '">' + (GRADE_LABEL[r.grade] || r.grade) + '</span></td>' +
      '<td class="reason">' + esc(r.reason) + '</td>' +
      '<td><a class="fut" href="' + esc(r.futbin) + '" target="_blank" rel="noopener">详情 ↗</a></td>' +
      '</tr>';
  }).join('');
  if (!list.length) tb.innerHTML = '<tr><td colspan="17" class="empty">没有符合条件的卡</td></tr>';
  const nS = list.filter(r => r.grade === 'S').length, nA = list.filter(r => r.grade === 'A').length;
  $('foot').textContent = '共 ' + list.length + ' 张（S ' + nS + ' · A ' + nA + '）· 点击表头排序 · 头像取本地 assets，未解析到则显示占位';
  document.querySelectorAll('th').forEach(th => {
    if (th.dataset.k === sortKey) th.innerHTML = th.dataset.k === 'name' ? '球员 <span class="sort-arrow">' + (sortDir === 1 ? '▲' : '▼') + '</span>' : th.innerText.replace(/[▲▼]$/, '') + ' <span class="sort-arrow">' + (sortDir === 1 ? '▲' : '▼') + '</span>';
  });
}

document.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
  const k = th.dataset.k; if (!k) return;
  if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
  render();
}));
['f-grade','f-kind','f-pos','f-rating-min','f-rating-max','f-q','f-club','f-league','f-nation','f-only26','f-onlyimg'].forEach(id => $('id' === '' ? '' : id).addEventListener('change', render));
['f-grade','f-kind','f-pos','f-rating-min','f-rating-max','f-q','f-club','f-league','f-nation'].forEach(id => $(id).addEventListener('input', render));
$('btn-reset').addEventListener('click', () => {
  ['f-grade','f-kind','f-pos','f-club','f-league','f-nation','f-q'].forEach(id => $(id).value = '');
  $('f-rating-min').value = ''; $('f-rating-max').value = '';
  $('f-only26').checked = true; $('f-onlyimg').checked = false;
  render();
});
render();
</script>
</body>
</html>
`;

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
const tmp = `${OUT_PATH}.tmp-${process.pid}`;
writeFileSync(tmp, html, 'utf8');
const { renameSync } = await import('node:fs');
renameSync(tmp, OUT_PATH);
console.log(`已写入 ${OUT_PATH}（${rows.length} 行）`);