#!/usr/bin/env node
/**
 * FC27 市场日任务 · 名单组装器（常驻脚本，2026-09-20 新建）
 *
 * 用途：把「共享采集器已经落库的当日观测」组装成日任务的 `automation/runs/<D>/market/market.json`。
 *       取代此前「每天由 agent 在 runs/<D>/market/work/ 里现写一份 assemble.mjs」的做法
 *       （那份脚本日期硬编码、口径会随时间漂移，且从未复用提取逻辑）。
 *
 * 输入（全部为已落库产物，本脚本**不打开任何网页**）：
 *   1. apps/market/engine/data/prices/fc27/series/popular.json      —— 采集器 collect-market-prices.mjs 写的累积序列（2026-09-20 起）
 *   2. apps/market/engine/data/prices/fc27/series/evolutions.json   —— 同上
 *   3. automation/runs/<D>/market/work/players-rows.json                      —— 可选，/27/players 翻页行（价格分层用）
 *   4. automation/runs/<D>/market/work/totw-probe.json                        —— 可选，周黑/活动卡路由探测（如实空状态用）
 * 输出：automation/runs/<D>/market/market.json
 *
 *   序列读取一律经 src/price-series.mjs 的 `snapshotFrom()` 还原成旧快照形状（date/hour/collectedAt/counts/cards），
 *   **不要**再直接读 popular/hourly 或 evolutions/hourly —— 那两套逐小时文件已在 2026-09-20 废弃。
 *
 * 口径（2026-09-20 固化，改动前先读根 AGENTS.md「市场扫描的排除与价格口径」与 automation/prompts/market.md）：
 *   - **FC27 开服日 = 2026-09-18**（2026-09-25 是正式全球发售日，勿改回）。
 *   - `priceBasis` **按实测有效价判定**：当日有 ≥1000 coins 的平台价 → partial-live，全无 → listing-estimate。
 *   - `evo` 字段**只允许 `在进化池` / `非进化池`**，进化路径名放 `evoName`（写反会让索引卡计数恒为 0）。
 *   - `players[]` 保留**原始逐条观测**（含同卡不同进化路径，各自带 `cardVersion`）：
 *     归并为「一人一行」由渲染器 `mergeByBaseCard()` 统一完成——因为系列排除（Hero / Icon / Hall of FUT）
 *     需要看到**所有变体**的版本前缀取并集，采集侧先合会丢掉变体的版本信号。
 *   - 平台价（`psPrice` = Console / `pcPrice` = PC）与估值（`price` = 列表页 IS 列）严格分开；<1000 视为占位值。
 *
 * 用法：node apps/market/engine/scripts/assemble-daily-market.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSeries, seriesPathFor, snapshotFrom } from '../src/price-series.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PRICE_ROOT = process.env.FC_MARKET_PRICE_DIR
  || path.join(ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27');

const LAUNCH_DATE = '2026-09-18'; // FC27 开服日（2026-09-25 是正式发售日，勿改回）
const MIN_VALID_PRICE = 1000;

const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}
const int = s => { const n = parseInt(String(s).replace(/,/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const full = h => (!h ? '' : (String(h).startsWith('http') ? String(h) : 'https://www.futbin.com' + String(h)));
const slugName = h => decodeURIComponent(String(h || '').split('/').filter(Boolean).pop() || '').replace(/-/g, ' ').trim();

const workDir = path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'work');
const outPath = path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'market.json');

// 当日**最后一个**观测点：从单文件累积序列还原「本次快照」（series/<族>.json）
function snapshotOf(kind, opts = {}) {
  return snapshotFrom(readSeries(seriesPathFor(PRICE_ROOT, kind)), { date: dateStr, ...opts });
}

const pop = snapshotOf('popular');
const evo = snapshotOf('evolutions', { withPrice: false, shape: 'evolution' });
if (!pop || !Array.isArray(pop.cards) || !pop.cards.length) {
  console.error(`未找到 ${dateStr} 的热门榜观测（${seriesPathFor(PRICE_ROOT, 'popular')} 中无该日观测点）。`);
  console.error('请先运行 node apps/market/engine/scripts/collect-market-prices.mjs（共享采集器），再执行本脚本。');
  process.exit(1);
}
const evoCards = (evo && Array.isArray(evo.cards)) ? evo.cards : [];

// 可选输入：/27/players 翻页行（价格分层）、周黑/活动卡路由探测（如实空状态）
const pl = readJSON(path.join(workDir, 'players-rows.json')) || { rows: [] };
pl.ok = Array.isArray(pl.rows) && pl.rows.length > 0;
const totwProbe = readJSON(path.join(workDir, 'totw-probe.json')) || {};

// ---------- 名单：原始逐条观测（URL 去重），跨两个榜单 ----------
const seen = new Set();
const players = [];
function push(src) {
  for (const it of src) {
    const href = it.href || String(it.url || '').replace('https://www.futbin.com', '');
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const ps = int(it.psPrice), pc = int(it.pcPrice);
    players.push({
      name: it.name || slugName(href),
      url: full(href),
      rating: int(it.rating),
      pos: it.pos || '',
      cardType: it.evoName ? 'Evolution' : '',
      // 估值列（列表页 IS）：不是任何平台的成交价，只作参考
      price: int(it.scoreRaw || it.score || 0),
      priceValid: ps >= MIN_VALID_PRICE || pc >= MIN_VALID_PRICE,
      psPrice: ps,
      pcPrice: pc,
      popularity: int(it.popularity || 0),
      // `evo` 只允许两个值；进化路径名放 evoName（2026-09-20 固化）
      evo: it.evoName ? '在进化池' : '非进化池',
      evoName: it.evoName || null,
      // 卡片系列判据：卡面图版本前缀（Hero / Icon / Hall of FUT 等），与卡片同页采集
      cardVersion: it.cardVersion || null,
      stats: it.stats || {},
    });
  }
}
push(pop.cards);
push(evoCards);
players.forEach((p, i) => { p.rank = i + 1; });

const evolutions = evoCards.map((it, i) => ({
  name: it.name || slugName(it.href || it.url),
  rating: int(it.rating), pos: it.pos || '', cardType: 'Evolution',
  popularity: int(it.popularity || 0), note: it.evoName || '',
  url: full(it.href || it.url), rank: i + 1,
}));
const value = pop.cards.map((it, i) => ({
  name: it.name || slugName(it.href || it.url),
  rating: int(it.rating), pos: it.pos || '', cardType: '',
  popularity: int(it.popularity || 0),
  url: full(it.href || it.url), rank: i + 1,
}));

// ---------- 价格分层（来自 /27/players 翻页实测行） ----------
const tierRows = (pl.rows || []).map(r => ({
  name: r.name, url: full(r.href), version: r.version || '',
  rating: int(r.rating), pos: r.pos || '', price: int(r.score || 0),
  psPrice: int(r.psPrice), pcPrice: int(r.pcPrice),
  priceValid: int(r.psPrice) >= MIN_VALID_PRICE || int(r.pcPrice) >= MIN_VALID_PRICE,
  refPrice: Math.max(int(r.psPrice), int(r.pcPrice)),
})).filter(r => r.name && r.rating > 0 && r.priceValid);
const tierDefs = [
  { id: 'tier-1m', name: '≥ 100 万', min: 1000000, max: Infinity },
  { id: 'tier-300k', name: '30 - 100 万', min: 300000, max: 1000000 },
  { id: 'tier-100k', name: '10 - 30 万', min: 100000, max: 300000 },
  { id: 'tier-10k', name: '1 - 10 万', min: 10000, max: 100000 },
];
const tierNoteBasis = `分档基于本轮实测 /27/players 翻页行（评分降序，Console 有效价 ${tierRows.filter(r => r.psPrice >= MIN_VALID_PRICE).length}、PC 有效价 ${tierRows.filter(r => r.pcPrice >= MIN_VALID_PRICE).length}）；FUTBIN 的 ps_price/pc_price 价格筛选参数失效，无法按服务端筛选取全量，每档取实测范围内按 Rating 降序前 50。`;
const priceTiers = tierDefs.map(t => {
  const items = tierRows.filter(r => r.refPrice >= t.min && r.refPrice < t.max)
    .sort((a, b) => b.rating - a.rating).slice(0, 50)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { id: t.id, name: t.name, items, note: items.length ? tierNoteBasis : '本轮实测范围内该档无有效平台价，如实空状态。' };
});

const now = new Date().toISOString();
const psValidPlayers = players.filter(p => p.psPrice >= MIN_VALID_PRICE).length;
const pcValidPlayers = players.filter(p => p.pcPrice >= MIN_VALID_PRICE).length;
// priceBasis 按实测有效价判定（2026-09-20 用户口径），不按日期比较
const priceBasis = (psValidPlayers || pcValidPlayers) ? 'partial-live' : 'listing-estimate';

const out = {
  date: dateStr,
  status: 'partial',
  platform: 'console+pc',
  generatedAt: now,
  dataCutoff: now,
  launchDate: LAUNCH_DATE,
  priceBasis,
  notes: [
    `FC27 开服日 ${LAUNCH_DATE}。FUTBIN 对部分卡牌滚动更新 Console / PC 平台价（本轮 /27/popular ${pop.cards.length} 张中 Console 有效价 ${psValidPlayers} 张、PC 有效价 ${pcValidPlayers} 张，价格 ≥${MIN_VALID_PRICE} coins 记为有效）；未更新的卡两平台仍为 0 占位。`,
    '价格 < 1000 视为占位值，平台价（psPrice=Console，pcPrice=PC）与估值（price=列表 IS 列）严格分开落库；本日逐卡口径为 ' + priceBasis + '。',
    '全部数据由 web-access（CDP Proxy :3456 直连独立调试 profile Chrome，端口 9333，零弹框）本轮实测取回后解析；FUTBIN 对 curl/WebFetch 返回 403，静态路线不可用。',
    pl.ok
      ? `本轮 /27/players 列表页可访问，翻页实测共提取 ${pl.rows.length} 行；价格分层基于该实测样本（见 priceTiers note），不伪造服务端筛选结果。`
      : '本轮 /27/players 被拦截或无数据，价格分层如实空状态。',
    '本周活动卡（Promo）/本周周黑（TOTW）：候选路由 /27/totw、/27/promos 本轮实测无名单内容（FC27 首期未发布时属正常），如实空状态。',
    '热门球员维度排序指标为 FUTBIN 热门页热度计数（卡片火苗图标旁计数，非搜索热度）；热门进化页每卡同样带该计数。',
    `价格采集自 /27/popular 与 /27/players 双源，均为一次取页同时读取 Console（platform-ps-only）与 PC（platform-pc-only）两个单元格，未依赖平台切换或 URL 参数分平台取数。观测序列（单文件累积，一行 = 一次观测）：${path.relative(ROOT, seriesPathFor(PRICE_ROOT, 'popular'))}${evo ? `；进化榜 ${path.relative(ROOT, seriesPathFor(PRICE_ROOT, 'evolutions'))}` : ''}。`,
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
    { url: 'https://www.futbin.com/robots.txt', openedAt: pop.collectedAt || '', note: 'CDP 宿主页（建立 futbin.com 同源会话，不触发 Cloudflare 挑战）' },
    { url: 'https://www.futbin.com/27/popular', openedAt: pop.collectedAt || '', note: `页内同源 fetch 取回 ${pop.cards.length} 张唯一卡（双平台价 + 热度计数 + 卡面版本前缀）；Console 有效价 ${psValidPlayers}、PC 有效价 ${pcValidPlayers}` },
    { url: 'https://www.futbin.com/27/popular/evolutions', openedAt: (evo && evo.collectedAt) || '', note: `页内同源 fetch 取回 ${evoCards.length} 张唯一进化卡（含进化名与热度计数，页面无价格单元格）` },
    { url: 'https://www.futbin.com/27/players?page=1..N', openedAt: pl.collectedAt || '', note: pl.ok ? `翻页共 ${pl.rows.length} 行，价格分层据此分档` : `本轮被拦截/无数据：${JSON.stringify(pl.attempts || []).slice(0, 200)}` },
    { url: 'https://www.futbin.com/27/totw, /27/promos', openedAt: totwProbe.totw?.openedAt || '', note: `周黑/活动卡候选路由实测无名单内容（${totwProbe.totw?.note || totwProbe.totw?.error || '?'} / ${totwProbe.promos?.note || totwProbe.promos?.error || '?'}），如实空状态` },
  ],
  missing: [],
  overview: {
    weekly: {
      promo: [], totw: [],
      note: '本周活动卡（Promo）与本周周黑（TOTW）名单本轮未采集到可用来源（/27/totw、/27/promos 实测无名单内容），如实空状态，不以旧日期或 FC26 名单填充。',
    },
    priceTiers: pl.ok ? priceTiers : tierDefs.map(t => ({ id: t.id, name: t.name, items: [], note: '本轮 /27/players 未采集到数据（见 sources），该档如实空状态，不以旧日期或 FC26 价格填充。' })),
    evolutions,
  },
};
out.missing.push('进化卡平台价：/27/popular/evolutions 卡片未渲染价格单元格，进化卡平台价如实为空。');
if (pl.ok) out.missing.push('价格分层覆盖范围：FUTBIN 价格筛选参数失效，分档基于 /27/players 实测翻页行（每档范围内 Top 50），非全量卡池。');
else out.missing.push('价格分层：/27/players 本轮被拦截或无数据，各档如实空状态（来源页临时拦截，非「无卡」）。');
out.missing.push('部分卡牌平台价仍为 0（FUTBIN 尚未更新），按占位值处理，不以估值顶替。');
out.missing.push('`players[]` 保留原始逐条观测（含同卡不同进化路径）：「一人一行」归并由渲染器 mergeByBaseCard() 完成，以保证系列排除能取到所有变体的卡面版本前缀。');

atomicWrite(outPath, JSON.stringify(out, null, 1));
console.log(`market.json 已写入 ${path.relative(ROOT, outPath)}`);
console.log(`players ${players.length} · evolutions ${evolutions.length} · value ${value.length} · unique URL ${seen.size}`);
console.log(`validPS ${psValidPlayers} · validPC ${pcValidPlayers} · priceBasis ${priceBasis} · launchDate ${LAUNCH_DATE}`);
console.log(`tiers ${(pl.ok ? priceTiers : []).map(t => t.name + ':' + t.items.length).join(' ') || '(无 /27/players 数据)'}`);
