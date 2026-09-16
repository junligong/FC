#!/usr/bin/env node
/**
 * FC27 市场「概览」页渲染器
 * 用途：把结构化的市场数据（market.json 的 overview 段）渲染为 reports/daily/D/market.html，
 *       即站点 FC27 市场栏目里「市场概览」子标签的内容。
 * 输入：automation/runs/D/market/market.json 的 overview 字段（可用 FC_MARKET_JSON 指定其他路径）。
 * 输出：reports/daily/D/market.html
 *
 * 固定四段结构（顺序与命名不可改）：
 *   一、本周活动卡与本周周黑
 *   二、价格分层：≥100万 / 30-100万 / 10-30万 / 1-10万 —— 每档监控 Top50，按 Rating 排序
 *   三、传奇卡与英雄卡
 *   四、热门进化卡
 * 采集缺失时渲染为如实空状态，绝不伪造、不用 FC26 数据冒充 FC27。
 *
 * 用法：node apps/market/engine/scripts/render-market-overview.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : (v ?? ''));
const fmtPrice = v => (typeof v === 'number' && v > 0 ? num(v) : '—');

// 价格分层：标题、区间与 FUTBIN 筛选参数（/27/players 的 pc_price / ps_price 查询参数）
export const PRICE_TIERS = [
  { id: 'tier-1m', name: '≥ 100 万', range: [1000000, null], futbin: 'pc_price=1000000%2B' },
  { id: 'tier-300k', name: '30 - 100 万', range: [300000, 1000000], futbin: 'pc_price=300000-1000000' },
  { id: 'tier-100k', name: '10 - 30 万', range: [100000, 300000], futbin: 'pc_price=100000-300000' },
  { id: 'tier-10k', name: '1 - 10 万', range: [10000, 100000], futbin: 'pc_price=10000-100000' },
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

// 通用球员表：列可裁剪（price / rating 视段落而定）
function playerTable(items, { withPrice = true, withRating = true, withPop = false, emptyText } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return `<div class="empty">${esc(emptyText || '本期无已核验数据。')}</div>`;
  const head = ['#', '球员'];
  if (withRating) head.push('<th class="w-rating">Rating</th>');
  head.push('位置', '卡版本');
  if (withPrice) head.push('<th class="w-price">价格(coins)</th>');
  if (withPop) head.push('<th class="w-pop">热度</th>');
  head.push('备注');
  const rows = list.map((it, i) => {
    const cells = [
      `<td class="c-rank">${it.rank || i + 1}</td>`,
      `<td class="c-name">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</td>`,
    ];
    if (withRating) cells.push(`<td class="c-rating">${esc(it.rating ?? '')}</td>`);
    cells.push(`<td class="c-pos">${esc(it.pos ?? '')}</td>`, `<td class="c-type">${esc(it.cardType ?? it.version ?? '')}</td>`);
    if (withPrice) cells.push(`<td class="c-price">${fmtPrice(it.price)}</td>`);
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
  const platform = d.platform || 'cross';
  const weekly = ov.weekly || {};
  const promo = weekly.promo || [];
  const totw = weekly.totw || [];
  const iconsHeroes = ov.iconsHeroes || [];
  const evolutions = ov.evolutions || [];

  // 价格分层：优先用数据里的分层，缺失则按固定四档输出空状态（保证结构永远完整）
  const tiersData = Array.isArray(ov.priceTiers) ? ov.priceTiers : [];
  const tierCards = PRICE_TIERS.map(tier => {
    const found = tiersData.find(t => t.id === tier.id || t.name === tier.name) || {};
    const items = (found.items || []).slice(0, TOP_N);
    const note = found.note || (items.length ? `按 Rating 取前 ${items.length} 名（上限 ${TOP_N}）` : '本期该档无已核验价格数据');
    return `<div class="card">
  <div class="tier-head"><h3>${esc(tier.name)}</h3><span class="tier-range">Top ${TOP_N} · 按 Rating</span><span class="tier-count">${items.length} 张</span></div>
  <div class="tier-src">FUTBIN 筛选：<code>${esc(tier.futbin)}</code> · <span>${esc(note)}</span></div>
  ${playerTable(items, { emptyText: 'FC27 平台价格未开放或本档无成交，如实空状态（不伪造、不用 FC26 数据填充）。' })}
</div>`;
  }).join('');

  const srcList = (d.sources || []).map(s => `<li><code>${esc(s.url)}</code>${s.openedAt ? ` · 打开 ${esc(s.openedAt)}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</li>`).join('');
  const missingList = (d.missing || []).map(m => `<li>${esc(m)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 市场概览 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;
--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--gold:#e3b341}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px 28px 40px;line-height:1.6}
h1{font-size:21px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(229,72,77,.18);border:1px solid rgba(229,72,77,.4);color:#ff6259}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 22px}
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
.c-name a{color:#8fd6bb;text-decoration:none}
.c-name a:hover{text-decoration:underline}
.c-rating{color:var(--text);font-weight:700;width:60px}
.w-rating{width:60px}.w-price{width:110px}.w-pop{width:70px}
.c-pos{color:var(--muted)}
.c-type,.c-note{color:var(--quiet);font-size:12px}
.c-price{color:var(--gold);font-weight:600}
.c-pop{color:#ff6259;font-weight:700}
.empty{color:var(--quiet);font-size:12.5px;padding:14px;border:1px dashed var(--line);border-radius:9px;background:#161d17}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
code{background:#2a3329;padding:1px 5px;border-radius:4px;font-size:11.5px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:30px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body>
<h1>FC27 市场概览 <span class="badge">${esc(status)}</span></h1>
<div class="sub">数据日期 ${esc(dateStr)} · 平台 ${esc(platform)} · 来源 FUTBIN · 四段式固定结构</div>

<h2>一、本周活动卡与本周周黑</h2>
<div class="card">
  <div class="tier-head"><h3>本周活动卡（Promo）</h3><span class="tier-count">${promo.length} 张</span></div>
  ${playerTable(promo, { emptyText: '本周活动卡名单本轮未采集或尚未公布，如实空状态。' })}
</div>
<div class="card">
  <div class="tier-head"><h3>本周周黑（TOTW）</h3><span class="tier-count">${totw.length} 张</span></div>
  ${playerTable(totw, { emptyText: '本周周黑名单本轮未采集或尚未公布，如实空状态。' })}
</div>

<h2>二、价格分层（每档 Top ${TOP_N}，按 Rating）</h2>
${tierCards}

<h2>三、传奇卡与英雄卡</h2>
<div class="card">${playerTable(iconsHeroes, { emptyText: '传奇卡与英雄卡本轮未独立核验，如实空状态。' })}</div>

<h2>四、热门进化卡</h2>
<div class="card">${playerTable(evolutions, { withPrice: false, emptyText: 'FC27 当前无可用进化卡（来源 /27/popular/evolutions），如实空状态。' })}</div>

<h2>数据来源与核验</h2>
<div class="card">${srcList ? `<ul>${srcList}</ul>` : '<div class="empty">未记录来源。</div>'}</div>

<h2>缺失项记录</h2>
<div class="card">${missingList ? `<ul>${missingList}</ul>` : '<div class="empty">无缺失项记录。</div>'}</div>

<div class="footer">FC27 市场概览 · ${esc(dateStr)} · 由 render-market-overview.mjs 渲染 · 数据仅作游戏市场研究，不构成投资或交易建议</div>
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
