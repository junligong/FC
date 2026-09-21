// 一次性明细脚本（临时）：icons-pricerange-hourly 2026-09-19 T06 轮建议集变动与临界余量明细。
// 全部按 cardId 关联（FUTBIN slug 不唯一，禁用 slug/name 做键）。
// 双映射：复算前轮(T05)命中集用「生成 T05 产物时的同一版 FC26 映射」(research-prev-t05.json)，避免 slug 漂移 artifact。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-19';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(a.join(' '));

const cur = j('apps/market/engine/data/prices/fc27/current.json');
const hNow = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T06.json`);
const hPrev = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T05.json`);
const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const pres = j('automation/runs/2026-09-19/icons-heroes/work/research-prev-t05.json');

const nowById = new Map((hNow.cards || []).map((c) => [String(c.id), c]));
const prevById = new Map((hPrev.cards || []).map((c) => [String(c.id), c]));
const rep = (c) => (c ? Math.max(c.currentValid?.console ? (c.current?.console ?? 0) : 0, c.currentValid?.pc ? (c.current?.pc ?? 0) : 0) : 0);
const nmOf = (id) => { const r = res.rows.find((x) => String(x.id) === id); return `${r?.nameZh || r?.name || '?'}(${id})`; };

const mapNow = new Map(res.rows.map((r) => [String(r.id), r.fc26Launch]));
const mapPrev = new Map(pres.rows.map((r) => [String(r.id), r.fc26Launch]));

const hits = (byId, map) => {
  const h = [];
  for (const [id, c] of byId) {
    const f = map.get(id);
    if (typeof f !== 'number') continue;
    const r = rep(c);
    const condA = r >= 1000 ? f > r : null;
    const condB = (c.priceRange?.max ?? 0) > 0 ? f > c.priceRange.max : null;
    if (condA === true || condB === true) h.push(id);
  }
  return h;
};
const hitNow = hits(nowById, mapNow);
const hitPrev = hits(prevById, mapPrev);

const line = (id, c, map) => {
  const f = map.get(id);
  const r = rep(c);
  const ratio = typeof f === 'number' && r > 0 ? (f / r).toFixed(4) : 'n/a';
  const condA = r >= 1000 ? (f > r) : null;
  const condB = (c?.priceRange?.max ?? 0) > 0 ? f > c.priceRange.max : null;
  const d = (v) => (v === null ? 'null(不适用)' : v ? 'true' : 'false');
  return `${nmOf(id)} con${c?.current?.console}(v=${!!c?.currentValid?.console}) pc${c?.current?.pc}(v=${!!c?.currentValid?.pc}) rep${r} | 区间${c?.priceRange?.min}-${c?.priceRange?.max} | fc26Launch${f} | 余量比${ratio} | A=${d(condA)} B=${d(condB)}`;
};

const inNow = hitNow.filter((x) => !hitPrev.includes(x));
const outNow = hitPrev.filter((x) => !hitNow.includes(x));
P(`建议集 T05 ${hitPrev.length} → T06 ${hitNow.length}（进 ${inNow.length} 出 ${outNow.length}）`);
P('--- 进 T06（用本轮映射看当前值）---');
for (const id of inNow) P('  ' + line(id, nowById.get(id), mapNow));
P('--- 出 T06（前轮值 vs 本轮值，同一映射=本轮）---');
for (const id of outNow) {
  P('  前轮: ' + line(id, prevById.get(id), mapNow));
  P('  本轮: ' + line(id, nowById.get(id), mapNow));
}
P('--- 保留卡余量最窄 Top 12（判据 fc26Launch ÷ representative 升序，越接近 1 越临界）---');
const kept = hitNow.map((id) => ({ id, c: nowById.get(id), f: mapNow.get(id) }))
  .filter((x) => typeof x.f === 'number' && rep(x.c) > 0)
  .map((x) => ({ ...x, ratio: x.f / rep(x.c) }))
  .sort((a, b) => a.ratio - b.ratio);
for (const x of kept.slice(0, 12)) P(`  ${x.ratio.toFixed(4)}  ${nmOf(x.id)} rep${rep(x.c)} vs fc26Launch${x.f}`);
P(`--- condB 单独命中 ---`);
for (const id of hitNow) {
  const c = nowById.get(id);
  const f = mapNow.get(id);
  const r = rep(c);
  if (typeof f === 'number' && (c?.priceRange?.max ?? 0) > 0 && f > c.priceRange.max && !(r >= 1000 && f > r)) {
    P(`  ${nmOf(id)} 区间上沿${c.priceRange.max} < fc26Launch${f}（rep${r} 未下穿 ⇒ 仅 condB）`);
  }
}
P('--- 区间极值卡 ---');
let mn = null, mx = null;
for (const [, c] of nowById) {
  if (!mn || c.priceRange.min < mn.c.priceRange.min) mn = { id: c.id, c };
  if (!mx || c.priceRange.max > mx.c.priceRange.max) mx = { id: c.id, c };
}
P(`  下沿最低 ${mn.c.priceRange.min} ${nmOf(String(mn.id))} | 上沿最高 ${mx.c.priceRange.max} ${nmOf(String(mx.id))}`);
P(`--- noFc26 清单（${res.rows.filter((r) => typeof r.fc26Launch !== 'number').length} 张）---`);
P('  ' + res.rows.filter((r) => typeof r.fc26Launch !== 'number').map((r) => `${r.nameZh || r.name}(${r.id})`).join(' · '));
