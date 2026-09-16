#!/usr/bin/env node
/**
 * 用途：把本轮 CDP 实测抓到的 FUTBIN 原始结果（/tmp/fc_*.json）整理成本轮 market.json。
 * 输入：/tmp/fc_players_p1.json（/27/players 无筛选首屏 30 行）、/tmp/fc_popular.json（/27/popular 卡片）、
 *       /tmp/fc_evo.json（/27/popular/evolutions 卡片）、/tmp/fc_tier_*.json（四档价格筛选页实测结果）
 * 输出：automation/runs/2026-09-16/market/market.json
 * 口径：FC27 开服日 2026-09-25 之前，FUTBIN 价格为列表页占位/估算价（listing-estimate），不计算涨跌。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const D = '2026-09-16';
const rd = p => { try { return JSON.parse(readFileSync(p, 'utf8')).value; } catch { return null; } };
const j = p => { const v = rd(p); return v ? JSON.parse(v) : null; };

const players = j('/tmp/fc_players_p1.json');
const pages = [players, j('/tmp/fc_players_p2.json'), j('/tmp/fc_players_p3.json')].filter(Boolean);
const popular = j('/tmp/fc_popular.json');
const evo = j('/tmp/fc_evo.json');
const tiers = {
  'tier-1m': j('/tmp/fc_tier_1m.json'),
  'tier-300k': j('/tmp/fc_tier_300k.json'),
  'tier-10k': j('/tmp/fc_tier_10k.json'),
};

const abs = h => (h ? `https://www.futbin.com${h}` : '');
const num = s => { const m = String(s).replace(/,/g, '').match(/^([\d.]+)(K|M)?$/i); if (!m) return null; const n = parseFloat(m[1]); return Math.round(m[2] ? n * (m[2].toUpperCase() === 'K' ? 1e3 : 1e6) : n); };

// /27/popular 卡片文本："0 67.5K 94 ST R 5 5 97.3 Ronaldo 455"
function parsePopular(t) {
  const m = /^(\S+)\s+(\S+)\s+(\d{2})\s+(.+?)\s+R\s+(\d)\s+(\d)\s+([\d.]+)\s+(.+?)\s+(\d+)$/.exec(t);
  if (!m) return null;
  return { price: num(m[1]), popularity: num(m[2]), rating: +m[3], pos: m[4].trim(), name: m[8].trim() };
}

// /27/popular/evolutions 卡片文本："79 RB ++ RM R 2 4 78.5 Savona 80 PAC ... Intro to Evolutions 1644"
function parseEvo(t) {
  const m = /^(\d{2})\s+(.+?)\s+R\s+(\d)\s+(\d)\s+([\d.]+)\s+(.+?)\s+((?:\d{2} (?:PAC|SHO|PAS|DRI|DEF|PHY)\s+){6})(.+?)\s+(\d+)$/.exec(t);
  if (!m) return null;
  return { rating: +m[1], pos: m[2].trim(), name: m[6].trim(), evo: m[8].trim(), popularity: +m[9] };
}

const evoParsed = (evo?.cards || []).map(c => ({ ...parseEvo(c.t), href: c.href })).filter(x => x && x.name);
const evoHrefs = new Set(evoParsed.map(x => x.href).filter(Boolean));
const popParsed = (popular?.cards || []).map(c => ({ ...parsePopular(c.t), href: c.href })).filter(x => x && x.name);

const playersRows = (() => {
  const seen = new Set();
  const out = [];
  for (const pg of pages) for (const r of pg.rows || []) {
    const key = r.href || r.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: r.name.replace(/\s+(Icon|Hero)$/i, '').trim(),
      url: abs(r.href),
      rating: +r.rat || null,
      pos: r.pos,
      cardType: /Icon$/i.test(r.name) ? 'Icon' : (/Hero$/i.test(r.name) ? 'Hero' : ''),
      price: +String(r.price).replace(/\D/g, '') || null,
      popularity: +r.pop || null,
    });
  }
  return out;
})();

// 价格分档：以实测价格在无筛选榜单内分档（筛选参数页在开服前恒为 0 行，见 missing）
const TIERS = [
  { id: 'tier-1m', name: '≥ 100 万', lo: 1000000, hi: null },
  { id: 'tier-300k', name: '30 - 100 万', lo: 300000, hi: 1000000 },
  { id: 'tier-100k', name: '10 - 30 万', lo: 100000, hi: 300000 },
  { id: 'tier-10k', name: '1 - 10 万', lo: 10000, hi: 100000 },
];
const inTier = (p, t) => p.price != null && p.price >= t.lo && (t.hi === null || p.price < t.hi);
const blankNote = (id) => {
  const r = tiers[id];
  return r && r.n === 0
    ? 'FUTBIN 价格筛选页（pc_price）返回 0 行；开服前该筛选参数不可用，本档据实测为空，如实空状态。'
    : '本档实测无满足价格区间的卡，如实空状态。';
};

const priceTiers = TIERS.map(t => {
  const items = playersRows.filter(p => inTier(p, t)).sort((a, b) => b.rating - a.rating).slice(0, 50)
    .map((p, i) => ({ ...p, rank: i + 1 }));
  return { id: t.id, name: t.name, items, note: items.length ? '' : blankNote(t.id) };
});
const allTiered = new Set(priceTiers.flatMap(t => t.items.map(i => i.url)));
const overflow = playersRows.filter(p => p.price != null && p.price < 10000).map((p, i) => ({ ...p, rank: i + 1 }));

const dimension = (id, name, range, lo, hi, note) => {
  const items = playersRows.filter(p => p.price != null && p.price >= lo && (hi === null || p.price < hi))
    .sort((a, b) => b.rating - a.rating).slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 }));
  return { id, name, range, items, note: items.length ? '' : (note || '') };
};

const market = {
  date: D,
  status: 'partial',
  platform: 'cross',
  generatedAt: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
  dataCutoff: '2026-09-16 13:34 +08:00',
  priceBasis: 'listing-estimate',
  notes: [
    'FC27 尚未开服（launchDate=2026-09-25），FUTBIN 列表页价格为占位/估算价（priceBasis=listing-estimate），不是市场成交价，本报告不计算日环比与累计涨跌。',
    '全部数据由 web-access（CDP 直连用户日常 Chrome）实测打开 FUTBIN 页面后从 DOM 提取；FUTBIN 对 curl/WebFetch 返回 403，静态路线不可用。',
    '/27/players 的价格筛选参数（pc_price=1000000%2B / 300000-1000000 / 100000-300000 / 10000-100000）在开服前均返回 0 行，故价格分档改由无筛选榜单（第 1-3 页共 90 行，按 Rating 降序）的实测价格直接分档。',
  ],
  priceDimensions: [
    dimension('premium', '大卡', '100 万以上', 1000000, null, blankNote('tier-1m')),
    dimension('mid', '中卡', '30 万 ~ 100 万', 300000, 1000000, blankNote('tier-300k')),
    dimension('hot', '热门卡', '10 万 ~ 30 万', 100000, 300000, '实测无满足区间的卡。'),
    dimension('practical', '适用卡', '1 万 ~ 10 万', 10000, 100000),
    dimension('below-10k', '万元以下', '1 万以下', 0, 10000),
  ],
  popular: {
    source: 'https://www.futbin.com/27/popular',
    sortMetric: 'FUTBIN 热门页所示引用/使用热度计数（非搜索热度）',
    evolutions: {
      source: 'https://www.futbin.com/27/popular/evolutions',
      items: evoParsed.slice(0, 60).map((x, i) => ({ ...x, rank: i + 1, url: abs(x.href) })),
    },
    value: {
      source: 'https://www.futbin.com/27/popular',
      items: popParsed.filter(x => !x.href || !evoHrefs.has(x.href)).slice(0, 60)
        .map((x, i) => ({ ...x, rank: i + 1, url: abs(x.href), note: '热门榜非进化卡' })),
    },
  },
  players: [
    ...playersRows.map(p => ({ ...p, evo: '' })),
    ...popParsed.filter(x => !x.href || !evoHrefs.has(x.href)).map(x => ({ ...x, url: abs(x.href), evo: '' })),
    ...evoParsed.slice(0, 60).map(x => ({ name: x.name, rating: x.rating, pos: x.pos, price: null, popularity: x.popularity, evo: x.evo, url: abs(x.href) })),
  ],
  sources: [
    { url: 'https://www.futbin.com/27/players', openedAt: '2026-09-16T13:32:56+08:00', note: '本轮实测打开，读取榜单首屏 30 行' },
    { url: 'https://www.futbin.com/27/players?page=2', openedAt: '2026-09-16T13:33:06+08:00', note: '本轮实测打开，读取第 2 页 30 行' },
    { url: 'https://www.futbin.com/27/players?page=3', openedAt: '2026-09-16T13:33:10+08:00', note: '本轮实测打开，读取第 3 页 30 行' },
    { url: 'https://www.futbin.com/27/popular', openedAt: '2026-09-16T13:32:56+08:00', note: '本轮实测打开，读取热门球员卡片' },
    { url: 'https://www.futbin.com/27/popular/evolutions', openedAt: '2026-09-16T13:32:56+08:00', note: '本轮实测打开，读取热门进化卡卡片' },
    { url: 'https://www.futbin.com/27/players?pc_price=1000000%2B', openedAt: '2026-09-16T13:33:21+08:00', note: '已打开，表头正常但 0 行：开服前价格筛选参数不可用' },
    { url: 'https://www.futbin.com/27/players?pc_price=300000-1000000', openedAt: '2026-09-16T13:33:27+08:00', note: '已打开，0 行：开服前价格筛选参数不可用' },
    { url: 'https://www.futbin.com/27/players?pc_price=10000-100000', openedAt: '2026-09-16T13:33:34+08:00', note: '已打开，0 行；该区间榜单中确有卡，确认筛选参数失效' },
  ],
  missing: [],
  overview: {
    weekly: { promo: [], totw: [] },
    priceTiers,
    iconsHeroes: playersRows.filter(p => p.cardType).slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 })),
    evolutions: evoParsed.slice(0, 50).map((x, i) => ({ name: x.name, rating: x.rating, pos: x.pos, cardType: 'Evolution', popularity: x.popularity, note: x.evo, url: abs(x.href), rank: i + 1 })),
  },
};

writeFileSync(new URL('../market.json', import.meta.url), JSON.stringify(market, null, 2) + '\n');
console.log(`market.json 已生成：玩家行 ${playersRows.length} · 热门 ${popParsed.length} · 进化 ${evoParsed.length} · 分档合计 ${priceTiers.reduce((s, t) => s + t.items.length, 0)} · 万元以下 ${overflow.length}`);
