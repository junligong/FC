#!/usr/bin/env node
/**
 * FC27 基础传奇卡「逐日价格快照」记录器
 * 用途：把当天从 FUTBIN 抓到的 FC27 基础传奇卡价格固化为「一天一份」的不可变快照，
 *       供「传奇监控」页逐日比对全部传奇卡的价格变化。
 *       同日重跑只覆盖当天快照文件，绝不改动其他日期，也不清空历史。
 * 输入：
 *   apps/market/engine/icons/data/prices/fc27/base-icons.json     当日抓取原始结果（默认）
 *   apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json  卡库台账（位置/六维/特技）
 *   （可用 FC_ICON_RAW / FC_ICON_LEDGER 指定其他路径；FC_PROJECT_ROOT 指定项目根）
 * 输出：
 *   apps/market/engine/icons/data/prices/fc27/daily/<DATE>.json   当日快照（原子写入）
 * 平台口径：
 *   FUTBIN 只提供 Console（PS / Xbox 合并）与 PC 两个市场。原始抓取里 prices.console / prices.pc
 *   分别承载两平台价（历史文件用 prices.cross 表示 Console，本脚本兼容两种写法）。
 *   逐卡同时写入 platforms.console / platforms.pc，并保留 price（用于展示的当轮价）以便向后兼容。
 * 口径：
 *   date < launchDate（2026-09-25）时 FUTBIN 只有列表页占位/估算价，priceBasis 记为 listing-estimate；
 *   开服后记为 market。价格 < 1000 视为占位值而非有效市场价，priceValid=false。
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
const DAILY_DIR = path.join(ICON_DIR, 'data', 'prices', 'fc27', 'daily');

const FALLBACK_LAUNCH_DATE = '2026-09-25';
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

const players = raw.players.map(p => {
  const id = String(p.id ?? p.slug ?? '');
  const meta = ledgerById.get(id) || null;
  const price = typeof p.currentPrice === 'number' && Number.isFinite(p.currentPrice) ? p.currentPrice : null;
  const priceValid = price !== null && price >= MIN_VALID_PRICE;
  const platforms = platformPricesOf(p);
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
    marketUrl: p.marketUrl || '',
  };
}).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || String(a.nameZh).localeCompare(String(b.nameZh), 'zh'));

const validCount = players.filter(p => p.priceValid).length;
const platformValidCount = Object.fromEntries(Object.keys(PLATFORM_KEYS).map(pid => [pid, players.filter(p => p.platforms[pid]?.valid).length]));
const priceBasis = dateStr < launchDate ? 'listing-estimate' : 'market';

const snapshot = {
  schemaVersion: 1,
  date: dateStr,
  game: 'fc27',
  cardType: 'icon',
  cardLabel: '基础传奇',
  platform: raw.platform || 'console+pc',
  platforms: Object.keys(PLATFORM_KEYS),
  launchDate,
  capturedAt: raw.generatedAt || new Date().toISOString(),
  recordedAt: new Date().toISOString(),
  priceBasis,
  priceBasisNote: priceBasis === 'listing-estimate'
    ? `FC27 未开服（开服日 ${launchDate}），FUTBIN 仅提供列表页占位/估算价，不是市场成交价，不能当作行情信号。`
    : 'FC27 已开服，价格为 FUTBIN 当日成交价。',
  counts: { total: players.length, valid: validCount, missing: players.length - validCount, platformValid: platformValidCount },
  source: {
    name: 'FUTBIN',
    listUrl: 'https://www.futbin.com/27/players',
    rawFile: path.relative(ROOT, RAW_PATH),
    capturedAt: raw.generatedAt || null,
    note: raw.source ? `原始抓取来源：${raw.source}` : '',
  },
  players,
};

const target = path.join(DAILY_DIR, `${dateStr}.json`);
const existed = existsSync(target);
atomicWrite(target, JSON.stringify(snapshot, null, 2) + '\n');

console.log(`传奇卡快照已写入: ${path.relative(ROOT, target)}${existed ? '（同日重跑，已覆盖当日快照）' : ''}`);
console.log(`  卡数 ${players.length} · 有效价格 ${validCount} · 口径 ${priceBasis} · 开服日 ${launchDate}`);
console.log(`  平台有效价：Console ${platformValidCount.console} / PC ${platformValidCount.pc}（开服前两平台均为 0，属预期）`);
const days = existsSync(DAILY_DIR) ? readdirSync(DAILY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length : 0;
console.log(`  历史快照累计天数: ${days}`);
