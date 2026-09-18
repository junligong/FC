#!/usr/bin/env node
/**
 * FC27 传奇卡（Icon）价格区间采集器 —— 每小时任务的执行入口
 *
 * 用途：逐卡读取 FUTBIN 球员详情页的「Price Range（最低价 - 最高价）」「Price Updated」与双平台当前价，
 *       落库为「最新值 + 逐小时快照」，供监控页展示与「传奇研究」计算投资建议。
 *       补齐了此前只有「列表页占位价」的空白：区间价是 FUTBIN 唯一在开服前就持续更新的行情字段。
 *
 * 输入：
 *   - 卡牌名单：apps/market/engine/icons/data/prices/fc27/base-icons.json（优先，含 marketUrl）
 *               回退 apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json（含 rel）
 *   - 浏览器：Web Access 技能的 CDP Proxy（默认 http://127.0.0.1:3456），复用用户日常已登录 Chrome
 *   - 环境变量：FC_PROJECT_ROOT / FC_CDP_PROXY / FC_PRICE_RANGE_DIR 可覆盖默认路径
 *   - 命令行：--limit N（只采前 N 张，用于验证） / --date YYYY-MM-DD（逐小时文件名日期）
 *
 * 输出：
 *   - apps/market/engine/icons/data/prices/fc27/pricerange/latest.json         最新一次采集结果（原子写）
 *   - apps/market/engine/icons/data/prices/fc27/pricerange/hourly/<D>T<HH>.json 逐小时快照（原子写，同日同小时只覆盖该小时）
 *
 * 口径（2026-09-17 实机核验，勿凭印象改动）：
 *   - **价格区间是卡级字段**：同一张卡的 Console 与 PC 价格盒渲染出完全相同的区间值（20 张卡批量比对差异数为 0），
 *     因此只落一份 min/max，并在产物内以 scope="card" 明确标注，绝不伪造「每平台各一套区间」。
 *   - 区间价不是成交价：开服日 launchDate（2026-09-25）前 FUTBIN 尚无市场成交，此口径记为 listing-estimate，
 *     不得据此计算日环比与累计涨跌。
 *   - 平台「当前价」未开服前普遍为 0，属占位值（<1000 判无效），如实留空，不用另一平台顶替。
 *   - FUTBIN 会限流：并发 5 时出现 HTTP 429，故本脚本**串行 + 间隔**，并对 429/5xx 退避重试。
 *   - 采不到就如实记 missingIitems 并保留上次结果，**绝不用 FC26 或历史日期数据填充**。
 *
 * 用法：node apps/market/engine/scripts/collect-icon-priceranges.mjs [--limit N] [--date YYYY-MM-DD]
 *       （采集前必须先 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` 且 exit 0）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPriceRangeScript } from './extract-icon-priceranges.js';
import { mergeCurrentMarket, syncCurrentMarketAssets } from '../src/current-market.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOST_PAGE = 'https://www.futbin.com/robots.txt'; // 只需 futbin.com origin，轻量、不触发反爬

const ICON_DIR = path.join(ROOT, 'apps', 'market', 'engine', 'icons');
const RAW_PATH = path.join(ICON_DIR, 'data', 'prices', 'fc27', 'base-icons.json');
const LEDGER_PATH = path.join(ICON_DIR, 'data', 'players', 'fc27', 'fc27-icons-playstyles.json');
const OUT_DIR = process.env.FC_PRICE_RANGE_DIR || path.join(ICON_DIR, 'data', 'prices', 'fc27', 'pricerange');

const FALLBACK_LAUNCH_DATE = '2026-09-25';
const MIN_VALID_PRICE = 1000; // 低于此值视为占位价，不是有效市场价
const BATCH_SIZE = 8;         // 单次 eval 的卡数：控制单次往返时长在 30 秒内
const BATCH_GAP_MS = 400;     // 批与批之间的间隔，规避 FUTBIN 限流
// 宿主页重建周期（批）：长驻宿主页连续解析大量详情页后会累积内存，表现为「跑到某一进度后
// 后续批全部 Runtime.evaluate 超时 + 响应 JSON 截断（Unexpected end of JSON input）」，
// 且补采轮同样 0 张。2026-09-17 三次实测（进度 16 / 104 / 48 处劣化），确认是**长驻页/目标级**故障
// 而非 429 或 Cloudflare。定期重建宿主页把累积量截断在该阈值之下；不改变串行与限速语义。
const HOST_RECYCLE_EVERY = 3;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const nowIso = () => new Date().toISOString();
const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

// 原子写：先写临时文件再改名，避免中途失败留下半截 JSON
function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

const argv = process.argv.slice(2);
const argOf = name => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const limit = Number.parseInt(argOf('--limit') || '', 10);
const isDryRun = Number.isFinite(limit) && limit > 0;
// 防呆：带 --limit 的试跑**绝不能**覆盖生产结果（曾经用 4 张的试跑覆盖过全量 latest.json）。
// 试跑统一写到 dryrun/ 子目录，生产路径只允许全量采集写入。
const OUT_ROOT = isDryRun ? path.join(OUT_DIR, 'dryrun') : OUT_DIR;
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(argOf('--date') || '') ? argOf('--date') : shanghaiDate();

// ---------- 1. 卡牌名单 ----------
// 优先用当日原始抓取（含 marketUrl），缺失时回退卡库台账（含 rel），两者都缺则无法采集
function buildRoster() {
  const raw = readJSON(RAW_PATH);
  if (raw && Array.isArray(raw.players) && raw.players.length) {
    return {
      from: path.relative(ROOT, RAW_PATH),
      launchDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.launchDate || '') ? raw.launchDate : FALLBACK_LAUNCH_DATE,
      cards: raw.players.map(p => ({
        id: String(p.id ?? p.slug ?? ''),
        slug: p.slug || '',
        nameZh: p.nameZh || '',
        name: p.name || '',
        rating: typeof p.rating === 'number' ? p.rating : null,
        url: p.marketUrl || (p.rel ? `https://www.futbin.com${p.rel}` : ''),
      })).filter(c => c.id && c.url),
    };
  }
  const ledger = readJSON(LEDGER_PATH);
  if (Array.isArray(ledger) && ledger.length) {
    return {
      from: path.relative(ROOT, LEDGER_PATH),
      launchDate: FALLBACK_LAUNCH_DATE,
      cards: ledger.map(p => ({
        id: String(p.id || ''),
        slug: p.slug || '',
        nameZh: p.nameZh || '',
        name: p.name || '',
        rating: typeof p.rating === 'number' ? p.rating : null,
        url: p.rel ? `https://www.futbin.com${p.rel}` : '',
      })).filter(c => c.id && c.url),
    };
  }
  return { from: null, cards: [] };
}

const roster = buildRoster();
if (!roster.cards.length) {
  console.error(`未找到传奇卡名单（${path.relative(ROOT, RAW_PATH)} 与 ${path.relative(ROOT, LEDGER_PATH)} 均不可用），本轮不写入任何结果。`);
  process.exit(1);
}
const targets = isDryRun ? roster.cards.slice(0, limit) : roster.cards;

// ---------- 2. 浏览器通道 ----------
async function proxyJson(url, body, timeoutMs) {
  // function + 显式判空：CDP 代理对超长表达式的返回偶发为空对象，需自行判错
  const res = await fetch(url, {
    method: body === null ? 'GET' : 'POST',
    body: body === null ? undefined : body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return await res.json();
}

async function findOrCreateHost() {
  // 始终自建宿主页，用完只关自己建的那一个。
  // 不复用用户已有标签页：复用的页可能长时间未活动而被 Chrome 冻结（JS 停摆、fetch 永不返回），
  // 一挂就是几十秒，批量采集会整体卡死 —— 该教训来自本项目的 news 取图模块。
  const created = await proxyJson(`${PROXY}/new`, HOST_PAGE, 25000);
  if (!created.targetId) throw new Error('无法创建 futbin 宿主标签页');
  return { id: created.targetId, owned: true };
}

async function closeHost(host) {
  if (!host || !host.owned) return; // 绝不动用户自己的标签页
  try { await fetch(`${PROXY}/close?target=${encodeURIComponent(host.id)}`, { signal: AbortSignal.timeout(5000) }); } catch { /* 关闭失败不影响结果 */ }
}

