// 一次性明细脚本（临时）：icons-pricerange-hourly 2026-09-19 T20 轮建议集变动与临界余量明细。
// 全部按 cardId 关联（FUTBIN slug 不唯一，禁用 slug/name 做键）。
// T20 本轮为全量成功轮（131/131，无 ok=false）：本轮取值口径 = current.json（分析器实际读取的源），
// 前轮取值 = T19 逐小时快照（同为全量成功轮）。
// 双映射：复算前轮(T19)命中集用生成该轮产物时的同一版 FC26 映射（research-prev-t19.json）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-19';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(a.join(' '));

const cur = j('apps/market/engine/data/prices/fc27/current.json');
const hNow = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T20.json`);
const hPrev = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T19.json`);
const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const pres = j('automation/runs/2026-09-19/icons-heroes/work/research-prev-t19.json');

// 本轮视图：由 current.json 归一化（icon 条目）
const nowById = new Map(Object.entries(cur.cards).filter(([, r]) => r.cardType === 'icon')
  .map(([id, r]) => [id, {
    current: { console: r.platforms?.console?.price ?? 0, pc: r.platforms?.pc?.price ?? 0 },
    currentValid: { console: !!r.platforms?.console?.valid, pc: !!r.platforms?.pc?.valid },
    priceRange: r.priceRange ? { min: r.priceRange.min, max: r.priceRange.max } : null,
    src: 'current.json',
  }]));
const prevById = new Map((hPrev.cards || []).map((c) => [String(c.id), c]));
const failed = new Set((hNow.cards || []).filter((c) => c.ok === false).map((c) => String(c.id)));
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
P(`建议集 T19 ${hitPrev.length} → T20 ${hitNow.length}（进 ${inNow.length} 出 ${outNow.length}）`);
P(`[口径] 本轮取值=current.json（分析器源）；本轮未采到（403）并入 current.json 保留观测的卡=${failed.size} 张：${[...failed].map((id) => nmOf(id)).join(' · ')}`);
P('--- 进 T20（本轮值）---');
for (const id of inNow) P('  ' + line(id, nowById.get(id), mapNow));
P('--- 出 T20（前轮值 vs 本轮值，同一映射=本轮）---');
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
P('--- condB 单独命中 ---');
for (const id of hitNow) {
  const c = nowById.get(id);
  const f = mapNow.get(id);
  const r = rep(c);
  if (typeof f === 'number' && (c?.priceRange?.max ?? 0) > 0 && f > c.priceRange.max && !(r >= 1000 && f > r)) {
    P(`  ${nmOf(id)} 区间上沿${c.priceRange.max} < fc26Launch${f}（rep${r} 未下穿 ⇒ 仅 condB）`);
  }
}
P('--- noFc26 清单（' + res.rows.filter((r) => typeof r.fc26Launch !== 'number').length + ' 张）---');
P('  ' + res.rows.filter((r) => typeof r.fc26Launch !== 'number').map((r) => `${r.nameZh || r.name}(${r.id})`).join(' · '));
