#!/usr/bin/env node
/**
 * render-database-columns.mjs — FC27 球员数据库三专栏渲染器（重构核心产物）
 *
 * 用途：读取五类台账（传奇 / 英雄 / 周黑 / 活动卡 / 83+）与统一行情 current.json，
 *       按三套差异化分档渲染出三个专栏的 HTML 页面：
 *         reports/daily/D/database-columns.html
 *       三个专栏：① 传奇卡专栏（独立）② 英雄专栏（独立）③ 其他卡专栏（周黑+活动卡+83+ 合一）。
 *
 * 口径（2026-09-20 定稿）：
 *   - 分档：传奇 30W以下/30~100W/100~200W/200~500W/500W+；
 *           英雄 10W以下/10~30W/30~50W/50~100W/100W+；
 *           其他 1W以下/1~5W/5~10W/10~50W/50~100W/100~200W/200W+。
 *   - 价格取 current.json 的双平台价（console/pc），随平台切换；<1000 视为无效价（占位）。
 *   - 无有效价的卡按该快照最高有效价处理并标注「无价·按最高价」（沿用市场扫描口径）。
 *   - 球员点开展示价格变化图：读取 series/popular.json 的观测序列（经 price-series.mjs 还原成当日 ps[]/pc[]），
 *     复用 FC26 回顾的惰性 SVG 曲线（data-curve 编码 + 页内 drawCurve）。
 *   - 译名、头像走既有注入/头像库；本渲染器只读台账与行情，不采集、不写 current.json。
 *
 * 输入：
 *   apps/market/engine/icons/data/players/fc27/ledger-icons.json
 *   apps/market/engine/heroes/data/players/fc27/ledger-heroes.json
 *   apps/market/engine/promo/data/players/fc27/rating83plus.json
 *   apps/market/engine/totw/data/players/fc27/totw-current.json
 *   apps/market/engine/promo/data/players/fc27/activity-current.json
 *   apps/market/engine/data/prices/fc27/current.json
 *   apps/market/engine/data/prices/fc27/series/popular.json（价格曲线；2026-09-20 起取代 popular/daily/<D>.json）
 *
 * 输出：reports/daily/D/database-columns.html
 * 用法：node apps/market/engine/scripts/render-database-columns.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dailyFrom, readSeries, seriesPathFor } from '../src/price-series.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const ENGINE = path.join(ROOT, 'apps', 'market', 'engine');
const PRICE_ROOT = path.join(ENGINE, 'data', 'prices', 'fc27');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readJSON = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();

const MIN_VALID_PRICE = 1000;

// ── 三套分档 ────────────────────────────────────────────────────────────
const BUCKETS = {
  icon: [
    { id: 'lt30w', label: '30W以下', min: 0, max: 300000 },
    { id: '30w-100w', label: '30~100W', min: 300000, max: 1000000 },
    { id: '100w-200w', label: '100~200W', min: 1000000, max: 2000000 },
    { id: '200w-500w', label: '200~500W', min: 2000000, max: 5000000 },
    { id: '500w+', label: '500W+', min: 5000000, max: Infinity },
  ],
  hero: [
    { id: 'lt10w', label: '10W以下', min: 0, max: 100000 },
    { id: '10w-30w', label: '10~30W', min: 100000, max: 300000 },
    { id: '30w-50w', label: '30~50W', min: 300000, max: 500000 },
    { id: '50w-100w', label: '50~100W', min: 500000, max: 1000000 },
    { id: '100w+', label: '100W+', min: 1000000, max: Infinity },
  ],
  other: [
    { id: 'lt1w', label: '1W以下', min: 0, max: 10000 },
    { id: '1w-5w', label: '1~5W', min: 10000, max: 50000 },
    { id: '5w-10w', label: '5~10W', min: 50000, max: 100000 },
    { id: '10w-50w', label: '10~50W', min: 100000, max: 500000 },
    { id: '50w-100w', label: '50~100W', min: 500000, max: 1000000 },
    { id: '100w-200w', label: '100~200W', min: 1000000, max: 2000000 },
    { id: '200w+', label: '200W+', min: 2000000, max: Infinity },
  ],
};

function bucketOf(buckets, v) {
  for (const b of buckets) if (v >= b.min && v < b.max) return b.id;
  return buckets[buckets.length - 1].id;
}
const fmt = v => (v == null || v <= 0 ? '—' : v.toLocaleString('en-US'));
const fmtW = v => (v == null || v <= 0 ? '—' : (v / 10000).toFixed(v >= 1000000 ? 0 : 1) + 'W');

// ── 载入数据 ────────────────────────────────────────────────────────────
const current = readJSON(path.join(ENGINE, 'data/prices/fc27/current.json'));
const curCards = current?.cards || {};
// 价格观测序列：单文件累积序列还原成当日 ps/pc 视图（卡片键 = url，等价旧 popular/daily/<D>.json）
const daily = dailyFrom(readSeries(seriesPathFor(PRICE_ROOT, 'popular')), dateStr);
const dailyCards = daily?.cards || {};

const iconLedger = readJSON(path.join(ENGINE, 'icons/data/players/fc27/ledger-icons.json'))?.players || [];
const heroLedger = readJSON(path.join(ENGINE, 'heroes/data/players/fc27/ledger-heroes.json'))?.players || [];
const r83Ledger = readJSON(path.join(ENGINE, 'promo/data/players/fc27/rating83plus.json'))?.players || [];
const totwLedger = readJSON(path.join(ENGINE, 'totw/data/players/fc27/totw-current.json'))?.players || [];
const activityLedger = readJSON(path.join(ENGINE, 'promo/data/players/fc27/activity-current.json'))?.players || [];

// 从台账 + current.json 组装卡（价格优先取 current.json，缺失则台账内 prices）
function assemble(players, bucketKey) {
  const rows = [];
  for (const p of players) {
    const cid = String(p.cardId ?? p.id);
    const c = curCards[cid] || {};
    const consolePrice = c.platforms?.console?.price ?? p.prices?.console?.price ?? 0;
    const pcPrice = c.platforms?.pc?.price ?? p.prices?.pc?.price ?? 0;
    rows.push({
      cardId: cid,
      slug: c.slug || p.slug || '',
      name: c.name || p.name || '',
      nameZh: c.nameZh || p.nameZh || '',
      rating: c.rating ?? p.rating ?? null,
      position: c.position || p.position || '',
      cardType: c.cardType || p.category || '',
      consolePrice, pcPrice,
      priceRange: c.priceRange || null,
      category: p.category || bucketKey,
    });
  }
  // 计算该栏最高有效价（用于无价卡兜底）
  const validPrices = rows.flatMap(r => [r.consolePrice, r.pcPrice]).filter(v => v >= MIN_VALID_PRICE);
  const maxValid = validPrices.length ? Math.max(...validPrices) : 0;
  const buckets = BUCKETS[bucketKey];
  // 分档
  const groups = {};
  for (const b of buckets) groups[b.id] = { ...b, rows: [] };
  for (const r of rows) {
    const eff = (r.consolePrice >= MIN_VALID_PRICE ? r.consolePrice : 0) || (r.pcPrice >= MIN_VALID_PRICE ? r.pcPrice : 0);
    const v = eff >= MIN_VALID_PRICE ? eff : maxValid;
    const bid = bucketOf(buckets, v);
    groups[bid].rows.push({ ...r, effective: eff >= MIN_VALID_PRICE ? eff : null, fallback: eff < MIN_VALID_PRICE });
  }
  return { rows, maxValid, groups: buckets.map(b => groups[b.id]) };
}

// 价格曲线数据（当日观测序列，来自 series/popular.json；卡片键 = url）
function curveData(cardId, slug) {
  const url = `https://www.futbin.com/27/player/${cardId}/${slug}`;
  const entry = dailyCards[url];
  if (!entry) return null;
  return { ps: entry.ps || [], pc: entry.pc || [] };
}

// ── 渲染一个专栏 ─────────────────────────────────────────────────────────
function renderColumn(title, en, data, bucketKey) {
  const { maxValid, groups } = data;
  const bucketList = BUCKETS[bucketKey];
  let html = '';
  for (const g of groups) {
    html += `<h3 class="col-bucket">${esc(g.label)} <span class="cnt">${g.rows.length}</span></h3>`;
    if (!g.rows.length) { html += `<div class="col-empty">该档暂无卡片</div>`; continue; }
    html += `<table class="col-table"><thead><tr><th>球员</th><th>评分</th><th>位置</th><th class="price-ps">Console 价</th><th class="price-pc">PC 价</th><th>区间</th><th></th></tr></thead><tbody>`;
    for (const r of g.rows) {
      const curve = curveData(r.cardId, r.slug);
      const dataAttr = curve ? ` data-curve="${esc(JSON.stringify(curve))}"` : '';
      const pricePs = r.consolePrice >= MIN_VALID_PRICE ? fmt(r.consolePrice) : (r.fallback ? `≥${fmt(maxValid)}` : '—');
      const pricePc = r.pcPrice >= MIN_VALID_PRICE ? fmt(r.pcPrice) : (r.fallback ? `≥${fmt(maxValid)}` : '—');
      const tag = r.fallback ? '<span class="tag-fallback">无价·按最高价</span>' : '';
      const range = r.priceRange && (r.priceRange.min || r.priceRange.max)
        ? `${fmtW(r.priceRange.min)}~${fmtW(r.priceRange.max)}` : '—';
      html += `<tr class="col-row${curve ? '' : ''}"${dataAttr}>
        <td class="name">${esc(r.nameZh || r.name)} <span class="en">${esc(r.name)}</span></td>
        <td>${r.rating ?? '—'}</td>
        <td>${esc(r.position || '—')}</td>
        <td class="price-ps num">${pricePs}${tag}</td>
        <td class="price-pc num">${pricePc}${tag}</td>
        <td class="range">${range}</td>
        <td class="curve-toggle">${curve ? '<button class="btn-curve">走势</button>' : ''}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }
  return `<section class="column" id="col-${esc(bucketKey)}">
    <h2 class="col-title">${esc(title)} <span class="en">${esc(en)}</span></h2>
    ${html}
  </section>`;
}

// ── 组装三栏 ────────────────────────────────────────────────────────────
const iconData = assemble(iconLedger, 'icon');
const heroData = assemble(heroLedger, 'hero');
const otherData = assemble([...totwLedger, ...activityLedger, ...r83Ledger], 'other');

const colIcon = renderColumn('传奇卡专栏', 'ICONS', iconData, 'icon');
const colHero = renderColumn('英雄专栏', 'HEROES', heroData, 'hero');
const colOther = renderColumn('其他卡专栏（周黑 · 活动卡 · 83+）', 'TOTW / PROMO / 83+', otherData, 'other');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC27 球员数据库 · 三专栏（${dateStr}）</title>
<meta name="data-date" content="${dateStr}">
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--gold:#e3b341;--lime:#c8f646;--font:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;line-height:1.6;padding:24px}
.column{margin-bottom:40px}
.col-title{font-size:22px;font-weight:700;margin:0 0 16px;border-left:4px solid var(--lime);padding-left:12px}
.col-title .en{color:var(--quiet);font-size:12px;letter-spacing:.2em;margin-left:8px}
.col-bucket{font-size:15px;font-weight:600;color:var(--gold);margin:20px 0 8px}
.col-bucket .cnt{color:var(--quiet);font-weight:400;font-size:12px;margin-left:6px}
.col-table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:10px;overflow:hidden;margin-bottom:8px}
.col-table th,.col-table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:13.5px}
.col-table th{color:var(--muted);font-weight:600;background:#1d271b;white-space:nowrap}
.col-table .name{font-weight:600}
.col-table .name .en{color:var(--quiet);font-weight:400;font-size:12px;margin-left:6px}
.col-table .num{text-align:right;font-variant-numeric:tabular-nums}
.col-table .range{color:var(--muted);font-size:12px;white-space:nowrap}
.tag-fallback{color:var(--gold);font-size:11px;margin-left:4px}
.btn-curve{background:var(--surface);border:1px solid var(--line);color:var(--lime);border-radius:6px;padding:2px 8px;font-size:12px;cursor:pointer}
.btn-curve:hover{border-color:var(--lime)}
.curve-box{margin:8px 0;background:#141c15;border:1px solid var(--line);border-radius:8px;padding:12px}
.curve-box svg{width:100%;height:auto}
.col-empty{color:var(--quiet);padding:20px;text-align:center;border:1px dashed var(--line);border-radius:8px}
.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:20px}
.toolbar button{padding:8px 16px;border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:8px;cursor:pointer;font-size:13px}
.toolbar button.active{border-color:var(--lime);color:var(--lime)}
</style>
</head>
<body>
<div class="toolbar">
  <button class="pf active" data-pf="console">Console（PS / Xbox）</button>
  <button class="pf" data-pf="pc">PC</button>
</div>
${colIcon}
${colHero}
${colOther}
<script>
// 双平台切换：切换价格列显隐
(function(){
  var btns=document.querySelectorAll('.pf');
  function setPf(pf){
    btns.forEach(function(b){b.classList.toggle('active',b.getAttribute('data-pf')===pf)});
    document.querySelectorAll('.price-ps').forEach(function(el){el.style.display=pf==='console'?'':'none'});
    document.querySelectorAll('.price-pc').forEach(function(el){el.style.display=pf==='pc'?'':'none'});
  }
  btns.forEach(function(b){b.addEventListener('click',function(){setPf(b.getAttribute('data-pf'))})});
  setPf('console');
})();
// 价格曲线：点击「走势」展开该卡逐轮价格变化图
(function(){
  function coins(v){if(v==null||v<=0)return '—';if(v>=1e6)return (v/1e6).toFixed(2)+'M';if(v>=1e3)return (v/1e3).toFixed(v>=1e5?0:1)+'K';return String(v)}
  function draw(d){
    var W=640,H=180,L=50,R=12,T=12,B=30;
    var ps=d.ps||[],pc=d.pc||[];
    var vals=[].concat(ps.map(function(x){return x.v}),pc.map(function(x){return x.v})).filter(function(v){return v>0});
    if(!vals.length)return '<div class="col-empty">该卡暂无可用的价格观测。</div>';
    var y0=Math.min.apply(null,vals),y1=Math.max.apply(null,vals);
    if(y0===y1){y0*=0.9;y1*=1.1;}
    var n=ps.length||pc.length||0;
    function X(i){return L+(W-L-R)*(n<=1?0:i/(n-1))}
    function Y(v){return T+(H-T-B)*(1-(v-y0)/(y1-y0))}
    function path(series){var pts=[];for(var i=0;i<series.length;i++){if(series[i].v>0)pts.push(X(i).toFixed(1)+','+Y(series[i].v).toFixed(1));}return pts.length?'M'+pts.join('L'):''}
    var g='';
    for(var t=0;t<=3;t++){var v=y0+(y1-y0)*t/3;var yy=Y(v);g+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#30392f" stroke-dasharray="3 5"/>'+'<text x="'+(L-6)+'" y="'+(yy+4)+'" text-anchor="end" fill="#859080" font-size="10">'+coins(v)+'</text>';}
    var pps=path(ps),ppc=path(pc);
    if(pps)g+='<path d="'+pps+'" fill="none" stroke="#ff6259" stroke-width="2"/>';
    if(ppc)g+='<path d="'+ppc+'" fill="none" stroke="#8aa9c8" stroke-width="1.8" stroke-dasharray="5 4"/>';
    var legend='<div style="color:#aeb5aa;font-size:12px;margin-top:6px"><span style="color:#ff6259">■</span> Console &nbsp; <span style="color:#8aa9c8">—</span> PC（单位 coins）</div>';
    return '<svg viewBox="0 0 '+W+' '+H+'" role="img">'+g+'</svg>'+legend;
  }
  document.addEventListener('click',function(e){
    var el=e.target;
    while(el&&el!==document&&!(el.classList&&el.classList.contains('btn-curve')))el=el.parentNode;
    if(!el||el===document)return;
    var tr=el.closest('tr');
    if(!tr)return;
    var next=tr.nextElementSibling;
    if(next&&next.classList&&next.classList.contains('curve-row')){next.remove();return;}
    var raw=tr.getAttribute('data-curve');
    if(!raw)return;
    var d=JSON.parse(raw);
    var box=document.createElement('tr');
    box.className='curve-row';
    box.innerHTML='<td colspan="7"><div class="curve-box">'+draw(d)+'</div></td>';
    tr.parentNode.insertBefore(box,tr.nextSibling);
  });
})();
</script>
</body>
</html>`;

const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'database-columns.html');
writeFileSync(outFile, html, 'utf8');

console.log(JSON.stringify({
  date: dateStr,
  icon: iconData.rows.length, hero: heroData.rows.length,
  other: otherData.rows.length,
  otherBreakdown: { totw: totwLedger.length, activity: activityLedger.length, r83: r83Ledger.length },
  out: path.relative(ROOT, outFile),
}, null, 2));
