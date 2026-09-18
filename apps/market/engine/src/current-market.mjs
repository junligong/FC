// 用途：维护 FC27 唯一的“当前行情”主表，按 cardId 合并不同采集器的最新值，并同步网页运行时读取的 JSON 资源。
// 输入：市场热门榜、传奇详情页等采集器传入的卡级增量记录。
// 输出：apps/market/engine/data/prices/fc27/current.json，以及 reports/daily/D/assets/data/current.json 和 daily-merged/assets/data/current.json。
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = process.env.FC_PROJECT_ROOT || path.resolve(HERE, '../../../..');
export const CURRENT_MARKET_PATH = process.env.FC_CURRENT_MARKET
  || path.join(PROJECT_ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27', 'current.json');
export const MIN_VALID_PRICE = 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

export function cardIdFromUrl(value) {
  return String(value || '').match(/\/player\/([^/?#]+)/)?.[1] || null;
}

export function readCurrentMarket(file = CURRENT_MARKET_PATH) {
  return readJSON(file) || {
    schemaVersion: 1,
    game: 'fc27',
    generatedAt: null,
    minValidPrice: MIN_VALID_PRICE,
    cards: {},
  };
}

function atomicWrite(target, value) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  renameSync(tmp, target);
}

async function acquireLock(lockPath) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let i = 0; i < 100; i++) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeFileSync(fd, `${process.pid}\n`);
      closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 120000) unlinkSync(lockPath);
      } catch { /* 另一进程刚好释放锁 */ }
      await sleep(50);
    }
  }
  throw new Error(`等待当前行情写锁超时：${lockPath}`);
}

function newerOrEqual(incoming, existing) {
  if (!existing) return true;
  if (!incoming) return false;
  const incomingMs = Date.parse(incoming);
  const existingMs = Date.parse(existing);
  if (Number.isFinite(incomingMs) && Number.isFinite(existingMs)) return incomingMs >= existingMs;
  return String(incoming) >= String(existing);
}

function mergePlatform(previous, incoming, observedAt, source) {
  if (!incoming || !newerOrEqual(observedAt, previous?.observedAt)) return previous || null;
  const price = typeof incoming.price === 'number' && Number.isFinite(incoming.price) ? incoming.price : null;
  return {
    price,
    valid: price !== null && price >= MIN_VALID_PRICE,
    observedAt,
    source,
  };
}

function mergeCard(previous, patch, source, observedAt) {
  const next = {
    ...(previous || {}),
    cardId: String(patch.cardId),
    slug: patch.slug || previous?.slug || '',
    url: patch.url || previous?.url || '',
    name: patch.name || previous?.name || '',
    nameZh: patch.nameZh || previous?.nameZh || '',
    rating: patch.rating ?? previous?.rating ?? null,
    position: patch.position || previous?.position || '',
    cardType: patch.cardType || previous?.cardType || '',
    updatedAt: newerOrEqual(observedAt, previous?.updatedAt) ? observedAt : previous?.updatedAt,
  };
  if (patch.platforms) {
    next.platforms = { ...(previous?.platforms || {}) };
    for (const pid of ['console', 'pc']) {
      next.platforms[pid] = mergePlatform(previous?.platforms?.[pid], patch.platforms[pid], observedAt, source);
    }
  }
  if (patch.priceRange && newerOrEqual(observedAt, previous?.priceRange?.observedAt)) {
    next.priceRange = {
      min: typeof patch.priceRange.min === 'number' ? patch.priceRange.min : null,
      max: typeof patch.priceRange.max === 'number' ? patch.priceRange.max : null,
      scope: 'card',
      observedAt,
      source,
    };
  }
  if (Object.hasOwn(patch, 'popularity') && newerOrEqual(observedAt, previous?.popularityObservedAt)) {
    next.popularity = typeof patch.popularity === 'number' ? patch.popularity : null;
    next.popularityObservedAt = observedAt;
    next.popularitySource = source;
  }
  return next;
}

export async function mergeCurrentMarket(records, { source, observedAt = new Date().toISOString(), date = null } = {}) {
  if (!source) throw new TypeError('mergeCurrentMarket 需要 source');
  const clean = (records || []).filter(record => record && record.cardId !== null && record.cardId !== undefined);
  const lockPath = `${CURRENT_MARKET_PATH}.lock`;
  await acquireLock(lockPath);
  try {
    const document = readCurrentMarket();
    document.schemaVersion = 1;
    document.game = 'fc27';
    document.generatedAt = new Date().toISOString();
    document.minValidPrice = MIN_VALID_PRICE;
    document.cards = document.cards || {};
    for (const record of clean) {
      const key = String(record.cardId);
      document.cards[key] = mergeCard(document.cards[key], record, source, observedAt);
    }
    document.sources = { ...(document.sources || {}), [source]: { observedAt, date, cards: clean.length } };
    atomicWrite(CURRENT_MARKET_PATH, document);
    return document;
  } finally {
    try { unlinkSync(lockPath); } catch { /* 已释放 */ }
  }
}

export function syncCurrentMarketAssets(date, { root = PROJECT_ROOT } = {}) {
  if (!existsSync(CURRENT_MARKET_PATH)) return [];
  const targets = [
    path.join(root, 'reports', 'daily', date, 'assets', 'data', 'current.json'),
    path.join(root, 'daily-merged', 'assets', 'data', 'current.json'),
  ];
  for (const target of targets) {
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(CURRENT_MARKET_PATH, target);
  }
  return targets;
}
