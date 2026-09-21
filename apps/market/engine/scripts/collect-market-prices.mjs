#!/usr/bin/env node
/**
 * FC27 市场价格采集器 —— 「FC·市场价格关注列表」（每 4 小时）任务的执行入口
 *
 * 用途：读取 FUTBIN FC27 热门榜（/27/popular）的**双平台**平台价（Console / PC）与热度，以及热门进化榜
 *       （/27/popular/evolutions）的进化卡热度，落库为「单文件累积序列（series/）+ 最新快照缓存（latest.json）」，
 *       供关注列表（market-watch.html）与市场扫描页（market-scan.html）展示。
 *
 * 输入：
 *   - 浏览器：Web Access 技能的 CDP Proxy（默认 http://127.0.0.1:3456），复用用户日常已登录 Chrome
 *   - 环境变量：FC_PROJECT_ROOT / FC_CDP_PROXY / FC_MARKET_PRICE_DIR 可覆盖默认路径
 *   - 命令行：--date YYYY-MM-DD（文件名日期，默认 Asia/Shanghai 当日） / --limit N（只取前 N 张，试跑）
 *             --page popular|evolutions|both（默认 both）
 *
 * 输出（全部原子写）：
 *   - apps/market/engine/data/prices/fc27/series/popular.json        热门榜**单文件累积序列**（静态字段只存一次，卡下挂 price[] 观测行，`h` 为小时位）
 *   - apps/market/engine/data/prices/fc27/series/evolutions.json     进化榜单文件累积序列（同上，行内只有热度）
 *   - apps/market/engine/data/prices/fc27/popular/latest.json        最近一次成功的全量快照（**派生缓存**，供轻量读取）
 *   - apps/market/engine/data/prices/fc27/evolutions/latest.json     同上
 *   - apps/market/engine/data/prices/fc27/last-attempt.json          最近一次尝试的状态（成功/失败原因，含被拦截）
 *   试跑（带 --limit）一律写入 dryrun/ 子目录，**绝不覆盖生产结果**。
 *
 * 存储口径（2026-09-20 重构，替代此前的 popular/hourly + evolutions/hourly + popular/daily 三套写法）：
 *   - 旧写法每次采集写一份**全量快照**，把卡片静态字段（url/name/rating/pos/stats…）完整重复一遍：
 *     实测 popular 每份 46 KB 静态 + 22 KB 动态（静态是动态的 2.1 倍），evolutions 每份 70 KB + 8 KB（8.6 倍）。
 *   - 新写法：`series/<族>.json` 里静态字段在 cards[url] 下只存一次，下挂 `price[]`，**一行 = 一次观测**：
 *       { h, ps, pc, pop, min, max }（evolutions 只有 { h, pop }，该页无价格单元格）
 *     h = 小时键 `YYYY-MM-DDTHH`（即获取时间到小时粒度；精确到秒的 at 在同文件 points[] 里按小时给出）、
 *     ps/pc = Console/PC 平台价、pop = 热度、min/max = 当次观测到的**最低/最高有效平台价**（无有效价则 null）。
 *     **行内不写 at**：同一观测点内所有行的 at 恒相同，逐行重复正是要消除的冗余（约 1 MB 量级）。
 *   - **FUTBIN 的原始文本（"2.7K" 之类，旧 psPriceRaw/pcPriceRaw）不再入库**：无任何消费方、可由数值推导，
 *     全量历史下约 320 KB 纯冗余。将来若确需，从行内数值反推展示文案即可。
 *   - `latest.json` 保留旧形状，作为本次采集的「当前快照」派生缓存（体积可忽略），
 *     供 assemble / watchlist / sync-current-market 等轻量读取，避免它们全都解析整份历史序列。
 *     唯一权威的**时间序列**是 series/*.json；latest.json 不得被当作历史来源。
 *   - 序列读写一律走 `src/price-series.mjs`（含混合缩进序列化与旧形状还原适配器），勿在脚本内直接拼 JSON。
 *
 * 口径（2026-09-17 首测、2026-09-20 复核，勿凭印象改动）：
 *   - 列表页每一行**同时渲染**两个平台价格单元格（platform-ps-only / platform-pc-only），
 *     一次取页即得双平台价；页顶平台按钮只是纯前端显隐切换，不要为切换平台重复取页。
 *   - **`/27/popular` 与 `/27/popular/evolutions` 是服务端渲染的**（2026-09-20 实测：页内 fetch 的原始 HTML
 *     即含 250 / 500 个 `a.playercard-wrapper`）。旧注释「客户端渲染、必须轮询等卡片」已被推翻，
 *     因此本脚本**不导航、不轮询**，改为「宿主页 + 页内同源 fetch」。
 *   - **取数路径固定为「停在 `https://www.futbin.com/robots.txt` 的宿主页 + 页内同源 fetch」**
 *     （2026-09-20 固化）。原因：频繁新建标签页**直达**榜单页会被 Cloudflare 下发「Just a moment」挑战页，
 *     `Runtime.evaluate` 持续抛 `Uncaught`——2026-09-20 的 17 点与 18 点两轮即因此连续失败（12 次建页全败）。
 *     停在轻量同源页再 fetch 可稳定绕开，且与 `collect-icons-list.mjs` 的既定做法一致。**不要改回导航。**
 *   - 平台价 < 1000 视为占位值（FUTBIN 尚未更新该卡），**不当有效价**，也不与另一平台互相顶替。
 *   - `.item-score-segment`（评分/指数位）不是任何平台的成交价，仅作参考记录。
 *   - `/27/players` 列表目录可能被 FUTBIN 分路径 403 拦截（2026-09-17 实测），本脚本不使用该路径。
 *   - 采不到就如实记失败并保留上次结果，**绝不用 FC26 或历史日期数据填充**。
 *
 * 用法：node apps/market/engine/scripts/collect-market-prices.mjs [--date D] [--limit N] [--page both]
 *       （采集前必须先 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` 且 exit 0）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMarketListFetchScript } from './extract-market-prices.js';
import { cardIdFromUrl, mergeCurrentMarket, syncCurrentMarketAssets } from '../src/current-market.mjs';
import { appendSeries, atomicWrite, seriesPathFor } from '../src/price-series.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';

const PRICE_ROOT = process.env.FC_MARKET_PRICE_DIR
  || path.join(ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27');
const POPULAR_DIR = path.join(PRICE_ROOT, 'popular');
const EVO_DIR = path.join(PRICE_ROOT, 'evolutions');

const POPULAR_URL = 'https://www.futbin.com/27/popular';
const EVO_URL = 'https://www.futbin.com/27/popular/evolutions';
// 宿主页：只需建立 futbin.com origin，且必须**轻量、不触发 Cloudflare 挑战**（勿改成首页或榜单页本身）
const HOST_URL = 'https://www.futbin.com/robots.txt';
const HOST_SETTLE_MS = 2500;
const MIN_VALID_PRICE = 1000; // < 1000 视为占位价
const LAUNCH_DATE = '2026-09-18'; // FC27 开服日（2026-09-25 是正式发售日，勿改回）

const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const shanghaiHour = () => String(new Date(Date.now() + 8 * 3600e3).getUTCHours()).padStart(2, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const argv = process.argv.slice(2);
const argOf = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const limit = Number.parseInt(argOf('--limit') || '', 10);
const isDryRun = Number.isFinite(limit) && limit > 0;
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(argOf('--date') || '') ? argOf('--date') : shanghaiDate();
const hourStr = shanghaiHour();
const pageArg = (argOf('--page') || 'both').toLowerCase();

// 试跑防呆：带 --limit 的试跑绝不覆盖生产结果
const outRoot = isDryRun ? path.join(PRICE_ROOT, 'dryrun') : PRICE_ROOT;
const dirOf = base => (isDryRun ? path.join(outRoot, path.basename(base)) : base);

// ---------- 浏览器通道 ----------
async function proxyJson(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: body === null ? 'GET' : 'POST',
    body: body === null ? undefined : body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return await res.json();
}

async function openTab(url) {
  const created = await proxyJson(`${PROXY}/new`, url, 30000);
  if (!created.targetId) throw new Error('无法创建 futbin 标签页（CDP Proxy 不可用？先跑 check-deps.mjs）');
  return created.targetId;
}
async function closeTab(id) {
  try { await fetch(`${PROXY}/close?target=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) }); } catch { /* 关闭失败不影响结果 */ }
}
async function evaluate(id, script, timeoutMs = 60000) {
  const raw = await proxyJson(`${PROXY}/eval?target=${encodeURIComponent(id)}`, script, timeoutMs);
  if (raw && typeof raw.value === 'string') return raw.value;
  if (raw && raw.error) throw new Error(String(raw.error).slice(0, 160));
  throw new Error(`代理返回异常: ${JSON.stringify(raw).slice(0, 140)}`);
}

