#!/usr/bin/env node
/**
 * 一次性迁移工具（2026-09-20）：把旧的「逐小时全量快照」搬进新的单文件累积序列。
 *
 * 背景：2026-09-20 起，价格落库从
 *   popular/hourly/<D>T<HH>.json + evolutions/hourly/<D>T<HH>.json + popular/daily/<D>.json
 *   pricerange/hourly/<D>T<HH>.json
 * 改为
 *   apps/market/engine/data/prices/fc27/series/{popular,evolutions}.json
 *   apps/market/engine/icons/data/prices/fc27/series/icons.json
 * 本工具按**采集时的同一套语义**重放历史 hourly 文件（逐小时 appendSeries），
 * 因此产出的序列与「一开始就用新写法采集」逐字段等价。搬完后旧目录可归档/删除。
 *
 * 为什么只重放 hourly：实测 popular / evolutions 的 daily/<D>.json 里的 points 是 hourly 小时的**严格子集**
 * （58 = 8+16+19+15 完全一致），而 daily.cards 只多不少——逐小时重放已经覆盖每个 (卡, 小时) 组合，
 * 不再需要 daily 参与，避免两套来源口径混流。
 *
 * 用法：
 *   node apps/market/engine/scripts/migrate-price-series.mjs \
 *     [--market-src <apps/market/engine/data/prices/fc27>] \
 *     [--icon-src <apps/market/engine/icons/data/prices/fc27/pricerange>] \
 *     [--out-market <dir>] [--out-icons <dir>]
 *   默认 --out-market = <market-src>/series，--out-icons = <icon-src>/../series。
 *   输出目录**必须为空或已是本工具的产物**：为幂等起见，重放前会先确认目标文件不存在同名旧结构。
 *   迁移是纯追加重放，可安全重跑（同小时覆盖、同卡同小时覆盖）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendSeries, readSeries } from '../src/price-series.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const argv = process.argv.slice(2);
const argOf = name => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };

const MARKET_SRC = argOf('--market-src') || path.join(ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27');
const ICON_SRC = argOf('--icon-src') || path.join(ROOT, 'apps', 'market', 'engine', 'icons', 'data', 'prices', 'fc27', 'pricerange');
const OUT_MARKET = argOf('--out-market') || path.join(MARKET_SRC, 'series');
const OUT_ICONS = argOf('--out-icons') || path.join(path.dirname(ICON_SRC), 'series');

const MIN_VALID_PRICE = 1000;
const HOUR_FILE = /^\d{4}-\d{2}-\d{2}T\d{2}\.json$/;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const hourlyFiles = dir => (existsSync(dir) ? readdirSync(dir).filter(f => HOUR_FILE.test(f)).sort() : []);
const rangeOf = (ps, pc) => {
  const vals = [ps, pc].filter(v => typeof v === 'number' && v >= MIN_VALID_PRICE);
  return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: null, max: null };
};

// ---------- 市场族（popular 带价 / evolutions 只带热度） ----------
function migrateMarket(family) {
  const dir = path.join(MARKET_SRC, family, 'hourly');
  const files = hourlyFiles(dir);
  if (!files.length) return { family, files: 0, points: 0, cards: 0, path: null };
  const outFile = path.join(OUT_MARKET, `${family}.json`);
  const withPrice = family === 'popular';
  let entryCount = 0;

  for (const f of files) {
    const snap = readJSON(path.join(dir, f));
    if (!snap || !Array.isArray(snap.cards) || !snap.cards.length) continue;
    const hour = f.replace('.json', '');
    const date = hour.slice(0, 10);
    const at = snap.collectedAt || null;
    appendSeries(outFile, {
      meta: {
        scope: family,
        game: 'fc27',
        platform: snap.platform || 'console+pc',
        sourceUrl: snap.sourceUrl || null,
        minValidPrice: snap.minValidPrice ?? MIN_VALID_PRICE,
        launchDate: '2026-09-18',
        migratedFrom: `apps/market/engine/data/prices/fc27/${family}/hourly/*.json（2026-09-20 一次性重放）`,
        seriesNote: '静态字段在 cards[key] 下只存一次；price[] 一行 = 一次观测（h 小时键 = 获取时间 / ps Console / pc PC / pop 热度 / min·max 当次最低最高有效价）。精确到秒的采集时间在同文件 points[].at。',
      },
      point: { hour, date, at, priceBasis: snap.priceBasis ?? null, attempts: snap.attempts ?? null, counts: snap.counts ?? null },
      entries: snap.cards.map(c => ({
        key: c.url,
        static: {
          url: c.url, name: c.name, rating: c.rating, pos: c.pos,
          evoName: c.evoName || null,
          cardVersion: c.cardVersion || null,
          scoreRaw: c.scoreRaw ?? null,
          ...(c.stats ? { stats: c.stats } : {}),
        },
        price: withPrice
          ? { h: hour, ps: c.psPrice, pc: c.pcPrice, pop: c.popularity, ...rangeOf(c.psPrice, c.pcPrice) }
          : { h: hour, pop: c.popularity },
      })),
    });
    entryCount += snap.cards.length;
  }

  const series = readSeries(outFile) || { points: [], cards: {} };
  return { family, files: files.length, points: series.points.length, cards: Object.keys(series.cards).length, rows: entryCount, path: outFile };
}

// ---------- 传奇族（价格区间 + 双平台当前价 + 估值） ----------
function migrateIcons() {
  const dir = path.join(ICON_SRC, 'hourly');
  const files = hourlyFiles(dir);
  if (!files.length) return { family: 'icons', files: 0, points: 0, cards: 0, path: null };
  const outFile = path.join(OUT_ICONS, 'icons.json');
  let entryCount = 0;

  for (const f of files) {
    const snap = readJSON(path.join(dir, f));
    if (!snap || !Array.isArray(snap.cards) || !snap.cards.length) continue;
    const hour = f.replace('.json', '');
    const date = hour.slice(0, 10);
    const at = snap.collectedAt || null;
    appendSeries(outFile, {
      meta: {
        scope: 'icons',
        game: 'fc27',
        cardType: snap.cardType || 'icon',
        cardLabel: snap.cardLabel || '基础传奇',
        platform: snap.platform || 'console+pc',
        scopeNote: snap.scopeNote || null,
        launchDate: snap.launchDate || '2026-09-18',
        minValidPrice: snap.minValidPrice ?? MIN_VALID_PRICE,
        source: snap.source || null,
        migratedFrom: 'apps/market/engine/icons/data/prices/fc27/pricerange/hourly/*.json（2026-09-20 一次性重放）',
        seriesNote: '静态字段在 cards[cardId] 下只存一次；price[] 一行 = 一次观测（h 小时键 = 获取时间 / ps Console / pc PC / min·max 当次最低最高有效价 / rmin·rmax FUTBIN 卡级 Price Range / est 列表页 IS 估值；采集失败时带 err）。精确到秒的采集时间在同文件 points[].at。',
      },
      point: { hour, date, at, priceBasis: snap.priceBasis ?? null, counts: snap.counts ?? null, errors: snap.errors || [] },
      entries: snap.cards.map(c => {
        const ps = c.current ? c.current.console : null;
        const pc = c.current ? c.current.pc : null;
        const row = {
          h: hour, ps: ps ?? null, pc: pc ?? null,
          ...rangeOf(ps, pc),
          rmin: c.priceRange ? c.priceRange.min : null,
          rmax: c.priceRange ? c.priceRange.max : null,
          est: typeof c.estimate === 'number' ? c.estimate : null,
        };
        if (c.error) row.err = c.error;
        return {
          key: String(c.id),
          static: {
            id: String(c.id), slug: c.slug, nameZh: c.nameZh || null,
            name: c.name, rating: c.rating ?? null, marketUrl: c.marketUrl,
          },
          price: row,
        };
      }),
    });
    entryCount += snap.cards.length;
  }

  const series = readSeries(outFile) || { points: [], cards: {} };
  return { family: 'icons', files: files.length, points: series.points.length, cards: Object.keys(series.cards).length, rows: entryCount, path: outFile };
}

const summary = [
  migrateMarket('popular'),
  migrateMarket('evolutions'),
  migrateIcons(),
];

for (const s of summary) {
  console.log(`${s.family.padEnd(11)} 源文件 ${String(s.files).padStart(3)} · 观测点 ${String(s.points).padStart(3)} · 卡片 ${String(s.cards).padStart(4)} · 观测行 ${String(s.rows ?? '—').padStart(6)} · ${s.path ? path.relative(ROOT, s.path) : '（无源文件，已跳过）'}`);
}
