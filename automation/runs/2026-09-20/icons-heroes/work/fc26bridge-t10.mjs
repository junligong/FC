// 一次性脚本（临时）：icons-pricerange-hourly 2026-09-20 T10 轮 FC26 跨代关联缺陷量化。
// 背景：FUTBIN 于 2026-09-20 T03 前后把 FC27 传奇卡 URL slug 从「全名式」换成「常用名式」，
//       build-icon-research.mjs 按 slug 精确关联 FC26（旧式全名 slug），因此静默丢失对照。
// 本脚本用「旧 slug」把这几张卡桥回 FC26，复算 condA/condB，给出修正后的投资建议数（只读，不改任何产物）。
// 全部按 cardId 关联；FC26 只做 slug 精确匹配（含连字符/空格两种书写变体），不做人名模糊匹配。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(...a);

const MIN_VALID_PRICE = 1000;

// cardId / 本轮(新) slug / 上一版(旧) slug —— 名单取自 T03 轮实测并逐张复核
const PAIRS = [
  [21488, 'pele', 'arantes-nascimento'],
  [21492, 'ronaldo', 'nazario-de-lima'],
  [21495, 'garrincha', 'franc-dos-santos'],
  [21501, 'ronaldinho', 'de-assis-moreira'],
  [21526, 'carlos-alberto-torres', 'torres'],
  [21531, 'zico', 'antunes-coimbra'],
  [21560, 'roberto-carlos-da-silva-rocha', 'da-silva-rocha'],
  [21567, 'rivaldo', 'borba-ferreira'],
  [21779, 'kaka', 'dos-santos-leite'],
  [21807, 'jairzinho', 'ventura-filho'],
  [21815, 'lucio', 'da-silva-ferreira'],
  [21829, 'socrates', 'vieira-de-oliveira'],
  [21839, 'marcelo', 'vieira-da-silva'],
  [21877, 'sissi', 'lima-do-amor'],
];

const fc26 = j('apps/market/engine/icons/data/prices/fc26/base-icons.json');
const fc26BySlug = new Map();
for (const p of (fc26.players || [])) {
  const series = (p.prices && (p.prices.cross || p.prices.console)) || {};
  const days = Object.keys(series).filter((d) => typeof series[d] === 'number' && series[d] > 0).sort();
  if (!days.length) continue;
  fc26BySlug.set(String(p.slug || ''), { launchDate: days[0], launchPrice: series[days[0]], name: p.name, rating: p.rating });
}
const lookup = (slug) => {
  const cands = [slug, slug.replace(/-/g, ' '), slug.replace(/ /g, '-')];
  for (const c of cands) if (fc26BySlug.has(c)) return { key: c, v: fc26BySlug.get(c) };
  return null;
};

const cur = j('apps/market/engine/data/prices/fc27/current.json');
const research = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const rowsById = new Map(research.rows.map((r) => [String(r.id), r]));

P(`[基线] 脚本自判 advice=${research.counts.advice} condA=${research.counts.condA} condB=${research.counts.condB} noFc26=${research.counts.noFc26}`);
P(`[清单] 待桥回 cardId ${PAIRS.length} 张`);

const bridged = [];
const unresolvable = [];
for (const [id, newSlug, oldSlug] of PAIRS) {
  const card = cur.cards[String(id)];
  const row = rowsById.get(String(id));
  if (!card || !row) { unresolvable.push(`${id} 在 current.json 或 research rows 中缺失`); continue; }
  const hit = lookup(oldSlug) || lookup(newSlug);
  if (!hit) { unresolvable.push(`${id} ${newSlug}（旧 ${oldSlug}）FC26 无对应 slug 键`); continue; }
  const con = card.platforms?.console?.price ?? null;
  const pc = card.platforms?.pc?.price ?? null;
  const validCon = typeof con === 'number' && con >= MIN_VALID_PRICE;
  const validPc = typeof pc === 'number' && pc >= MIN_VALID_PRICE;
  const cands = [validCon ? con : null, validPc ? pc : null].filter((v) => v !== null);
  const rep = cands.length ? Math.max(...cands) : null;
  const L = hit.v.launchPrice;
  const maxP = card.priceRange?.max ?? null;
  const condA = rep !== null ? L > rep : null;
  const condB = maxP !== null ? L > maxP : null;
  const advice = Boolean(condA) || Boolean(condB);
  const ratio = rep !== null && rep > 0 ? L / rep : null;
  bridged.push({ id, nameZh: row.nameZh, name: row.name, newSlug, oldSlug, fc26Key: hit.key, L, con, pc, rep, maxP, condA, condB, advice, ratio });
}

P('');
P('--- 桥回明细（cardId / 台账名 / 新slug → FC26键 / con / pc / rep / fc26Launch / 余量比 / condA / condB）---');
for (const b of bridged) {
  P(`  ${b.id} ${b.nameZh}(${b.name}) | ${b.newSlug} → ${b.fc26Key} | con=${b.con} pc=${b.pc} rep=${b.rep} | fc26Launch=${b.L} | ${b.ratio === null ? 'n/a' : b.ratio.toFixed(4)} | condA=${b.condA} condB=${b.condB}${b.advice ? ' ★建议' : ''}`);
}
P('');
P(`[无法桥回] ${unresolvable.length} 张：${unresolvable.join(' | ') || '无'}`);

const scriptAdv = new Set(research.rows.filter((r) => r.advice).map((r) => String(r.id)));
const bridgedAdv = bridged.filter((b) => b.advice).map((b) => String(b.id));
const newlyIn = bridgedAdv.filter((id) => !scriptAdv.has(id));
const corrected = research.counts.advice + newlyIn.length;
P('');
P(`[修正] 桥回后新增命中 ${newlyIn.length} 张：${newlyIn.map((id) => { const b = bridged.find((x) => String(x.id) === id); return `${b.nameZh}(${id}) rep${b.rep} vs ${b.L} ${b.ratio.toFixed(4)}`; }).join(' | ') || '无'}`);
P(`[修正] 投资建议：脚本自判 ${research.counts.advice} → 修正 ${corrected}（condA 应 ${research.counts.condA + newlyIn.length} / condB ${research.counts.condB}）`);
P(`[修正] noFc26：脚本 ${research.counts.noFc26} → 修正 ${research.counts.noFc26 - bridged.length}（本轮桥回 ${bridged.length} 张）`);
