#!/usr/bin/env node
/**
 * FC27 进化专栏渲染器
 * 用途：把结构化的进化数据（evolution.json）渲染为 reports/daily/D/evolution.html，
 *       即站点「进化专栏」（首页右栏 + 独立视图）的内容。
 * 输入：automation/runs/D/evolution/evolution.json（可用 FC_EVOLUTION_JSON 指定其他路径）。
 *       页面运行时从 assets/data/current.json 按 baseCardId 读取统一行情。
 * 输出：reports/daily/D/evolution.html
 *
 * 版式（本日改版：从「全量 500 张流水表」改为「精选池 × 三视角」）：
 *   本日速览        —— 路径数 / 候选数 / 精选数 / 有报价数
 *   一、按进化精选  —— 每条进化只出「热度 Top5」人选，组内按参考价升序
 *   二、按位置精选  —— 同一精选池按位置分组
 *   三、按价格档精选—— 同一精选池按价格档位分组
 *   四、进化路线与前置条件核验
 *   五、数据来源与核验 / 缺失项记录
 * 精选池 = 每条进化按 popularityCount 取前 5，去重后最多 14×5 张；全量数据仍完整保存在 evolution.json。
 * 采集缺失时渲染为如实空状态，绝不伪造或沿用旧日期数据。
 *
 * 用法：node apps/market/engine/scripts/render-evolution.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avatarIndex, avatarSrc, materializeAvatars } from '../../../../shared/lib/player-avatar.mjs';
import { CURRENT_MARKET_PATH, readCurrentMarket } from '../src/current-market.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : (v ?? ''));

/** 金币价格式化：950 → 950、4800 → 4.8K、19000 → 1.9万 */
const coin = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
};

const TOP_N = 5;
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const popOf = c => { const n = parseInt(c.popularityCount, 10); return Number.isFinite(n) ? n : 0; };
const currentMarket = readCurrentMarket(CURRENT_MARKET_PATH);
const baseCardIdOf = c => c.baseCardId || String(c.url || '').match(/\/player\/(\d+)/)?.[1] || null;
const currentOf = c => currentMarket.cards?.[baseCardIdOf(c)] || null;
const priceOf = c => {
  const card = currentOf(c);
  const pc = card?.platforms?.pc?.valid ? card.platforms.pc.price : 0;
  const console = card?.platforms?.console?.valid ? card.platforms.console.price : 0;
  return pc || console || null;
};

/** 组内排序：参考价升序（无报价置后），同价按热度降序 */
const byPriceThenPop = (a, b) => {
  const pa = priceOf(a), pb = priceOf(b);
  if (pa === null && pb === null) return popOf(b) - popOf(a);
  if (pa === null) return 1;
  if (pb === null) return -1;
  if (pa !== pb) return pa - pb;
  return popOf(b) - popOf(a);
};

/** 精选选取排序：只按热度降序；同热度用 Rating、姓名做确定性兜底，刻意不让价格影响「最热 5 人」的构成 */
const byPopDesc = (a, b) =>
  popOf(b) - popOf(a)
  || (parseInt(b.rating, 10) || 0) - (parseInt(a.rating, 10) || 0)
  || String(a.name || '').localeCompare(String(b.name || ''));

const POS_ORDER = ['GK', 'LB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const BANDS = [
  { key: '≤1K', max: 1000, note: '千币以内，进化成本最低的一档' },
  { key: '1K–5K', max: 5000, note: '低档位，适合批量投入' },
  { key: '5K–20K', max: 20000, note: '中档位，需权衡进化收益' },
  { key: '20K–50K', max: 50000, note: '高档位，通常是热门卡' },
  { key: '>50K', max: Infinity, note: '顶价档，投入前先确认进化收益' },
  { key: '无报价', max: null, note: '市场数据集未覆盖该球员基础卡价格，如实留空' }
];
const bandOf = c => {
  const v = priceOf(c);
  if (v === null) return '无报价';
  return (BANDS.find(b => b.max !== null && v <= b.max) || { key: '无报价' }).key;
};

