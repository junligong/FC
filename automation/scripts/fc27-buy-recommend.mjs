#!/usr/bin/env node
/**
 * FC27 球员价格 × FC26 历史价格对照 与 购买推荐分级分析
 *
 * 用途：把 FC27 当前行情（current.json，开服前 partial-live / listing-estimate 口径）与
 *       FC26 历史行情（金卡 fc26-first-month、传奇 base-icons、英雄 base-heroes）逐卡对照，
 *       按「有效价 + FC26 开服价 + FC26 首月末价」计算折价比与走势，输出购买推荐分级名单。
 *
 * 输入：
 *   - FC27 当前价：apps/market/engine/data/prices/fc27/current.json（按 cardId，含 console/pc 双平台）
 *   - FC27 卡库：shared/data/fc27/players.json（canonical，含 nameZh/头像/位置/俱乐部等静态字段）
 *   - FC26 金卡：apps/market/engine/gold/data/prices/fc26/fc26-first-month.json（prices.cross 首日=开服价）
 *   - FC26 传奇：apps/market/engine/icons/data/prices/fc26/base-icons.json
 *   - FC26 英雄：apps/market/engine/heroes/data/prices/fc26/base-heroes.json
 *
 * 输出：
 *   - automation/runs/<DATE>/analysis/fc27-buy-recommend.json   结构化推荐结果（可复核）
 *
 * 口径说明：
 *   - FC27 未开服（launchDate=2026-09-25），FUTBIN 当前价为估值/部分实况滚动价，价格 < minValidPrice(1000)
 *     视为占位值（valid=false），不参与推荐判定；本任务不计算 FC27 日环比与累计涨跌。
 *   - FC26 开服价为该卡 FC26 开服日（2025-09-18）Console（PS/Xbox 合并）均价（prices.cross 首日值）；
 *     FC26 首月末价为 2025-10-17（首月第 30 天）cross 价。
 *   - 关联键：FUTBIN slug（FC27 current.json 与 FC26 各文件均有 slug；players.json 亦有 slug）。
 *   - 推荐分级：参考价 = FC27 两平台有效价较大者；折价比 = FC27 参考价 / FC26 开服价；
 *     走势比 = FC26 首月末价 / FC26 开服价。仅 FC27 参考价有效（>=1000）且 FC26 开服价有效（>0）的卡参与分级。
 *   - 本脚本为分析研究用途，不构成任何投资或交易建议。
 *
 * 用法：node automation/scripts/fc27-buy-recommend.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');

const MIN_VALID_PRICE = 1000;
const FC27_LAUNCH_DATE = '2026-09-25';
const FC26_LAUNCH_DATE = '2025-09-18';
const FC26_MONTH_END_DATE = '2025-10-17';

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const DATE = isDate(process.argv[2]) ? process.argv[2] : todayShanghai();

const CUR_PATH = path.join(ROOT, 'apps/market/engine/data/prices/fc27/current.json');
const PLAYERS_PATH = path.join(ROOT, 'shared/data/fc27/players.json');
const FC26_GOLD = path.join(ROOT, 'apps/market/engine/gold/data/prices/fc26/fc26-first-month.json');
const FC26_ICON = path.join(ROOT, 'apps/market/engine/icons/data/prices/fc26/base-icons.json');
const FC26_HERO = path.join(ROOT, 'apps/market/engine/heroes/data/prices/fc26/base-heroes.json');
const OUT_DIR = path.join(ROOT, 'automation/runs', DATE, 'analysis');
const OUT_PATH = path.join(OUT_DIR, 'fc27-buy-recommend.json');

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { console.error(`无法读取 ${p}: ${e.message}`); process.exit(1); } };

function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

// ---------- 1. 载入数据 ----------
const current = readJSON(CUR_PATH);
const playersDb = readJSON(PLAYERS_PATH);
const fc26Gold = readJSON(FC26_GOLD);
const fc26Icon = readJSON(FC26_ICON);
const fc26Hero = readJSON(FC26_HERO);

const playersBySlug = new Map();
for (const p of playersDb.players || []) {
  if (!playersBySlug.has(p.slug)) playersBySlug.set(p.slug, []);
  playersBySlug.get(p.slug).push(p);
}

// FC26：按 slug 聚合三个来源的开服价与首月末价
function fc26Series(file) {
  const out = new Map();
  for (const p of file.players || []) {
    const cross = (p.prices && (p.prices.cross || p.prices.console)) || {};
    const launch = cross[FC26_LAUNCH_DATE];
    const monthEnd = cross[FC26_MONTH_END_DATE];
    const days = Object.keys(cross).filter(d => typeof cross[d] === 'number' && cross[d] > 0).sort();
    const vals = days.map(d => cross[d]);
    out.set(String(p.slug || ''), {
      id: String(p.id || ''),
      slug: p.slug || '',
      rating: p.rating ?? null,
      launchPrice: typeof launch === 'number' ? launch : null,
      monthEndPrice: typeof monthEnd === 'number' ? monthEnd : null,
      monthMin: vals.length ? Math.min(...vals) : null,
      monthMax: vals.length ? Math.max(...vals) : null,
      days: days.length,
    });
  }
  return out;
}
const fc26BySlug = new Map([
  ...fc26Series(fc26Gold).entries(),
  ...fc26Series(fc26Icon).entries(),
  ...fc26Series(fc26Hero).entries(),
]);
// 标注来源类别（金/传奇/英雄）
const goldSlugs = new Set((fc26Gold.players || []).map(p => String(p.slug)));
const iconSlugs = new Set((fc26Icon.players || []).map(p => String(p.slug)));
const heroSlugs = new Set((fc26Hero.players || []).map(p => String(p.slug)));
const fc26Kind = slug => goldSlugs.has(slug) ? 'gold' : iconSlugs.has(slug) ? 'icon' : heroSlugs.has(slug) ? 'hero' : null;

// ---------- 2. 逐卡对照 ----------
const rows = [];
let withValidFC27 = 0, matchedFC26 = 0;
for (const [cardId, card] of Object.entries(current.cards || {})) {
  const cp = card.platforms?.console;
  const pp = card.platforms?.pc;
  const cOk = cp && cp.valid && typeof cp.price === 'number' && cp.price >= MIN_VALID_PRICE;
  const pOk = pp && pp.valid && typeof pp.price === 'number' && pp.price >= MIN_VALID_PRICE;
  if (!cOk && !pOk) continue; // 无有效价不参与
  withValidFC27++;

  const refPrice = cOk && pOk ? Math.max(cp.price, pp.price) : cOk ? cp.price : pp.price;
  const slug = String(card.slug || '');
  const f26 = fc26BySlug.get(slug) || null;
  const metaArr = playersBySlug.get(slug) || [];
  // 优先取与 cardId 一致的卡记录；无 cardId 匹配时取第一条
  const meta = metaArr.find(m => String(m.cardId) === String(cardId)) || metaArr[0] || null;

  if (f26) matchedFC26++;

  let ratio = null, trend = null, grade = 'NA', gradeReason = '';
  if (f26 && f26.launchPrice > 0) {
    ratio = refPrice / f26.launchPrice;
    trend = f26.monthEndPrice != null && f26.launchPrice > 0 ? f26.monthEndPrice / f26.launchPrice : null;
    if (f26.launchPrice >= MIN_VALID_PRICE) {
      if (ratio <= 0.6 && trend !== null && trend >= 0.7) { grade = 'S'; gradeReason = 'FC27 参考价 ≤ FC26 开服价 60%，且 FC26 首月走势未跌破 70%，历史参照偏贵当前偏低估'; }
      else if (ratio <= 0.8 && trend !== null && trend >= 0.5) { grade = 'A'; gradeReason = 'FC27 参考价 ≤ FC26 开服价 80%，且 FC26 首月未深跌（≥50%），估值相对历史偏低'; }
      else if (ratio <= 1.0) { grade = 'B'; gradeReason = 'FC27 参考价接近 FC26 开服价（≤100%），估值中性偏谨慎'; }
      else { grade = 'C'; gradeReason = 'FC27 参考价高于 FC26 开服价，当前估值相对历史偏贵'; }
      if (grade !== 'NA' && trend === null) { grade = 'B'; gradeReason = 'FC26 有开服价但无首月末价，按中性处理'; }
    } else {
      grade = 'NA'; gradeReason = 'FC26 开服价低于下限，参照不可靠';
    }
  } else {
    grade = 'NA'; gradeReason = f26 ? 'FC26 无开服价数据' : 'FC26 无该卡对照数据';
  }

  rows.push({
    cardId: String(cardId),
    playerId: meta?.playerId ?? meta?.resourceId ?? null,
    slug,
    cardType: card.cardType || meta?.cardType || meta?.version || null,
    version: meta?.version || null,
    name: card.name || meta?.name || null,
    // 中文名以 canonical players.json 词库为唯一权威；current.json 内嵌译名只作后备
    nameZh: meta?.nameZh || card.nameZh || null,
    translationStatus: meta?.translationStatus || null,
    rating: card.rating ?? meta?.rating ?? null,
    position: card.position || meta?.position || null,
    positions: meta?.positions || null,
    club: meta?.club || null,
    league: meta?.league || null,
    nation: meta?.nation || null,
    playstyles: meta?.playstyles || null,
    skillMoves: meta?.skillMoves ?? null,
    weakFoot: meta?.weakFoot ?? null,
    avatarPath: meta?.avatarPath || null,
    futbinUrl: meta?.futbinUrl || card.url || null,
    fc27: {
      console: cOk ? { price: cp.price, observedAt: cp.observedAt || null } : null,
      pc: pOk ? { price: pp.price, observedAt: pp.observedAt || null } : null,
      refPrice,
      updatedAt: card.updatedAt || null,
      popularity: card.popularity ?? null,
    },
    fc26: f26 ? {
      kind: fc26Kind(f26.slug),
      id: f26.id,
      slug: f26.slug,
      launchPrice: f26.launchPrice,
      monthEndPrice: f26.monthEndPrice,
      monthMin: f26.monthMin,
      monthMax: f26.monthMax,
      days: f26.days,
    } : null,
    ratio,      // FC27 参考价 / FC26 开服价
    trend,      // FC26 首月末价 / FC26 开服价
    grade,
    gradeReason,
    priceBasis: current.game ? (current.sources ? Object.keys(current.sources) : []) : [],
    fetchedAt: current.generatedAt || null,
    fc27LaunchDate: FC27_LAUNCH_DATE,
    fc26LaunchDate: FC26_LAUNCH_DATE,
  });
}

// ---------- 3. 排序与统计 ----------
rows.sort((a, b) => {
  const rank = { S: 0, A: 1, B: 2, C: 3, NA: 4 };
  const d = rank[a.grade] - rank[b.grade];
  if (d !== 0) return d;
  return (b.fc27.refPrice || 0) - (a.fc27.refPrice || 0);
});

const counts = {
  totalCardsWithValidPrice: withValidFC27,
  matchedFC26,
  byGrade: {},
  byKind: {},
};
for (const r of rows) {
  counts.byGrade[r.grade] = (counts.byGrade[r.grade] || 0) + 1;
  const kind = r.fc26?.kind || 'no-fc26';
  counts.byKind[kind] = (counts.byKind[kind] || 0) + 1;
}

const recommended = rows.filter(r => r.grade === 'S' || r.grade === 'A');
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  analysisDate: DATE,
  fc27LaunchDate: FC27_LAUNCH_DATE,
  fc26LaunchDate: FC26_LAUNCH_DATE,
  minValidPrice: MIN_VALID_PRICE,
  priceBasis: 'listing-estimate / partial-live（FC27 未开服，不计算日环比与累计涨跌）',
  disclaimer: '本报告仅作跨代价格与市场研究参考，FC26 历史价格不代表 FC27 会重演，不构成任何投资或交易建议。',
  counts,
  recommendedCount: recommended.length,
  recommendations: recommended,
  all: rows,
};

atomicWrite(OUT_PATH, JSON.stringify(result, null, 2));
console.log(`已写入 ${OUT_PATH}`);
console.log(JSON.stringify({ withValidFC27, matchedFC26, byGrade: counts.byGrade, byKind: counts.byKind, recommended: recommended.length }, null, 2));