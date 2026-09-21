// 组装 2026-09-20 市场名单 market.json：热门 250 卡 + 热门进化 500 卡（URL 去重 750），
// 价格分层取 /27/players 页 1-4（渲染 DOM，评分降序）按双平台有效价较大者分档。
// 输入 work/popular-raw.json、work/evo-popular-raw.json、work/players-rows.json、work/totw-probe.json；输出 ../market.json
import fs from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const rd = f => JSON.parse(fs.readFileSync(dir + 'work/' + f, 'utf8'));
const pop = rd('popular-raw.json');
const evo = rd('evo-popular-raw.json');
const pl = rd('players-rows.json');
pl.ok = Array.isArray(pl.rows) && pl.rows.length > 0;
const totwProbe = rd('totw-probe.json');
const int = s => { const n = parseInt(String(s).replace(/,/g, ''), 10); return isNaN(n) ? 0 : n; };
const full = h => h && h.startsWith('http') ? h : 'https://www.futbin.com' + (h || '');
const slugName = h => decodeURIComponent((h || '').split('/').pop() || '').replace(/-/g, ' ').trim();

const seen = new Set();
const players = [];
function push(src) {
  for (const it of src) {
    const href = it.href || (it.url || '').replace('https://www.futbin.com', '');
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const ps = int(it.psPrice), pc = int(it.pcPrice);
    players.push({
      name: it.name || slugName(href),
      url: full(href),
      rating: int(it.rating),
      pos: it.pos || '',
      cardType: it.evoName ? 'Evolution' : '',
      price: int(it.scoreRaw || it.score || 0),
      priceValid: ps >= 1000 || pc >= 1000,
      psPrice: ps,
      pcPrice: pc,
      popularity: int(it.popularity || 0),
      evo: it.evoName || '非进化池',
      stats: it.stats || {},
    });
  }
}
push(pop.cards);   // 热门页（热度降序）
push(evo.cards);   // 进化热门页（热度降序）
players.forEach((p, i) => { p.rank = i + 1; });

const evolutions = evo.cards.map((it, i) => ({
  name: it.name || slugName(it.href),
  rating: int(it.rating),
  pos: it.pos || '',
  cardType: 'Evolution',
  popularity: int(it.popularity || 0),
  note: it.evoName || '',
  url: full(it.href),
  rank: i + 1,
}));
const value = pop.cards.map((it, i) => ({
  name: it.name || slugName(it.href),
  rating: int(it.rating),
  pos: it.pos || '',
  cardType: '',
  popularity: int(it.popularity || 0),
  url: full(it.href),
  rank: i + 1,
}));

// 价格分层：/27/players 页 1-4 渲染 DOM（评分降序），按双平台有效价较大者分档，每档 Top 50
const tierRows = pl.rows.map(r => ({
  name: r.name, url: full(r.href), version: r.version || '',
  rating: int(r.rating), pos: r.pos || '', price: int(r.score || 0),
  psPrice: int(r.psPrice), pcPrice: int(r.pcPrice),
  priceValid: int(r.psPrice) >= 1000 || int(r.pcPrice) >= 1000,
  refPrice: Math.max(int(r.psPrice), int(r.pcPrice)),
})).filter(r => r.name && r.rating > 0 && r.priceValid);
const tierDefs = [
  { id: 'tier-1m', name: '≥ 100 万', min: 1000000, max: Infinity },
  { id: 'tier-300k', name: '30 - 100 万', min: 300000, max: 1000000 },
  { id: 'tier-100k', name: '10 - 30 万', min: 100000, max: 300000 },
  { id: 'tier-10k', name: '1 - 10 万', min: 10000, max: 100000 },
];
const tierNoteBasis = `分档基于本轮实测 /27/players 页 1-4（评分降序前 120 行，Console 有效价 ${tierRows.filter(r => r.psPrice >= 1000).length}、PC 有效价 ${tierRows.filter(r => r.pcPrice >= 1000).length}）的双平台价；开服前 FUTBIN 的 ps_price/pc_price 价格筛选参数失效，无法按服务端筛选取全量，每档取实测范围内按 Rating 降序前 50。`;
const priceTiers = tierDefs.map(t => {
  const items = tierRows.filter(r => r.refPrice >= t.min && r.refPrice < t.max)
    .sort((a, b) => b.rating - a.rating).slice(0, 50)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { id: t.id, name: t.name, items, note: items.length ? tierNoteBasis : '本轮实测范围（评分降序前 120 行）内该档无有效平台价，如实空状态。' };
});

