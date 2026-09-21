// verify-t23d.mjs —— 权威桥回核算（PAIRS 取自 fc26bridge-t19.mjs，格式 [cardId, FC27 slug, FC26 键]）
import fs from 'node:fs';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const MIN = 1000;
const j = p => JSON.parse(fs.readFileSync(`${ROOT}/${p}`, 'utf8'));
const cur = j('apps/market/engine/data/prices/fc27/current.json');
const research = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const base = j('apps/market/engine/icons/data/prices/fc27/base-icons.json');
const fc26 = j('apps/market/engine/icons/data/prices/fc26/base-icons.json');

const PAIRS = [
  [21488, 'pele', 'arantes-nascimento'], [21492, 'ronaldo', 'nazario-de-lima'],
  [21495, 'garrincha', 'franc-dos-santos'], [21501, 'ronaldinho', 'de-assis-moreira'],
  [21526, 'carlos-alberto-torres', 'torres'], [21531, 'zico', 'antunes-coimbra'],
  [21560, 'roberto-carlos-da-silva-rocha', 'da-silva-rocha'], [21567, 'rivaldo', 'borba-ferreira'],
  [21779, 'kaka', 'dos-santos-leite'], [21807, 'jairzinho', 'ventura-filho'],
  [21815, 'lucio', 'da-silva-ferreira'], [21829, 'socrates', 'vieira-de-oliveira'],
  [21839, 'marcelo', 'vieira-da-silva'], [21877, 'sissi', 'lima-do-amor'],
];
const fc26BySlug = new Map();
for (const p of (fc26.players || [])) {
  const ser = (p.prices && (p.prices.cross || p.prices.console)) || {};
  const days = Object.keys(ser).filter(d => typeof ser[d] === 'number' && ser[d] > 0).sort();
  if (!days.length) continue;
  fc26BySlug.set(String(p.slug || ''), { launchPrice: ser[days[0]], days: days.length });
}
const baseArr = base.cards || base.players;
const slugOf = id => baseArr.find(x => String(x.cardId ?? x.id) === String(id))?.slug;
const rowsById = new Map(research.rows.map(r => [String(r.id ?? r.cardId), r]));

console.log('=== ① 换名对照表核对（base-icons.json cardId→slug vs PAIRS 新 slug） ===');
let eq = 0;
for (const [id, newSlug, oldSlug] of PAIRS) {
  const have = slugOf(id);
  const ok = have === newSlug;
  if (ok) eq++;
  else console.log(`   ✘ ${id} 台账 slug=${have} ≠ PAIRS ${newSlug}`);
}
console.log(`   全等 ${eq}/${PAIRS.length} ${eq === PAIRS.length ? '✔' : '✘'}`);

console.log('\n=== ② 桥回（FC26 键直查） ===');
let ok = 0, unres = [], newly = [], stillNo = [];
for (const [id, newSlug, oldSlug] of PAIRS) {
  const card = cur.cards[String(id)]; const row = rowsById.get(String(id));
  if (!card || !row) { unres.push(`${id} 缺失`); continue; }
  const hit = fc26BySlug.get(oldSlug) || fc26BySlug.get(newSlug);
  if (!hit) { unres.push(`${id} ${newSlug}（旧 ${oldSlug}）FC26 无 slug 键`); continue; }
  ok++;
  const con = card.platforms?.console?.valid ? card.platforms.console.price : 0;
  const pc = card.platforms?.pc?.valid ? card.platforms.pc.price : 0;
  const rep = Math.max(con, pc);
  const launch = hit.launchPrice;
  const a = rep >= MIN ? launch > rep : null;
  const b = card.priceRange?.max != null ? launch > card.priceRange.max : null;
  const inScript = row.advice === true || row.condA === true || row.condB === true;
  const ratio = rep ? +(launch / rep).toFixed(4) : null;
  const flag = (a === true || b === true) ? (inScript ? '已在脚本命中集' : '★新增命中') : '仍不命中';
  if ((a === true || b === true) && !inScript) newly.push({ id, name: row.nameZh || row.name, con, pc, rep, launch, ratio });
  if (a !== true && b !== true) stillNo.push({ id, name: row.nameZh || row.name, rep, launch, ratio, a });
  console.log(`   ${String(id)} ${(row.nameZh || row.name).padEnd(14)} FC27slug=${newSlug} → FC26键=${oldSlug} con=${con.toLocaleString()} pc=${pc.toLocaleString()} rep=${rep.toLocaleString()} vs ${launch.toLocaleString()} 余量比=${ratio} condA=${a} condB=${b} [${flag}]`);
}
console.log(`\n桥回成功 ${ok}/${PAIRS.length} · 无法桥回 ${unres.length} ${unres.join('; ')}`);
const rc = research.counts;
console.log(`★ 新增命中 ${newly.length} 张 ⇒ 修正建议集 = ${rc.advice} + ${newly.length} = ${rc.advice + newly.length}（condA ${rc.condA + newly.length} / condB ${rc.condB}）`);
console.log(`★ 桥回后仍无建议 ${stillNo.length} 张: ${stillNo.map(x => `${x.name}(${x.id}) rep=${x.rep} vs ${x.launch} 比值${x.ratio}`).join(' · ')}`);

// noFc26 修正值：脚本 noFc26 减去「实际靠桥回才命中、但脚本未命中」的数量
const directHit = PAIRS.filter(([id]) => {
  const row = rowsById.get(String(id));
  return row && (row.advice === true || row.condA === true || row.condB === true);
}).length;
console.log(`\n脚本 noFc26=${rc.noFc26} · 14 行中脚本已直连命中 ${directHit} 张（即在建议集内，不属 noFc26）`);
console.log(`⇒ noFc26 修正值 = ${rc.noFc26} − ${PAIRS.length - directHit} = ${rc.noFc26 - (PAIRS.length - directHit)}`);
