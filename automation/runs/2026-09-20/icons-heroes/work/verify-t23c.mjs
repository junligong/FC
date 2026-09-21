// verify-t23c.mjs —— noFc26 差集定位 + FC26 slug 桥回修正值（只读）
import fs from 'node:fs';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const read = p => JSON.parse(fs.readFileSync(`${ROOT}/${p}`, 'utf8'));
const cur = read('apps/market/engine/data/prices/fc27/current.json');
const research = read(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const base = read('apps/market/engine/icons/data/prices/fc27/base-icons.json');
const fc26 = read('apps/market/engine/icons/data/prices/fc26/base-icons.json');
const LAUNCH = '2025-09-18';
const baseArr = base.cards || base.players;

const fc26Map = new Map(); // slug -> { launch, ser }
for (const p of fc26.players) fc26Map.set(p.slug, { launch: p.prices?.cross?.[LAUNCH] ?? null, ser: p.prices?.cross || {} });

const slugOf = id => baseArr.find(x => String(x.cardId ?? x.id) === id)?.slug;
const noFc26 = [];
for (const r of research.rows) {
  const id = String(r.id ?? r.cardId);
  const slug = slugOf(id);
  if (!fc26Map.has(slug)) noFc26.push({ id, slug, name: r.nameZh || r.name, nameEn: r.name });
}
console.log(`noFc26 实算 ${noFc26.length} 张（脚本印 ${research.counts.noFc26}）`);
console.log(`其中 FC26 完全无同 slug 者 ${noFc26.filter(x => !fc26Map.has(x.slug)).length} 张`);
console.log('清单:', noFc26.map(x => `${x.nameEn}(${x.id}) slug=${x.slug}`).join(' | '));

// 桥回：换名清单（人工可审计）
const PAIRS = [
  ['21488', 'pele', 'arantes-nascimento'],
  ['21495', 'garrincha', 'franc-dos-santos'],
  ['21501', 'ronaldinho', 'de-assis-moreira'],
  ['21531', 'zico', 'antunes-coimbra'],
  ['21560', 'roberto-carlos-da-silva-rocha', 'da-silva-rocha'],
  ['21567', 'rivaldo', 'borba-ferreira'],
  ['21839', 'marcelo', 'vieira-da-silva'],
];
// 全 14 行对照表（T19 memory 记录 14 行）
const FULL14 = [
  ['21488', 'arantes-nascimento'], ['21495', 'franc-dos-santos'], ['21501', 'de-assis-moreira'],
  ['21531', 'antunes-coimbra'], ['21560', 'da-silva-rocha'], ['21567', 'borba-ferreira'],
  ['21839', 'vieira-da-silva'], ['21492', 'nazario-de-lima'], ['21779', 'reis-do-nascimento'],
  ['21807', 'da-silva-fernandes'], ['21815', 'da-silva-ferreira'], ['21829', 'socrates'],
  ['21877', 'chagas-de-souza'], ['21526', 'carlos-alberto-torres'],
];
console.log('\n=== 14 行换名/桥回对照表核验（cardId→FC27 slug vs FC26 键） ===');
let allEq = 0, bridgeOk = 0, newlyHit = 0;
const newly = [];
for (const [id, fc26key] of FULL14) {
  const have = slugOf(id);
  const fc26Has = fc26Map.has(fc26key);
  const direct = fc26Map.has(have);
  const rec = { id, have, fc26key, fc26Has, direct };
  if (have === fc26key) allEq++;
  if (fc26Has && !direct) { bridgeOk++; }
  // 桥回后判定
  const c = cur.cards[id];
  const launch = fc26Map.get(fc26key)?.launch ?? null;
  if (c && launch != null) {
    const con = c.platforms.console.valid ? c.platforms.console.price : 0;
    const pc = c.platforms.pc.valid ? c.platforms.pc.price : 0;
    const rep = Math.max(con, pc);
    const a = rep >= 1000 ? launch > rep : null;
    const b = c.priceRange?.max != null ? launch > c.priceRange.max : null;
    rec.con = con; rec.pc = pc; rec.rep = rep; rec.launch = launch; rec.ratio = rep ? +(launch / rep).toFixed(4) : null; rec.a = a; rec.b = b;
    if (a === true || b === true) { newlyHit++; newly.push(rec); }
    console.log(`${rec.direct ? '直连命中' : '需桥回  '} ${id} FC27slug=${have} → FC26键=${fc26key}(存在=${fc26Has}) con=${con.toLocaleString()} pc=${pc.toLocaleString()} rep=${rep.toLocaleString()} vs ${launch.toLocaleString()} 余量比=${rec.ratio} condA=${a} condB=${b}`);
  }
}
console.log(`\n全等 ${allEq}/14 · 需桥回且 FC26 存在 ${bridgeOk} 张 · 桥回后 condA/condB 成立 ${newlyHit} 张`);
console.log(`⇒ 修正建议集 = ${research.counts.advice} + ${newlyHit} = ${research.counts.advice + newlyHit}（condA ${research.counts.condA + newlyHit} / condB ${research.counts.condB}）`);
const noFc26Corrected = noFc26.length - newlyHit + (research.rows.length - 0) * 0;
console.log(`⇒ noFc26 修正值 = ${noFc26.length} − ${newlyHit} = ${noFc26.length - newlyHit}（脚本印 ${research.counts.noFc26}）`);
console.log('桥回命中:', newly.map(n => `${n.id} ${n.ratio}`).join(' / '));
