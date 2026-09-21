/**
 * 价格序列存储层（series/*.json）—— 单文件累积，静态字段只存一次
 * ============================================================================
 * 2026-09-20 重构。此前每次采集都写一份「逐小时全量快照」：
 *   popular/hourly/<D>T<HH>.json、evolutions/hourly/<D>T<HH>.json、pricerange/hourly/<D>T<HH>.json
 * 每份都把卡片的**静态字段**（url/name/rating/pos/stats…）完整重复一遍，
 * 实测 popular 每份 46 KB 静态 + 22 KB 动态（静态是动态的 2.1 倍），
 * evolutions 每份 70 KB 静态 + 8 KB 动态（8.6 倍），全量历史 10.7 MB 里大半是重复。
 *
 * 新结构：每个数据族一个文件，静态字段在 cards[key] 下只存一次，
 * 每张卡下挂 `price[]` 数组，**一行一个观测点**（按小时），行内只放**随卡变化的**当次动态量：
 *   { h, ps, pc, pop, min, max }                     市场族（popular / evolutions；evolutions 只有 h/pop）
 *   { h, ps, pc, min, max, rmin, rmax, est }         传奇族（icons；采集失败时额外带 err）
 * 其中 h = 小时键 `YYYY-MM-DDTHH`（即"获取时间"到小时粒度）、
 * ps/pc = Console/PC 平台价、pop = 热度、min/max = 当次观测到的最低/最高有效价、
 * rangeMin/rangeMax（序列里写作 rmin/rmax）= FUTBIN 详情页 Price Range（卡级区间，仅传奇族）、
 * est = 列表页 IS 估值。
 *
 * 为什么行内**没有**精确到秒的 `at`：同一观测点内所有行的 `at` 完全相同，
 * 逐行重复正是本模块要消除的冗余（实测约 1.35 MB）。精确时间在同文件的 `points[]` 里
 * 按小时给出（`points[].at`），用 `h` 关联即可；`h` 本身已经是一次观测的时间标识。
 * 反之 `min/max` 逐卡不同，属于"随卡变化的量"，留在行内。
 *
 * 序列化：手写「混合缩进」——顶层字段、points 每项、cards 每个键、每行 price 各占一行，
 * 行内紧凑。既可 grep/diff（一行 = 一次观测），又比 pretty-print 省约 35% 体积。
 *
 * 落盘用 `atomicWrite`（写临时文件 + rename）。本模块**只负责序列的读写与装配**，
 * 不关心采集通道；`latest.json` 等「当前值」缓存仍由各采集器自行写出（见其文件头注释）。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

/** 序列文件版本。字段语义变化时递增，并在 AGENTS.md 同步。 */
export const SERIES_SCHEMA_VERSION = 2;

export const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

export function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

/** `${priceRoot}/series/${name}.json` */
export const seriesPathFor = (root, name) => path.join(root, 'series', `${name}.json`);

/** 空序列骨架 */
export function emptySeries({ scope, ...meta } = {}) {
  return {
    schemaVersion: SERIES_SCHEMA_VERSION,
    scope: scope || null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    points: [],
    cards: {},
    ...meta,
  };
}

export function readSeries(file) {
  const raw = readJSON(file);
  if (!raw || typeof raw !== 'object') return null;
  raw.points = Array.isArray(raw.points) ? raw.points : [];
  raw.cards = raw.cards && typeof raw.cards === 'object' ? raw.cards : {};
  return raw;
}

/**
 * 混合缩进序列化：顶层字段 / points 每项 / cards 每键 / 每行 price 各占一行。
 * 关键不变量：`JSON.parse(serializeSeries(x))` 必须深等于 `x`（见 price-series.test.mjs）。
 */
export function serializeSeries(series) {
  const { cards = {}, points = [], ...head } = series;
  const out = ['{'];
  for (const [k, v] of Object.entries(head)) out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  out.push('  "points": [');
  points.forEach((p, i) => out.push(`    ${JSON.stringify(p)}${i === points.length - 1 ? '' : ','}`));
  out.push('  ],');
  out.push('  "cards": {');
  const keys = Object.keys(cards);
  keys.forEach((k, i) => {
    const card = cards[k] || {};
    const tail = i === keys.length - 1 ? '' : ',';
    // 没有 price 键的卡原样输出，保证 `JSON.parse(serializeSeries(x))` 与 x 严格深等
    if (!Array.isArray(card.price)) { out.push(`    ${JSON.stringify(k)}: ${JSON.stringify(card)}${tail}`); return; }
    const { price, ...stat } = card;
    const statJson = JSON.stringify(stat);
    // statJson 形如 {...}；剥掉尾部 } 后接上 ,"price":[
    const prefix = statJson === '{}' ? '{' : `${statJson.slice(0, -1)},`;
    out.push(`    ${JSON.stringify(k)}: ${prefix}"price": [`);
    price.forEach((r, j) => out.push(`      ${JSON.stringify(r)}${j === price.length - 1 ? '' : ','}`));
    out.push(`    ]}${tail}`);
  });
  out.push('  }');
  out.push('}');
  return `${out.join('\n')}\n`;
}

/**
 * 追加一次观测。
 *
 * @param {string} file 序列文件路径
 * @param {object} opts
 * @param {object} [opts.meta]      顶层字段（scope/game/sourceUrl/launchDate/minValidPrice…），undefined 不覆盖
 * @param {object} [opts.point]     本次观测点，按 `point.hour` 覆盖同小时（形如 { hour, date, at, counts, priceBasis }）
 * @param {Array}  [opts.entries]   [{ key, static, price }]；static 按字段合并且 undefined 不覆盖；price 按 `price.h` 覆盖同小时
 * @param {number} [opts.maxRowsPerCard] 单卡最多保留的观测行数（0 = 不限；裁剪只从最旧一端丢）
 * @returns {object} 写盘后的序列对象
 */