// 宿主页：停在轻量 futbin.com 页建立 origin/session，之后全部走页内同源 fetch（不再导航到榜单页）。
// 2026-09-20 实测：频繁新建标签页**直达**榜单页会被 Cloudflare 下发「Just a moment」挑战页，
// 此时 Runtime.evaluate 持续抛 Uncaught（17/18 两轮 12 次建页全败）；停在 /robots.txt 再页内 fetch
// 则稳定返回服务端渲染的完整榜单（popular 250 卡 / evolutions 500 卡），且省掉轮询等待。
async function openHost() {
  const id = await openTab(HOST_URL);
  await sleep(HOST_SETTLE_MS);
  return id;
}

// 采集一个榜单页：宿主页 + 页内同源 fetch，含「单次退避重试」；被拦截时不密集重试（站点经验：分钟级退避）
async function collectPage(kind) {
  const path = kind === 'popular' ? '/27/popular' : '/27/popular/evolutions';
  const url = kind === 'popular' ? POPULAR_URL : EVO_URL;
  const attempts = [
    { waitMs: 0, note: '宿主页 + 页内同源 fetch' },
    { waitMs: 45000, note: '45 秒退避后重试（重建宿主页）' },
  ];
  const errors = [];
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.waitMs) await sleep(attempt.waitMs);
    let host = null;
    try {
      host = await openHost();
      const payload = JSON.parse(await evaluate(host, buildMarketListFetchScript([{ kind, path }]), 90000));
      const stat = payload.byPage[kind] || {};
      if (stat.blocked) { errors.push({ attempt: i + 1, note: attempt.note, error: 'FUTBIN 挑战页/403 拦截页' }); continue; }
      if (stat.err) { errors.push({ attempt: i + 1, note: attempt.note, error: `页内 fetch 失败：${String(stat.err).slice(0, 160)}` }); continue; }
      if (stat.status !== 200) { errors.push({ attempt: i + 1, note: attempt.note, error: `页内 fetch 返回 HTTP ${stat.status}` }); continue; }
      let cards = payload.cards || [];
      if (!cards.length) { errors.push({ attempt: i + 1, note: attempt.note, error: '页面可读但未解析到卡片' }); continue; }
      for (const c of cards) c.__kind = kind;
      if (isDryRun) cards = cards.slice(0, limit);
      return { ok: true, url, cards, attempts: i + 1, errors, bytes: stat.bytes };
    } catch (e) {
      errors.push({ attempt: i + 1, note: attempt.note, error: String(e && e.message ? e.message : e).slice(0, 200) });
    } finally {
      if (host) await closeTab(host);
    }
  }
  return { ok: false, url, cards: [], attempts: attempts.length, errors };
}

