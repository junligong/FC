#!/usr/bin/env node
/**
 * 用途：把本轮 CDP 实测原始结果（/tmp/fc27r/*.json）整理成
 *       ① 传奇卡当日抓取台账 apps/market/engine/icons/data/prices/fc27/base-icons.json（仅 FC27 全部基础传奇卡）
 *       ② 本轮 market.json（概览 overview + 扫描 priceDimensions/popular）
 * 输入：/tmp/fc27r/icons_p1..5.json、players_p1..4.json、popular.json、evo.json、tier_*.json
 * 输出：base-icons.json、automation/runs/2026-09-16/market/market.json
 * 口径：FC27 开服日 2026-09-25 之前，FUTBIN 列表页只有占位/估算价（priceBasis=listing-estimate），
 *       不计算日环比与累计涨跌；价格 < 1000 视为占位非有效价；缺失一律如实空状态。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-16';
const RUNDIR = path.join(ROOT, 'automation', 'runs', D, 'market');
const W = '/tmp/fc27r';
const nowIso = () => new Date().toISOString();
const raw = n => { try { return JSON.parse(readFileSync(`${W}/${n}.json`, 'utf8')); } catch { return null; } };

const ledger = JSON.parse(readFileSync(path.join(ROOT, 'apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json'), 'utf8'));
const ledgerById = new Map(ledger.map(x => [String(x.id), x]));

const num = s => { const m = String(s || '').replace(/,/g, '').match(/^([\d.]+)(K|M)?$/i); if (!m) return null; const n = parseFloat(m[1]); return Math.round(m[2] ? n * (m[2].toUpperCase() === 'K' ? 1e3 : 1e6) : n); };
const abs = h => (h ? `https://www.futbin.com${h}` : '');
const idOf = h => { const m = /\/player\/([\d_]+)\//.exec(h || ''); return m ? m[1] : ''; };

// ---------- ① 传奇卡（仅基础 Icon，按卡库台账 131 张对齐） ----------
const iconSeen = new Map();
const iconSources = [];
for (let p = 1; p <= 5; p++) {
  const pg = raw(`icons_p${p}`);
  if (!pg) continue;
  iconSources.push({ url: pg.url, openedAt: pg.at, n: pg.n });
  for (const r of pg.rows || []) {
    const id = idOf(r.href).split('_')[0];
    if (!ledgerById.has(id)) continue;           // 排除 Debut Icon / 特殊版本
    if (iconSeen.has(id)) continue;
    const meta = ledgerById.get(id);
    const price = num(r.is);
    iconSeen.set(id, {
      url: abs(r.href), id, slug: meta.slug || '', name: meta.name || '',
      rating: +r.rat || meta.rating || null, currentPrice: price,
      rowText: [r.rat, meta.name, 'Icon', r.rat, r.is, r.pos].filter(Boolean).join(' '),
      marketUrl: `${abs(r.href)}/market`,
      prices: { cross: {}, pc: num(r.pc) ? { current: num(r.pc) } : {} },
      metrics: { cross: {}, pc: {} },
      status: 'captured', nameZh: meta.nameZh || '',
    });
  }
}
const iconPlayers = [...iconSeen.values()].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || String(a.nameZh).localeCompare(String(b.nameZh), 'zh'));
const validIcons = iconPlayers.filter(p => p.currentPrice !== null && p.currentPrice >= 1000).length;
const ledgerAbsent = ledger.filter(x => !iconSeen.has(String(x.id))).map(x => `${x.id} ${x.nameZh || x.name}`);
if (!iconPlayers.length) { console.error('传奇卡本轮采集为空，不写入 base-icons.json'); process.exit(1); }
const iconDoc = {
  schemaVersion: 1, generatedAt: nowIso(), game: 'fc27', cardType: 'icon', cardLabel: '基础传奇',
  source: 'futbin', launchDate: '2026-09-25', window: 'launch',
  counts: { total: ledger.length, captured: iconPlayers.length, withLaunchPrice: validIcons, withNameZh: iconPlayers.filter(p => p.nameZh).length },
  players: iconPlayers,
};
writeFileSync(path.join(ROOT, 'apps/market/engine/icons/data/prices/fc27/base-icons.json'), JSON.stringify(iconDoc, null, 2) + '\n');
console.log(`base-icons.json：台账 ${ledger.length} 张 · 本轮命中 ${iconPlayers.length} · 有效价 ${validIcons} · 未命中 ${ledgerAbsent.length}`);

// ---------- ② 玩家榜单（/27/players 前 4 页，按 Rating 降序） ----------
const popPlay = n => { const d = raw(n); return (d?.rows || []).map(r => ({ href: r.href, name: r.name, rat: r.rat, is: r.is, pos: r.pos, pop: r.pop, at: d.at, url: d.url })); };
const playerRows = [];
const playerSources = [];
const seenP = new Set();
for (let p = 1; p <= 4; p++) {
  const pg = raw(`players_p${p}`);
  if (!pg) continue;
  playerSources.push({ url: pg.url, openedAt: pg.at, n: pg.n });
  for (const r of pg.rows || []) {
    const key = r.href;
    if (!key || seenP.has(key)) continue;
    seenP.add(key);
    const price = num(r.is);
    playerRows.push({
      name: (r.name || '').replace(/\s+(Icon|Hero)$/i, '').trim(), url: abs(r.href),
      rating: +r.rat || null, pos: r.pos || '',
      cardType: /Icon$/i.test(r.name) ? 'Icon' : (/Hero$/i.test(r.name) ? 'Hero' : ''),
      price, priceValid: price !== null && price >= 1000, popularity: +r.pop || null,
      psPrice: num(r.ps) || 0, pcPrice: num(r.pc) || 0,
    });
  }
}

// ---------- ③ 热门与进化 ----------
const popDoc = raw('popular'); const evoDoc = raw('evo');
const parsePopular = t => { const m = /^(\S+)\s+(\S+)\s+(\d{2})\s+(.+?)\s+R\s+(\d)\s+(\d)\s+([\d.]+)\s+(.+?)\s+(\d+)$/.exec(t); if (!m) return null; return { price: num(m[1]), popularity: num(m[2]), rating: +m[3], pos: m[4].trim(), name: m[8].trim(), popularityRaw: m[2] }; };
const parseEvo = t => { const m = /^(\d{2})\s+(.+?)\s+R\s+(\d)\s+(\d)\s+([\d.]+)\s+(.+?)\s+((?:\d{2} (?:PAC|SHO|PAS|DRI|DEF|PHY)\s+){6})(.+?)\s+(\d+)$/.exec(t); if (!m) return null; return { rating: +m[1], pos: m[2].trim(), name: m[6].trim(), evo: m[8].trim(), popularity: +m[9] }; };
const evoParsed = (evoDoc?.cards || []).map(c => { const p = parseEvo(c.t); return p && p.name ? { ...p, href: c.href } : null; }).filter(Boolean);
const evoHrefs = new Set(evoParsed.map(x => (x.href || '').split('/').slice(0, 4).join('/')));
const popParsed = (popDoc?.cards || []).map(c => { const p = parsePopular(c.t); return p && p.name ? { ...p, href: c.href } : null; }).filter(Boolean);
const valueCards = popParsed.filter(x => !evoHrefs.has((x.href || '').split('/').slice(0, 4).join('/')));

// ---------- 价格分档（FUTBIN 筛选参数 + 榜单实测价） ----------
const tiersMeta = [
  { id: 'tier-1m', name: '≥ 100 万', filter: 'pc_price=1000000%2B', lo: 1000000, hi: null, page: 'tier_1m' },
  { id: 'tier-300k', name: '30 - 100 万', filter: 'pc_price=300000-1000000', lo: 300000, hi: 1000000, page: 'tier_300k' },
  { id: 'tier-100k', name: '10 - 30 万', filter: 'pc_price=100000-300000', lo: 100000, hi: 300000, page: 'tier_100k' },
  { id: 'tier-10k', name: '1 - 10 万', filter: 'pc_price=10000-100000', lo: 10000, hi: 100000, page: 'tier_10k' },
];
const tierSource = {};
for (const t of tiersMeta) { const d = raw(t.page); tierSource[t.id] = { url: d?.url, openedAt: d?.at, n: d?.n ?? 0 }; }

const priceTiers = tiersMeta.map(t => {
  const items = playerRows.filter(p => p.priceValid && p.price >= t.lo && (t.hi === null || p.price < t.hi))
    .sort((a, b) => b.rating - a.rating).slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 }));
  const s = tierSource[t.id];
  return {
    id: t.id, name: t.name, futbinFilter: t.filter,
    futbinUrl: `https://www.futbin.com/27/players?${t.filter}`,
    futbinRows: s.n, items,
    note: items.length ? '' : `FUTBIN 价格筛选页（${t.filter}）本轮实测 ${s.n} 行；FC27 开服前该筛选参数不可用，本档无可用数据，如实空状态（不等于该档无卡）。`,
  };
});

const dim = (id, name, range, lo, hi, note) => {
  const items = playerRows.filter(p => p.priceValid && p.price >= lo && (hi === null || p.price < hi))
    .sort((a, b) => b.rating - a.rating).slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 }));
  return { id, name, range, items, note: items.length ? '' : (note || '本轮实测无满足区间的卡，如实空状态。') };
};
const emptyHigh = `FUTBIN 价格筛选页本轮实测 0 行，开服前筛选参数不可用；/27/players 无筛选榜单（前 4 页 120 行，按 Rating 降序）中亦无该价格区间卡，如实空状态。`;
const priceDimensions = [
  dim('premium', '大卡', '100 万以上', 1000000, null, emptyHigh),
  dim('mid', '中卡', '30 万 ~ 100 万', 300000, 1000000, emptyHigh),
  dim('hot', '热门卡', '10 万 ~ 30 万', 100000, 300000, emptyHigh),
  dim('practical', '适用卡', '1 万 ~ 10 万', 10000, 100000),
  dim('below-10k', '万元以下', '1 万以下', 0, 10000),
];

const missing = [
  '概览·本周活动卡（Promo）与本周周黑（TOTW）：本任务未采集对应来源页，名单与发布时间缺失，如实空状态。',
  '概览·价格分层 ≥100 万 / 30-100 万 / 10-30 万 三档：FUTBIN 对应的 pc_price 筛选页本轮实测均为 0 行（筛选参数在开服前不可用），无筛选榜单前 4 页中亦无卡落入该三档，如实空状态（不等于该档无卡）。',
  '扫描·价格维度 大卡 / 中卡 / 热门卡：同上，实测无可用数据，如实空状态。',
  `传奇监控：卡库台账 ${ledger.length} 张基础传奇卡中，本轮在 /27/players?version=icons 实测命中 ${iconPlayers.length} 张，未命中 ${ledgerAbsent.length} 张（见 base-icons.json），未命中卡不伪造价格。`,
  'FUTBIN /27/players 的 PS/PC 价格列（platform-ps-only / platform-pc-only）本轮实测全部为 0，开服前价格列未开放；本报告以页面提供的 IS（table-item-score）列作为开服前列表估算价口径（listing-estimate），不是成交价。',
  'FC27 未开服（launchDate=2026-09-25），全部价格为列表页占位/估算价，本报告不计算日环比与累计涨跌。',
];

const market = {
  date: D,
  status: 'partial',
  platform: 'cross',
  generatedAt: nowIso(),
  dataCutoff: (raw('players_p1')?.at || nowIso()),
  priceBasis: 'listing-estimate',
  notes: [
    'FC27 尚未开服（launchDate=2026-09-25），FUTBIN 列表页价格为占位/估算价（priceBasis=listing-estimate），不是市场成交价，本报告不计算日环比与累计涨跌；价格 < 1000 视为占位非有效价。',
    '全部数据由 web-access（CDP Proxy :3456 直连用户日常 Chrome）本轮实测打开 FUTBIN 页面后从 DOM 提取；FUTBIN 对 curl/WebFetch 返回 403，静态路线不可用。',
    '价格分层：以 /27/players 的 Rating 列降序取前 4 页（120 行）实测价分档；FUTBIN 的 pc_price 四档筛选页本轮实测行数已逐档记录（futbinRows）。',
    '平台隔离：默认 Cross 平台；价格列 pc/ps 分开保存，本报告不混用 PC 与 Cross 口径。',
  ],
  priceDimensions,
  popular: {
    source: popularSourceNote(),
    sortMetric: 'FUTBIN 热门页所示引用/使用热度计数（非搜索热度）',
    evolutions: { source: 'https://www.futbin.com/27/popular/evolutions', sourceOpenedAt: evoDoc?.at, items: evoParsed.slice(0, 60).map((x, i) => ({ ...x, rank: i + 1, url: abs(x.href) })) },
    value: { source: 'https://www.futbin.com/27/popular', sourceOpenedAt: popDoc?.at, items: valueCards.slice(0, 60).map((x, i) => ({ ...x, rank: i + 1, url: abs(x.href), note: '热门榜非进化卡' })) },
  },
  players: [
    ...playerRows,
    ...valueCards.map(x => ({ name: x.name, rating: x.rating, pos: x.pos, price: x.price, priceValid: x.price !== null && x.price >= 1000, psPrice: 0, pcPrice: 0, popularity: x.popularity, cardType: '', url: abs(x.href), evo: '' })),
    ...evoParsed.slice(0, 60).map(x => ({ name: x.name, rating: x.rating, pos: x.pos, price: null, priceValid: false, psPrice: 0, pcPrice: 0, popularity: x.popularity, cardType: 'Evolution', url: abs(x.href), evo: x.evo })),
  ],
  sources: [
    ...iconSources.map(s => ({ url: s.url, openedAt: s.openedAt, note: `本轮实测打开，读取传奇卡榜单 ${s.n} 行` })),
    ...playerSources.map(s => ({ url: s.url, openedAt: s.openedAt, note: `本轮实测打开，读取榜单 ${s.n} 行（Rating 降序）` })),
    { url: 'https://www.futbin.com/27/popular', openedAt: popDoc?.at, note: `本轮实测打开，读取热门球员卡片 ${popDoc?.n ?? 0} 个节点，解析 ${popParsed.length} 条` },
    { url: 'https://www.futbin.com/27/popular/evolutions', openedAt: evoDoc?.at, note: `本轮实测打开，读取热门进化卡 ${evoDoc?.n ?? 0} 个节点，解析 ${evoParsed.length} 条` },
    ...tiersMeta.map(t => ({ url: `https://www.futbin.com/27/players?${t.filter}`, openedAt: tierSource[t.id].openedAt, note: `本轮实测打开，表头正常但 tbody ${tierSource[t.id].n} 行：开服前价格筛选参数不可用` })),
  ],
  missing,
  notes2: { ledgerAbsent },
  overview: {
    weekly: {
      promo: [], totw: [],
      note: '本周活动卡（Promo）与本周周黑（TOTW）名单本轮未采集（本任务未打开对应来源页），如实空状态，不以旧日期或 FC26 名单填充。',
    },
    priceTiers,
    iconsHeroes: iconPlayers.slice(0, 50).map((p, i) => ({ name: `${p.rating} ${p.nameZh || p.name}`, url: p.url, rating: p.rating, pos: ledgerById.get(p.id)?.position || '', cardType: 'Icon', price: p.currentPrice, popularity: null, rank: i + 1 })),
    iconsHeroesNote: `FC27 基础传奇卡全量 ${ledger.length} 张（本轮实测命中 ${iconPlayers.length} 张、有效价 ${validIcons} 张），此处展示前 50 张，完整台账见「传奇监控」页。英雄卡（Hero）本轮未独立核验，如实标注待核验。`,
    evolutions: evoParsed.slice(0, 50).map((x, i) => ({ name: x.name, rating: x.rating, pos: x.pos, cardType: 'Evolution', popularity: x.popularity, note: x.evo, url: abs(x.href), rank: i + 1 })),
  },
};

function popularSourceNote() { return 'https://www.futbin.com/27/popular'; }

writeFileSync(path.join(RUNDIR, 'market.json'), JSON.stringify(market, null, 2) + '\n');
console.log(`market.json：玩家行 ${playerRows.length} · 热门 ${popParsed.length} · 价值卡 ${valueCards.length} · 进化 ${evoParsed.length}`);
console.log(`分档：${priceTiers.map(t => `${t.name}=${t.items.length}(筛选页${t.futbinRows}行)`).join(' ')}`);
console.log(`扫描维度：${priceDimensions.map(d => `${d.name}=${d.items.length}`).join(' ')}`);
