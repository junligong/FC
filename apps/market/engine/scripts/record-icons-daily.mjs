#!/usr/bin/env node
/**
 * FC27 基础传奇卡「逐日价格快照」记录器
 * 用途：把当天从 FUTBIN 抓到的 FC27 基础传奇卡价格固化为「一天一份」的不可变快照，
 *       供「传奇监控」页逐日比对全部传奇卡的价格变化。
 *       同日重跑只覆盖当天快照文件，绝不改动其他日期，也不清空历史。
 * 输入：
 *   apps/market/engine/icons/data/prices/fc27/base-icons.json     当日抓取原始结果（默认）
 *   apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json  卡库台账（位置/六维/特技）
 *   apps/market/engine/icons/data/prices/fc27/pricerange/latest.json  传奇价格区间任务（每 4 小时）采集的价格区间
 *       （最低价 / 最高价 + 双平台实时价；缺失时回退当日列表页平台价）
 *   （可用 FC_ICON_RAW / FC_ICON_LEDGER / FC_ICON_PRICERANGE 指定其他路径；FC_PROJECT_ROOT 指定项目根）
 * 输出：
 *   apps/market/engine/icons/data/prices/fc27/daily/<DATE>.json   当日快照（原子写入）
 * 平台口径：
 *   FUTBIN 只提供 Console（PS / Xbox 合并）与 PC 两个市场。原始抓取里 prices.console / prices.pc
 *   分别承载两平台价（历史文件用 prices.cross 表示 Console，本脚本兼容两种写法）。
 *   逐卡同时写入 platforms.console / platforms.pc，并保留 price（用于展示的当轮价）以便向后兼容。
 * 区间口径（2026-09-17 新增）：
 *   FUTBIN 详情页的「Price Range」是**卡级**字段（同一张卡的 Console 与 PC 价格盒渲染同值），
 *   故逐卡写入单个 priceRange{min,max}，不按平台拆分；缺失一律 null，不用估值或其他卡顶替。
 * 口径（2026-09-20 定稿）：
 *   FC27 开服日 launchDate = 2026-09-18（2026-09-25 是**正式全球发售日**，不是开服日，勿改回）。
 *   priceBasis **按当日实测有效价判定，不按日期比较**：当日存在平台级有效价（≥1000 coins）记为 market，
 *   一张都没有记为 listing-estimate。理由：09-18 当天两平台价多为 0/占位值，若按日期一刀切成 market，
 *   会让「日环比」把占位价当成基线。
 *   价格 < 1000 视为占位值而非有效市场价，priceValid=false。
 * 用法：node apps/market/engine/scripts/record-icons-daily.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const ICON_DIR = path.join(ROOT, 'apps', 'market', 'engine', 'icons');
const RAW_PATH = process.env.FC_ICON_RAW || path.join(ICON_DIR, 'data', 'prices', 'fc27', 'base-icons.json');
const LEDGER_PATH = process.env.FC_ICON_LEDGER || path.join(ICON_DIR, 'data', 'players', 'fc27', 'fc27-icons-playstyles.json');
const PRICERANGE_PATH = process.env.FC_ICON_PRICERANGE || path.join(ICON_DIR, 'data', 'prices', 'fc27', 'pricerange', 'latest.json');
const DAILY_DIR = path.join(ICON_DIR, 'data', 'prices', 'fc27', 'daily');


const FALLBACK_LAUNCH_DATE = '2026-09-18'; // FC27 开服日（2026-09-19 用户明确口径）
// 有效市场价格下限：列表页占位值集中在 88~95，明显不是金币成交价
const MIN_VALID_PRICE = 1000;

const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// 原子写入：先写临时文件再改名，避免中途失败留下半截快照
function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();

const raw = readJSON(RAW_PATH);
if (!raw || !Array.isArray(raw.players) || !raw.players.length) {
  console.error(`未找到可用的传奇卡抓取结果：${RAW_PATH}`);
  console.error('本轮不写入任何快照，传奇监控页将由渲染器输出如实空状态。');
  process.exit(1);
}

const launchDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.launchDate || '') ? raw.launchDate : FALLBACK_LAUNCH_DATE;

// 卡库台账：位置、六维、特技、身高、花式/逆足，用于监控页展示（缺失则为空）
const ledger = readJSON(LEDGER_PATH);
const ledgerById = new Map();
if (Array.isArray(ledger)) for (const item of ledger) if (item && item.id) ledgerById.set(String(item.id), item);

// 价格区间（传奇价格区间任务采集）：卡级字段 min/max，缺失一律 null
const pricerange = readJSON(PRICERANGE_PATH);
const rangeById = new Map();
if (pricerange && Array.isArray(pricerange.cards)) {
  for (const c of pricerange.cards) {
    if (c && c.ok && c.priceRange && typeof c.id === 'string') rangeById.set(c.id, c);
  }
}
const rangeCollectedAt = pricerange && typeof pricerange.collectedAt === 'string' ? pricerange.collectedAt : null;
const rangeIsCurrentDate = pricerange?.date === dateStr;


function positionOf(player, meta) {
  if (meta && meta.position) return String(meta.position);
  // rowText 形如 "95 Maradona Icon 95 60000 CAM ST 0 96.8 CAM - PL ..."，位置字段不稳定，仅在无台账时兜底
  const m = /Icon\s+\d+\s+\S*\s*([A-Z]{2,3})\b/.exec(player.rowText || '');
  return m ? m[1] : '';
}

// 平台定义：与 FUTBIN 的 platform 表单按钮一致（value=ps 文案 Console / value=pc 文案 PC）。
// 原始抓取可能用 console 或 cross 表示 Console 口径，这里两种都接受。
const PLATFORM_KEYS = { console: ['console', 'cross', 'ps'], pc: ['pc'] };

// 从原始抓取的一个平台节点里取出价格（兼容数字直给与 {price|value|currentPrice} 两种写法）
function readPlatformPrice(node) {
  if (node === null || node === undefined) return null;
  if (typeof node === 'number' && Number.isFinite(node)) return node;
  if (typeof node === 'object') {
    for (const k of ['price', 'value', 'currentPrice', 'coinPrice']) {
      const v = node[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
  }
  return null;
}

// 逐卡平台价：两个平台各给一个 { price, valid }，缺失写 null（如实空状态，不用另一平台顶替）
function platformPricesOf(player) {
  const src = player && typeof player.prices === 'object' && player.prices ? player.prices : {};
  const out = {};
  for (const [pid, aliases] of Object.entries(PLATFORM_KEYS)) {
    let found = null;
    for (const alias of aliases) {
      const v = readPlatformPrice(src[alias]);
      if (typeof v === 'number') { found = v; break; }
    }
    out[pid] = found === null
      ? { price: null, valid: false }
      : { price: found, valid: found >= MIN_VALID_PRICE };
  }
  return out;
}

// 详情页（每 4 小时一轮）采集同时包含双平台实时价；只有快照日期与目标日期相同才可覆盖列表页价。
function latestPlatformPricesOf(rng, fallback) {
  if (!rangeIsCurrentDate || !rng || !rng.current) return fallback;
  const out = { ...fallback };
  for (const pid of ['console', 'pc']) {
    const value = rng.current[pid];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[pid] = { price: value, valid: value >= MIN_VALID_PRICE };
    }
  }
  return out;
}

const players = raw.players.map(p => {
  const id = String(p.id ?? p.slug ?? '');
  const meta = ledgerById.get(id) || null;
  const rng = rangeById.get(id) || null;
  const platforms = latestPlatformPricesOf(rng, platformPricesOf(p));
  const validPlatformPrices = Object.values(platforms).filter(cell => cell.valid).map(cell => cell.price);
  const rawPrice = typeof p.currentPrice === 'number' && Number.isFinite(p.currentPrice) ? p.currentPrice : null;
  const price = validPlatformPrices.length ? Math.max(...validPlatformPrices) : rawPrice;
  const priceValid = validPlatformPrices.length > 0 || (price !== null && price >= MIN_VALID_PRICE);
  return {
    id,
    slug: p.slug || '',
    nameZh: p.nameZh || meta?.nameZh || p.name || '',
    name: p.name || '',
    rating: typeof p.rating === 'number' ? p.rating : null,
    pos: positionOf(p, meta),
    altPos: Array.isArray(meta?.altPos) ? meta.altPos.filter(Boolean) : [],
    six: meta?.six || null,
    goldPlaystyles: (meta?.playstyles || []).filter(s => s && s.gold).map(s => s.name),
    skills: meta?.skills ?? null,
    weakFoot: meta?.weakFoot ?? null,
    price,
    priceValid,
    platforms,
    // 价格区间：卡级字段（FUTBIN 同一卡的 Console / PC 渲染同值），缺失为 null
    priceRange: rng ? { min: rng.priceRange.min, max: rng.priceRange.max, updatedText: rng.priceRange.updatedText || null, fetchedAt: rng.fetchedAt || null } : null,
    marketUrl: p.marketUrl || '',
  };
}).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || String(a.nameZh).localeCompare(String(b.nameZh), 'zh'));

const validCount = players.filter(p => p.priceValid).length;
const platformValidCount = Object.fromEntries(Object.keys(PLATFORM_KEYS).map(pid => [pid, players.filter(p => p.platforms[pid]?.valid).length]));
// priceBasis 按**当日实测有效价**判定（2026-09-20 用户口径），不再按「日期 < launchDate」一刀切。
// 词表与市场侧统一：listing-estimate（全无有效价，全是占位/估值）| partial-live（已有部分有效价）。
const priceBasis = validCount > 0 ? 'partial-live' : 'listing-estimate';

// 区间覆盖统计：用于监控页如实说明「有多少张卡拿到了最低价/最高价」
const withRange = players.filter(p => p.priceRange && typeof p.priceRange.min === 'number' && typeof p.priceRange.max === 'number');
const rangeMins = withRange.map(p => p.priceRange.min);
const rangeMaxs = withRange.map(p => p.priceRange.max);

const snapshot = {
  schemaVersion: 1,
  date: dateStr,
  game: 'fc27',
  cardType: 'icon',
  cardLabel: '基础传奇',
  platform: raw.platform || 'console+pc',
  platforms: Object.keys(PLATFORM_KEYS),
  launchDate,
  capturedAt: rangeIsCurrentDate && rangeCollectedAt ? rangeCollectedAt : (raw.generatedAt || new Date().toISOString()),
  recordedAt: new Date().toISOString(),
  priceBasis,
  priceBasisNote: priceBasis === 'listing-estimate'
    ? `本日（${dateStr}）${players.length} 张传奇卡全部无平台级有效价（均 <1000 coins），FUTBIN 仅有列表页占位/估算值，不是市场成交价，不得据此计算日环比与累计涨跌。`
    : `本日（${dateStr}）${validCount}/${players.length} 张拿到平台级有效价（≥1000 coins），属 FUTBIN 当日挂单/估价口径。`,
  counts: { total: players.length, valid: validCount, missing: players.length - validCount, platformValid: platformValidCount },
  priceRange: {
    scope: 'card',
    scopeNote: 'FUTBIN 详情页「Price Range」为卡级字段（同一张卡的 Console / PC 价格盒渲染同值），不按平台拆分。',
    withRange: withRange.length,
    missing: players.length - withRange.length,
    minFloor: rangeMins.length ? Math.min(...rangeMins) : null,
    maxCeiling: rangeMaxs.length ? Math.max(...rangeMaxs) : null,
    collectedAt: rangeCollectedAt,
    sourceFile: existsSync(PRICERANGE_PATH) ? path.relative(ROOT, PRICERANGE_PATH) : null,
  },
  source: {
    name: 'FUTBIN',
    listUrl: 'https://www.futbin.com/27/players',
    rawFile: path.relative(ROOT, RAW_PATH),
    capturedAt: rangeIsCurrentDate && rangeCollectedAt ? rangeCollectedAt : (raw.generatedAt || null),
    note: rangeIsCurrentDate && rangeCollectedAt
      ? `双平台当前价与价格区间来自详情页采集（每 4 小时一轮）；名单与静态字段来自 ${path.relative(ROOT, RAW_PATH)}。`
      : (raw.source ? `原始抓取来源：${raw.source}` : ''),
  },
  players,
};

const target = path.join(DAILY_DIR, `${dateStr}.json`);
const existed = existsSync(target);
atomicWrite(target, JSON.stringify(snapshot, null, 2) + '\n');

console.log(`传奇卡快照已写入: ${path.relative(ROOT, target)}${existed ? '（同日重跑，已覆盖当日快照）' : ''}`);
console.log(`  卡数 ${players.length} · 有效价格 ${validCount} · 口径 ${priceBasis} · 开服日 ${launchDate}`);
// 平台有效价提示必须按当日实测走，不能写死「均为 0」：FUTBIN 会在开服初期滚动放出部分平台价
const anyPlatformValid = platformValidCount.console > 0 || platformValidCount.pc > 0;
console.log(`  平台有效价：Console ${platformValidCount.console} / PC ${platformValidCount.pc}（${anyPlatformValid
  ? 'FUTBIN 已开始滚动放出部分平台价，其余为 0 按占位值处理'
  : '两平台均无有效价（全为 0 占位），属预期'}）`);
console.log(`  价格区间（最低价-最高价，卡级）：${withRange.length}/${players.length} 张${rangeCollectedAt ? ` · 采集于 ${rangeCollectedAt}` : ' · 未找到价格区间任务采集结果'}`);
const days = existsSync(DAILY_DIR) ? readdirSync(DAILY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length : 0;
console.log(`  历史快照累计天数: ${days}`);