// ---------- 落库 ----------
function compactCards(cards, { withPrice }) {
  // `cardVersion`（英雄/传奇/活动卡唯一可靠判据）与 `scoreRaw`（列表页 IS 估值列）必须**与卡片同页落库**：
  // 进化榜每轮内容滚动（两次探测仅重合约 55%），事后按 cardId 补采会补不齐版本信号。
  // 日任务的价格分层与扫描页的系列排除都依赖这两个字段。
  const base = c => ({
    url: c.url, name: c.name, rating: c.rating, pos: c.pos,
    popularity: c.popularity, evoName: c.evoName || null,
    cardVersion: c.cardVersion || null,
    scoreRaw: c.scoreRaw ?? null,
  });
  return cards.map(c => (withPrice
    ? {
        ...base(c),
        psPrice: c.psPrice, pcPrice: c.pcPrice,
        stats: c.stats || {},
      }
    : base(c)));
}

function countsOf(cards) {
  return {
    total: cards.length,
    psValid: cards.filter(c => c.psPrice >= MIN_VALID_PRICE).length,
    pcValid: cards.filter(c => c.pcPrice >= MIN_VALID_PRICE).length,
    bothValid: cards.filter(c => c.psPrice >= MIN_VALID_PRICE && c.pcPrice >= MIN_VALID_PRICE).length,
    withPopularity: cards.filter(c => typeof c.popularity === 'number').length,
  };
}