export function appendSeries(file, { meta = {}, point = null, entries = [], maxRowsPerCard = 0 } = {}) {
  const series = readSeries(file) || emptySeries(meta.scope ? { scope: meta.scope } : {});
  series.schemaVersion = SERIES_SCHEMA_VERSION;
  for (const [k, v] of Object.entries(meta)) if (v !== undefined) series[k] = v;
  series.updatedAt = new Date().toISOString();

  if (point) {
    const id = point.hour;
    series.points = series.points.filter(p => p.hour !== id).concat([point]);
    series.points.sort((a, b) => String(a.hour).localeCompare(String(b.hour)));
  }

  for (const e of entries) {
    const card = series.cards[e.key] || { price: [] };
    for (const [k, v] of Object.entries(e.static || {})) if (v !== undefined) card[k] = v;
    // price 可能位于 key 之前写入的对象里；解构后重新挂回
    const rows = Array.isArray(card.price) ? card.price : [];
    const at = e.price.h;
    const next = rows.filter(r => r.h !== at).concat([e.price]).sort((a, b) => String(a.h).localeCompare(String(b.h)));
    delete card.price;
    card.price = maxRowsPerCard > 0 && next.length > maxRowsPerCard ? next.slice(next.length - maxRowsPerCard) : next;
    series.cards[e.key] = card;
  }

  atomicWrite(file, serializeSeries(series));
  return series;
}

/** 最近一个观测点；给了 date 则取该日最后一个（当日无观测返回 null） */
export function latestPoint(series, date = null) {
  const pts = (series && series.points) || [];
  const scoped = date ? pts.filter(p => p.date === date) : pts;
  return scoped.length ? scoped[scoped.length - 1] : null;
}

/** 某日的全部观测点（HH 升序） */
export const pointsOf = (series, date) => ((series && series.points) || []).filter(p => p.date === date);

/**
 * 还原「一次全量快照」的旧形状（= 采集器写出的 latest.json / hourly 快照）：
 * { date, hour, collectedAt, sourceUrl, platform, priceBasis, minValidPrice, counts, cards:[...] }
 * `cards` 按静态字段 + 该小时的动态量拼回，字段名与 collect-market-prices.mjs 的 compactCards 一致。
 */
export function snapshotFrom(series, { date = null, withPrice = true, shape = 'market' } = {}) {
  const point = latestPoint(series, date);
  if (!point) return null;
  const cards = [];
  for (const [key, card] of Object.entries((series && series.cards) || {})) {
    const row = (card.price || []).find(r => r.h === point.hour);
    if (!row) continue;
    const stat = { ...card };
    delete stat.price;
    if (shape === 'evolution') {
      cards.push({ ...stat, popularity: row.pop });
      continue;
    }
    cards.push(withPrice
      ? { ...stat, psPrice: row.ps, pcPrice: row.pc, popularity: row.pop }
      : { ...stat, popularity: row.pop });
  }
  return {
    schemaVersion: SERIES_SCHEMA_VERSION,
    date: point.date,
    hour: point.hour,
    collectedAt: point.at,
    sourceUrl: (series && series.sourceUrl) || null,
    platform: (series && series.platform) || 'console+pc',
    priceBasis: point.priceBasis ?? null,
    minValidPrice: (series && series.minValidPrice) ?? null,
    attempts: point.attempts ?? null,
    counts: point.counts ?? null,
    cards,
  };
}

/**
 * 还原「当日合并序列」的旧形状（= 旧 popular/daily/<D>.json），
 * 供 build-market-watchlist.mjs 与 render-database-columns.mjs 的逐轮曲线使用：
 *   { date, platform, points:[{hour,collectedAt,counts}], cards:{ <url>: {name,rating,pos,evoName,ps:[{h,v}],pc:[{h,v}],pop:[{h,v}]} } }
 *
 * **注意 `hour` / `h` 只取两位小时 `'HH'`**——这是旧契约的既有格式（消费方把它当 fromHour 展示），
 * 序列内部用的是 `YYYY-MM-DDTHH`；适配器负责截断，保持消费方零改动。
 */
export function dailyFrom(series, date) {
  const pts = pointsOf(series, date);
  if (!pts.length) return null;
  const shortHour = hour => String(hour).slice(11, 13);
  const hours = new Set(pts.map(p => p.hour));
  const cards = {};
  for (const [url, card] of Object.entries((series && series.cards) || {})) {
    const rows = (card.price || []).filter(r => hours.has(r.h));
    if (!rows.length) continue;
    const entry = { name: card.name, rating: card.rating, pos: card.pos, evoName: card.evoName || null, ps: [], pc: [], pop: [] };
    const put = (arr, r, v) => { if (v !== undefined && v !== null) arr.push({ h: shortHour(r.h), v }); };
    for (const r of rows) { put(entry.ps, r, r.ps); put(entry.pc, r, r.pc); put(entry.pop, r, r.pop); }
    cards[url] = entry;
  }
  return {
    date,
    platform: (series && series.platform) || 'console+pc',
    points: pts.map(p => ({ hour: shortHour(p.hour), collectedAt: p.at, counts: p.counts ?? null })),
    cards,
  };
}