// ---------- 3. 逐批取数 ----------
const collected = new Map();
const errors = [];

async function collectOnce(cards, { gapMs = 350 } = {}) {
  const queued = [...cards];
  let batchIndex = 0;
  for (let i = 0; i < queued.length; i += BATCH_SIZE, batchIndex++) {
    // 周期性重建宿主页：把长驻页的累积量截断在劣化阈值之下（见 HOST_RECYCLE_EVERY 注释）
    if (batchIndex > 0 && batchIndex % HOST_RECYCLE_EVERY === 0) {
      const old = host;
      try {
        host = await findOrCreateHost();
        await closeHost(old);
        process.stdout.write('  （已重建宿主页）\n');
      } catch {
        host = old; // 重建失败则继续用旧页，不让整轮中断
      }
    }
    const batch = queued.slice(i, i + BATCH_SIZE);
    let payload = null;
    try {
      const raw = await proxyJson(`${PROXY}/eval?target=${encodeURIComponent(host.id)}`, buildPriceRangeScript(batch, { gapMs }), 90000);
      if (raw && typeof raw.value === 'string') payload = JSON.parse(raw.value);
      else if (raw && raw.error) throw new Error(String(raw.error).slice(0, 160));
      else throw new Error(`代理返回异常: ${JSON.stringify(raw).slice(0, 140)}`);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).slice(0, 200);
      for (const c of batch) errors.push({ id: c.id, error: `批失败: ${msg}` });
    }
    if (payload && Array.isArray(payload.results)) {
      for (const r of payload.results) {
        if (r.ok) collected.set(String(r.id), r);
        else errors.push({ id: String(r.id), error: r.error || `HTTP ${r.status}`, status: r.status });
      }
    }
    process.stdout.write(`  进度 ${Math.min(i + BATCH_SIZE, queued.length)}/${queued.length}（已成功 ${collected.size}）\n`);
    if (i + BATCH_SIZE < queued.length) await new Promise(r => setTimeout(r, BATCH_GAP_MS));
  }
}