// ---------- 序列落库：单文件累积（series/<族>.json），静态字段只存一次 ----------
// 旧的 hourly/<D>T<HH>.json + daily/<D>.json 写法已废弃（每份全量快照都重复静态字段）。
const seriesRoot = isDryRun ? path.join(PRICE_ROOT, 'dryrun') : PRICE_ROOT;

/** 当次观测的**最低/最高有效平台价**；两平台都无有效价时如实 null（不拿占位值充当区间） */
function rangeOf(card) {
  const vals = [card.psPrice, card.pcPrice].filter(v => typeof v === 'number' && v >= MIN_VALID_PRICE);
  return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: null, max: null };
}

function writeSeries(kind, cards, { withPrice, counts, priceBasis = null, attempts, observedAt }) {
  const hour = `${dateStr}T${hourStr}`;
  const file = seriesPathFor(seriesRoot, kind);
  appendSeries(file, {
    meta: {
      scope: kind,
      game: 'fc27',
      platform: 'console+pc',
      sourceUrl: kind === 'popular' ? POPULAR_URL : EVO_URL,
      minValidPrice: MIN_VALID_PRICE,
      launchDate: LAUNCH_DATE,
      seriesNote: '静态字段在 cards[key] 下只存一次；price[] 一行 = 一次观测（h 小时键 = 获取时间 / ps Console / pc PC / pop 热度 / min·max 当次最低最高有效价）。精确到秒的采集时间在同文件 points[].at，按小时给出、不逐行重复。',
    },
    point: { hour, date: dateStr, at: observedAt, priceBasis, attempts, counts },
    entries: cards.map(c => ({
      key: c.url,
      static: {
        url: c.url, name: c.name, rating: c.rating, pos: c.pos,
        evoName: c.evoName || null,
        cardVersion: c.cardVersion || null,
        scoreRaw: c.scoreRaw ?? null,
        ...(c.stats ? { stats: c.stats } : {}),
      },
      price: withPrice
        ? { h: hour, ps: c.psPrice, pc: c.pcPrice, pop: c.popularity, ...rangeOf(c) }
        : { h: hour, pop: c.popularity },
    })),
  });
  return file;
}

// ---------- 主流程 ----------
const wantPopular = pageArg === 'popular' || pageArg === 'both';
const wantEvo = pageArg === 'evolutions' || pageArg === 'both';
const startedAt = new Date().toISOString();
const result = { date: dateStr, hour: hourStr, startedAt, dryRun: isDryRun, popular: null, evolutions: null, errors: [] };
let currentCards = [];
let currentObservedAt = null;

