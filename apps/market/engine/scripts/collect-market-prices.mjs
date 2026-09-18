#!/usr/bin/env node
/**
 * FC27 市场价格采集器 —— 每小时任务的执行入口
 *
 * 用途：每小时读取 FUTBIN FC27 热门榜（/27/popular）的**双平台**平台价（Console / PC）与热度，以及热门进化榜
 *       （/27/popular/evolutions）的进化卡热度，落库为「逐小时快照 + 当日合并序列 + 最新值」，
 *       供「每小时关注列表」（market-watch.html）与市场扫描页（market-scan.html）展示。
 *
 * 输入：
 *   - 浏览器：Web Access 技能的 CDP Proxy（默认 http://127.0.0.1:3456），复用用户日常已登录 Chrome
 *   - 环境变量：FC_PROJECT_ROOT / FC_CDP_PROXY / FC_MARKET_PRICE_DIR 可覆盖默认路径
 *   - 命令行：--date YYYY-MM-DD（文件名日期，默认 Asia/Shanghai 当日） / --limit N（只取前 N 张，试跑）
 *             --page popular|evolutions|both（默认 both）
 *
 * 输出（全部原子写）：
 *   - apps/market/engine/data/prices/fc27/popular/hourly/<D>T<HH>.json      逐小时快照（同日同小时只覆盖该小时）
 *   - apps/market/engine/data/prices/fc27/popular/daily/<D>.json           当日合并序列（逐卡逐小时价格与热度）
 *   - apps/market/engine/data/prices/fc27/popular/latest.json             最近一次成功的全量结果
 *   - apps/market/engine/data/prices/fc27/evolutions/hourly/<D>T<HH>.json  进化榜热度逐小时快照
 *   - apps/market/engine/data/prices/fc27/last-attempt.json                最近一次尝试的状态（成功/失败原因，含被拦截）
 *   试跑（带 --limit）一律写入各自目录下的 dryrun/ 子目录，**绝不覆盖生产结果**。
 *
 * 口径（2026-09-17 实机核验，勿凭印象改动）：
 *   - 列表页每一行**同时渲染**两个平台价格单元格（platform-ps-only / platform-pc-only），
 *     一次导航即得双平台价；页顶平台按钮只是纯前端显隐切换，不要为切换平台重复导航。
 *   - 平台价 < 1000 视为占位值（FUTBIN 尚未更新该卡），**不当有效价**，也不与另一平台互相顶替。
 *   - `.item-score-segment`（评分/指数位）不是任何平台的成交价，仅作参考记录。
 *   - `/27/players` 列表目录可能被 FUTBIN 分路径 403 拦截（2026-09-17 实测），本脚本不使用该路径。
 *   - 采不到就如实记失败并保留上次结果，**绝不用 FC26 或历史日期数据填充**。
 *
 * 用法：node apps/market/engine/scripts/collect-market-prices.mjs [--date D] [--limit N] [--page both]
 *       （采集前必须先 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` 且 exit 0）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMarketListScript } from './extract-market-prices.js';
import { cardIdFromUrl, mergeCurrentMarket, syncCurrentMarketAssets } from '../src/current-market.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';

const PRICE_ROOT = process.env.FC_MARKET_PRICE_DIR
  || path.join(ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27');
const POPULAR_DIR = path.join(PRICE_ROOT, 'popular');
const EVO_DIR = path.join(PRICE_ROOT, 'evolutions');

const POPULAR_URL = 'https://www.futbin.com/27/popular';
const EVO_URL = 'https://www.futbin.com/27/popular/evolutions';
const HOME_URL = 'https://www.futbin.com/';
const MIN_VALID_PRICE = 1000; // < 1000 视为占位价

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const shanghaiHour = () => String(new Date(Date.now() + 8 * 3600e3).getUTCHours()).padStart(2, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 原子写：先写临时文件再改名，避免中途失败留下半截 JSON
function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

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
async function navigate(id, url) {
  await proxyJson(`${PROXY}/navigate?target=${encodeURIComponent(id)}`, url, 30000);
}
async function evaluate(id, script, timeoutMs = 60000) {
  const raw = await proxyJson(`${PROXY}/eval?target=${encodeURIComponent(id)}`, script, timeoutMs);
  if (raw && typeof raw.value === 'string') return raw.value;
  if (raw && raw.error) throw new Error(String(raw.error).slice(0, 160));
  throw new Error(`代理返回异常: ${JSON.stringify(raw).slice(0, 140)}`);
}

// 页面是客户端渲染：导航返回 ≠ 内容就绪，必须轮询到卡片出现（或超时）
async function waitForCards(id, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = { cards: 0, blocked: false };
  while (Date.now() < deadline) {
    const probe = await evaluate(id, `(() => {
      const n = document.querySelectorAll('a.playercard-wrapper').length;
      const t = document.body ? document.body.innerText.slice(0, 200) : '';
      return JSON.stringify({ cards: n, blocked: /403|does not have permission/i.test(t) });
    })()`, 20000);
    last = JSON.parse(probe);
    if (last.cards > 0 || last.blocked) return last;
    await sleep(2500);
  }
  return last;
}

// 采集一个榜单页：含「会话建立 + 单次退避重试」，被 403 拦截时不密集重试（站点经验：分钟级退避）
async function collectPage(kind) {
  const url = kind === 'popular' ? POPULAR_URL : EVO_URL;
  const attempts = [{ waitMs: 0, note: '首次导航' }, { waitMs: 45000, note: '45 秒退避后重试（先经首页重建会话）' }];
  const errors = [];
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.waitMs) await sleep(attempt.waitMs);
    let tab = null;
    try {
      if (i > 0) { tab = await openTab(HOME_URL); await sleep(3000); await navigate(tab, url); }
      else { tab = await openTab(url); }
      const probe = await waitForCards(tab);
      if (probe.blocked) { errors.push({ attempt: i + 1, note: attempt.note, error: 'FUTBIN 403 拦截页' }); continue; }
      if (!probe.cards) { errors.push({ attempt: i + 1, note: attempt.note, error: '等待 45 秒后仍无卡片元素' }); continue; }
      const payload = JSON.parse(await evaluate(tab, buildMarketListScript(kind), 60000));
      if (payload.blocked) { errors.push({ attempt: i + 1, note: attempt.note, error: '解析到 403 拦截页' }); continue; }
      let cards = payload.cards || [];
      if (isDryRun) cards = cards.slice(0, limit);
      if (!cards.length) { errors.push({ attempt: i + 1, note: attempt.note, error: '页面可读但未解析到卡片' }); continue; }
      return { ok: true, url, cards, attempts: i + 1, errors };
    } catch (e) {
      errors.push({ attempt: i + 1, note: attempt.note, error: String(e && e.message ? e.message : e).slice(0, 200) });
    } finally {
      if (tab) await closeTab(tab);
    }
  }
  return { ok: false, url, cards: [], attempts: attempts.length, errors };
}

// ---------- 落库 ----------
function compactCards(cards, { withPrice }) {
  return cards.map(c => (withPrice
    ? {
        url: c.url, name: c.name, rating: c.rating, pos: c.pos,
        psPrice: c.psPrice, pcPrice: c.pcPrice, psPriceRaw: c.psPriceRaw, pcPriceRaw: c.pcPriceRaw,
        popularity: c.popularity, evoName: c.evoName || null, stats: c.stats || {},
      }
    : {
        url: c.url, name: c.name, rating: c.rating, pos: c.pos,
        popularity: c.popularity, evoName: c.evoName || null,
      }));
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

// 当日合并序列：逐卡记录当天每个小时的观测点，供关注列表计算逐小时变化与日环比
function mergeDaily(dir, cards, { withPrice }) {
  const dailyPath = path.join(dir, 'daily', `${dateStr}.json`);
  const existing = readJSON(dailyPath) || { date: dateStr, platform: 'console+pc', points: [], cards: {} };
  const point = { hour: hourStr, collectedAt: new Date().toISOString(), counts: countsOf(cards) };
  existing.points = (existing.points || []).filter(p => p.hour !== hourStr).concat([point])
    .sort((a, b) => String(a.hour).localeCompare(String(b.hour)));
  existing.cards = existing.cards || {};
  for (const c of cards) {
    const key = c.url;
    const entry = existing.cards[key] || { name: c.name, rating: c.rating, pos: c.pos, evoName: c.evoName || null, ps: [], pc: [], pop: [] };
    entry.name = c.name; entry.rating = c.rating; entry.pos = c.pos;
    if (c.evoName) entry.evoName = c.evoName;
    const put = (arr, value) => { const list = (arr || []).filter(x => x.h !== hourStr); list.push({ h: hourStr, v: value }); list.sort((a, b) => String(a.h).localeCompare(String(b.h))); return list; };
    if (withPrice) { entry.ps = put(entry.ps, c.psPrice); entry.pc = put(entry.pc, c.pcPrice); }
    entry.pop = put(entry.pop, c.popularity);
    existing.cards[key] = entry;
  }
  atomicWrite(dailyPath, JSON.stringify(existing, null, 1));
  return dailyPath;
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
    const snapshot = {
      date: dateStr, hour: hourStr, collectedAt: currentObservedAt, sourceUrl: POPULAR_URL,
      platform: 'console+pc', priceBasis: counts.psValid || counts.pcValid ? 'partial-live' : 'listing-estimate',
      minValidPrice: MIN_VALID_PRICE, attempts: r.attempts, counts, cards,
    };
    atomicWrite(path.join(dir, 'hourly', `${dateStr}T${hourStr}.json`), JSON.stringify(snapshot, null, 1));
    if (!isDryRun) atomicWrite(path.join(dir, 'latest.json'), JSON.stringify(snapshot, null, 1));
    const dailyPath = mergeDaily(dir, r.cards, { withPrice: true });
    currentCards = cards.map(c => ({
      cardId: cardIdFromUrl(c.url), slug: String(c.url || '').split('/').filter(Boolean).at(-1) || '',
      url: c.url, name: c.name, rating: c.rating, position: c.pos,
      platforms: { console: { price: c.psPrice }, pc: { price: c.pcPrice } },
      popularity: c.popularity,
    })).filter(c => c.cardId);
    result.popular = { counts, snapshotHour: hourStr, dailyPath: path.relative(ROOT, dailyPath) };
    process.stdout.write(`  成功：${counts.total} 张卡，Console 有效价 ${counts.psValid}，PC 有效价 ${counts.pcValid}（第 ${r.attempts} 次导航）\n`);
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
    const snapshot = {
      date: dateStr, hour: hourStr, collectedAt: new Date().toISOString(), sourceUrl: EVO_URL,
      note: '进化榜卡片不渲染平台价格单元格，本快照只含热度与进化名',
      attempts: r.attempts, counts, cards,
    };
    atomicWrite(path.join(dir, 'hourly', `${dateStr}T${hourStr}.json`), JSON.stringify(snapshot, null, 1));
    if (!isDryRun) atomicWrite(path.join(dir, 'latest.json'), JSON.stringify(snapshot, null, 1));
    const dailyPath = mergeDaily(dir, r.cards, { withPrice: false });
    result.evolutions = { counts, snapshotHour: hourStr, dailyPath: path.relative(ROOT, dailyPath) };
    process.stdout.write(`  成功：${cards.length} 张进化卡，含热度 ${counts.withPopularity}（第 ${r.attempts} 次导航）\n`);
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
if (!result.popular) { console.error('热门榜价格采集失败：本次不更新关注列表所需的逐小时序列。'); process.exit(1); }