let host = null;
try {
  host = await findOrCreateHost();
} catch (e) {
  console.error(`浏览器通道不可用：${String(e && e.message ? e.message : e)}`);
  console.error('请先运行 node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs 确认 exit 0。本轮不写入任何结果。');
  await closeHost(host);
  process.exit(1);
}

console.log(`传奇价格区间采集：${targets.length} 张（名单来源 ${roster.from}）${isDryRun ? ' 【DRY-RUN：只写 dryrun/，不覆盖生产结果】' : ''}`);
await collectOnce(targets);

// 失败项（排除 403 —— 站点级拦截，重试无益）再补采一轮，间隔加大
const retryable = targets.filter(c => !collected.has(String(c.id)) && !errors.some(e => e.id === c.id && e.status === 403));
if (retryable.length) {
  console.log(`\n补采 ${retryable.length} 张失败卡（加大间隔）…`);
  await collectOnce(retryable, { gapMs: 1200 });
}
await closeHost(host);

// ---------- 4. 落库 ----------
const fetchedAt = nowIso();
const cardsOut = targets.map(c => {
  const r = collected.get(String(c.id)) || null;
  const current = {
    console: r && r.current ? r.current.console : null,
    pc: r && r.current ? r.current.pc : null,
  };
  const err = errors.find(e => e.id === String(c.id));
  return {
    id: c.id,
    slug: c.slug,
    nameZh: c.nameZh || '',
    name: c.name || (r && r.name) || '',
    rating: c.rating,
    marketUrl: c.url,
    ok: Boolean(r && r.ok),
    priceRange: r && r.ok ? { min: r.min, max: r.max, updatedText: r.updatedText || null } : null,
    current: {
      console: typeof current.console === 'number' ? current.console : null,
      pc: typeof current.pc === 'number' ? current.pc : null,
    },
    currentValid: {
      console: typeof current.console === 'number' && current.console >= MIN_VALID_PRICE,
      pc: typeof current.pc === 'number' && current.pc >= MIN_VALID_PRICE,
    },
    estimate: r && typeof r.estimate === 'number' ? r.estimate : null,
    fetchedAt: r ? fetchedAt : null,
    error: r && r.ok ? null : (err ? err.error : '未采集'),
  };
});

const okCards = cardsOut.filter(c => c.ok);
if (!okCards.length) {
  console.error('\n全部卡牌均未取到价格区间：FUTBIN 详情页不可用或被拦截。');
  console.error('按契约不写入任何结果、不用历史数据填充，保留上次有效结果。');
  console.error(`失败样例：${errors.slice(0, 3).map(e => `${e.id}:${e.error}`).join(' | ') || '无'}`);
  process.exit(1);
}

