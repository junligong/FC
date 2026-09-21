#!/usr/bin/env node
/**
 * FC27「传奇 / 英雄卡」同时段（开服第 N 天）对比 与 购买建议
 *
 * 用途：把 FC27 当前价（开服第 N 天）与 FC26 开服第 N 天（同日偏移）的历史价逐卡对照，
 *       并叠加「FC26 在同期之后仍会跌多少」的走势参照，输出传奇卡（Icon）与英雄卡（Hero）
 *       的购买建议分级（买入 / 分批买入 / 观望等待 / 谨慎 / 数据不足）。
 *
 * 为什么是「同时段」而不是「开服日一次对比」：
 *   FC26 与 FC27 开服日同为 09-18（相差整一年），两代卡的行情节奏天然对齐。
 *   开服第 1 天 FC26 传奇卡价普遍处于开服冲高后的高位，随后首月大幅回落（如马拉多纳首月 -69%）。
 *   因此单看「FC27 当前价 vs FC26 开服日价」会系统性高估空间；正确口径是
 *   「FC27 开服第 N 天价 vs FC26 开服第 N 天价」，并叠加 FC26 同期之后的走势作为前瞻参照。
 *
 * 输入：
 *   - FC27 传奇当前价：apps/market/engine/data/prices/fc27/current.json（按 cardId，detail 页双平台价）
 *   - FC27 传奇台账：apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json（slug/中文名/评分）
 *   - FC26 传奇历史：apps/market/engine/icons/data/prices/fc26/base-icons.json（开服首月逐日均价 cross）
 *   - FC27 英雄当前价：apps/market/engine/heroes/data/prices/fc27/base-heroes.json（列表页双平台价）
 *   - FC26 英雄历史：apps/market/engine/heroes/data/prices/fc26/base-heroes.json（开服首月逐日均价 cross）
 *
 * 输出：
 *   - apps/market/engine/icons/data/research/same-period-<DATE>.json   结构化结果（可复核、可复用）
 *   - reports/daily/<DATE>/same-period-advice.html                      当日报告
 *   - apps/market/engine/icons/reports/fc27-same-period-advice.html     跨日期常驻底稿
 *
 * 建议分级（数据驱动，不写死结论）：
 *   - 买入窗口  buy       ：FC27 < FC26 同期价，且 FC26 同期后基本企稳（月末/同期 ≥ 0.95）
 *   - 分批买入  staged    ：FC27 < FC26 同期价，但 FC26 同期后仍继续下探（< 0.95）
 *   - 观望等待  wait      ：FC27 ≥ FC26 同期价，且 FC26 同期后仍继续下探
 *   - 谨慎      caution   ：FC27 ≥ FC26 同期价，且 FC26 同期后未再下跌
 *   - 数据不足  insufficient：缺 FC26 同期价或 FC27 有效价（≥1000 coins）
 *
 * 用法：node apps/market/engine/scripts/build-same-period-advice.mjs [YYYY-MM-DD]
 * 本报告仅为游戏内市场研究，不构成任何投资或交易建议。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const MIN_VALID_PRICE = 1000;
const FC27_LAUNCH_DATE = '2026-09-18';
const FC26_LAUNCH_DATE = '2025-09-18';
const DAY_MS = 86400000;

const ICON_DIR = path.join(ROOT, 'apps', 'market', 'engine', 'icons');
const HERO_DIR = path.join(ROOT, 'apps', 'market', 'engine', 'heroes');
const CUR_PATH = path.join(ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27', 'current.json');
const ICON_LEDGER = path.join(ICON_DIR, 'data', 'players', 'fc27', 'fc27-icons-playstyles.json');
const FC26_ICON = path.join(ICON_DIR, 'data', 'prices', 'fc26', 'base-icons.json');
const FC27_HERO = path.join(HERO_DIR, 'data', 'prices', 'fc27', 'base-heroes.json');
const FC26_HERO = path.join(HERO_DIR, 'data', 'prices', 'fc26', 'base-heroes.json');

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const dateStr = isDate(process.argv[2]) ? process.argv[2] : todayShanghai();

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coins = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v.toLocaleString('en-US') : '—');
const pctOf = v => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');

function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayOffset = Math.max(0, Math.round((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${FC27_LAUNCH_DATE}T00:00:00Z`)) / DAY_MS));
// 开服第 N 天（1-based）：开服当天 = 第 1 天。dayOffset 是「当前日期 - 开服日期」的天数差（0-based），
// 用于把 FC26 开服日偏移到相应同日（fc26SameDayDate = FC26 开服日 + dayOffset）。用户口径：9-18=第1天、9-19=第2天、9-20=第3天。
const dayN = dayOffset + 1;
const fc26SameDayDate = addDays(FC26_LAUNCH_DATE, dayOffset);

// ---------- FC26 逐日序列（传奇 / 英雄通用）：按 slug 建索引 ----------
function fc26Index(file) {
  const map = new Map();
  for (const p of (file && Array.isArray(file.players) ? file.players : [])) {
    const series = (p.prices && (p.prices.cross || p.prices.console)) || {};
    const days = Object.keys(series).filter(d => typeof series[d] === 'number' && series[d] > 0).sort();
    if (!days.length) continue;
    const vals = days.map(d => series[d]);
    const sameDay = typeof series[fc26SameDayDate] === 'number' ? series[fc26SameDayDate] : null;
    const afterVals = days.filter(d => d >= fc26SameDayDate).map(d => series[d]);
    map.set(String(p.slug || ''), {
      id: String(p.id || ''),
      slug: p.slug || '',
      rating: p.rating ?? null,
      launchDate: days[0],
      launchPrice: typeof series[FC26_LAUNCH_DATE] === 'number' ? series[FC26_LAUNCH_DATE] : null,
      sameDayDate: fc26SameDayDate,
      sameDayPrice: sameDay,
      endDate: days[days.length - 1],
      endPrice: series[days[days.length - 1]],
      minAfterSameDay: afterVals.length ? Math.min(...afterVals) : null,
      monthMin: Math.min(...vals),
      monthMax: Math.max(...vals),
      days: days.length,
      series: days.map(d => ({ date: d, price: series[d] })),
    });
  }
  return map;
}

// ---------- 建议分级 ----------
const TIER_META = {
  buy: { rank: 0, label: '买入窗口', color: '#22c55e', bg: 'rgba(34,197,94,.14)', border: 'rgba(34,197,94,.45)' },
  staged: { rank: 1, label: '分批买入', color: '#38bdf8', bg: 'rgba(56,189,248,.14)', border: 'rgba(56,189,248,.45)' },
  wait: { rank: 2, label: '观望等待', color: '#f59e0b', bg: 'rgba(245,158,11,.14)', border: 'rgba(245,158,11,.45)' },
  caution: { rank: 3, label: '谨慎', color: '#94a3b8', bg: 'rgba(148,163,184,.14)', border: 'rgba(148,163,184,.45)' },
  insufficient: { rank: 4, label: '数据不足', color: '#64748b', bg: 'rgba(100,116,139,.12)', border: 'rgba(100,116,139,.4)' },
};
function grade(sameDayRatio, forwardRatio) {
  if (sameDayRatio == null || forwardRatio == null) {
    return { tier: 'insufficient', label: TIER_META.insufficient.label, reason: '缺 FC26 同期价或 FC27 有效价，暂无法分级' };
  }
  const cheaper = sameDayRatio < 1.0;
  const stillFalling = forwardRatio < 0.95;
  if (cheaper && !stillFalling) return { tier: 'buy', label: TIER_META.buy.label, reason: `FC27 比 FC26 同期低（${pctOf(sameDayRatio)}），且 FC26 同期后基本企稳` };
  if (cheaper && stillFalling) return { tier: 'staged', label: TIER_META.staged.label, reason: `FC27 已比 FC26 同期低（${pctOf(sameDayRatio)}），但 FC26 同期后仍下探，宜分批` };
  if (!cheaper && stillFalling) return { tier: 'wait', label: TIER_META.wait.label, reason: `FC27 高于/持平 FC26 同期（${pctOf(sameDayRatio)}），历史显示同期后仍会回调` };
  return { tier: 'caution', label: TIER_META.caution.label, reason: `FC27 高于/持平 FC26 同期（${pctOf(sameDayRatio)}），且历史同期后未再跌，无折价` };
}

// ---------- 载入 ----------
const current = readJSON(CUR_PATH);
const iconLedger = readJSON(ICON_LEDGER);
const fc26IconIdx = fc26Index(readJSON(FC26_ICON));
const fc27Heroes = readJSON(FC27_HERO);
const fc26HeroIdx = fc26Index(readJSON(FC26_HERO));

const currentById = new Map(Object.entries((current && current.cards) || {}));
const ledgerById = new Map((Array.isArray(iconLedger) ? iconLedger : []).map(i => [String(i.id), i]));

// FC27 当前价代表值：两平台有效价（≥1000）较大者
function fc27Representative(platforms) {
  const c = platforms && platforms.console;
  const p = platforms && platforms.pc;
  const cOk = c && c.valid && typeof c.price === 'number' && c.price >= MIN_VALID_PRICE;
  const pOk = p && p.valid && typeof p.price === 'number' && p.price >= MIN_VALID_PRICE;
  const vals = [cOk ? c.price : null, pOk ? p.price : null].filter(v => v !== null);
  return {
    console: cOk ? c.price : null,
    pc: pOk ? p.price : null,
    representative: vals.length ? Math.max(...vals) : null,
  };
}

function buildRow(kind, id, slug, name, nameZh, rating, position, fc27, f26) {
  const sameDayPrice = f26 ? f26.sameDayPrice : null;
  const endPrice = f26 ? f26.endPrice : null;
  const sameDayRatio = (sameDayPrice != null && sameDayPrice > 0 && fc27.representative != null) ? fc27.representative / sameDayPrice : null;
  const forwardRatio = (sameDayPrice != null && sameDayPrice > 0 && endPrice != null) ? endPrice / sameDayPrice : null;
  const g = grade(sameDayRatio, forwardRatio);
  return {
    kind, id: String(id), slug: String(slug || ''),
    name: name || '', nameZh: nameZh || '', rating: rating ?? null, position: position || '',
    fc27,
    fc26: f26 ? {
      launchPrice: f26.launchPrice, sameDayDate: f26.sameDayDate, sameDayPrice,
      endDate: f26.endDate, endPrice, minAfterSameDay: f26.minAfterSameDay,
      monthMin: f26.monthMin, monthMax: f26.monthMax, days: f26.days,
    } : null,
    sameDayRatio, forwardRatio,
    tier: g.tier, tierLabel: g.label, reason: g.reason,
    fc26Series: f26 ? f26.series : [],
  };
}

// ---------- 传奇卡（Icon）----------
const iconRows = [];
for (const item of (Array.isArray(iconLedger) ? iconLedger : [])) {
  const id = String(item.id);
  const cur = currentById.get(id);
  if (!cur) continue; // current.json 里没有的传奇卡跳过（以采集到行情的卡为准）
  const fc27 = fc27Representative(cur.platforms);
  const f26 = fc26IconIdx.get(String(item.slug || '')) || null;
  iconRows.push(buildRow('icon', id, item.slug, item.name, item.nameZh, item.rating, item.position, fc27, f26));
}

// ---------- 英雄卡（Hero）----------
const heroRows = [];
for (const h of ((fc27Heroes && Array.isArray(fc27Heroes.players)) ? fc27Heroes.players : [])) {
  const fc27 = fc27Representative(h.prices);
  const f26 = fc26HeroIdx.get(String(h.slug || '')) || null;
  heroRows.push(buildRow('hero', h.id, h.slug, h.name, h.nameZh, h.rating, h.version ? `${h.position || ''}`.trim() : (h.position || ''), fc27, f26));
}

// ---------- 排序 ----------
const tierRank = t => (TIER_META[t] ? TIER_META[t].rank : 9);
const sortRows = rows => rows.slice().sort((a, b) => {
  const d = tierRank(a.tier) - tierRank(b.tier);
  if (d !== 0) return d;
  const ra = a.sameDayRatio ?? 9, rb = b.sameDayRatio ?? 9;
  return ra - rb;
});

function summarize(rows) {
  const byTier = {};
  let compared = 0, advised = 0;
  for (const r of rows) {
    byTier[r.tier] = (byTier[r.tier] || 0) + 1;
    if (r.fc26) compared++;
    if (r.tier === 'buy' || r.tier === 'staged') advised++;
  }
  return { total: rows.length, compared, advised, byTier };
}

const iconStats = summarize(iconRows);
const heroStats = summarize(heroRows);

// 头版结论：由数据生成
function headline() {
  const iconCheap = (iconStats.byTier.buy || 0) + (iconStats.byTier.staged || 0);
  const iconRich = (iconStats.byTier.wait || 0) + (iconStats.byTier.caution || 0);
  const parts = [];
  parts.push(`FC27 开服第 ${dayN} 天（${dateStr}），与 FC26 开服第 ${dayN} 天（${fc26SameDayDate}）同时段对照。`);
  if (iconStats.compared) {
    const cheapPct = Math.round(iconCheap / iconStats.compared * 100);
    parts.push(`传奇卡 ${iconStats.compared} 张可对照，其中 ${iconCheap} 张（约 ${cheapPct}%）当前价已低于 FC26 同期、${iconRich} 张仍高于同期。`);
  }
  if (heroStats.total) {
    parts.push(`英雄卡 ${heroStats.total} 张名单，${heroStats.compared} 张有 FC26 同期对照，${(heroStats.byTier.insufficient || 0)} 张因 FC27 有效价缺失暂无法分级。`);
  }
  if (dayN <= 3) {
    parts.push(`开服初期 FC26 传奇/英雄价整体处于冲高后的高位，历史首月普遍显著回落，故多数卡当前建议「观望等待」回调；只有已跌破 FC26 同期的少数卡进入「分批买入 / 买入窗口」。`);
  }
  return parts.join(' ');
}

// ---------- 渲染 HTML ----------
const tierTag = r => {
  const m = TIER_META[r.tier] || TIER_META.insufficient;
  return `<span class="tag" style="color:${m.color};background:${m.bg};border:1px solid ${m.border}">${esc(r.tierLabel)}</span>`;
};

function sparkline(row) {
  const series = row.fc26Series || [];
  if (series.length < 2) return '<span class="muted">—</span>';
  const prices = series.map(s => s.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || 1;
  const W = 96, H = 26, P = 3;
  const x = i => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = v => H - P - ((v - min) / span) * (H - 2 * P);
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.price).toFixed(1)}`).join(' ');
  // 同期限位点（FC26 开服第 N 天）
  let marker = '';
  const idx = series.findIndex(s => s.date >= row.fc26.sameDayDate);
  if (idx >= 0) marker = `<circle cx="${x(idx).toFixed(1)}" cy="${y(series[idx].price).toFixed(1)}" r="2.4" fill="#f5f4eb"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#e3b341" stroke-width="1.3"/>${marker}</svg>`;
}

function tableSection(title, sub, rows) {
  if (!rows.length) return `<h2>${esc(title)}</h2><div class="empty">暂无数据</div>`;
  const body = sortRows(rows).map((r, i) => {
    const ratio = r.sameDayRatio;
    const ratioColor = ratio == null ? 'var(--muted)' : ratio < 1 ? 'var(--up)' : 'var(--dn)';
    const fwd = r.forwardRatio;
    const fwdColor = fwd == null ? 'var(--muted)' : fwd < 0.95 ? 'var(--dn)' : 'var(--up)';
    return `<tr>
<td class="c-rank">${i + 1}</td>
<td class="c-name">${esc(r.nameZh)}${r.name ? `<span class="en">${esc(r.name)}</span>` : ''}</td>
<td class="c-rating">${esc(r.rating ?? '—')}</td>
<td class="c-num">${coins(r.fc27.representative)}<span class="hint">${esc(r.fc27.console ? 'C ' + coins(r.fc27.console) : '')}${esc(r.fc27.pc ? ' PC ' + coins(r.fc27.pc) : '')}</span></td>
<td class="c-num">${coins(r.fc26 ? r.fc26.sameDayPrice : null)}<span class="hint">${esc(r.fc26 ? r.fc26.sameDayDate : '')}</span></td>
<td class="c-num">${coins(r.fc26 ? r.fc26.endPrice : null)}<span class="hint">月末</span></td>
<td class="c-num"><span style="color:${ratioColor}">${ratio == null ? '—' : ratio.toFixed(2) + '×'}</span></td>
<td class="c-num"><span style="color:${fwdColor}">${fwd == null ? '—' : fwd.toFixed(2) + '×'}</span></td>
<td class="c-tag">${tierTag(r)}</td>
<td class="c-spark">${sparkline(r)}</td>
</tr>`;
  }).join('');
  return `<h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>评分</th><th>FC27 当前价</th><th>FC26 同期价</th><th>FC26 月末价</th><th>同期比</th><th>后期走势</th><th>建议</th><th>FC26 首月走势</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

const statCard = (label, val, sub) => `<div class="stat"><b>${val}</b><small>${esc(label)}</small>${sub ? `<em>${esc(sub)}</em>` : ''}</div>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 传奇/英雄 · 同时段购买建议 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;--line2:#3a4438;--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--up:#4ec08a;--dn:#ff6259;--gold:#e3b341}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;padding:22px}
h1{font-size:20px;margin-bottom:6px}
h2{font-size:15px;margin:26px 0 8px;padding-left:9px;border-left:3px solid var(--gold)}
.sub{color:var(--quiet);font-size:12.5px;margin-bottom:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:14px}
.hero{border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px;background:var(--surface)}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:8px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:11px 12px}
.stat b{display:block;font-size:20px;color:var(--gold)}
.stat small{color:var(--quiet);font-size:11.5px}
.stat em{display:block;color:var(--muted);font-style:normal;font-size:11px;margin-top:2px}
.tbl-wrap{overflow-x:auto}
table.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
table.tbl th{text-align:left;color:var(--quiet);font-weight:600;font-size:11px;padding:8px;border-bottom:1px solid var(--line2);white-space:nowrap}
table.tbl td{padding:6px 8px;border-bottom:1px solid #232c24;vertical-align:top}
tbody tr:hover{background:#1b241c}
.c-rank{color:var(--quiet);width:30px}
.c-name{min-width:120px}
.c-name .en{display:block;color:var(--quiet);font-size:10px;font-weight:400}
.c-rating{width:46px}
.c-num{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.c-num .hint{color:var(--quiet);font-size:9.5px;margin-left:3px;font-weight:400}
.c-tag{white-space:nowrap}
.c-spark{text-align:center}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;white-space:nowrap}
.muted{color:var(--quiet);font-size:11px}
.empty{color:var(--quiet);font-size:12.5px;padding:14px;border:1px dashed var(--line);border-radius:9px;background:#161d17}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
.footer{color:var(--quiet);font-size:11.5px;margin-top:28px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body>
<h1>FC27 传奇 / 英雄卡 · 同时段购买建议</h1>
<div class="sub">成稿 ${esc(dateStr)} · 数据源 FUTBIN · FC27 开服 ${esc(FC27_LAUNCH_DATE)} · FC26 开服 ${esc(FC26_LAUNCH_DATE)} · 当前为「开服第 ${dayN} 天」对比</div>

<div class="hero">
<div class="stat-grid">
${statCard('FC27 开服日', FC27_LAUNCH_DATE, '')}
${statCard('FC26 开服日', FC26_LAUNCH_DATE, '')}
${statCard('当前开服第 N 天', `第 ${dayN} 天`, `${dateStr} vs ${fc26SameDayDate}`)}
${statCard('传奇可对照', `${iconStats.compared}/${iconStats.total}`, '有 FC26 同期对照')}
${statCard('英雄可对照', `${heroStats.compared}/${heroStats.total}`, '有 FC26 同期对照')}
</div>
<p style="margin-top:12px;font-size:13px;color:var(--muted)">${esc(headline())}</p>
</div>

<div class="stat-grid" style="margin-bottom:6px">
${statCard('买入窗口(传奇)', iconStats.byTier.buy || 0, '')}
${statCard('分批买入(传奇)', iconStats.byTier.staged || 0, '')}
${statCard('观望等待(传奇)', iconStats.byTier.wait || 0, '')}
${statCard('谨慎(传奇)', iconStats.byTier.caution || 0, '')}
${statCard('数据不足(英雄)', heroStats.byTier.insufficient || 0, 'FC27 有效价缺失')}
</div>

<h2>一、判定规则与口径</h2>
<div class="card"><ul>
<li><b>同时段对照</b>：FC26 与 FC27 开服日同为 09-18（相差整一年），故「FC27 开服第 N 天」与「FC26 开服第 N 天」天然对齐。当前 N=${dayN}，即对比 FC27 ${esc(dateStr)} 与 FC26 ${esc(fc26SameDayDate)}。</li>
<li><b>同期比</b> = FC27 当前价 ÷ FC26 同期价。&lt; 1× 表示 FC27 已比 FC26 同期更便宜；≥ 1× 表示更贵。</li>
<li><b>后期走势</b> = FC26 月末价 ÷ FC26 同期价。&lt; 0.95 表示 FC26 在该时点之后仍继续下探（历史上前瞻「再等等」）；≥ 0.95 表示基本企稳/上行。</li>
<li><b>分级</b>：买入窗口（更便宜+企稳）＞ 分批买入（更便宜+仍下探）＞ 观望等待（更贵+仍下探）＞ 谨慎（更贵+企稳）；缺 FC26 同期价或 FC27 有效价（≥${MIN_VALID_PRICE.toLocaleString()} coins）为「数据不足」。</li>
<li><b>FC27 有效价</b>：传奇取 detail 页 current.json 两平台有效价较大者；英雄取列表页 base-heroes.json 两平台有效价较大者（英雄明细价采集尚未接入 current.json，见下方缺失说明）。</li>
<li>折线图为 FC26 首月逐日均价走势，白点为「同期位点」，用于直观看出 FC26 在同期之后是涨是跌。</li>
</ul></div>

${tableSection('二、传奇卡（Icon）购买建议', `共 ${iconStats.total} 张，${iconStats.compared} 张有 FC26 同期对照；按建议优先级排序（同期比越小越靠前）。`, iconRows)}

${tableSection('三、英雄卡（Hero）购买建议', `共 ${heroStats.total} 张，${heroStats.compared} 张有 FC26 同期对照。英雄卡 FC27 明细价尚未接入 current.json（仅列表页价，多数仍为占位 0），故「数据不足」较多，随采集完善会逐步收敛。`, heroRows)}

<h2>四、数据来源与缺失项</h2>
<div class="card"><ul>
<li>传奇 FC27 当前价：<code>current.json</code>（detail 页每 4 小时采集）· 英雄 FC27 当前价：<code>heroes/data/prices/fc27/base-heroes.json</code>（列表页每日采集，明细价待接入）。</li>
<li>FC26 首月逐日历史：<code>icons/data/prices/fc26/base-icons.json</code>（${fc26IconIdx.size} 张）· <code>heroes/data/prices/fc26/base-heroes.json</code>（${fc26HeroIdx.size} 张），均为开服首月 30 天 Console 均价。</li>
<li>英雄卡「数据不足」根因：FC27 英雄明细价尚未进入 current.json（当前 0 张英雄卡在 current.json 中），仅有列表页价，多数仍为占位 0。补齐英雄明细采集后本报告英雄栏将自动充实。</li>
</ul></div>

<div class="footer">FC27 传奇/英雄 同时段购买建议 · 成稿 ${esc(dateStr)} · 生成脚本 build-same-period-advice.mjs · 价格为 FUT 金币，仅作游戏市场研究，<b>不构成任何投资或交易建议</b>。跨代价格受卡池供给、活动节奏与版本改动影响，FC26 历史走势不代表 FC27 会重演。</div>
</body></html>`;

// ---------- 落盘 ----------
const outHtml = path.join(ROOT, 'reports', 'daily', dateStr, 'same-period-advice.html');
const persistentHtml = path.join(ICON_DIR, 'reports', 'fc27-same-period-advice.html');
const outJson = path.join(ICON_DIR, 'data', 'research', `same-period-${dateStr}.json`);

atomicWrite(outHtml, html);
atomicWrite(persistentHtml, html);
atomicWrite(outJson, JSON.stringify({
  schemaVersion: 1,
  date: dateStr,
  generatedAt: new Date().toISOString(),
  dayOffset,
  dayN,
  fc27LaunchDate: FC27_LAUNCH_DATE,
  fc26LaunchDate: FC26_LAUNCH_DATE,
  fc26SameDayDate,
  minValidPrice: MIN_VALID_PRICE,
  counts: { icons: iconStats, heroes: heroStats },
  headline: headline(),
  disclaimer: '本报告仅作跨代价格与市场研究参考，FC26 历史价格不代表 FC27 会重演，不构成任何投资或交易建议。',
  icons: iconRows,
  heroes: heroRows,
}, null, 2) + '\n');

console.log(`同时段购买建议已生成: ${path.relative(ROOT, outHtml)}`);
console.log(`  开服第 ${dayN} 天（${dateStr} vs FC26 ${fc26SameDayDate}）`);
console.log(`  传奇 ${iconStats.total} 张（可对照 ${iconStats.compared}）· 建议: 买入 ${iconStats.byTier.buy || 0} / 分批 ${iconStats.byTier.staged || 0} / 观望 ${iconStats.byTier.wait || 0} / 谨慎 ${iconStats.byTier.caution || 0} / 不足 ${iconStats.byTier.insufficient || 0}`);
console.log(`  英雄 ${heroStats.total} 张（可对照 ${heroStats.compared}）· 不足 ${heroStats.byTier.insufficient || 0}`);
console.log(`  结构化结果: ${path.relative(ROOT, outJson)}`);
console.log(`  常驻底稿: ${path.relative(ROOT, persistentHtml)}`);
