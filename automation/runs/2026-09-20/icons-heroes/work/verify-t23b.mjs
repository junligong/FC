// verify-t23b.mjs —— 研究判定链独立重算（按 cardId，修正 FC26 取价口径）
// FC26 开服价 = players[].prices.cross['2025-09-18']
import fs from 'node:fs';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const read = p => JSON.parse(fs.readFileSync(`${ROOT}/${p}`, 'utf8'));
const cur = read('apps/market/engine/data/prices/fc27/current.json');
const research = read(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const base = read('apps/market/engine/icons/data/prices/fc27/base-icons.json');
const fc26 = read('apps/market/engine/icons/data/prices/fc26/base-icons.json');

const LAUNCH = '2025-09-18';
const fc26Launch = new Map();
const fc26Series = new Map();
for (const p of fc26.players) {
  const ser = p.prices?.cross || {};
  fc26Launch.set(p.slug, ser[LAUNCH] ?? null);
  fc26Series.set(p.slug, ser);
}
const baseArr = base.cards || base.players;
const slugOf = id => baseArr.find(x => String(x.cardId ?? x.id) === id)?.slug;

let reA = 0, reB = 0, reAdv = 0, reNo = 0, nullA = 0, mapDrift = 0, slugMiss = 0;
const detail = [];
for (const row of research.rows) {
  const id = String(row.id ?? row.cardId);
  const c = cur.cards[id];
  if (!c) { console.log('MISSING in current.json:', id); continue; }
  const slug = slugOf(id);
  const launch = fc26Launch.get(slug) ?? null;
  if (launch == null) { reNo++; if (!fc26Launch.has(slug)) slugMiss++; continue; }
  if (row.fc26Launch != null && Math.abs(row.fc26Launch - launch) > 1) mapDrift++;
  const con = c.platforms.console.valid ? c.platforms.console.price : 0;
  const pc = c.platforms.pc.valid ? c.platforms.pc.price : 0;
  const rep = Math.max(con, pc);
  const a = rep >= 1000 ? launch > rep : null;
  const b = c.priceRange?.max != null ? launch > c.priceRange.max : null;
  if (a === true) reA++; else if (a === null) nullA++;
  if (b === true) reB++;
  if (a === true || b === true) reAdv++;
  detail.push({ id, nameZh: row.nameZh || row.name, slug, con, pc, rep, launch, ratio: rep ? +(launch / rep).toFixed(4) : null, a, b });
}
const rc = research.counts;
console.log(`[研究-重算] script advice=${rc.advice} condA=${rc.condA} condB=${rc.condB} noFc26=${rc.noFc26}`);
console.log(`[研究-重算] verify advice=${reAdv} condA=${reA} condB=${reB} noFc26=${reNo} (其中 FC26 无此 slug ${slugMiss}) condA不适用(null)=${nullA}`);
console.log(`[研究-重算] 差异 advice=${rc.advice - reAdv} condA=${rc.condA - reA} condB=${rc.condB - reB} noFc26=${rc.noFc26 - reNo}`);
console.log(`[研究-重算] FC26 映射并发漂移 ${mapDrift} 张`);

// 逐卡 diff：脚本命中集 vs 重算命中集
const scriptHit = new Set(research.rows.filter(r => r.advice === true || r.isAdvice === true || r.condA === true || r.condB === true).map(r => String(r.id ?? r.cardId)));
const verifyHit = new Set(detail.filter(d => d.a === true || d.b === true).map(d => d.id));
const onlyScript = [...scriptHit].filter(x => !verifyHit.has(x));
const onlyVerify = [...verifyHit].filter(x => !scriptHit.has(x));
console.log(`[研究-重算] 命中集双向差集 脚本独有 ${onlyScript.length} [${onlyScript.map(i => `${research.rows.find(r => String(r.id) === i)?.nameZh}(${i})`).join(',')}] / verify独有 ${onlyVerify.length} [${onlyVerify.map(i => `${cur.cards[i]?.nameZh}(${i})`).join(',')}]`);

// 保留卡余量最窄 Top12
const kept = detail.filter(d => d.a === true).sort((x, y) => x.ratio - y.ratio).slice(0, 12);
console.log(`[研究-重算] condA 命中 ${reA} 张，余量最窄 Top12（fc26Launch ÷ 代表价 升序）:`);
for (const k of kept) console.log(`   ${k.nameZh} ${k.id} con=${k.con.toLocaleString()} pc=${k.pc.toLocaleString()} rep=${k.rep.toLocaleString()} vs ${k.launch.toLocaleString()} → ${k.ratio}`);

// 进/出张数与价格证据（对比上一轮 research）
const prev = read(`automation/runs/${D}/icons-heroes/work/research-prev-t19.json`);
const prevHit = new Set(prev.rows.filter(r => r.advice === true || r.isAdvice === true || r.condA === true || r.condB === true).map(r => String(r.id ?? r.cardId)));
const prevPr = new Map(prev.rows.map(r => [String(r.id ?? r.cardId), r]));
const inn = [...verifyHit].filter(x => !prevHit.has(x));
const out = [...prevHit].filter(x => !verifyHit.has(x));
console.log(`[研究-重算] 环比 T19：进 ${inn.length} 出 ${out.length}`);
for (const i of inn) { const d = detail.find(x => x.id === i); console.log(`   + ${d.nameZh} ${i} con=${d.con.toLocaleString()} pc=${d.pc.toLocaleString()} rep=${d.rep.toLocaleString()} vs ${d.launch.toLocaleString()} 余量比 ${d.ratio} (上轮 in=${prevHit.has(i)})`); }
for (const o of out) {
  const p = prevPr.get(o); const d = detail.find(x => x.id === o);
  const pc0 = p?.currentPrice ?? p?.representative ?? null;
  console.log(`   - ${p?.nameZh}(${o}) 本轮 con=${d.con.toLocaleString()} pc=${d.pc.toLocaleString()} rep=${d.rep.toLocaleString()} vs ${d.launch.toLocaleString()} 余量比 ${d.ratio} · 上轮 con=${p?.console ?? p?.psPrice ?? '?'} pc=${p?.pc ?? p?.pcPrice ?? '?'} 上轮in=${prevHit.has(o)}`);
}
// condB 唯一
const condBOnly = detail.filter(d => d.b === true);
console.log(`[研究-重算] condB 命中 ${condBOnly.length} 张: ${condBOnly.map(d => `${d.nameZh}(${d.id}) 上沿余量比 ${d.ratio}`).join(' / ')}`);
