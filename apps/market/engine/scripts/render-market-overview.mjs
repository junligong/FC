#!/usr/bin/env node
/**
 * FC27 市场「概览」页渲染器
 * 用途：把结构化的市场数据（market.json 的 overview 段）渲染为 reports/daily/D/market.html，
 *       即站点 FC27 市场栏目里「市场概览」子标签的内容。
 * 输入：automation/runs/D/market/market.json 的 overview 字段（可用 FC_MARKET_JSON 指定其他路径）。
 * 输出：reports/daily/D/market.html
 *
 * 固定三段结构（2026-09-16 起「传奇卡与英雄卡」已迁出到传奇/英雄专栏，不再出现在市场概览）：
 *   一、本周活动卡与本周周黑
 *   二、价格分层：≥100万 / 30-100万 / 10-30万 / 1-10万 —— 每档监控 Top50，按 Rating 排序
 *   三、热门进化卡
 *
 * 平台：FUTBIN 只有 Console(PS/Xbox) 与 PC 两个平台。列表页每行同时渲染
 *       td.table-price.platform-ps-only 与 td.table-price.platform-pc-only 两个价格单元格。
 *       本页顶部提供平台切换按钮，切换后只显示对应平台的价格列。
 *       开服前两个平台价均为 0，此时列表页 IS 列（table-item-score）是估值，单独以「估值」标注，不当作平台成交价。
 *
 * 采集缺失时渲染为如实空状态，绝不伪造、不用 FC26 数据冒充 FC27。
 *
 * 用法：node apps/market/engine/scripts/render-market-overview.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avatarIndex, avatarSrc, materializeAvatars } from '../../../../shared/lib/player-avatar.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : (v ?? ''));
const fmtPrice = v => (typeof v === 'number' && v > 0 ? num(v) : '—');

// 平台定义：与 FUTBIN 的 platform 表单按钮一致（value=ps 文案 Console / value=pc 文案 PC）
export const PLATFORMS = [
  { id: 'console', label: 'Console', short: 'PS / Xbox', cell: 'platform-ps-only' },
  { id: 'pc', label: 'PC', short: 'PC', cell: 'platform-pc-only' },
];
export const DEFAULT_PLATFORM = 'console';

// 价格分层：标题、区间与 FUTBIN 筛选区间（按平台拼成 ps_price / pc_price）
export const PRICE_TIERS = [
  { id: 'tier-1m', name: '≥ 100 万', range: [1000000, null], rangeParam: '1000000%2B' },
  { id: 'tier-300k', name: '30 - 100 万', range: [300000, 1000000], rangeParam: '300000-1000000' },
  { id: 'tier-100k', name: '10 - 30 万', range: [100000, 300000], rangeParam: '100000-300000' },
  { id: 'tier-10k', name: '1 - 10 万', range: [10000, 100000], rangeParam: '10000-100000' },
];
export const TOP_N = 50;

function todayShanghai() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

function loadData(dateStr) {
  const jsonPath = process.env.FC_MARKET_JSON
    || path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'market.json');
  if (!existsSync(jsonPath)) return { data: null, jsonPath };
  try {
    return { data: JSON.parse(readFileSync(jsonPath, 'utf8')), jsonPath };
  } catch (e) {
    return { data: null, jsonPath, error: e.message };
  }
}

const cardIdOf = it => String(it?.url || it?.marketUrl || '').match(/\/player\/([^/?#]+)/)?.[1]?.split('_')[0] || '';

// 价格单元格：同时渲染两个平台的价格，由页面顶部的平台切换按钮决定显示哪一个。
// 平台价全为 0 时，退回显示列表页 IS 列的估值，并明确标注「估值」。
function priceCell(it) {
  const id = cardIdOf(it);
  const parts = PLATFORMS.map(p => `<span class="pv pv-${p.id} live-market-price" data-card-id="${esc(id)}" data-market-platform="${p.id}">读取中</span>`).join('');
  const estimate = it.estimate ?? it.price;
  const est = typeof estimate === 'number' && estimate > 0
    ? `<span class="est" title="FUTBIN 列表页估值（IS 列），不是任何平台的成交价">估值 ${num(estimate)}</span>`
    : '';
  return `<td class="c-price">${parts}${est}</td>`;
}

// 通用球员表：列可裁剪。avatarOf(item) 返回头像 relative path（无则空串），由调用方提前解析并落盘。
function playerTable(items, { withPrice = true, withRating = true, withPop = false, emptyText, avatarOf = () => '' } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return `<div class="empty">${esc(emptyText || '本期无已核验数据。')}</div>`;
  const head = ['#', '球员'];
  if (withRating) head.push('<th class="w-rating">Rating</th>');
  head.push('位置', '卡版本');
  if (withPrice) head.push(`<th class="w-price">价格(coins) · <span class="ph-plat">本平台</span></th>`);
  if (withPop) head.push('<th class="w-pop">热度</th>');
  head.push('备注');
  const rows = list.map((it, i) => {
    const ava = avatarOf(it);
    const cells = [
      `<td class="c-rank">${it.rank || i + 1}</td>`,
      `<td class="c-name">${ava ? `<img class="pimg" src="${esc(ava)}" loading="lazy" alt="">` : ''}${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}${it.nameZh ? `<span class="zh">${esc(it.nameZh)}</span>` : ''}</td>`,
    ];
    if (withRating) cells.push(`<td class="c-rating">${esc(it.rating ?? '')}</td>`);
    cells.push(`<td class="c-pos">${esc(it.pos ?? '')}</td>`, `<td class="c-type">${esc(it.cardType ?? it.version ?? '')}</td>`);
    if (withPrice) cells.push(priceCell(it));
    if (withPop) cells.push(`<td class="c-pop">${it.popularity ? num(it.popularity) : '—'}</td>`);
    cells.push(`<td class="c-note">${esc(it.note ?? '')}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map(h => h.startsWith('<th') ? h : `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderOverview(dateStr, data) {
  const d = data || {};
  const ov = d.overview || {};
  const status = (d.status || 'partial').toUpperCase();
  const platform = DEFAULT_PLATFORM;
  const weekly = ov.weekly || {};
  const promo = weekly.promo || [];
  const totw = weekly.totw || [];
  const evolutions = ov.evolutions || [];

  // ── 球员头像 ────────────────────────────────────────────────────────────────
  // 先解析出本页所有条目的 resourceId 并批量缩放落盘到 reports/daily/D/assets/players/，
  // HTML 里只写相对路径 assets/players/<rid>.png；合并成站点时由
  // rewriteLocalReportAssets 改写为指向 daily-merged/assets/ 的相对路径（头像无法解析的条目如实不显示，不伪造）。
  const idx = avatarIndex();
  const avatarItems = [
    ...promo, ...totw, ...evolutions,
    ...(Array.isArray(ov.priceTiers) ? ov.priceTiers.flatMap(t => t.items || []) : []),
  ];
  const avatarResolved = avatarItems.map(it => idx.resolve(it)?.resourceId || null);
  const avatarReady = materializeAvatars(path.join(ROOT, 'reports', 'daily', dateStr),
    avatarResolved.filter(Boolean));
  const avatarOf = it => {
    const rid = idx.resolve(it)?.resourceId;
    return rid && avatarReady.has(String(rid)) ? avatarSrc(rid) : '';
  };
  const avatarHit = avatarResolved.filter(rid => rid && avatarReady.has(String(rid))).length;
  const avatarStat = avatarItems.length ? ` · 球员头像 ${avatarHit}/${avatarItems.length}` : '';

  const allOverviewItems = [
    ...(Array.isArray(ov.priceTiers) ? ov.priceTiers.flatMap(t => t.items || []) : []),
    ...(weekly.promo || []), ...(weekly.totw || []),
  ];
  const PTOTAL = allOverviewItems.length;
  const platformHint = PTOTAL === 0
    ? '本期概览暂无条目。'
    : '正在读取统一行情 current.json；未覆盖的卡保留估值标识，不以旧价格顶替。';

  const platformBar = `<div class="plat-bar" role="group" aria-label="平台切换">
  <span class="plat-label">平台</span>
  ${PLATFORMS.map(p => `<button type="button" class="plat-btn${p.id === platform ? ' active' : ''}" data-platform="${p.id}" aria-pressed="${p.id === platform}">${esc(p.label)}<small>${esc(p.short)}</small></button>`).join('')}
  <span class="plat-hint" id="live-market-hint">${platformHint}</span>
</div>`;

  // 价格分层：优先用数据里的分层，缺失则按固定四档输出空状态（保证结构永远完整）
  const tiersData = Array.isArray(ov.priceTiers) ? ov.priceTiers : [];
  const tierCards = PRICE_TIERS.map(tier => {
    const found = tiersData.find(t => t.id === tier.id || t.name === tier.name) || {};
    const items = (found.items || []).slice(0, TOP_N);
    const note = found.note || (items.length ? `按 Rating 取前 ${items.length} 名（上限 ${TOP_N}）` : '本期该档无已核验价格数据');
    const filters = PLATFORMS.map(p => `${p.id === 'console' ? 'ps' : 'pc'}_price=${tier.rangeParam}`).join(' · ');
    return `<div class="card">
  <div class="tier-head"><h3>${esc(tier.name)}</h3><span class="tier-range">Top ${TOP_N} · 按 Rating</span><span class="tier-count">${items.length} 张</span></div>
  <div class="tier-src">FUTBIN 筛选：<code>${esc(filters)}</code> · <span>${esc(note)}</span></div>
  ${playerTable(items, { emptyText: 'FC27 平台价格未开放或本档无成交，如实空状态（不伪造、不用 FC26 数据填充）。', avatarOf })}
</div>`;
  }).join('');

  const srcList = (d.sources || []).map(s => `<li><code>${esc(s.url)}</code>${s.openedAt ? ` · 打开 ${esc(s.openedAt)}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</li>`).join('');
  const missingList = (d.missing || []).map(m => `<li>${esc(m)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 市场概览 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;
--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--gold:#e3b341;--lime:#c8f646}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px 28px 40px;line-height:1.6}
h1{font-size:21px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(229,72,77,.18);border:1px solid rgba(229,72,77,.4);color:#ff6259}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 18px}
.plat-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#161d17;border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin-bottom:22px}
.plat-label{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--quiet);font-weight:700}
.plat-btn{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:6px 14px;border-radius:9px;border:1px solid var(--line);background:#1d271b;color:var(--muted);font-size:13px;font-weight:650;cursor:pointer;transition:.15s}
.plat-btn small{font-size:10px;color:var(--quiet);font-weight:500;letter-spacing:.05em}
.plat-btn:hover{border-color:var(--lime);color:var(--text)}
.plat-btn.active{background:rgba(200,246,70,.12);border-color:rgba(200,246,70,.5);color:var(--lime)}
.plat-btn.active small{color:rgba(200,246,70,.75)}
.plat-hint{font-size:11px;color:var(--quiet);margin-left:auto;max-width:46ch}
h2{font-size:17px;font-weight:750;margin:30px 0 14px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:17px;background:var(--red);border-radius:2px}
h3{font-size:14.5px;font-weight:700}
.card{background:linear-gradient(180deg,var(--surface),#141c15);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.tier-head{display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap}
.tier-range{font-size:12px;color:var(--gold);background:rgba(227,179,65,.14);border:1px solid rgba(227,179,65,.35);padding:2px 9px;border-radius:999px}
.tier-count{font-size:12px;color:var(--quiet);margin-left:auto}
.tier-src{font-size:11.5px;color:var(--quiet);margin-bottom:12px}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--quiet);font-weight:600;padding:8px 9px;border-bottom:1px solid var(--line);font-size:11.5px;letter-spacing:.03em;white-space:nowrap}
td{padding:7px 9px;border-bottom:1px solid #242d25}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#1a211b}
.c-rank{color:var(--gold);font-weight:700;width:38px}
.c-name{white-space:nowrap}
.c-name .pimg{width:26px;height:26px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:7px;background:#202b1a;border:1px solid #30392f}
.c-name a{color:#8fd6bb;text-decoration:none}
.c-name a:hover{text-decoration:underline}
.c-name .zh{color:#9aa79a;font-size:11px;margin-left:6px}
.c-rating{color:var(--text);font-weight:700;width:60px}
.w-rating{width:60px}.w-price{width:150px}.w-pop{width:70px}
.c-pos{color:var(--muted)}
.c-type,.c-note{color:var(--quiet);font-size:12px}
.c-price{color:var(--gold);font-weight:600;white-space:nowrap}
.c-price .est{display:inline-block;margin-left:8px;font-size:11px;font-weight:500;color:var(--quiet);border:1px dashed var(--line);border-radius:6px;padding:0 6px}
.c-pop{color:#ff6259;font-weight:700}
.empty{color:var(--quiet);font-size:12.5px;padding:14px;border:1px dashed var(--line);border-radius:9px;background:#161d17}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
code{background:#2a3329;padding:1px 5px;border-radius:4px;font-size:11.5px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:30px;border-top:1px solid var(--line);padding-top:12px}
/* 平台切换：默认只显示当前平台的价格 */
.pv{display:none}
body[data-platform="console"] .pv-console,
body[data-platform="pc"] .pv-pc{display:inline}
</style></head>
<body data-platform="${esc(platform)}">
<h1>FC27 市场概览 <span class="badge">${esc(status)}</span></h1>
<div class="sub">数据日期 ${esc(dateStr)} · 来源 FUTBIN · 三段式固定结构（传奇/英雄内容已迁至「传奇/英雄专栏」）${esc(avatarStat)}</div>

