// 组装 2026-09-18 市场名单 market.json：热门 250 卡 + 热门进化 500 卡，URL 去重。
// 输入 work/popular-raw.json、work/popular-heat.json、work/evo-popular-raw.json；输出 ../market.json
import fs from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const rd = f => JSON.parse(fs.readFileSync(dir + 'work/' + f, 'utf8')).value;
const pop = rd('popular-raw.json');
const heat = rd('popular-heat.json');
const evo = rd('evo-popular-raw.json');
const heatMap = new Map(heat.items.map(x => [x.href, x.heat]));
const full = h => 'https://www.futbin.com' + h;
const slugName = h => decodeURIComponent(h.split('/').pop() || '').replace(/-/g, ' ').trim();
const int = s => { const n = parseInt(String(s).replace(/,/g, ''), 10); return isNaN(n) ? 0 : n; };

const seen = new Set();
const players = [];
function push(src) {
  for (const it of src) {
    if (!it.href || seen.has(it.href)) continue;
    seen.add(it.href);
    const ps = int(it.ps), pc = int(it.pc);
    players.push({
      name: slugName(it.href),
      url: full(it.href),
      rating: int(it.rating),
      pos: it.pos || '',
      cardType: it.evoPill ? 'Evolution' : '',
      price: int(it.isPS || it.is || 0),
      priceValid: ps >= 1000 || pc >= 1000,
      psPrice: ps,
      pcPrice: pc,
      popularity: int(it.heat || heatMap.get(it.href) || 0),
      evo: it.evoPill || '非进化池',
    });
  }
}
push(pop.items);   // 热门页（热度降序）
push(evo.items);   // 进化热门页（热度降序）
players.forEach((p, i) => { p.rank = i + 1; });

const evolutions = evo.items.map((it, i) => ({
  name: slugName(it.href),
  rating: int(it.rating),
  pos: it.pos || '',
  cardType: 'Evolution',
  popularity: int(it.heat),
  note: it.evoPill || '',
  url: full(it.href),
  rank: i + 1,
}));
const value = pop.items.map((it, i) => ({
  name: slugName(it.href),
  rating: int(it.rating),
  pos: it.pos || '',
  cardType: '',
  popularity: int(it.heat),
  url: full(it.href),
  rank: i + 1,
}));

const blockedNote = '来源页 https://www.futbin.com/27/players 本轮实测被 FUTBIN 403 拦截页拒绝（IP/会话级反爬，同源对照：首页与 /27/popular、/27/popular/evolutions 同轮均正常渲染 200），页 1-4 页内 fetch 与单次退避重试均 403，价格分层各档无法按区间采集，如实空状态；未使用旧日期或 FC26 数据填充。';

const tierNote = n => ({ id: n.id, name: n.name, items: [], note: blockedNote });
const dimNote = (id, name, range) => ({ id, name, range, items: [], note: blockedNote });

