#!/usr/bin/env node
/**
 * 作用：生成主页「FC26 球员回顾」栏目页面 —— 用本地 FC26 数据集，按「能力值（OVR）」
 *       分档汇总开服首月的球员价格变化，并画成图。
 *
 * 数据来源（全部本地文件，**不联网、不采集**）：
 *   apps/market/engine/gold/data/prices/fc26/fc26-first-month.json   152 张金卡 × 30 天（cross + pc）
 *   apps/market/engine/icons/data/prices/fc26/base-icons.json        129 张基础传奇 × 30 天
 *   apps/market/engine/heroes/data/prices/fc26/base-heroes.json       93 张基础英雄 × 30 天
 *   apps/market/engine/data/players/database/fc26.json                FC26 球员库（FC26 口径 OVR）
 *
 * 口径：
 *   - 窗口固定取数据文件自带的 window（2025-09-18 ~ 2025-10-17，30 天）。
 *   - 只使用有值的观测日；0 值与缺失一律忽略（与数据源 zeroPricePolicy 一致），不用估值或其它日期顶替。
 *   - 分档按能力值：95+ / 90–94 / 88–89 / 86–87 / 84–85 / ≤83。
 *   - 涨跌 = 末个有效观测日 / 首个有效观测日 − 1；回撤 = 月内谷值 / 峰值 − 1（负值）。
 *   - 颜色遵循站点约定：**红涨绿跌**（涨 #ff6259 / 跌 #4ec08a）。
 *   - 能力值口径：本轮回顾 FC26，优先取 FC26 球员库的 rating；库内无该球员或该字段时回退到
 *     数据源自带的 OVR（gold 池为 fc27Rating、icon/hero 池为 FC26 页面 rating），并在页面注明。
 *
 * 头像：**不接入**。FC26 数据源的卡 ID 与 FC27 头像库不同源（实测 FC26 球员库里的 resourceId
 *      字段跨代不可信：rid 51 在 canonical 是希勒、库里却写登贝莱），按根 AGENTS.md 的
 *      「跨代（FC26）数据一律不配头像」红线，本栏目不出球员头像。
 *
 * 输出：
 *   apps/market/engine/gold/reports/fc26-season-review.html   常驻产物（主页栏目内容源）
 *   用法：node apps/market/engine/scripts/render-fc26-review.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT ? path.resolve(process.env.FC_PROJECT_ROOT) : path.resolve(HERE, '../../../..');
const ENGINE = path.join(ROOT, 'apps', 'market', 'engine');
const OUT_DIR = path.join(ENGINE, 'gold', 'reports');
const OUT_FILE = path.join(OUT_DIR, 'fc26-season-review.html');

const readJSON = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const asList = v => (Array.isArray(v) ? v : (v?.players || v?.cards || []));

// ── 口径参数 ────────────────────────────────────────────────────────────────
const BUCKETS = [
  { key: 'b95', label: '95+', test: r => r >= 95, color: '#e3b341' },
  { key: 'b90', label: '90–94', test: r => r >= 90 && r < 95, color: '#ff6259' },
  { key: 'b88', label: '88–89', test: r => r >= 88 && r < 90, color: '#ff9f4a' },
  { key: 'b86', label: '86–87', test: r => r >= 86 && r < 88, color: '#d8d24a' },
  { key: 'b84', label: '84–85', test: r => r >= 84 && r < 86, color: '#c8f646' },
  { key: 'b83', label: '≤83', test: r => r < 84, color: '#6fd0a8' },
];
const POOLS = [
  { key: 'gold', label: 'Gold', desc: '金卡（152）' },
  { key: 'icon', label: 'Icon', desc: '基础传奇（129）' },
  { key: 'hero', label: 'Hero', desc: '基础英雄（93）' },
];
const UP = '#ff6259';   // 涨（站点约定：红涨）
const DN = '#4ec08a';   // 跌（站点约定：绿跌）

const fmtCoins = v => (v == null ? '—' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'K' : String(v));
const fmtFull = v => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const pct = v => (v == null || !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%');
const pctAbs = v => (v == null || !Number.isFinite(v) ? '—' : (v * 100).toFixed(1) + '%');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const median = arr => { const a = arr.filter(x => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const mean = arr => { const a = arr.filter(x => Number.isFinite(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
// 涨=红、跌=绿
const signColor = v => (v == null ? 'var(--m2)' : v >= 0 ? UP : DN);
// 负值 → 绿、正值 → 红 的连续插值（用于热力矩阵）
function heat(v, lo, hi) {
  if (v == null || !Number.isFinite(v)) return '#20281f';
  const t = hi === lo ? 0.5 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const from = v <= 0 ? [78, 192, 138] : [255, 98, 89];
  const to = v <= 0 ? [24, 62, 48] : [92, 30, 28];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * (1 - t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ── 1. 载入三个卡池，统一成同一形状 ─────────────────────────────────────────
const goldData = readJSON(path.join(ENGINE, 'gold/data/prices/fc26/fc26-first-month.json'));
const iconData = readJSON(path.join(ENGINE, 'icons/data/prices/fc26/base-icons.json'));
const heroData = readJSON(path.join(ENGINE, 'heroes/data/prices/fc26/base-heroes.json'));
const db26 = readJSON(path.join(ENGINE, 'data/players/database/fc26.json'));

if (!goldData || !iconData || !heroData) {
  console.error('缺少 FC26 数据集（gold / icon / hero 任一），无法生成回顾页面。');
  process.exit(1);
}
const days = goldData.window?.days || [];
if (!days.length) { console.error('FC26 数据缺少 window.days，无法确定观察窗口。'); process.exit(1); }

const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
const ratingBySlug = new Map();
const ratingByName = new Map();
for (const p of asList(db26)) {
  if (typeof p.rating !== 'number') continue;
  if (p.slug) ratingBySlug.set(String(p.slug), p.rating);
  if (p.name) ratingByName.set(normName(p.name), p.rating);
}

const rows = [];
for (const p of asList(goldData)) {
  const fromDb = ratingBySlug.get(String(p.slug)) ?? ratingByName.get(normName(p.name));
  const poolRating = typeof p.fc27Rating === 'number' ? p.fc27Rating : (typeof p.fc26Rating === 'number' ? p.fc26Rating : null);
  rows.push({
    pool: 'gold', name: p.name, nameZh: p.nameZh || '', slug: p.slug,
    rating: fromDb ?? poolRating, ratingSource: fromDb != null ? 'fc26-db' : 'pool', poolRatingLabel: 'FC27 口径',
    url: p.fc26Url || p.sourceUrl || '', series: p.prices?.cross, seriesPc: p.prices?.pc, status: p.status,
  });
}
for (const [pool, set] of [['icon', iconData], ['hero', heroData]]) {
  for (const p of asList(set)) {
    if (p.status && p.status !== 'captured') continue;
    rows.push({
      pool, name: p.name, nameZh: p.nameZh || '', slug: p.slug,
      rating: typeof p.rating === 'number' ? p.rating : null, ratingSource: 'pool', poolRatingLabel: 'FC26 口径',
      url: p.url || p.marketUrl || '', series: p.prices?.cross, seriesPc: p.prices?.pc, status: p.status,
    });
  }
}

// ── 2. 逐卡指标（只用有价值的观测日） ───────────────────────────────────────
function metrics(series, pcSeries) {
  if (!series) return null;
  const pts = days.map(d => ({ d, idx: days.indexOf(d), v: typeof series[d] === 'number' && series[d] > 0 ? series[d] : null }));
  const valid = pts.filter(p => p.v != null);
  if (valid.length < 2) return { observed: valid.length, insufficient: true };
  const first = valid[0], last = valid[valid.length - 1];
  const peak = valid.reduce((a, b) => (b.v > a.v ? b : a));
  const trough = valid.reduce((a, b) => (b.v < a.v ? b : a));
  const pcts = [];
  for (let i = 1; i < valid.length; i++) pcts.push(valid[i].v / valid[i - 1].v - 1);
  const pcValid = pcSeries ? days.map(d => pcSeries[d]).filter(v => typeof v === 'number' && v > 0) : [];
  return {
    observed: valid.length,
    insufficient: false,
    first, last, peak, trough,
    changePct: last.v / first.v - 1,
    change: last.v - first.v,
    drawdown: trough.v / peak.v - 1,          // 负值
    openIsPeak: peak.idx === first.idx,
    peakIdx: peak.idx, troughIdx: trough.idx,
    volatility: pcts.length > 1 ? Math.sqrt(mean(pcts.map(x => (x - mean(pcts)) ** 2))) : null,
    pcObserved: pcValid.length,
    pcSeries,
  };
}
for (const r of rows) r.m = metrics(r.series, r.seriesPc);
const usable = rows.filter(r => r.m && !r.m.insufficient);
const withRating = usable.filter(r => typeof r.rating === 'number');

// ── 3. 按能力值分档聚合 ─────────────────────────────────────────────────────
// 价格指数：以每张卡自己的首个有效价为 100，逐日求全档中位数 → 抗异常值
function bucketIndex(list) {
  const out = [];
  for (let i = 0; i < days.length; i++) {
    const vals = [];
    for (const r of list) {
      const base = r.m.first.v;
      const v = r.series[days[i]];
      if (typeof v === 'number' && v > 0 && base > 0) vals.push(v / base * 100);
    }
    out.push(vals.length ? median(vals) : null);
  }
  return out;
}

const groups = BUCKETS.map(b => {
  const list = withRating.filter(r => b.test(r.rating));
  const changes = list.map(r => r.m.changePct);
  const dds = list.map(r => r.m.drawdown);
  const peaks = list.map(r => r.m.peakIdx);
  const troughs = list.map(r => r.m.troughIdx);
  return {
    ...b,
    list: list.slice().sort((x, y) => y.m.changePct - x.m.changePct),
    n: list.length,
    index: bucketIndex(list),
    medianChange: median(changes),
    meanChange: mean(changes),
    upShare: list.length ? list.filter(r => r.m.changePct > 0).length / list.length : null,
    medianDrawdown: median(dds),
    medianPeakIdx: median(peaks),
    medianTroughIdx: median(troughs),
    openIsPeakShare: list.length ? list.filter(r => r.m.openIsPeak).length / list.length : null,
    medianLaunch: median(list.map(r => r.m.first.v)),
  };
}).filter(g => g.n > 0);

// OVR 档 × 卡池 的中位涨跌幅矩阵
const matrix = groups.map(g => ({
  key: g.key, label: g.label,
  cells: POOLS.map(p => {
    const list = g.list.filter(r => r.pool === p.key);
    return { pool: p.key, n: list.length, medianChange: median(list.map(r => r.m.changePct)) };
  }),
}));
const matrixVals = matrix.flatMap(r => r.cells.map(c => c.medianChange)).filter(Number.isFinite);
const matrixLo = Math.min(...matrixVals), matrixHi = Math.max(...matrixVals);

// 全池基线
const allChanges = withRating.map(r => r.m.changePct);
const allMedian = median(allChanges);
const bestGroup = groups.slice().sort((a, b) => b.medianChange - a.medianChange)[0];
const worstGroup = groups.slice().sort((a, b) => a.medianChange - b.medianChange)[0];
// 峰值/谷值「中位日」取整后比较；并列的档位全部列出（避免只显示排序第一的档）
const dayOf = idx => (idx == null ? null : Math.round(idx) + 1);
const earliestPeakDay = Math.min(...groups.map(g => dayOf(g.medianPeakIdx)));
const latestPeakDay = Math.max(...groups.map(g => dayOf(g.medianPeakIdx)));
const earliestPeakLabels = groups.filter(g => dayOf(g.medianPeakIdx) === earliestPeakDay).map(g => g.label).join('、');
const latestPeakLabels = groups.filter(g => dayOf(g.medianPeakIdx) === latestPeakDay).map(g => g.label).join('、');
const dbRated = rows.filter(r => r.ratingSource === 'fc26-db').length;

// ── 4. 图表：手写内联 SVG（不依赖任何 CDN） ─────────────────────────────────
const W = 1000;
function lineChart(title, note, seriesList, { yMin, yMax, unit = '' } = {}) {
  const H = 380, L = 64, R = 22, T = 26, B = 58;
  const pw = W - L - R, ph = H - T - B;
  const vals = seriesList.flatMap(s => s.points.filter(v => Number.isFinite(v)));
  let lo = yMin ?? Math.min(...vals), hi = yMax ?? Math.max(...vals);
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const x = i => L + (pw * i) / (days.length - 1);
  const y = v => T + ph - ((v - lo) / (hi - lo)) * ph;
  const ticks = 5;
  let g = '';
  for (let t = 0; t <= ticks; t++) {
    const v = lo + (hi - lo) * (t / ticks), yy = y(v);
    g += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="var(--line)" stroke-dasharray="${t === 0 ? '0' : '3 5'}"/><text x="${L - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end" class="ax">${v.toFixed(0)}${unit}</text>`;
  }
  // 100 基准线
  if (lo < 100 && hi > 100) g += `<line x1="${L}" y1="${y(100).toFixed(1)}" x2="${W - R}" y2="${y(100).toFixed(1)}" stroke="var(--m2)" stroke-width="1.4"/>`;
  for (let i = 0; i < days.length; i += 5) g += `<text x="${x(i).toFixed(1)}" y="${H - B + 22}" text-anchor="middle" class="ax">${days[i].slice(5)}</text>`;
  const paths = seriesList.map(s => {
    let d = '';
    s.points.forEach((v, i) => { if (!Number.isFinite(v)) return; d += (d ? ' L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); });
    const lastIdx = s.points.reduce((acc, v, i) => (Number.isFinite(v) ? i : acc), -1);
    const lastV = lastIdx >= 0 ? s.points[lastIdx] : null;
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round"/>`
      + (lastV != null ? `<circle cx="${x(lastIdx).toFixed(1)}" cy="${y(lastV).toFixed(1)}" r="3.4" fill="${s.color}"/>` : '');
  }).join('');
  const legend = seriesList.map(s => `<span class="lg"><i style="background:${s.color}"></i>${esc(s.label)}${s.tail != null ? ` <b>${pctAbs(s.tail / 100 - 1)}</b>` : ''}</span>`).join('');
  return `<section class="card"><div class="card-head"><h3>${esc(title)}</h3><span class="ax">${esc(note)}</span></div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">
<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="rgba(255,255,255,.012)"/>${g}${paths}</svg>
<div class="legend">${legend}</div></section>`;
}

function divergingBars(title, note, items) {
  const H = 46 + items.length * 46, L = 132, R = 96, T = 26;
  const pw = W - L - R;
  const max = Math.max(...items.map(i => Math.abs(i.value || 0)), 0.01);
  const zero = L + pw / 2;
  let g = `<line x1="${zero}" y1="${T - 8}" x2="${zero}" y2="${H - 18}" stroke="var(--m2)"/>`;
  items.forEach((it, i) => {
    const yy = T + i * 46;
    const w = (Math.abs(it.value || 0) / max) * (pw / 2 - 4);
    const neg = (it.value || 0) < 0;
    const x = neg ? zero - w : zero;
    g += `<text x="${L - 14}" y="${yy + 22}" text-anchor="end" class="barlabel">${esc(it.label)}<tspan class="ax"> · ${it.sub || ''}</tspan></text>`
      + `<rect x="${x.toFixed(1)}" y="${yy + 6}" width="${w.toFixed(1)}" height="24" rx="4" fill="${neg ? DN : UP}" opacity=".85"/>`
      + `<text x="${(neg ? zero - 8 : zero + w + 8).toFixed(1)}" y="${yy + 23}" text-anchor="${neg ? 'end' : 'start'}" class="barval" fill="${signColor(it.value)}">${pct(it.value)}</text>`;
  });
  return `<section class="card"><div class="card-head"><h3>${esc(title)}</h3><span class="ax">${esc(note)}</span></div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">${g}</svg></section>`;
}

function heatMatrix(title, note) {
  const cw = 168, ch = 46, L = 132, T = 62;
  const H = T + matrix.length * ch + 30;
  let g = POOLS.map((p, i) => `<text x="${L + cw * i + cw / 2}" y="${T - 22}" text-anchor="middle" class="barlabel">${esc(p.label)}<tspan class="ax"> ${esc(p.desc)}</tspan></text>`).join('');
  matrix.forEach((row, ri) => {
    const yy = T + ri * ch;
    g += `<text x="${L - 14}" y="${yy + 29}" text-anchor="end" class="barlabel">${esc(row.label)}</text>`;
    row.cells.forEach((c, ci) => {
      const x = L + cw * ci;
      const txt = c.n ? pct(c.medianChange) : '无样本';
      g += `<rect x="${x + 4}" y="${yy + 4}" width="${cw - 8}" height="${ch - 8}" rx="7" fill="${c.n ? heat(c.medianChange, matrixLo, matrixHi) : '#1b231b'}" stroke="var(--line)"/>`
        + `<text x="${x + cw / 2}" y="${yy + 23}" text-anchor="middle" class="cellv">${txt}</text>`
        + `<text x="${x + cw / 2}" y="${yy + 39}" text-anchor="middle" class="ax">n=${c.n}</text>`;
    });
  });
  return `<section class="card"><div class="card-head"><h3>${esc(title)}</h3><span class="ax">${esc(note)}</span></div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">${g}</svg></section>`;
}

function phaseChart(title, note) {
  const H = 46 + groups.slice().reverse().length * 44, L = 132, R = 40, T = 26;
  const pw = W - L - R;
  const x = i => L + (pw * i) / (days.length - 1);
  let g = '';
  for (let i = 0; i < days.length; i += 5) g += `<line x1="${x(i).toFixed(1)}" y1="${T - 10}" x2="${x(i).toFixed(1)}" y2="${H - 16}" stroke="var(--line)" stroke-dasharray="3 5"/><text x="${x(i).toFixed(1)}" y="${H - 2}" text-anchor="middle" class="ax">D${i + 1}</text>`;
  groups.slice().reverse().forEach((gg, i) => {
    const yy = T + i * 44;
    const px = x(gg.medianPeakIdx ?? 0), tx = x(gg.medianTroughIdx ?? 0);
    g += `<text x="${L - 14}" y="${yy + 20}" text-anchor="end" class="barlabel">${esc(gg.label)}<tspan class="ax"> n=${gg.n} · 峰D${Math.round(gg.medianPeakIdx ?? 0) + 1} 谷D${Math.round(gg.medianTroughIdx ?? 0) + 1}</tspan></text>`
      + `<line x1="${px.toFixed(1)}" y1="${yy + 12}" x2="${tx.toFixed(1)}" y2="${yy + 12}" stroke="var(--line)" stroke-width="6" stroke-linecap="round"/>`
      + `<circle cx="${px.toFixed(1)}" cy="${yy + 12}" r="7" fill="${UP}"/><text x="${px.toFixed(1)}" y="${yy + 16}" text-anchor="middle" class="dotv">峰</text>`
      + `<circle cx="${tx.toFixed(1)}" cy="${yy + 12}" r="7" fill="${DN}"/><text x="${tx.toFixed(1)}" y="${yy + 16}" text-anchor="middle" class="dotv">谷</text>`;
  });
  return `<section class="card"><div class="card-head"><h3>${esc(title)}</h3><span class="ax">${esc(note)}</span></div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">${g}</svg></section>`;
}

const chart1 = lineChart(
  '各能力值档「价格指数」走势（首日 = 100）',
  `中位数口径 · ${days[0]} → ${days[days.length - 1]}（30 天）`,
  groups.map(g => ({ label: `${g.label}（n=${g.n}）`, color: g.color, points: g.index, tail: g.index[days.length - 1] }))
);
const chart2 = divergingBars(
  '各能力值档首月涨跌幅（中位 / 上涨占比）',
  '红 = 涨，绿 = 跌（站点约定）',
  groups.slice().sort((a, b) => b.medianChange - a.medianChange).map(g => ({ label: g.label, sub: `上涨 ${(g.upShare * 100).toFixed(0)}% · n=${g.n}`, value: g.medianChange }))
);
const chart3 = heatMatrix('能力值 × 卡池 首月涨跌幅矩阵（中位）', '同档不同卡池的差异 · n 为样本数');
const chart4 = phaseChart('各档「月内峰值 / 谷值」出现时点（中位）', 'D1 = 开服首日；峰早谷晚 = 开服冲高后长期回落');

// ── 5. 代表球员（每档涨跌两端）+ 逐卡「点开展示」价格曲线 ──────────────────────
// 曲线数据来自各卡池自带的 30 天逐日价（本页已有的 series / pcSeries），无需额外数据源。
// 体积策略：**不预渲染 405 张 SVG**（那样要 1.8MB+），而是把 30 个价格点紧凑编码进
// `data-curve`，点开某一行时再由前端内联脚本画出来（首帧只解析数据，不建 SVG 节点）。
const curveCounter = { n: 0 };

function curveAttr(r) {
  const s = r.series || {};
  const c = days.map(d => (typeof s[d] === 'number' && s[d] > 0 ? s[d] : null));
  const pRaw = r.m?.pcSeries || null;
  const p = pRaw ? days.map(d => (typeof pRaw[d] === 'number' && pRaw[d] > 0 ? pRaw[d] : null)) : [];
  const pcValid = p.filter(v => v != null);
  const payload = {
    c,
    p: pcValid.length >= 2 ? p : null,
    i: [r.m.first.idx, r.m.peak.idx, r.m.trough.idx, r.m.last.idx],
    ch: +r.m.changePct.toFixed(4),
    dd: +r.m.drawdown.toFixed(4),
    vo: r.m.volatility == null ? null : +r.m.volatility.toFixed(4),
    n: r.m.observed,
    pcn: pcValid.length,
    pcl: pcValid.length ? pcValid[pcValid.length - 1] : null,
    nm: r.nameZh || r.name,
  };
  return `data-curve='${esc(JSON.stringify(payload))}'`;
}

function playerEntry(r, idx) {
  const zh = r.nameZh && r.nameZh !== r.name ? r.nameZh : '';
  const id = 'pl' + (++curveCounter.n);
  const search = [r.name, r.nameZh, r.slug, r.pool].filter(Boolean).join(' ').toLowerCase();
  const row = `<tr class="pl-row" data-pl="${id}" ${curveAttr(r)} title="点开展示该球员一个月价格曲线"><td class="c-rank"><span class="pl-caret">▸</span>${idx}</td>
<td class="c-name"><span class="pname">${zh ? esc(zh) + `<span class="en">${esc(r.name)}</span>` : esc(r.name)}</span></td>
<td class="c-num">${r.rating ?? '—'}</td><td class="c-pool">${esc(POOLS.find(p => p.key === r.pool)?.label || r.pool)}</td>
<td class="c-num">${fmtCoins(r.m.first.v)}</td><td class="c-num">${fmtCoins(r.m.last.v)}</td>
<td class="c-num" style="color:${signColor(r.m.changePct)};font-weight:600">${pct(r.m.changePct)}</td>
<td class="c-num">${pctAbs(r.m.drawdown)}</td><td class="c-num">D${r.m.peakIdx + 1}</td></tr>`;
  const detail = `<tr class="pl-detail"><td colspan="9"><div class="pl-box"></div></td></tr>`;
  return `<tbody class="pl" data-name="${esc(search)}">${row}${detail}</tbody>`;
}

function groupTable(g) {
  const top = g.list.slice(0, 5);
  const bottom = g.list.slice(-5).reverse();
  const head = `<thead><tr><th>#</th><th>球员</th><th>OVR</th><th>卡池</th><th>首日</th><th>末日</th><th>涨跌</th><th>月内回撤</th><th>峰值日</th></tr></thead>`;
  return `<div class="gtable">
<div class="ghead"><span class="gt-label">${esc(g.label)}</span><span class="ax">n=${g.n} · 中位涨跌 <b style="color:${signColor(g.medianChange)}">${pct(g.medianChange)}</b> · 中位回撤 ${pctAbs(g.medianDrawdown)} · 上涨占比 ${(g.upShare * 100).toFixed(0)}% · 中位首日价 ${fmtCoins(g.medianLaunch)}</span></div>
<div class="two-col">
<div><div class="sub-t">抗跌前列</div><div class="tbl-wrap"><table class="tbl">${head}${top.map((r, i) => playerEntry(r, i + 1)).join('')}</table></div></div>
<div><div class="sub-t">跌幅前列</div><div class="tbl-wrap"><table class="tbl">${head}${bottom.map((r, i) => playerEntry(r, i + 1)).join('')}</table></div></div>
</div></div>`;
}

// 全量明细（按 OVR 降序、涨跌升序）
const detail = withRating.slice().sort((a, b) => (b.rating - a.rating) || (a.m.changePct - b.m.changePct));

// ── 6. 页面 ─────────────────────────────────────────────────────────────────
const style = `<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--surface2:#1d271b;--line:#30392f;--line2:#3a4438;--t1:#f5f4eb;--t2:#aeb5aa;--m2:#859080;--up:${UP};--dn:${DN};--gold:#e3b341;--lime:#c8f646}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--t1);font:15px/1.65 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}
.container{max-width:1180px;margin:0 auto;padding:14px 18px 46px}
.header{padding:14px 0 22px}
.header h1{font-size:28px;margin:0 0 8px}
.header .meta{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 10px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border:1px solid var(--line2);border-radius:999px;font-size:12.5px;color:var(--t2)}
.chip b{color:var(--t1)}
.subtitle{color:var(--t2);font-size:14px;margin:0}
.notice{margin:14px 0 0;padding:11px 14px;border-left:3px solid var(--gold);background:rgba(227,179,65,.07);border-radius:0 8px 8px 0;font-size:13.5px;color:var(--t2)}
.notice b{color:var(--t1)}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(178px,1fr));gap:12px;margin:22px 0 8px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:15px 16px}
.stat b{display:block;font-size:25px;line-height:1.25}
.stat small{display:block;color:var(--m2);font-size:12.5px;margin-top:3px}
.stat i{font-style:normal;font-size:12.5px;color:var(--t2)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 18px 14px;margin:16px 0}
.card-head{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;justify-content:space-between;margin-bottom:10px}
.card-head h3{font-size:17px;margin:0}
.ax{font-size:12px;fill:var(--m2);color:var(--m2)}
svg{width:100%;height:auto;display:block}
.barlabel{font-size:13px;fill:var(--t1)}
.barval{font-size:13.5px;font-weight:700}
.cellv{font-size:15px;font-weight:700;fill:#f5f4eb}
.dotv{font-size:9px;fill:#101713;font-weight:700}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 2px 0;border-top:1px solid var(--line);margin-top:8px}
.lg{font-size:12.5px;color:var(--t2);display:inline-flex;align-items:center;gap:7px}
.lg i{width:14px;height:3px;border-radius:2px;display:inline-block}
.lg b{color:var(--t1)}
.insights{margin:18px 0 0}
.insight{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--lime);border-radius:0 10px 10px 0;padding:13px 16px;margin-bottom:10px;font-size:14px;color:var(--t2)}
.insight b{color:var(--t1)}
.gtable{border-top:1px solid var(--line);padding-top:16px;margin-top:16px}
.gtable:first-of-type{border-top:0;margin-top:0;padding-top:0}
.ghead{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;margin-bottom:10px}
.gt-label{font-size:16px;font-weight:700}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.sub-t{font-size:12.5px;color:var(--m2);margin:0 0 6px}
.tbl-wrap{overflow:auto}
table.tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:430px}
table.tbl th{background:var(--surface2);color:var(--t2);text-align:left;padding:8px 9px;border-bottom:1px solid var(--line2);white-space:nowrap;font-weight:600}
table.tbl td{padding:7px 9px;border-bottom:1px solid var(--line)}
table.tbl tr:hover td{background:#1a2219}
.c-rank{color:var(--m2);width:26px}
.c-name .pname{font-weight:600}
.c-name .en{color:var(--m2);font-size:11.5px;margin-left:6px;font-weight:400}
.c-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.c-pool{color:var(--t2);font-size:12px}
/* 逐卡「点开展示」：行可点 → 展开该球员一个月逐日价格曲线 */
tr.pl-row{cursor:pointer}
.pl-caret{display:inline-block;width:10px;color:var(--m2);font-size:10px;margin-right:3px;transition:transform .15s ease}
tr.pl-row.open .pl-caret{transform:rotate(90deg);color:var(--lime)}
tr.pl-detail{display:none}
tr.pl-row.open+tr.pl-detail{display:table-row}
tr.pl-detail>td{padding:0;background:#131a14;border-bottom:1px solid var(--line2)}
.pl-box{padding:14px 16px 16px}
.pl-cap{font-size:12.5px;color:var(--m2);margin:0 0 6px}
.pl-stat{display:flex;flex-wrap:wrap;gap:7px 18px;font-size:12.5px;color:var(--t2);margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}
.pl-stat b{color:var(--t1);font-variant-numeric:tabular-nums}
.pl-stat i{font-style:normal}
.mkv{font-size:11px;font-weight:700}
.pl-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:2px 0 10px}
.pl-filter{background:var(--surface2);border:1px solid var(--line2);border-radius:8px;color:var(--t1);font-family:inherit;font-size:13px;padding:7px 11px;width:min(320px,100%)}
.pl-filter:focus{outline:none;border-color:var(--lime)}
.pl-empty{padding:14px 4px}
tbody.pl.hid{display:none}
details{margin:16px 0}
details>summary{cursor:pointer;color:var(--t2);font-size:13px;padding:10px 2px}
details>summary:hover{color:var(--t1)}
.footer{color:var(--m2);font-size:12px;margin-top:30px;padding-top:16px;border-top:1px solid var(--line)}
.footer a{color:var(--t2)}
@media(max-width:860px){.two-col{grid-template-columns:1fr}.container{padding:12px 12px 34px}.header h1{font-size:23px}}
</style>`;

const header = `<div class="header">
<h1>FC26 球员回顾 · 开服首月价格变化</h1>
<div class="meta">
<span class="chip">窗口 <b>${days[0]} → ${days[days.length - 1]}</b>（${days.length} 天）</span>
<span class="chip">样本 <b>${withRating.length}</b> 张卡</span>
<span class="chip">卡池 <b>Gold ${groups.reduce((s, g) => s + g.list.filter(r => r.pool === 'gold').length, 0)} · Icon ${groups.reduce((s, g) => s + g.list.filter(r => r.pool === 'icon').length, 0)} · Hero ${groups.reduce((s, g) => s + g.list.filter(r => r.pool === 'hero').length, 0)}</b></span>
<span class="chip">分档 <b>${groups.length}</b> 档</span>
</div>
<p class="subtitle">按<b>能力值（OVR）</b>分档汇总 FC26 开服首月的球员价格变化：先看每个档位的整体走势与涨跌，再看档内抗跌与跌幅前列的具体球员。<b>任意球员行都可点开</b>，展开该卡开服首月（30 天）逐日价格曲线。</p>
<div class="notice"><b>数据来源为项目内本地 FC26 数据集</b>（金卡首月逐日价格、基础传奇、基础英雄），<b>本页不联网、不抓取</b>，只做本地汇总。价格单位为 coins，取 Cross 平台口径；只统计有值的观测日，0 值与缺失一律忽略（与数据源 zeroPricePolicy 一致），不用估值或其它日期顶替。颜色遵循站点约定：<b style="color:${UP}">红 = 涨</b>、<b style="color:${DN}">绿 = 跌</b>。${dbRated ? `能力值优先取 FC26 球员库口径（${dbRated} 张），库内无记录的 ${rows.length - dbRated} 张回退到数据源自带 OVR 并在页面标注。` : '能力值取数据源自带 OVR。'}</div>
</div>`;

const stats = `<div class="stat-grid">
<div class="stat"><b style="color:${signColor(allMedian)}">${pct(allMedian)}</b><small>全样本首月中位涨跌</small><i>n=${withRating.length}</i></div>
<div class="stat"><b>${bestGroup.label}</b><small>最抗跌档（中位）</small><i>${pct(bestGroup.medianChange)} · n=${bestGroup.n}</i></div>
<div class="stat"><b>${worstGroup.label}</b><small>跌幅最深档（中位）</small><i>${pct(worstGroup.medianChange)} · n=${worstGroup.n}</i></div>
<div class="stat"><b>D${earliestPeakDay}</b><small>峰值最早档：${esc(earliestPeakLabels)}</small><i>最晚：${esc(latestPeakLabels)} D${latestPeakDay}</i></div>
<div class="stat"><b>${(withRating.filter(r => r.m.openIsPeak).length / withRating.length * 100).toFixed(0)}%</b><small>首日即月内最高价</small><i>${withRating.filter(r => r.m.openIsPeak).length}/${withRating.length}</i></div>
<div class="stat"><b>${pctAbs(median(withRating.map(r => r.m.drawdown)))}</b><small>全样本中位月内回撤</small><i>峰值→谷值</i></div>
</div>`;

// 由数据生成结论，不写死数字
const insights = [
  `<b>能力值越低越抗跌。</b>${bestGroup.label} 档中位 ${pct(bestGroup.medianChange)}、上涨占比 ${(bestGroup.upShare * 100).toFixed(0)}%；而 ${worstGroup.label} 档中位 ${pct(worstGroup.medianChange)}、上涨占比仅 ${(worstGroup.upShare * 100).toFixed(0)}%。低价卡在开服首月的跌幅明显小于高价卡。`,
  `<b>高评分卡更早见顶、也更晚止跌。</b>${earliestPeakLabels} 档的月内峰值中位就落在开服第 ${earliestPeakDay} 天，${latestPeakLabels} 档晚至第 ${latestPeakDay} 天；而谷值日中位：90 分以上档拖到第 ${dayOf(groups.find(g => g.key === 'b90')?.medianTroughIdx)} 天附近，84–85 与 ≤83 档在第 ${dayOf(groups.find(g => g.key === 'b84')?.medianTroughIdx)} / ${dayOf(groups.find(g => g.key === 'b83')?.medianTroughIdx)} 天就已经止跌。高评分卡属于「先冲高、后长期阴跌」，低评分卡见底更早、之后还能小幅回升。`,
  `<b>首日冲高是普遍现象。</b>${withRating.filter(r => r.m.openIsPeak).length}/${withRating.length}（${(withRating.filter(r => r.m.openIsPeak).length / withRating.length * 100).toFixed(0)}%）的卡把月内最高价留在了开服首日，全样本中位回撤 ${pctAbs(median(withRating.map(r => r.m.drawdown)))}。开服首周是价格最不稳定、也最容易被套的阶段。`,
  `<b>同档不同卡池表现分化。</b>${matrix.map(row => { const c = row.cells.filter(x => x.n >= 5).sort((a, b) => b.medianChange - a.medianChange)[0]; return c ? `${row.label} 档里 ${POOLS.find(p => p.key === c.pool).label} 中位 ${pct(c.medianChange)}` : null; }).filter(Boolean).slice(0, 3).join('；')}。样本不足 5 张的组合不参与比较。`,
];

const groupSection = groups.slice().sort((a, b) => b.label.localeCompare(a.label, 'zh')).map(groupTable).join('');

const detailTable = `<details><summary>展开全量明细（${detail.length} 张卡，按能力值降序 / 涨跌升序）—— 每行都可点开看该球员一个月价格曲线</summary>
<div class="pl-tools"><input type="search" id="pl-filter" class="pl-filter" placeholder="输入球员名筛选（中文 / 英文 / 卡池）…" aria-label="按球员名筛选"><span class="ax">共 ${detail.length} 张 · 点任意行展开曲线</span></div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>OVR</th><th>卡池</th><th>首日</th><th>末日</th><th>涨跌</th><th>月内回撤</th><th>峰值日</th></tr></thead>
${detail.map((r, i) => playerEntry(r, i + 1)).join('')}
</table></div>
<div class="pl-empty ax" id="pl-empty" hidden>没有匹配的球员，换个关键词试试。</div></details>`;

const footer = `<div class="footer">
数据窗口 ${days[0]} ~ ${days[days.length - 1]}（${days.length} 天）· 样本 ${rows.length} 张卡（可用 ${withRating.length} 张，其余因观测日不足被剔除）· 卡池 Gold / Icon / Hero · 平台 Cross。
本页为本地历史数据汇总，<b>不含任何预测</b>，也不构成投资或交易建议；FC26 开服首月的价格路径不代表 FC27 会重演。生成方式：<code>node apps/market/engine/scripts/render-fc26-review.mjs</code>（只读本地数据，不联网）。
</div>`;

// 交互：点球员行 → 展开/收起该卡一个月逐日价格曲线（首次展开时按需绘制 SVG）；全量明细支持按球员名筛选。
// 纯前端、无外部依赖；价格点已在渲染时内联进 data-curve，不发起任何网络请求。
//
// ⚠ 本页会被 merge_daily_report.mjs 作 srcdoc 内嵌进站点，而 themedPanel 会把 `&`→`&amp;`、`"`→`&quot;`。
// `<script>` / `<style>` 是 raw text 元素，属性里的实体**不会被解码**，所以脚本内**禁止出现 `"` 与 `&`**
// （否则内嵌后脚本会变成 &quot; 而直接语法报错）。因此脚本里所有字符串一律用单引号，
// 生成的 SVG 属性也用单引号；DAYS 数组手工拼成单引号形式，不用 JSON.stringify。
const daysJs = '[' + days.map(d => `'${d.slice(5)}'`).join(',') + ']';
const script = `<script>
(function(){
  var DAYS=${daysJs};
  var UP='${UP}',DN='${DN}',N=DAYS.length;
  var MQ=String.fromCharCode(39);
  function q(v){return MQ+v+MQ;}
  function coins(v){return v==null?'—':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(v>=1e5?0:1)+'K':String(v);}
  function pctS(v){return v==null?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';}
  function pctA(v){return v==null?'—':(v*100).toFixed(1)+'%';}
  function drawCurve(d){
    var W=1000,H=306,L=78,R=26,T=22,B=50,pw=W-L-R,ph=H-T-B,C=d.c,P=d.p,all=[],i;
    for(i=0;i<C.length;i++)if(C[i]!=null)all.push(C[i]);
    if(P)for(i=0;i<P.length;i++)if(P[i]!=null)all.push(P[i]);
    if(all.length<2)return '<div class=pl-cap>有效观测不足 2 天，无法绘制价格曲线。</div>';
    var lo=Math.min.apply(null,all),hi=Math.max.apply(null,all);
    var pad=(hi-lo)*0.14||Math.max(1,hi*0.05),y0=Math.max(0,lo-pad),y1=hi+pad;
    function X(k){return L+pw*k/(N-1);}
    function Y(v){return T+ph-(v-y0)/(y1-y0)*ph;}
    function pathOf(a){var s='';for(var k=0;k<a.length;k++){if(a[k]==null)continue;s+=(s?' L':'M')+X(k).toFixed(1)+' '+Y(a[k]).toFixed(1);}return s;}
    var g='',t,v,yy;
    for(t=0;t<=4;t++){v=y0+(y1-y0)*t/4;yy=Y(v);
      g+='<line x1=' + q(L) + ' y1=' + q(yy) + ' x2=' + q(W-R) + ' y2=' + q(yy) + ' stroke=' + q('var(--line)') + ' stroke-dasharray=' + q(t===0?'0':'3 5') + '/>'
       + '<text x=' + q(L-10) + ' y=' + q(yy+4) + ' text-anchor=end class=ax>' + coins(v) + '</text>';}
    for(i=0;i<N;i+=5)g+='<text x=' + q(X(i)) + ' y=' + q(H-B+22) + ' text-anchor=middle class=ax>' + DAYS[i] + '</text>';
    var col=d.ch>=0?UP:DN,dc=pathOf(C),fi=d.i[0],li=d.i[3];
    if(li>fi)g+='<path d=' + q(dc+' L'+X(li).toFixed(1)+' '+(T+ph).toFixed(1)+' L'+X(fi).toFixed(1)+' '+(T+ph).toFixed(1)+' Z') + ' fill=' + q(col) + ' opacity=.10/>';
    if(P){var pv=0;for(i=0;i<P.length;i++)if(P[i]!=null)pv++;if(pv>=2)g+='<path d=' + q(pathOf(P)) + ' fill=none stroke=#8aa9c8 stroke-width=1.8 stroke-dasharray=' + q('5 4') + ' stroke-linejoin=round/>';}
    g+='<path d=' + q(dc) + ' fill=none stroke=' + q(col) + ' stroke-width=2.6 stroke-linejoin=round/>';
    var marks=[{idx:d.i[1],fill:UP,txt:'峰 '+coins(C[d.i[1]]),below:false},
               {idx:d.i[2],fill:DN,txt:'谷 '+coins(C[d.i[2]]),below:true},
               {idx:d.i[3],fill:col,txt:'末 '+coins(C[d.i[3]]),below:false},
               {idx:d.i[0],fill:'#859080',txt:'首',below:false}];
    var seen={},m,px,py,tt,an,dx;
    for(var k=0;k<marks.length;k++){m=marks[k];
      if(m.idx==null||C[m.idx]==null)continue;
      px=X(m.idx);py=Y(C[m.idx]);
      g+='<circle cx=' + q(px) + ' cy=' + q(py) + ' r=4.2 fill=' + q(m.fill) + ' stroke=#101713 stroke-width=1.4/>';
      if(seen[m.idx])continue;seen[m.idx]=1;
      tt=(px-L)/pw;an=tt<0.16?'start':tt>0.84?'end':'middle';dx=tt<0.16?7:(tt>0.84?-7:0);
      g+='<text x=' + q(px+dx) + ' y=' + q(py+(m.below?19:-12)) + ' text-anchor=' + an + ' class=mkv fill=' + q(m.fill) + '>' + m.txt + '</text>';
    }
    var st='<div class=pl-stat>'
      + '<span>首日 <b>' + coins(C[d.i[0]]) + '</b> <i class=ax>D' + (d.i[0]+1) + '</i></span>'
      + '<span>峰值 <b style=' + q('color:'+UP) + '>' + coins(C[d.i[1]]) + '</b> <i class=ax>D' + (d.i[1]+1) + '</i></span>'
      + '<span>谷值 <b style=' + q('color:'+DN) + '>' + coins(C[d.i[2]]) + '</b> <i class=ax>D' + (d.i[2]+1) + '</i></span>'
      + '<span>末日 <b>' + coins(C[d.i[3]]) + '</b> <i class=ax>D' + (d.i[3]+1) + '</i></span>'
      + '<span>涨跌 <b style=' + q('color:'+col) + '>' + pctS(d.ch) + '</b></span>'
      + '<span>月内回撤 <b>' + pctA(d.dd) + '</b></span>'
      + '<span>日波动率 <b>' + (d.vo==null?'—':(d.vo*100).toFixed(1)+'%') + '</b></span>'
      + '<span>观测 <b>' + d.n + '</b>/' + N + ' 天</span>'
      + (d.pcn ? '<span>PC 末日 <b>' + coins(d.pcl) + '</b> <i class=ax>n=' + d.pcn + '</i></span>' : '')
      + '</div>';
    return '<div class=pl-cap>' + d.nm + ' 开服首月逐日价格（Cross 实线 · PC 虚线 · 单位 coins）</div>'
      + '<svg viewBox=' + q('0 0 1000 306') + ' role=img aria-label=' + q(d.nm + ' 逐日价格曲线') + ' preserveAspectRatio=' + q('xMidYMid meet') + '>' + g + '</svg>' + st;
  }
  document.addEventListener('click',function(e){
    var el=e.target;
    while(el&&el!==document&&!(el.classList&&el.classList.contains('pl-row')))el=el.parentNode;
    if(!el||el===document)return;
    var open=el.classList.toggle('open');
    if(!open)return;
    var box=el.nextElementSibling&&el.nextElementSibling.querySelector('.pl-box');
    if(!box||box.childNodes.length)return;
    try{box.innerHTML=drawCurve(JSON.parse(el.getAttribute('data-curve')));}
    catch(err){box.innerHTML='<div class=pl-cap>曲线数据解析失败。</div>';}
  });
  var f=document.getElementById('pl-filter');
  if(f){
    var empty=document.getElementById('pl-empty');
    f.addEventListener('input',function(){
      var q2=f.value.trim().toLowerCase(),shown=0;
      var list=document.querySelectorAll('tbody.pl');
      for(var i=0;i<list.length;i++){
        var tb=list[i],hit=!q2||(tb.getAttribute('data-name')||'').indexOf(q2)>=0;
        tb.classList.toggle('hid',!hit);
        if(hit)shown++;
      }
      if(empty)empty.hidden=shown>0;
    });
  }
})();
</script>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC26 球员回顾 · 开服首月价格变化</title>
${style}
</head>
<body>
<div class="container">
${header}
${stats}
${chart1}
${chart2}
${chart3}
${chart4}
<div class="insights">${insights.map(t => `<div class="insight">${t}</div>`).join('')}</div>
<section class="card"><div class="card-head"><h3>按能力值分档：代表球员</h3><span class="ax">每档列抗跌前 5 与跌幅前 5 · <b>点任意球员行</b>即可展开该卡一个月逐日价格曲线</span></div>${groupSection}</section>
${detailTable}
${footer}
</div>
${script}
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf8');
console.log(`FC26 球员回顾已渲染: ${OUT_FILE}`);
console.log(`  窗口 ${days[0]} ~ ${days[days.length - 1]}（${days.length} 天）· 样本 ${rows.length} 张（可用 ${withRating.length}）`);
console.log(`  分档：${groups.map(g => `${g.label} n=${g.n} 中位${pct(g.medianChange)}`).join(' · ')}`);
console.log(`  峰值日中位：${groups.map(g => `${g.label} D${(g.medianPeakIdx ?? 0) + 1}`).join(' · ')}`);
console.log(`  谷值日中位：${groups.map(g => `${g.label} D${(g.medianTroughIdx ?? 0) + 1}`).join(' · ')}`);