${platformBar}

<h2>一、本周活动卡与本周周黑</h2>
<div class="card">
  <div class="tier-head"><h3>本周活动卡（Promo）</h3><span class="tier-count">${promo.length} 张</span></div>
  ${playerTable(promo, { emptyText: '本周活动卡名单本轮未采集或尚未公布，如实空状态。', avatarOf })}
</div>
<div class="card">
  <div class="tier-head"><h3>本周周黑（TOTW）</h3><span class="tier-count">${totw.length} 张</span></div>
  ${playerTable(totw, { emptyText: '本周周黑名单本轮未采集或尚未公布，如实空状态。', avatarOf })}
</div>

<h2>二、价格分层（每档 Top ${TOP_N}，按 Rating）</h2>
${tierCards}

<h2>三、热门进化卡</h2>
<div class="card">${playerTable(evolutions, { withPrice: false, emptyText: 'FC27 当前无可用进化卡（来源 /27/popular/evolutions），如实空状态。', avatarOf })}</div>

<h2>数据来源与核验</h2>
<div class="card">${srcList ? `<ul>${srcList}</ul>` : '<div class="empty">未记录来源。</div>'}</div>

<h2>缺失项记录</h2>
<div class="card">${missingList ? `<ul>${missingList}</ul>` : '<div class="empty">无缺失项记录。</div>'}</div>