function loadData(dateStr) {
  const jsonPath = process.env.FC_EVOLUTION_JSON
    || path.join(ROOT, 'automation', 'runs', dateStr, 'evolution', 'evolution.json');
  if (!existsSync(jsonPath)) return { data: null, jsonPath };
  try { return { data: JSON.parse(readFileSync(jsonPath, 'utf8')), jsonPath }; }
  catch (e) { return { data: null, jsonPath, error: e.message }; }
}

export function renderEvolution(dateStr, data) {
  const d = data || {};
  const status = (d.status || 'partial').toUpperCase();
  const cards = Array.isArray(d.evolutions) ? d.evolutions : [];
  const routes = Array.isArray(d.routes) ? d.routes : [];
  const sources = d.sources || [];
  const missing = d.missing || [];
  const notes = d.notes || [];
  const cutoff = d.dataCutoff || d.generatedAt || '未标注';
  const join = d.marketJoin || null;

  // ── 精选池：每条进化取热度 Top5 ──
  const byEvo = new Map();
  for (const c of cards) {
    const k = c.evolutionName || '未标注进化';
    if (!byEvo.has(k)) byEvo.set(k, []);
    byEvo.get(k).push(c);
  }
  const groups = [...byEvo.entries()].map(([name, list]) => {
    const sorted = [...list].sort(byPopDesc);
    return { name, total: list.length, picks: sorted.slice(0, TOP_N), popSum: sorted.slice(0, TOP_N).reduce((s, c) => s + popOf(c), 0) };
  }).sort((a, b) => b.popSum - a.popSum || b.total - a.total);

  const pool = groups.flatMap(g => g.picks);
  const poolPriced = pool.filter(c => priceOf(c) !== null).length;
  const candidatesPriced = cards.filter(c => priceOf(c) !== null).length;

  // ── 球员头像：只为本页真正展示的精选池解析并落盘 ──
  const idx = avatarIndex();
  const avatarResolved = pool.map(c => idx.resolve(c)?.resourceId || null);
  const avatarReady = materializeAvatars(path.join(ROOT, 'reports', 'daily', dateStr),
    avatarResolved.filter(Boolean));
  const avatarOk = avatarResolved.filter(rid => rid && avatarReady.has(String(rid))).length;

  const avaCell = c => {
    const i = pool.indexOf(c);
    const rid = i > -1 ? avatarResolved[i] : null;
    const src = rid && avatarReady.has(String(rid)) ? avatarSrc(rid) : '';
    const nm = c.url
      ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>`
      : esc(c.name);
    const zh = c.nameZh ? `<span class="zh">${esc(c.nameZh)}</span>` : '';
    return `${src ? `<img class="pimg" src="${esc(src)}" loading="lazy" alt="">` : ''}${nm}${zh}`;
  };

  const priceCell = c => {
    const id = baseCardIdOf(c) || '';
    const card = currentOf(c);
    const ps = card?.platforms?.console?.valid ? coin(card.platforms.console.price) : '';
    const pc = card?.platforms?.pc?.valid ? coin(card.platforms.pc.price) : '';
    return `<span class="px evo-live-price${ps || pc ? '' : ' off'}" data-card-id="${esc(id)}"><b class="pm">C</b><span data-p="console">${ps ? esc(ps) : '—'}</span><b class="pm">P</b><span data-p="pc">${pc ? esc(pc) : '—'}</span></span>`;
  };

  const hotCell = c => {
    const n = popOf(c);
    return `<span class="hot">${num(n)}</span>`;
  };

  // 行内不重复列头，三个视角共用同一行渲染
  const row = (c, i) => `<tr data-card-id="${esc(baseCardIdOf(c) || '')}">
<td class="c-rank">${i + 1}</td>
<td class="c-name">${avaCell(c)}</td>
<td class="c-rating">${esc(c.rating ?? '')}</td>
<td class="c-pos">${esc(c.pos ?? '')}</td>
<td class="c-hot">${hotCell(c)}</td>
<td class="c-price">${priceCell(c)}</td>
<td class="c-ovr">${c.totalStats ? num(c.totalStats) : '—'}</td>
<td class="c-fbr">${c.futbinRating ? esc(c.futbinRating) : '—'}</td>
</tr>`;

  const THEAD = `<thead><tr><th>#</th><th>球员</th><th>RAT</th><th>位置</th><th>热度</th><th>参考价 C/P</th><th>六维合计</th><th>FB评分</th></tr></thead>`;
  const table = rows => `<div class="tbl-wrap"><table class="tbl">${THEAD}<tbody>${rows}</tbody></table></div>`;

  // ── 一、按进化精选 ──
  const evoBlock = groups.length
    ? groups.map(g => {
      const head = g.picks[0] || {};
      const route = routes.find(r => (r.name || '').startsWith(g.name));
      const req = Array.isArray(head.requirements) ? head.requirements.join('、') : '';
      return `<div class="card">
<div class="tier-head">
<h3>${esc(g.name)}</h3>
<span class="tier-range">候选 ${g.total} 张</span>
<span class="tier-range alt">精选 Top${g.picks.length} 热度合计 ${num(g.popSum)}</span>
${route && route.cost ? `<span class="tier-range">费用 ${esc(route.cost)}</span>` : ''}
</div>
<div class="req">${req ? `入选前提：${esc(req)}` : '入选前提：页面未列出'}</div>
${table(g.picks.map(row).join(''))}
</div>`;
    }).join('')
    : `<div class="empty">FC27 当前无可用热门进化卡（来源 <code>/27/popular/evolutions</code>），如实空状态。</div>`;

  // ── 二、按位置精选 ──
  const posMap = new Map();
  for (const c of pool) {
    const k = c.pos || '未标注';
    if (!posMap.has(k)) posMap.set(k, []);
    posMap.get(k).push(c);
  }
  const posGroups = [...posMap.entries()]
    .sort((a, b) => {
      const ia = POS_ORDER.indexOf(a[0]), ib = POS_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const posBlock = posGroups.length
    ? posGroups.map(([pos, list]) => {
      const sorted = [...list].sort(byPriceThenPop);
      const cheapest = sorted.find(c => priceOf(c) !== null);
      return `<div class="card">
<div class="tier-head"><h3>${esc(pos)}</h3><span class="tier-range">${list.length} 人</span>
${cheapest ? `<span class="tier-range alt">最低参考价 ${esc(coin(priceOf(cheapest)))}</span>` : '<span class="tier-range alt">本组暂无报价</span>'}</div>
${table(sorted.map(row).join(''))}
</div>`;
    }).join('')
    : '<div class="empty">精选池为空，无位置分组。</div>';

  // ── 三、按价格档精选 ──
  const bandMap = new Map(BANDS.map(b => [b.key, []]));
  for (const c of pool) bandMap.get(bandOf(c)).push(c);
  // 只有「无报价」一档会把大量无价条目堆成一张长表，参考价值低；该档不单独成表，
  // 改为在区块下方如实标注人数（这些卡片仍完整出现在「按进化」「按位置」两个视图中）。
  const unpriced = bandMap.get('无报价').length;
  const pricedBands = BANDS.filter(b => b.key !== '无报价' && bandMap.get(b.key).length);
  const bandBlock = pool.length
    ? `${pricedBands.map(b => {
      const list = [...bandMap.get(b.key)].sort(byPriceThenPop);
      return `<div class="card">
<div class="tier-head"><h3>${esc(b.key)}</h3><span class="tier-range">${list.length} 人</span><span class="tier-range alt">${esc(b.note)}</span></div>
${table(list.map(row).join(''))}
</div>`;
    }).join('')}${unpriced ? `<div class="empty">另有 ${unpriced} 人在精选池内，但市场数据集未覆盖其基础卡价格，本视图如实不计入；这些卡片仍见上方的「按进化」「按位置」视图。</div>` : ''}`
    : '<div class="empty">精选池为空，无价格档分组。</div>';

  // ── 四、进化路线 ──
  const routeBlock = routes.length
    ? routes.map(r => `<div class="card"><div class="tier-head"><h3>${esc(r.name || '进化路线')}</h3>${r.cost ? `<span class="tier-range">费用 ${esc(num(r.cost))}</span>` : ''}</div>${r.desc ? `<p class="desc">${esc(r.desc)}</p>` : ''}${Array.isArray(r.steps) && r.steps.length ? `<ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${r.note ? `<div class="tier-src">${esc(r.note)}</div>` : ''}</div>`).join('')
    : `<div class="empty">本期未输出进化路线建议。</div>`;

  const kpi = (label, value, hint) => `<div class="kpi"><div class="kv">${esc(value)}</div><div class="kl">${esc(label)}</div>${hint ? `<div class="kh">${esc(hint)}</div>` : ''}</div>`;
  const kpiBlock = cards.length ? `<div class="kpis">
${kpi('进化路径', String(groups.length), '来源 /27/evolutions')}
${kpi('候选卡总数', String(cards.length), '全量保存在 evolution.json')}
${kpi('本页精选', String(pool.length), `每条进化热度 Top${TOP_N}`)}
${kpi('有报价', String(poolPriced), `精选池 ${pool.length} 人中；全量 ${candidatesPriced}/${cards.length}`)}
</div>` : '';

  const joinNote = join
    ? `<div class="note"><b>价格口径：</b>${esc(join.note)}关联结果：${join.matchedToMarket}/${join.total}，其中当前有效报价 ${join.withPrice} 张。页面刷新时重新请求统一行情；未命中如实留空。</div>`
    : `<div class="note"><b>价格口径：</b>候选卡尚未写入 baseCardId，本页无法关联统一行情。</div>`;

  const liveJs = `(function(){
  function currentUrl(){
    try { var host=window.parent&&window.parent!==window?window.parent.location:window.location; var prefix=host.pathname.indexOf('/archive/')!==-1?'../':''; return new URL(prefix+'assets/data/current.json',host.href).toString(); }
    catch(e){ return 'assets/data/current.json'; }
  }
  function fmt(v){ if(v>=10000)return (v/10000).toFixed(v%10000===0?0:1)+'万'; if(v>=1000)return (v/1000).toFixed(v%1000===0?0:1)+'K'; return String(v); }
  fetch(currentUrl(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json();}).then(function(doc){
    var cards=doc.cards||{}; document.querySelectorAll('.evo-live-price').forEach(function(el){ var c=cards[el.dataset.cardId], any=false; ['console','pc'].forEach(function(pid){var cell=c&&c.platforms&&c.platforms[pid], target=el.querySelector('[data-p="'+pid+'"]');if(target)target.textContent=cell&&cell.valid?fmt(cell.price):'—';if(cell&&cell.valid)any=true;});el.classList.toggle('off',!any); });
  }).catch(function(){ document.querySelectorAll('.evo-live-price').forEach(function(el){el.classList.add('off');}); });
})();`;

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 进化专栏 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;
--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--gold:#e3b341;--teal:#8fd6bb}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px 28px 40px;line-height:1.6}
h1{font-size:21px;font-weight:800;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(233,200,74,.14);border:1px solid rgba(227,179,65,.4);color:var(--gold)}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 18px}
h2{font-size:17px;font-weight:750;margin:28px 0 14px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:17px;background:var(--gold);border-radius:2px}
h2 .cnt{color:var(--quiet);font-size:12px;font-weight:500}
h3{font-size:14.5px;font-weight:700}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:6px}
.kpi{background:linear-gradient(180deg,var(--surface),#141c15);border:1px solid var(--line);border-radius:11px;padding:11px 13px}
.kv{font-size:22px;font-weight:800;color:var(--gold);line-height:1.25}
.kl{font-size:12px;color:var(--muted);margin-top:1px}
.kh{font-size:10.5px;color:var(--quiet);margin-top:2px}
.card{background:linear-gradient(180deg,var(--surface),#141c15);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.tier-head{display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.tier-range{font-size:12px;color:var(--gold);background:rgba(227,179,65,.14);border:1px solid rgba(227,179,65,.35);padding:2px 9px;border-radius:999px}
.tier-range.alt{color:var(--teal);background:rgba(143,214,187,.12);border-color:rgba(143,214,187,.3)}
.tier-src{font-size:11.5px;color:var(--quiet);margin-top:8px}
.req{font-size:11.5px;color:var(--quiet);margin:-2px 0 9px}
.desc{color:var(--muted);font-size:13px}
.steps{padding-left:20px;margin-top:8px}.steps li{font-size:12.5px;color:var(--muted);margin:4px 0}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--quiet);font-weight:600;padding:8px 9px;border-bottom:1px solid var(--line);font-size:11.5px;white-space:nowrap}
td{padding:7px 9px;border-bottom:1px solid #242d25}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#1a211b}
.c-rank{color:var(--gold);font-weight:700;width:34px}
.c-name{min-width:190px}
.c-name a{color:var(--teal);text-decoration:none;font-weight:600}.c-name a:hover{text-decoration:underline}
.c-name .zh{color:#9aa79a;font-size:11px;margin-left:6px}
.c-name .pimg{width:26px;height:26px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:7px;background:#202b1a;border:1px solid #30392f}
.c-rating{font-weight:700;width:46px}
.c-pos,.c-fbr{color:var(--muted)}
.c-hot{width:64px}
.hot{color:var(--red);font-weight:700}
.c-price{white-space:nowrap;width:120px}
.px{color:var(--text);font-weight:600}
.px .pm{display:inline-block;font-size:9.5px;font-weight:800;color:var(--quiet);background:#26302a;border-radius:3px;padding:0 4px;margin:0 3px 0 0;vertical-align:1px}
.px.off{color:var(--quiet);font-weight:400;font-size:11.5px}
.c-ovr{color:var(--muted);width:74px}
.empty{color:var(--quiet);font-size:12.5px;padding:14px;border:1px dashed var(--line);border-radius:9px;background:#161d17}
.note{background:rgba(233,200,74,.07);border:1px solid rgba(227,179,65,.3);border-radius:10px;padding:13px 15px;font-size:12.5px;color:#aeb5aa;margin:16px 0}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
code{background:#2a3329;padding:1px 5px;border-radius:4px;font-size:11.5px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:30px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body>
<h1>FC27 进化专栏 <span class="badge">${esc(status)}</span></h1>
<div class="sub">数据日期 ${esc(dateStr)} · 数据截止 ${esc(cutoff)} · 来源 FUTBIN Popular Evolutions${pool.length ? ` · 本页球员头像 ${avatarOk}/${pool.length}` : ''}</div>

${notes.length ? `<div class="note"><b>本轮说明：</b>${notes.map(esc).join('<br>')}</div>` : ''}
${joinNote}

<h2>本日速览</h2>
${kpiBlock || '<div class="empty">无可用数据。</div>'}

<h2>一、按进化精选 <span class="cnt">每条进化只出热度 Top${TOP_N}，组内按参考价升序</span></h2>
${evoBlock}

<h2>二、按位置精选 <span class="cnt">同一精选池按位置分组，组内按参考价升序</span></h2>
${posBlock}

<h2>三、按价格档精选 <span class="cnt">同一精选池按参考价档位分组</span></h2>
${bandBlock}

<h2>四、进化路线与前置条件核验</h2>
${routeBlock}

<h2>五、数据来源与核验</h2>
<div class="card">${sources.length ? `<ul>${sources.map(s => `<li><code>${esc(s.url)}</code>${s.openedAt ? ` · 打开 ${esc(s.openedAt)}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</li>`).join('')}</ul>` : '<div class="empty">未记录来源。</div>'}</div>

<h2>缺失项记录</h2>
<div class="card">${missing.length ? `<ul>${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<div class="empty">无缺失项记录。</div>'}</div>

<script>${liveJs}</script>

<div class="footer">FC27 进化专栏 · ${esc(dateStr)} · 由 render-evolution.mjs 渲染 · 全量 ${cards.length} 张候选卡数据保存在 evolution.json，本页为精选视图 · 仅作游戏内研究，不构成交易建议</div>
</body></html>
`;
}

// ========== 主流程 ==========
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();
  const { data, jsonPath, error } = loadData(dateStr);
  if (error) console.error(`evolution.json 解析失败：${error}`);
  if (!data) console.error(`未找到 ${jsonPath}，将渲染为如实空状态。`);
  const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'evolution.html');
  writeFileSync(outPath, renderEvolution(dateStr, data), 'utf8');
  console.log(`进化专栏已渲染: ${outPath}`);
}
