#!/usr/bin/env node
/**
 * FC27 市场「关注列表」子页渲染器
 * 用途：把 build-market-watchlist.mjs 产出的关注列表渲染为 reports/daily/D/market-watch.html，
 *       作为 FC27 市场栏目的第三个子标签（市场概览 / 市场扫描 / 关注列表）。
 * 结构：摘要 → 一、重点推荐（关注分 Top 30）→ 二、同档低价（被低估）→ 三、逐小时挂单价异动
 *       → 四、进化卡热度榜 → 五、暂无有效平台价 → 口径与评分公式 → 免责声明
 * 平台：页顶提供 Console（PS / Xbox 合并）与 PC 切换，价格列随平台显隐；价格 <1000 视为占位值不参与打分。
 * 输入：automation/runs/D/market/watchlist.json（可用 FC_MARKET_WATCHLIST 覆盖）
 * 输出：reports/daily/D/market-watch.html
 * 缺失时渲染为如实空状态，绝不伪造或用其他日期数据填充。
 *
 * 用法：node apps/market/engine/scripts/render-market-watch.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avatarIndex, avatarSrc, materializeAvatars } from '../../../../shared/lib/player-avatar.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : '—');
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

// 平台定义与市场扫描页保持一致：psPrice=Console（PS / Xbox 合并）、pcPrice=PC
const PLATFORMS = [
  { id: 'console', label: 'Console', short: 'PS / Xbox', key: 'psPrice' },
  { id: 'pc', label: 'PC', short: 'PC', key: 'pcPrice' },
];
const DEFAULT_PLATFORM = 'console';

export function loadWatchlist(dateStr) {
  const jsonPath = process.env.FC_MARKET_WATCHLIST
    || path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'watchlist.json');
  if (!existsSync(jsonPath)) return { data: null, jsonPath };
  try {
    return { data: JSON.parse(readFileSync(jsonPath, 'utf8')), jsonPath };
  } catch (e) {
    return { data: null, jsonPath, error: e.message };
  }
}

const cardIdOf = c => c.cardId || String(c.url || '').match(/\/player\/([^/?#]+)/)?.[1]?.split('_')[0] || '';
const priceCell = c => PLATFORMS.map(pl =>
  `<span class="pv pv-${pl.id} live-price" data-card-id="${esc(cardIdOf(c))}" data-market-platform="${pl.id}"><i class="ph">读取中</i></span>`
).join('');

const moveCell = c => {
  if (!c.intradayChange || !c.intradayChange.length) return '<span class="mv-na">—</span>';
  return c.intradayChange.map(m => {
    // 红涨绿跌（国内行情惯例）：上行红、回落绿
    const cls = m.pct > 0 ? 'up' : m.pct < 0 ? 'dn' : 'flat';
    const sign = m.pct > 0 ? '+' : '';
    return `<span class="mv ${cls}">${sign}${m.pct}%<i>${esc(m.platform === 'pc' ? 'PC' : 'C')}</i></span>`;
  }).join('');
};

function table(rows, { emptyText, avatarOf }) {
  if (!rows || !rows.length) return `<div class="empty">${esc(emptyText)}</div>`;
  const body = rows.map(c => `<tr>
  <td class="c-rank">${esc(c.rank ?? '')}</td>
  <td class="c-name">${avatarOf(c)}${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name || '')}</a>` : esc(c.name || '')}${c.nameZh ? `<span class="zh">${esc(c.nameZh)}</span>` : ''}</td>
  <td class="c-rating">${esc(c.rating ?? '—')}</td>
  <td class="c-pos">${esc(c.pos ?? '')}</td>
  <td class="c-price">${priceCell(c)}</td>
  <td class="c-updated"><span class="live-time" data-card-id="${esc(cardIdOf(c))}" title="页面加载后按 cardId 从 assets/data/current.json 读取该卡最近观测时间">—</span></td>
  <td class="c-pop">${typeof c.popularity === 'number' ? num(c.popularity) : '—'}</td>
  <td class="c-move">${moveCell(c)}</td>
  <td class="c-score">${c.watchScore != null ? `<b>${esc(c.watchScore)}</b>` : '—'}</td>
  <td class="c-note">${esc((c.reasons || []).join(' · '))}</td>
</tr>`).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>
  <th>#</th><th>球员</th><th>总评</th><th>位置</th><th>价格（coins）</th><th>更新于</th><th>热度</th><th>本日挂单价变动</th><th>关注分</th><th>依据</th>
</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderWatch(dateStr, data) {
  const d = data || {};
  const lists = d.lists || {};
  const u = d.universe || {};
  const all = [].concat(lists.watch || [], lists.undervalued || [], lists.trending || [], lists.hotEvo || [], lists.pendingPrice || []);

  // 头像：只解析本页出现的球员；解析不到如实留空，禁止用他人头像顶替
  const idx = avatarIndex();
  const resolved = new Map();
  const ready = materializeAvatars(path.join(ROOT, 'reports', 'daily', dateStr), all.map(c => idx.resolve(c)?.resourceId).filter(Boolean));
  for (const c of all) {
    const rid = idx.resolve(c)?.resourceId || null;
    resolved.set(c.url, rid && ready.has(String(rid)) ? avatarSrc(rid) : '');
  }
  const avatarOf = c => {
    const src = resolved.get(c.url);
    return src ? `<img class="pimg" src="${esc(src)}" loading="lazy" alt="">` : '';
  };
  const avatarCount = all.filter(c => resolved.get(c.url)).length;

  const priceBasis = d.priceBasis || '';
  const priceNow = typeof u.priceValid === 'number' && u.priceValid > 0;
  const points = u.hourlyPoints || 0;
  const platformHint = !priceNow
    ? '本轮没有任何卡取得有效平台价（<1000 coins 视为占位值），关注列表为空状态。'
    : `FUTBIN 仅提供 Console（PS / Xbox 合并）与 PC 两个市场口径；本页价格为 FUTBIN 当前挂单/估价口径（${esc(priceBasis)}），<b>不是成交价</b>。「本日挂单价变动」列仅在同一平台的两个有效观测点之间计算（两个真实整点，或与当日开盘基线的单点对比并标注「待整点确认」）；本表不计算日环比与累计涨跌。`;

  const stat = (label, value, hint) => `<div class="stat"><span class="stat-label">${esc(label)}</span><b>${esc(value)}</b>${hint ? `<span class="stat-hint">${esc(hint)}</span>` : ''}</div>`;

  const css = `:root{color-scheme:dark;--bg:#101713;--panel:#161e18;--line:#30392f;--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--lime:#c8f646;--coral:#ff6259;--amber:#e3b341;--green:#4fb583;--teal:#8fd6bb;--up:#ff6259;--dn:#4ec08a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:22px 24px 40px;line-height:1.55}
h1{font-size:21px;font-weight:800;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(200,246,70,.14);border:1px solid rgba(200,246,70,.4);color:var(--lime)}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 18px}
h2{font-size:16px;font-weight:750;margin:26px 0 12px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:16px;background:var(--lime);border-radius:2px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.stat-label{font-size:11px;color:var(--quiet);letter-spacing:.06em}
.stat b{font-size:19px;color:var(--lime);font-weight:800}
.stat-hint{font-size:10.5px;color:var(--quiet)}
.plat-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin:0 0 18px}
.plat-label{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--quiet);font-weight:700}
.plat-btn{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:6px 14px;border-radius:9px;border:1px solid var(--line);background:#1d271b;color:var(--muted);font-size:13px;font-weight:650;cursor:pointer;transition:.15s}
.plat-btn small{font-size:10px;color:var(--quiet);font-weight:500}
.plat-btn:hover{border-color:var(--lime);color:var(--text)}
.plat-btn.active{background:rgba(200,246,70,.12);border-color:rgba(200,246,70,.5);color:var(--lime)}
.plat-hint{font-size:11px;color:var(--quiet);margin-left:auto;max-width:60ch}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:center;color:var(--quiet);font-weight:600;padding:9px 8px;border-bottom:1px solid var(--line);font-size:11px;white-space:nowrap;position:sticky;top:0;background:#1d271b}
td{padding:7px 8px;border-bottom:1px solid #202b1a;text-align:center;white-space:nowrap}
tbody tr:hover{background:#1d271b}
.c-rank{color:var(--quiet);width:34px;font-size:11px}
.c-name{text-align:left;min-width:180px}
.c-name .pimg{width:26px;height:26px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:7px;background:#202b1a;border:1px solid #30392f}
.c-name a{color:var(--text);text-decoration:none;font-weight:600}
.c-name a:hover{color:var(--lime)}
.c-name .zh{color:var(--quiet);font-size:10.5px;margin-left:5px;font-weight:400}
.c-rating{font-weight:800;color:var(--lime);font-size:14px}
.c-pos{color:var(--muted)}
.c-price{color:var(--amber);font-weight:600;min-width:96px}
.c-price .ph{color:var(--quiet);font-style:normal;font-size:10.5px;border:1px solid var(--line);border-radius:4px;padding:0 4px}
.pv{display:none}
body[data-platform="console"] .pv-console,body[data-platform="pc"] .pv-pc{display:inline}
.c-pop{color:var(--teal);font-weight:600}
.c-updated{color:var(--quiet);font-size:11px;min-width:62px;font-variant-numeric:tabular-nums}
.c-updated .live-time{display:inline-block;border-bottom:1px dotted #3d4a3a;cursor:help}
.c-move{min-width:96px}
.mv{display:inline-block;margin:0 2px;font-weight:700;font-size:12px}
.mv.up{color:var(--up)}.mv.dn{color:var(--dn)}.mv.flat{color:var(--muted)}
.mv i{font-style:normal;font-size:9px;color:var(--quiet);margin-left:2px}
.mv-na{color:var(--quiet)}
.c-score b{color:var(--lime);font-size:15px}
.c-note{text-align:left;color:var(--muted);font-size:11.5px;white-space:normal;min-width:200px}
.empty{color:var(--quiet);font-size:12.5px;padding:16px;border:1px dashed var(--line);border-radius:9px}
.note{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:12.5px;color:var(--muted)}
.note li{margin-left:18px;margin-bottom:5px}
.note code{background:#1d271b;border:1px solid var(--line);border-radius:5px;padding:1px 5px;color:var(--lime);font-size:11.5px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:24px;border-top:1px solid var(--line);padding-top:12px}
.warn{color:var(--amber)}`;

  const sections = [
    { key: 'watch', title: '一、重点推荐（关注分 Top 30）', empty: '本轮没有取得有效平台价的卡，关注列表为空状态；采集成功后的下一轮即会产出。' },
    { key: 'undervalued', title: '二、同档低价（热度不低但价格低于同档中位）', empty: '本轮无满足「热度分位 ≥50 且价格分 ≥60」的卡，如实空状态。' },
    { key: 'trending', title: '三、本日挂单价异动（相邻有效观测 |变动| ≥ 1%）', empty: '本日尚无可比的两个有效观测点，暂无异动可列（首个整点后开始累积）。' },
    { key: 'hotEvo', title: '四、进化卡热度榜', empty: '本轮无进化卡热度数据，如实空状态。' },
    { key: 'pendingPrice', title: '五、暂无有效平台价（FUTBIN 尚未更新，按占位处理）', empty: '本轮所有追踪卡均已取得有效平台价。' },
  ];

  const body = sections.map(s => `<h2>${esc(s.title)}</h2>\n${table(lists[s.key] || [], { emptyText: s.empty, avatarOf })}`).join('\n');
  const liveJs = `(function(){
  function currentUrl(){
    try { var host=window.parent&&window.parent!==window?window.parent.location:window.location; var prefix=host.pathname.indexOf('/archive/')!==-1?'../':''; return new URL(prefix+'assets/data/current.json',host.href).toString(); }
    catch(e){ return 'assets/data/current.json'; }
  }
  function fmt(v){ if(v>=10000)return (v/10000).toFixed(v%10000===0?0:1)+'万'; if(v>=1000)return (v/1000).toFixed(v%1000===0?0:1)+'K'; return String(v); }
  function pad(n){ return (n<10?'0':'')+n; }
  function bjHM(iso){ var t=Date.parse(iso); if(!isFinite(t))return null; var d=new Date(t+8*3600e3); return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes()); }
  function bjFull(iso){ var t=Date.parse(iso); if(!isFinite(t))return null; var d=new Date(t+8*3600e3); return d.toISOString().slice(0,10)+' '+d.toISOString().slice(11,19)+' 北京'; }
  function latestObs(card){ if(!card)return null; var ts=card.updatedAt||null; var ps=card.platforms||{}; ['console','pc'].forEach(function(k){ var c=ps[k]; if(c&&c.observedAt&&(!ts||c.observedAt>ts)) ts=c.observedAt; }); if(card.popularityObservedAt&&(!ts||card.popularityObservedAt>ts)) ts=card.popularityObservedAt; return ts; }
  document.querySelectorAll('.plat-btn').forEach(function(b){ b.addEventListener('click',function(){ var id=b.dataset.platform; document.body.dataset.platform=id; document.querySelectorAll('.plat-btn').forEach(function(x){var on=x.dataset.platform===id;x.classList.toggle('active',on);x.setAttribute('aria-pressed',on?'true':'false');}); }); });
  var head=document.getElementById('live-updated');
  fetch(currentUrl(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json();}).then(function(doc){
    var cards=doc.cards||{};
    if(head){ var g=bjFull(doc.generatedAt); head.textContent=g?g:'未标注'; if(doc.generatedAt)head.title='统一行情 current.json 生成于 '+doc.generatedAt; }
    document.querySelectorAll('.live-price').forEach(function(el){ var card=cards[el.dataset.cardId], cell=card&&card.platforms&&card.platforms[el.dataset.marketPlatform]; if(cell&&cell.valid){ el.innerHTML=fmt(cell.price); el.title=cell.observedAt?'观测于 '+bjFull(cell.observedAt):''; } else el.innerHTML='<i class="ph">未更新</i>'; });
    document.querySelectorAll('.live-time').forEach(function(el){ var ts=latestObs(cards[el.dataset.cardId]); if(ts){ el.textContent=bjHM(ts); el.title='该卡最近观测：'+bjFull(ts); } else { el.textContent='—'; el.title='该卡在统一行情 current.json 中暂无观测记录'; } });
  }).catch(function(){
    if(head)head.textContent='读取失败';
    document.querySelectorAll('.live-price').forEach(function(el){el.innerHTML='<i class="ph">行情不可用</i>';});
    document.querySelectorAll('.live-time').forEach(function(el){el.textContent='—';});
  });
})();`;

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 市场关注列表 ${esc(dateStr)}</title>
<style>${css}</style></head><body data-platform="${esc(DEFAULT_PLATFORM)}">
<h1>FC27 市场关注列表 <span class="badge">${esc((d.priceBasis || 'partial').toString().toUpperCase())}</span></h1>
<div class="sub">数据日期 ${esc(dateStr)} · 行情更新于 <b id="live-updated" title="按 cardId 从 assets/data/current.json 读取；页面每次加载/刷新都会重新获取">读取中…</b> · 名单生成于 ${esc(d.generatedAt || '未标注')} · 热度与价格来源 FUTBIN /27/popular + /27/popular/evolutions · 逐小时快照 ${esc(points)} 个观测点${u.firstHour ? `（${esc(u.firstHour)}–${esc(u.lastHour)} 时）` : ''}${all.length ? ` · 球员头像 ${avatarCount}/${all.length}` : ''}</div>

<div class="plat-bar" role="group" aria-label="平台切换">
  <span class="plat-label">平台</span>
  ${PLATFORMS.map(p => `<button type="button" class="plat-btn${p.id === DEFAULT_PLATFORM ? ' active' : ''}" data-platform="${p.id}" aria-pressed="${p.id === DEFAULT_PLATFORM}">${esc(p.label)}<small>${esc(p.short)}</small></button>`).join('')}
  <span class="plat-hint">${platformHint}</span>
</div>

<div class="stats">
  ${stat('追踪卡数', num(u.tracked ?? 0))}
  ${stat('有有效平台价', num(u.priceValid ?? 0), '两个平台中至少一个 ≥1000 coins')}
  ${stat('Console 有价 / PC 有价', `${num(u.psValid ?? 0)} / ${num(u.pcValid ?? 0)}`)}
  ${stat('有热度数据', num(u.withPopularity ?? 0))}
  ${stat('逐小时观测点', num(points), u.lastHour ? `最新 ${u.lastHour} 时` : '')}
</div>

${body}
<script>${liveJs}</script>

<h2>口径与评分公式</h2>
<div class="note">
<ul>
  <li>参考价 = 两个平台中有效价（≥1000 coins）的<b>较大者</b>；两个平台都无效的卡不参与打分，只列在「暂无有效平台价」。</li>
  <li>热度分 = 该卡 FUTBIN 热度计数在全体有热度卡中的分位（0–100）。</li>
  <li>价格分 = <code>50 + 50×(1 − 参考价 / 同档中位价)</code>，同档 = 同位置组且总评 ±2、样本 ≥5 才计算；越便宜分越高。</li>
  <li>变动分 = <code>50 + 逐小时挂单价变动百分比×2</code>（+10% → 70，−10% → 30）；仅在同一平台的两个有效观测点之间计算。</li>
  <li>关注分 = <code>0.45×热度分 + 0.40×价格分 + 0.15×变动分</code>；缺项按中性 50 计入（产物内 <code>neutralFilled</code> 标注）。</li>
  <li>${esc((d.scoring && d.scoring.caveat) || 'FC27 未正式开服前，平台价为滚动更新的挂单/估价口径，不是成交价。')}</li>
</ul>
</div>

<div class="footer">FC27 市场关注列表 · ${esc(dateStr)} · 由 render-market-watch.mjs 渲染 · 数据由每小时任务（collect-market-prices.mjs + build-market-watchlist.mjs）刷新 · 仅供游戏内研究，不构成投资或交易建议</div>
</body></html>
`;
}

// ========== 主流程 ==========
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();
  const { data, jsonPath, error } = loadWatchlist(dateStr);
  if (error) console.error(`watchlist.json 解析失败：${error}`);
  if (!data) console.error(`未找到 ${jsonPath}，将渲染为如实空状态。`);
  const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'market-watch.html');
  writeFileSync(outPath, renderWatch(dateStr, data), 'utf8');
  console.log(`市场关注列表已渲染: ${outPath}`);
}