const mins = okCards.map(c => c.priceRange.min).filter(v => typeof v === 'number');
const maxs = okCards.map(c => c.priceRange.max).filter(v => typeof v === 'number');
const priceBasis = dateStr < roster.launchDate ? 'listing-estimate' : 'market';
const blocked403 = errors.some(e => e.status === 403);

const snapshot = {
  schemaVersion: 1,
  date: dateStr,
  game: 'fc27',
  cardType: 'icon',
  cardLabel: '基础传奇',
  platform: 'console+pc',
  scope: 'card', // 价格区间为卡级字段：两平台渲染同值（2026-09-17 核验）
  scopeNote: 'FUTBIN 详情页「Price Range」在同一张卡的 Console 与 PC 价格盒中渲染为相同数值，属卡级字段，不按平台拆分。',
  launchDate: roster.launchDate,
  collectedAt: fetchedAt,
  priceBasis,
  priceBasisNote: priceBasis === 'listing-estimate'
    ? `FC27 未开服（开服日 ${roster.launchDate}），该区间是 FUTBIN 的挂单/估值区间，不是成交价，不能据此计算涨跌。`
    : 'FC27 已开服，区间为 FUTBIN 当日挂单区间。',
  minValidPrice: MIN_VALID_PRICE,
  source: {
    name: 'FUTBIN',
    rosterFrom: roster.from,
    detailUrlPattern: 'https://www.futbin.com/27/player/<id>/<slug>',
    rangeLogUrl: 'https://www.futbin.com/27/priceranges',
    note: '逐卡读取详情页 Price Range（最低价-最高价）、Price Updated 与双平台当前价；价格区间为卡级字段。',
  },
  counts: {
    total: cardsOut.length,
    ok: okCards.length,
    missing: cardsOut.length - okCards.length,
    minFloor: mins.length ? Math.min(...mins) : null,
    maxCeiling: maxs.length ? Math.max(...maxs) : null,
  },
  missingItems: [
    ...(cardsOut.length - okCards.length > 0
      ? [`${cardsOut.length - okCards.length} 张卡未取到价格区间，已在 cards 中如实标注 error。`]
      : []),
    ...(blocked403 ? ['部分请求遭遇 FUTBIN 403 站点级拦截（非通道故障），已在 error 中标注。'] : []),
    ...(priceBasis === 'listing-estimate'
      ? ['FC27 未开服，双平台当前价多为 0（占位值），已按 <1000 判为无效，未参与任何涨跌计算。']
      : []),
  ],
  // 只落「最终仍未采到」的错误：补采轮已成功的卡其首轮错误属陈旧残留，
  // 若一并写入会让下游把 131/131 的完整快照误读成部分失败（2026-09-17 实测残留 24 条）。
  errors: errors.filter(e => !collected.has(String(e.id))).slice(0, 40),
  cards: cardsOut,
};

atomicWrite(path.join(OUT_ROOT, 'latest.json'), JSON.stringify(snapshot, null, 2) + '\n');

// 逐小时快照：同日同小时只覆盖该小时，不动其他小时
const hour = new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 13);
const hourlyPath = path.join(OUT_ROOT, 'hourly', `${dateStr}T${hour}.json`);
atomicWrite(hourlyPath, JSON.stringify(snapshot, null, 2) + '\n');

if (!isDryRun) {
  await mergeCurrentMarket(cardsOut.filter(c => c.ok).map(c => ({
    cardId: c.id, slug: c.slug, url: c.marketUrl, name: c.name, nameZh: c.nameZh,
    rating: c.rating, cardType: 'icon',
    platforms: { console: { price: c.current.console }, pc: { price: c.current.pc } },
    priceRange: c.priceRange,
  })), { source: 'futbin-icon-detail', observedAt: snapshot.collectedAt, date: dateStr });
  syncCurrentMarketAssets(dateStr);
}

console.log(`\n价格区间已落库：${okCards.length}/${cardsOut.length} 张`);
console.log(`  区间下沿最低 ${snapshot.counts.minFloor?.toLocaleString('en-US') ?? '—'} · 区间上沿最高 ${snapshot.counts.maxCeiling?.toLocaleString('en-US') ?? '—'}`);
console.log(`  口径 ${priceBasis} · ${path.relative(ROOT, path.join(OUT_ROOT, 'latest.json'))}`);
console.log(`  逐小时快照 ${path.relative(ROOT, hourlyPath)}`);
if (cardsOut.length - okCards.length > 0) console.log(`  缺失 ${cardsOut.length - okCards.length} 张（已如实记录，未填充）`);