const now = new Date().toISOString();
const psValidPlayers = players.filter(p => p.psPrice >= 1000).length;
const pcValidPlayers = players.filter(p => p.pcPrice >= 1000).length;
const out = {
  date: '2026-09-20',
  status: 'partial',
  platform: 'console+pc',
  generatedAt: now,
  dataCutoff: now,
  priceBasis: 'partial-live',
  notes: [
    'FC27 尚未正式开服（launchDate=2026-09-25），FUTBIN 持续对部分卡牌滚动更新 Console / PC 平台价（本轮 /27/popular 250 张唯一卡中 Console 有效价 ' + psValidPlayers + ' 张、PC 有效价 ' + pcValidPlayers + ' 张，价格 ≥1000 coins 记为有效）；未更新的卡两平台仍为 0 占位。',
    '开服前不计算日环比与累计涨跌；价格 < 1000 视为占位值，平台价（psPrice=Console，pcPrice=PC）与估值（price=列表 IS 列）严格分开落库。',
    '全部数据由 web-access（CDP Proxy :3456 直连独立调试 profile Chrome，端口 9333，零弹框）本轮实测打开 FUTBIN 页面后从 DOM 提取；FUTBIN 对 curl/WebFetch 返回 403，静态路线不可用。',
    '本轮 /27/players 列表页 ' + (pl.ok ? '可正常访问，页 1-4 渲染 DOM 共提取 ' + pl.rows.length + ' 行；价格分层基于该实测样本（见 priceTiers note），不伪造服务端筛选结果。' : '被拦截或无数据，价格分层如实空状态。'),
    '本周活动卡（Promo）/本周周黑（TOTW）：候选路由 /27/totw、/27/promos 本轮实测打开后无名单内容（FC27 未开服、无首期周黑；09-18 已核验 /totw 等更早路由均 404），如实空状态。',
    '热门球员维度排序指标为 FUTBIN 热门页热度计数（卡片火苗图标旁计数，非搜索热度）；热门进化页每卡同样带该计数。',
    '价格采集自 /27/popular 与 /27/players 双源，均为一次打开页面同时读取 Console（td.table-price.platform-ps-only）与 PC（platform-pc-only）两个单元格，未依赖平台切换或 URL 参数分平台取数。',
  ],
  priceDimensions: [
    { id: 'premium', name: '大卡', range: '100 万以上（按所选平台价）', count: players.filter(p => Math.max(p.psPrice, p.pcPrice) >= 1000000).length },
    { id: 'mid', name: '中卡', range: '30 万 ~ 100 万（按所选平台价）', count: players.filter(p => { const v = Math.max(p.psPrice, p.pcPrice); return v >= 300000 && v < 1000000; }).length },
    { id: 'hot', name: '热门卡', range: '10 万 ~ 30 万（按所选平台价）', count: players.filter(p => { const v = Math.max(p.psPrice, p.pcPrice); return v >= 100000 && v < 300000; }).length },
    { id: 'practical', name: '适用卡', range: '1 万 ~ 10 万（按所选平台价）', count: players.filter(p => { const v = Math.max(p.psPrice, p.pcPrice); return v >= 10000 && v < 100000; }).length },
    { id: 'below-10k', name: '万元以下', range: '1 万以下（按所选平台价）', count: players.filter(p => { const v = Math.max(p.psPrice, p.pcPrice); return v > 0 && v < 10000; }).length },
  ],
  popular: {
    source: 'https://www.futbin.com/27/popular',
    sortMetric: 'FUTBIN 热门页显示的热度计数（非搜索热度）',
    evolutions,
    value,
  },
  players,
  sources: [
    { url: 'https://www.futbin.com/', openedAt: '', note: '实测打开正常（CDP 宿主页），建立同源会话' },
    { url: 'https://www.futbin.com/27/popular', openedAt: pop.collectedAt, note: '提取 ' + pop.cards.length + ' 张唯一卡（双平台价 + 热度计数）；Console 有效价 ' + psValidPlayers + '、PC 有效价 ' + pcValidPlayers },
    { url: 'https://www.futbin.com/27/popular/evolutions', openedAt: evo.collectedAt, note: '提取 ' + evo.cards.length + ' 张唯一进化卡（含进化名与热度计数，页面无价格单元格）' },
    { url: 'https://www.futbin.com/27/players?page=1..4', openedAt: pl.collectedAt || '', note: pl.ok ? '渲染 DOM 页 1-4 共 ' + pl.rows.length + ' 行，价格分层据此分档' : '本轮被拦截/无数据：' + JSON.stringify(pl.attempts || []).slice(0, 200) },
    { url: 'https://www.futbin.com/27/totw, /27/promos', openedAt: totwProbe.totw?.openedAt || '', note: '周黑/活动卡候选路由实测打开后无名单内容（' + (totwProbe.totw?.note || totwProbe.totw?.error || '?') + ' / ' + (totwProbe.promos?.note || totwProbe.promos?.error || '?') + '），如实空状态' },
  ],
  missing: [],
  overview: {
    weekly: {
      promo: [],
      totw: [],
      note: '本周活动卡（Promo）与本周周黑（TOTW）名单本轮未采集到可用来源（/27/totw、/27/promos 实测无名单内容，FC27 未开服无首期周黑），如实空状态，不以旧日期或 FC26 名单填充。',
    },
    priceTiers: pl.ok ? priceTiers : tierDefs.map(t => ({ id: t.id, name: t.name, items: [], note: '本轮 /27/players 未采集到数据（见 sources），该档如实空状态，不以旧日期或 FC26 价格填充。' })),
    evolutions,
  },
};
if (pl.ok) {
  out.missing.push('进化卡平台价：/27/popular/evolutions 卡片未渲染价格单元格，进化卡平台价如实为空。');
  out.missing.push('价格分层覆盖范围：开服前 FUTBIN 价格筛选参数失效，分档基于评分降序前 120 行的实测双平台价（每档范围内 Top 50），非全量卡池。');
} else {
  out.missing.push('价格分层：/27/players 本轮被拦截或无数据，价格分层各档如实空状态（来源页临时拦截，非「无卡」）。');
}
out.missing.push('部分卡牌平台价仍为 0（FUTBIN 尚未更新），按占位值处理，不以估值顶替。');
fs.writeFileSync(dir + 'market.json', JSON.stringify(out, null, 1));
console.log('players', players.length, '| evolutions', evolutions.length, '| value', value.length, '| unique', seen.size);
console.log('validPS', psValidPlayers, 'validPC', pcValidPlayers);
console.log('tiers', (pl.ok ? priceTiers : []).map(t => t.name + ':' + t.items.length).join(' '));