if (wantPopular) {
  process.stdout.write(`[1/2] 采集热门榜 ${POPULAR_URL}\n`);
  const r = await collectPage('popular');
  result.errors.push(...r.errors.map(e => ({ ...e, page: 'popular' })));
  if (r.ok) {
    const dir = dirOf(POPULAR_DIR);
    const cards = compactCards(r.cards, { withPrice: true });
    const counts = countsOf(r.cards);
    currentObservedAt = new Date().toISOString();
    const priceBasis = counts.psValid || counts.pcValid ? 'partial-live' : 'listing-estimate';
    const snapshot = {
      schemaVersion: 2,
      date: dateStr, hour: hourStr, collectedAt: currentObservedAt, sourceUrl: POPULAR_URL,
      platform: 'console+pc', priceBasis, minValidPrice: MIN_VALID_PRICE, attempts: r.attempts, counts, cards,
    };
    // 唯一权威的时间序列（单文件累积，静态字段只存一次）
    const seriesPath = writeSeries('popular', r.cards, {
      withPrice: true, counts, priceBasis, attempts: r.attempts, observedAt: currentObservedAt,
    });
    // 派生缓存：只保留本次的「当前快照」，供 assemble / watchlist / sync-current-market 轻量读取
    if (!isDryRun) atomicWrite(path.join(dir, 'latest.json'), JSON.stringify(snapshot, null, 1));
    currentCards = cards.map(c => ({
      cardId: cardIdFromUrl(c.url), slug: String(c.url || '').split('/').filter(Boolean).at(-1) || '',
      url: c.url, name: c.name, rating: c.rating, position: c.pos,
      platforms: { console: { price: c.psPrice }, pc: { price: c.pcPrice } },
      popularity: c.popularity,
    })).filter(c => c.cardId);
    result.popular = { counts, snapshotHour: hourStr, seriesPath: path.relative(ROOT, seriesPath) };
    process.stdout.write(`  成功：${counts.total} 张卡，Console 有效价 ${counts.psValid}，PC 有效价 ${counts.pcValid}（第 ${r.attempts} 次尝试）\n`);
  } else {
    process.stdout.write(`  失败：${r.errors.map(e => e.error).join(' / ')}\n`);
  }
}

if (wantEvo) {
  process.stdout.write(`[2/2] 采集热门进化榜 ${EVO_URL}\n`);
  const r = await collectPage('evolutions');
  result.errors.push(...r.errors.map(e => ({ ...e, page: 'evolutions' })));
  if (r.ok) {
    const dir = dirOf(EVO_DIR);
    const cards = compactCards(r.cards, { withPrice: false });
    const counts = { total: cards.length, withPopularity: cards.filter(c => typeof c.popularity === 'number').length };
    const observedAt = new Date().toISOString();
    const snapshot = {
      schemaVersion: 2,
      date: dateStr, hour: hourStr, collectedAt: observedAt, sourceUrl: EVO_URL,
      note: '进化榜卡片不渲染平台价格单元格，本快照只含热度与进化名',
      attempts: r.attempts, counts, cards,
    };
    const seriesPath = writeSeries('evolutions', r.cards, {
      withPrice: false, counts, attempts: r.attempts, observedAt,
    });
    if (!isDryRun) atomicWrite(path.join(dir, 'latest.json'), JSON.stringify(snapshot, null, 1));
    result.evolutions = { counts, snapshotHour: hourStr, seriesPath: path.relative(ROOT, seriesPath) };
    process.stdout.write(`  成功：${cards.length} 张进化卡，含热度 ${counts.withPopularity}（第 ${r.attempts} 次尝试）\n`);
  } else {
    process.stdout.write(`  失败：${r.errors.map(e => e.error).join(' / ')}\n`);
  }
}

result.finishedAt = new Date().toISOString();
result.status = result.popular || result.evolutions ? (result.popular && result.evolutions ? 'ok' : 'partial') : 'failed';
if (!isDryRun && currentCards.length) {
  await mergeCurrentMarket(currentCards, { source: 'futbin-popular', observedAt: currentObservedAt, date: dateStr });
  result.currentMarket = syncCurrentMarketAssets(dateStr).map(p => path.relative(ROOT, p));
}
if (!isDryRun) atomicWrite(path.join(PRICE_ROOT, 'last-attempt.json'), JSON.stringify(result, null, 1));

console.log(JSON.stringify({ status: result.status, date: dateStr, hour: hourStr, popular: result.popular, evolutions: result.evolutions, errors: result.errors }, null, 2));

// 退出码：热门榜（价格源）拿不到即视为失败——它是本任务的核心产物，缺失时不得让下游以为有数据
if (!result.popular) { console.error('热门榜价格采集失败：本次不更新关注列表所需的观测序列。'); process.exit(1); }