<div class="footer">FC27 市场概览 · ${esc(dateStr)} · 由 render-market-overview.mjs 渲染 · 数据仅作游戏市场研究，不构成投资或交易建议</div>

<script>
(function(){
  document.querySelectorAll('.plat-btn').forEach(function(b){
    b.addEventListener('click',function(){
      var v=b.dataset.platform;
      document.body.setAttribute('data-platform',v);
      document.querySelectorAll('.plat-btn').forEach(function(x){
        var on=x.dataset.platform===v;
        x.classList.toggle('active',on);
        x.setAttribute('aria-pressed',on?'true':'false');
      });
      document.querySelectorAll('.ph-plat').forEach(function(el){ el.textContent = v==='pc' ? 'PC' : 'Console'; });
    });
  });
  function currentUrl(){
    try{var host=window.parent&&window.parent!==window?window.parent.location:window.location;var prefix=host.pathname.indexOf('/archive/')!==-1?'../':'';return new URL(prefix+'assets/data/current.json',host.href).toString();}
    catch(e){return 'assets/data/current.json';}
  }
  function fmt(v){return typeof v==='number'&&isFinite(v)&&v>0?v.toLocaleString('en-US'):'—';}
  fetch(currentUrl(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json();}).then(function(doc){
    var cards=doc.cards||{},counts={console:0,pc:0};document.querySelectorAll('.live-market-price').forEach(function(el){var c=cards[el.dataset.cardId],cell=c&&c.platforms&&c.platforms[el.dataset.marketPlatform];el.textContent=cell&&cell.valid?fmt(cell.price):'—';if(cell&&cell.valid)counts[el.dataset.marketPlatform]++;});var hint=document.getElementById('live-market-hint');if(hint)hint.textContent='统一行情已刷新：Console 有价 '+counts.console+'，PC 有价 '+counts.pc+'。';
  }).catch(function(){var hint=document.getElementById('live-market-hint');if(hint)hint.textContent='统一行情文件暂不可用，当前价如实留空。';});
})();
</script>
</body></html>
`;
}

// ========== 主流程 ==========
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();
  const { data, jsonPath, error } = loadData(dateStr);
  if (error) console.error(`market.json 解析失败：${error}`);
  if (!data) console.error(`未找到 ${jsonPath}，将渲染为如实空状态。`);
  const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'market.html');
  writeFileSync(outPath, renderOverview(dateStr, data), 'utf8');
  console.log(`市场概览已渲染: ${outPath}`);
}