const now = '2026-09-18T03:30:00+08:00';
const out = {
  date: '2026-09-18',
  status: 'partial',
  platform: 'console+pc',
  generatedAt: now,
  dataCutoff: now,
  priceBasis: 'partial-live',
  notes: [
    'FC27 尚未正式开服（launchDate=2026-09-25），FUTBIN 持续对部分卡牌滚动更新 Console / PC 平台价（本轮 /27/popular 250 张唯一卡中 Console 有效价 ' + pop.items.filter(x => int(x.ps) >= 1000).length + ' 张、PC 有效价 ' + pop.items.filter(x => int(x.pc) >= 1000).length + ' 张，价格 ≥1000 coins 记为有效）；未更新的卡两平台仍为 0 占位。',
    '开服前不计算日环比与累计涨跌；价格 < 1000 视为占位值，平台价（psPrice=Console，pcPrice=PC）与估值严格分开落库。',
    '全部数据由 web-access（CDP Proxy :3456 直连用户日常 Chrome）本轮实测打开 FUTBIN 页面后从 DOM 提取；FUTBIN 对 curl/WebFetch 返回 403，静态路线不可用。',
    '/27/players 列表页（含页 1-4 页内 fetch 与退避后单次重试）本轮被 403 拦截，概览价格分层与扫描价格维度如实空状态；同轮首页、/27/popular、/27/popular/evolutions 均 200，同源对照确认属来源侧分路径拦截。',
    '本周活动卡（Promo）/本周周黑（TOTW）：FUTBIN 无 FC27 对应路由（/totw、/27/totw、/27/promos、/27/cards、/27/sbc 实测均 404），FC27 尚未开服亦无首期周黑，如实空状态。',
    '热门球员维度排序指标为 FUTBIN 热门页热度计数（卡片火苗图标旁计数，非搜索热度）；热门进化页每卡同样带该计数。',
  ],
  priceDimensions: [
    dimNote('premium', '大卡', '100 万以上'),
    dimNote('mid', '中卡', '30 万 ~ 100 万'),
    dimNote('hot', '热门卡', '10 万 ~ 30 万'),
    dimNote('practical', '适用卡', '1 万 ~ 10 万'),
    dimNote('below-10k', '万元以下', '1 万以下'),
  ],
  popular: {
    source: 'https://www.futbin.com/27/popular',
    sortMetric: 'FUTBIN 热门页显示的热度计数（非搜索热度）',
    evolutions,
    value,
  },
  players,
  sources: [
    { url: 'https://www.futbin.com/', openedAt: '2026-09-18T03:19:00+08:00', note: '实测打开正常（CDP 宿主页），建立同源会话' },
    { url: 'https://www.futbin.com/27/popular', openedAt: '2026-09-18T03:20:30+08:00', note: '实测 200，提取 250 张唯一卡（双平台价 + 热度计数）；Console 有效价 ' + pop.items.filter(x => int(x.ps) >= 1000).length + '、PC 有效价 ' + pop.items.filter(x => int(x.pc) >= 1000).length },
    { url: 'https://www.futbin.com/27/popular/evolutions', openedAt: '2026-09-18T03:23:00+08:00', note: '实测 200，提取 500 张唯一进化卡（含进化名与热度计数，页面无价格单元格）' },
    { url: 'https://www.futbin.com/27/players?page=1..4', openedAt: '2026-09-18T03:24:30+08:00', note: '页内 fetch 实测 4 页全部 403 拦截页' },
    { url: 'https://www.futbin.com/totw, /27/totw, /27/promos, /27/cards, /27/sbc', openedAt: '2026-09-18T03:25:30+08:00', note: '周黑/活动卡候选路由实测均 404' },
    { url: 'https://www.futbin.com/27/players?page=1', openedAt: '2026-09-18T03:27:30+08:00', note: '约 1 分钟后退避单次重试，仍 403，停止重试' },
  ],
  missing: [
    '概览·价格分层（≥100 万 / 30-100 万 / 10-30 万 / 1-10 万）：/27/players 被 403 拦截（页 1-4 与单次退避重试），如实空状态。',
    '扫描·价格维度（大卡 / 中卡 / 热门卡 / 适用卡 / 万元以下）：同上，如实空状态。',
    '概览·本周活动卡（Promo）与本周周黑（TOTW）：FUTBIN 无 FC27 对应路由（候选路由均 404），且开服前无首期周黑，如实空状态。',
    '进化卡平台价：/27/popular/evolutions 卡片未渲染价格单元格，进化卡平台价如实为空。',
    '部分卡牌平台价仍为 0（FUTBIN 尚未更新），按占位值处理，不以估值顶替。',
  ],
  overview: {
    weekly: {
      promo: [],
      totw: [],
      note: '本周活动卡（Promo）与本周周黑（TOTW）名单本轮未采集到可用来源（FUTBIN 候选路由实测 404，FC27 未开服无首期周黑），如实空状态，不以旧日期或 FC26 名单填充。',
    },
    priceTiers: [
      tierNote({ id: 'tier-1m', name: '≥ 100 万' }),
      tierNote({ id: 'tier-300k', name: '30 - 100 万' }),
      tierNote({ id: 'tier-100k', name: '10 - 30 万' }),
      tierNote({ id: 'tier-10k', name: '1 - 10 万' }),
    ],
    evolutions,
  },
};
fs.writeFileSync(dir + '../market.json', JSON.stringify(out, null, 1));
console.log('players', players.length, '| evolutions', evolutions.length, '| value', value.length, '| unique', seen.size);
console.log('validPS', players.filter(p => p.psPrice >= 1000).length, 'validPC', players.filter(p => p.pcPrice >= 1000).length);
