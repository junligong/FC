#!/usr/bin/env node
/**
 * FC27 市场「可关注球员列表」构建器 —— 每小时任务的分析步骤
 *
 * 用途：读取逐小时价格序列与 FUTBIN 热度，按「热度 + 价格（同档相对便宜度）+ 逐小时挂单价变动」三维打分，
 *       产出结构化关注列表（watchlist.json）。当前价不复制进衍生文件，页面统一从 current.json 读取。
 *
 * 输入：
 *   - 唯一当前行情：    apps/market/engine/data/prices/fc27/current.json（当前价与当前热度）
 *   - 逐小时价格序列：apps/market/engine/data/prices/fc27/popular/daily/<D>.json
 *   - 进化卡热度：    apps/market/engine/data/prices/fc27/evolutions/latest.json（缺失则该维度留空）
 *   - 当日市场数据：  automation/runs/<D>/market/market.json（球员名单、中文译名、进化池标记）
 *   - 环境变量：FC_PROJECT_ROOT 可覆盖项目根
 *
 * 输出：
 *   - automation/runs/<D>/market/watchlist.json  关注列表（结构化，含评分、理由、口径说明）
 *
 * 打分口径（公式写进产物，便于复核；不得黑箱）：
 *   - 参考价 = 该卡两个平台中**有效价（≥1000 coins）的较大者**；两个平台都无效则该卡只进「暂无有效价」列表，不参与打分排序。
 *   - 热度分 = 该卡热度在全体有热度卡中的分位（0–100）。
 *   - 价格分 = 与**同位置组且总评 ±2 的同档球员中位价**比较：50 + 50×(1 − 参考价/中位价)，夹在 0–100（越便宜分越高）。
 *   - 变动分 = 同一日内相邻两次有效观测的挂单价变动：50 + 变动百分比×100，夹在 0–100；无两个有效观测点时为 null。
 *   - 关注分 = 0.45×热度分 + 0.40×价格分 + 0.15×变动分（变动分缺失时按中性 50 计入，并在产物里标注）。
 *
 * 口径红线：平台价与估值严格分开；<1000 视为占位值；**不计算日环比与累计涨跌**（开服前无成交基准），
 *           变动分只反映同一日内两个有效挂单观测点之间的变化，产物内以 `intradayChange` 明确命名。
 * 缺失一律如实空状态，绝不用 FC26 或历史日期数据填充。
 *
 * 用法：node apps/market/engine/scripts/build-market-watchlist.mjs [D]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_MARKET_PATH, readCurrentMarket } from '../src/current-market.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const PRICE_ROOT = path.join(ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27');
const MIN_VALID_PRICE = 1000;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : shanghaiDate();
const runDir = path.join(ROOT, 'automation', 'runs', dateStr, 'market');
const dailyPath = path.join(PRICE_ROOT, 'popular', 'daily', `${dateStr}.json`);
const evoPath = path.join(PRICE_ROOT, 'evolutions', 'latest.json');
const marketPath = path.join(runDir, 'market.json');

const daily = readJSON(dailyPath);
const evoLatest = readJSON(evoPath);
const market = readJSON(marketPath);
const currentMarket = readCurrentMarket(CURRENT_MARKET_PATH);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const posGroup = pos => {
  if (!pos) return '其他';
  const p = String(pos).toUpperCase();
  if (p === 'GK') return '门将';
  if (/CB|LB|RB|LWB|RWB/.test(p)) return '后卫';
  if (/CM|CDM|CAM|LM|RM/.test(p)) return '中场';
  if (/ST|CF|LW|RW/.test(p)) return '前锋';
  return '其他';
};
const median = arr => {
  const a = arr.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
};
const cardIdOf = value => String(value || '').match(/\/player\/([^/?#]+)/)?.[1]?.split('_')[0] || null;
const shanghaiDateOf = value => {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    : null;
};

// ---------- 0. 当日开盘基线：market.json 里 03:05 市场任务采集到的有效平台价 ----------
// 用于「本日只有一个整点观测」时给出变动基准；两条观测都无则变动维度留空（不猜测）。
const roster = new Map();
const baseline = new Map(); // url -> { ps, pc, hour }
if (market && Array.isArray(market.players)) {
  for (const p of market.players) {
    if (!p.url) continue;
    roster.set(p.url, p);
    const ps = typeof p.psPrice === 'number' && p.psPrice >= MIN_VALID_PRICE ? p.psPrice : 0;
    const pc = typeof p.pcPrice === 'number' && p.pcPrice >= MIN_VALID_PRICE ? p.pcPrice : 0;
    if (ps || pc) baseline.set(p.url, { ps, pc, hour: '03' });
  }
}

// ---------- 1. 组装卡片集合：逐小时序列为主，market.json 补名单/译名/进化池标记 ----------
const cards = new Map(); // key = url
const seriesOf = entry => {
  const last = arr => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null);
  const prev = arr => (Array.isArray(arr) && arr.length > 1 ? arr[arr.length - 2] : null);
  return { psLast: last(entry.ps), psPrev: prev(entry.ps), pcLast: last(entry.pc), pcPrev: prev(entry.pc), popLast: last(entry.pop), popPrev: prev(entry.pop) };
};

if (daily && daily.cards) {
  for (const [url, entry] of Object.entries(daily.cards)) {
    const s = seriesOf(entry);
    const psLast = s.psLast && s.psLast.v >= MIN_VALID_PRICE ? s.psLast.v : 0;
    const pcLast = s.pcLast && s.pcLast.v >= MIN_VALID_PRICE ? s.pcLast.v : 0;
    const psPrevValid = s.psPrev && s.psPrev.v >= MIN_VALID_PRICE ? s.psPrev.v : 0;
    const pcPrevValid = s.pcPrev && s.pcPrev.v >= MIN_VALID_PRICE ? s.pcPrev.v : 0;
    // 变动只在「同一平台的两次有效观测」之间计算，跨平台或与占位值比较一律不做。
    // 优先用当日**相邻整点**观测；本日只有一个整点时，退回当日开盘基线，并以 basis 标注来源。
    const intraday = [];
    const base = baseline.get(url) || null;
    const pushMove = (platform, prevVal, nowVal, fromHour, basis) => {
      intraday.push({ platform, prev: prevVal, now: nowVal, pct: +(((nowVal - prevVal) / prevVal) * 100).toFixed(2), fromHour, basis });
    };
    if (psLast && psPrevValid) pushMove('console', psPrevValid, psLast, s.psPrev.h, 'hourly');
    else if (psLast && base && base.ps) pushMove('console', base.ps, psLast, base.hour, 'daily-open');
    if (pcLast && pcPrevValid) pushMove('pc', pcPrevValid, pcLast, s.pcPrev.h, 'hourly');
    else if (pcLast && base && base.pc) pushMove('pc', base.pc, pcLast, base.hour, 'daily-open');
    cards.set(url, {
      cardId: cardIdOf(url), url, name: entry.name, rating: entry.rating, pos: entry.pos, evoName: entry.evoName || null,
      psPrice: psLast, pcPrice: pcLast, refPrice: Math.max(psLast, pcLast),
      popularity: s.popLast ? s.popLast.v : null, popularityPrev: s.popPrev ? s.popPrev.v : null,
      popularityDelta: (s.popLast && s.popPrev && typeof s.popLast.v === 'number' && typeof s.popPrev.v === 'number')
        ? s.popLast.v - s.popPrev.v : null,
      points: { ps: (entry.ps || []).length, pc: (entry.pc || []).length, pop: (entry.pop || []).length },
      intradayChange: intraday,
      observations: { firstHour: daily.points?.[0]?.hour ?? null, lastHour: daily.points?.[daily.points.length - 1]?.hour ?? null, points: (daily.points || []).length },
      inMarketRoster: false,
    });
  }
}

// market.json 中「热度有但当天没价」的卡也纳入追踪（标为暂无有效价），并补齐译名/进化池标记
if (market && Array.isArray(market.players)) {
  for (const p of market.players) {
    if (!p.url) continue;
    if (!cards.has(p.url)) {
      cards.set(p.url, {
        cardId: cardIdOf(p.url), url: p.url, name: p.name, rating: p.rating, pos: p.pos, evoName: null,
        psPrice: 0, pcPrice: 0, refPrice: 0, popularity: null, popularityPrev: null, popularityDelta: null,
        points: { ps: 0, pc: 0, pop: 0 }, intradayChange: [],
        observations: { firstHour: null, lastHour: null, points: 0 }, inMarketRoster: true,
      });
    }
  }
}
// 进化榜热度补充（进化卡在 /27/popular 与 /27/popular/evolutions 两处都可能出现）
if (evoLatest && Array.isArray(evoLatest.cards)) {
  for (const c of evoLatest.cards) {
    const hit = cards.get(c.url);
    if (hit) {
      if (hit.popularity == null && typeof c.popularity === 'number') hit.popularity = c.popularity;
      if (!hit.evoName && c.evoName) hit.evoName = c.evoName;
    } else {
      cards.set(c.url, {
        cardId: cardIdOf(c.url), url: c.url, name: c.name, rating: c.rating, pos: c.pos, evoName: c.evoName || null,
        psPrice: 0, pcPrice: 0, refPrice: 0, popularity: typeof c.popularity === 'number' ? c.popularity : null,
        popularityPrev: null, popularityDelta: null, points: { ps: 0, pc: 0, pop: 0 }, intradayChange: [],
        observations: { firstHour: null, lastHour: null, points: 0 }, inMarketRoster: false,
      });
    }
  }
}

// 当前状态只认 current.json；逐小时序列上方只负责提供前一观测点与变化依据。
for (const c of cards.values()) {
  const live = c.cardId ? currentMarket.cards?.[c.cardId] : null;
  const priceOf = pid => {
    const cell = live?.platforms?.[pid];
    return cell?.valid && shanghaiDateOf(cell.observedAt) === dateStr ? cell.price : 0;
  };
  c.psPrice = priceOf('console');
  c.pcPrice = priceOf('pc');
  c.refPrice = Math.max(c.psPrice, c.pcPrice);
  if (typeof live?.popularity === 'number' && shanghaiDateOf(live.popularityObservedAt) === dateStr) {
    c.popularity = live.popularity;
  }
  c.intradayChange = c.intradayChange.flatMap(move => {
    const now = move.platform === 'pc' ? c.pcPrice : c.psPrice;
    if (!now || !move.prev) return [];
    return [{ ...move, now, pct: +(((now - move.prev) / move.prev) * 100).toFixed(2) }];
  });
}

// ---------- 2. 打分 ----------
const list = [...cards.values()];
for (const c of list) {
  const r = roster.get(c.url);
  c.nameZh = r?.nameZh || null;
  c.cardType = r?.cardType || (c.evoName ? 'Evolution' : '');
  c.evo = r?.evo || (c.evoName ? '在进化池' : (r ? '非进化池' : null));
  c.stats = r?.stats || null;
  c.posGroup = posGroup(c.pos);
  c.priceValid = c.refPrice >= MIN_VALID_PRICE;
}

const popPool = list.filter(c => typeof c.popularity === 'number').map(c => c.popularity).sort((a, b) => a - b);
const percentile = v => {
  if (!popPool.length || typeof v !== 'number') return null;
  const below = popPool.filter(x => x < v).length;
  return Math.round((below / popPool.length) * 100);
};
// 同档中位价：位置组相同 + 总评 ±2，且参考价有效
for (const c of list) {
  const peers = list.filter(o => o.priceValid && o.posGroup === c.posGroup && o.rating != null && c.rating != null && Math.abs(o.rating - c.rating) <= 2);
  c.peerCount = peers.length;
  c.peerMedianPrice = peers.length >= 5 ? median(peers.map(o => o.refPrice)) : null;
  c.popScore = percentile(c.popularity);
  c.priceScore = c.priceValid && c.peerMedianPrice
    ? clamp(Math.round(50 + 50 * (1 - c.refPrice / c.peerMedianPrice)), 0, 100)
    : null;
  // 变动分只取**两个真实整点观测**（basis=hourly）的对比：开服前 FUTBIN 的平台价字段本身会大幅跳动，
  // 与当日开盘基线（03:05）的单点对比可能混入 FUTBIN 自身的估值修订，故只作展示、不计入综合分。
  const confirmed = c.intradayChange.find(m => m.basis === 'hourly') || null;
  c.moveConfirmed = !!confirmed;
  c.moveSuspicious = c.intradayChange.some(m => Math.abs(m.pct) >= 50);
  c.moveScore = confirmed ? clamp(Math.round(50 + confirmed.pct * 2), 0, 100) : null;
}
// 关注分：权重固定，缺项按中性 50 计入并标注（不因缺项而人为抬高）
for (const c of list) {
  const parts = [
    { k: 'popularity', v: c.popScore, w: 0.45 },
    { k: 'price', v: c.priceScore, w: 0.40 },
    { k: 'move', v: c.moveScore, w: 0.15 },
  ];
  const used = parts.filter(p => p.v != null);
  const weightSum = used.reduce((s, p) => s + p.w, 0) || 1;
  const filled = parts.filter(p => p.v == null).map(p => p.k);
  c.watchScore = c.priceValid
    ? Math.round(used.reduce((s, p) => s + p.v * p.w, 0) / weightSum)
    : null;
  c.scoreParts = { popularity: c.popScore, price: c.priceScore, move: c.moveScore, neutralFilled: filled };

  const reasons = [];
  if (c.popScore != null && c.popScore >= 80) reasons.push('热度前列');
  if (c.priceScore != null && c.priceScore >= 70) reasons.push('同档低价');
  if (c.priceScore != null && c.priceScore <= 30) reasons.push('同档偏贵');
  const shown = c.intradayChange[0];
  if (shown && Math.abs(shown.pct) >= 2) {
    const dir = shown.pct > 0 ? '上行' : '回落';
    const tail = c.moveConfirmed ? '' : '（较开盘，待整点确认）';
    const warn = c.moveSuspicious ? '⚠' : '';
    reasons.push(`挂单价${warn}${dir} ${shown.pct > 0 ? '+' : ''}${shown.pct}%${tail}`);
  }
  if (c.evoName) reasons.push(`进化卡：${c.evoName}`);
  if (!c.priceValid) reasons.push('暂无有效平台价');
  c.reasons = reasons;
}

const sortByScore = (a, b) => (b.watchScore ?? -1) - (a.watchScore ?? -1);
const watch = list.filter(c => c.priceValid && c.watchScore != null).sort(sortByScore);
const undervalued = list.filter(c => c.priceValid && c.priceScore != null && c.priceScore >= 60 && c.popScore != null && c.popScore >= 50).sort(sortByScore);
const trending = list.filter(c => c.intradayChange.some(m => Math.abs(m.pct) >= 1))
  .sort((a, b) => Math.max(...b.intradayChange.map(m => Math.abs(m.pct))) - Math.max(...a.intradayChange.map(m => Math.abs(m.pct))));
const hotEvo = list.filter(c => c.evoName || c.evo === '在进化池').filter(c => typeof c.popularity === 'number')
  .sort((a, b) => b.popularity - a.popularity);
const pendingPrice = list.filter(c => !c.priceValid).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

const slim = (c, extra = {}) => ({
  rank: null, cardId: c.cardId, name: c.name, nameZh: c.nameZh, url: c.url, rating: c.rating, pos: c.pos, cardType: c.cardType,
  evo: c.evo, evoName: c.evoName,
  priceValid: c.priceValid,
  popularity: c.popularity, popularityDelta: c.popularityDelta,
  intradayChange: c.intradayChange, peerMedianPrice: c.peerMedianPrice, peerCount: c.peerCount,
  watchScore: c.watchScore, scoreParts: c.scoreParts, reasons: c.reasons, points: c.points,
  moveConfirmed: c.moveConfirmed, moveSuspicious: c.moveSuspicious,
  ...extra,
});
const withRank = arr => arr.map((c, i) => slim(c, { rank: i + 1 }));

const priceBasis = list.some(c => c.priceValid) ? 'partial-live' : 'listing-estimate';
const payload = {
  date: dateStr,
  generatedAt: new Date().toISOString(),
  platform: 'console+pc',
  priceBasis,
  minValidPrice: MIN_VALID_PRICE,
  source: {
    currentMarket: path.relative(ROOT, CURRENT_MARKET_PATH),
    currentMarketGeneratedAt: currentMarket.generatedAt || null,
    priceSeries: path.relative(ROOT, dailyPath),
    priceSeriesExists: !!daily,
    evolutions: path.relative(ROOT, evoPath),
    evolutionsExists: !!evoLatest,
    marketJson: path.relative(ROOT, marketPath),
    marketJsonExists: !!market,
  },
  universe: {
    tracked: list.length,
    priceValid: list.filter(c => c.priceValid).length,
    psValid: list.filter(c => c.psPrice >= MIN_VALID_PRICE).length,
    pcValid: list.filter(c => c.pcPrice >= MIN_VALID_PRICE).length,
    withPopularity: list.filter(c => typeof c.popularity === 'number').length,
    hourlyPoints: daily?.points?.length ?? 0,
    firstHour: daily?.points?.[0]?.hour ?? null,
    lastHour: daily?.points?.[daily.points.length - 1]?.hour ?? null,
  },
  scoring: {
    formula: '关注分 = 0.45×热度分 + 0.40×价格分 + 0.15×变动分（缺项按中性 50 计入并标注 neutralFilled）',
    popularityScore: '该卡 FUTBIN 热度计数在全体有热度卡中的分位（0–100）',
    priceScore: '50 + 50×(1 − 参考价/同档中位价)，同位置组且总评 ±2、样本 ≥5 才计算；越便宜分越高',
    referencePrice: '两个平台中有效价（≥1000 coins）的较大者；两平台都无效则该卡不参与打分',
    moveScore: '50 + 挂单价变动百分比×2（+10% → 70，−10% → 30）；**只取两个真实整点观测**（basis=hourly）的对比。与当日开盘基线（03:05）的单点对比只作展示、不计入综合分（开服前 FUTBIN 平台价字段波动大，单点对比可能混入其自身估值修订），并以 moveSuspicious 标注 |变动| ≥ 50% 的跳变。',
    changeBasis: 'intradayChange[].basis：hourly = 当日相邻整点观测；daily-open = 与当日开盘基线（03:05）比较',
    caveat: 'FC27 未正式开服（launchDate=2026-09-25），平台价为 FUTBIN 滚动更新的挂单/估价口径，不是成交价；本表不计算日环比与累计涨跌，intradayChange 仅表示同一日内两个有效观测点之间的变化。',
  },
  lists: {
    watch: withRank(watch.slice(0, 30)),
    undervalued: withRank(undervalued.slice(0, 20)),
    trending: withRank(trending.slice(0, 20)),
    hotEvo: withRank(hotEvo.slice(0, 20)),
    pendingPrice: withRank(pendingPrice.slice(0, 50)),
  },
  counts: {
    watch: watch.length, undervalued: undervalued.length, trending: trending.length,
    hotEvo: hotEvo.length, pendingPrice: pendingPrice.length,
  },
  disclaimer: '本表由 FUTBIN 公开挂单/热度数据机械计算得出，仅供游戏内研究，不构成投资或交易建议。',
};

if (!daily) {
  payload.missing = [
    `逐小时价格序列缺失（${path.relative(ROOT, dailyPath)} 不存在）：本轮无价格观测，关注列表为空状态。`,
    '首次运行或本轮采集失败时属正常现象；采集成功后的下一轮即会产出列表，不使用历史日期数据填充。',
  ];
}

atomicWrite(path.join(runDir, 'watchlist.json'), JSON.stringify(payload, null, 1));

console.log(JSON.stringify({
  status: daily ? 'ok' : 'partial',
  date: dateStr,
  universe: payload.universe,
  counts: payload.counts,
  topWatch: payload.lists.watch.slice(0, 5).map(c => ({ rank: c.rank, name: c.name, nameZh: c.nameZh, rating: c.rating, popularity: c.popularity, watchScore: c.watchScore, reasons: c.reasons })),
  outputs: [path.relative(ROOT, path.join(runDir, 'watchlist.json'))],
}, null, 2));
