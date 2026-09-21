// 一次性：输出 T02→T04 建议集变化逐张价格证据 + 保留项临界余量（全部按 cardId 关联）。
// 另外单独复算「前轮在上一版 FC26 映射下」的命中集，用于把 slug 复原导致的非价格 artifact 摘出来。
import fs from 'node:fs';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-19';
const HH = '04';
const PREV = '2026-09-19T02';
const j = (p) => JSON.parse(fs.readFileSync(`${ROOT}/${p}`, 'utf8'));

const hNow = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T${HH}.json`);
const hPrev = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${PREV}.json`);
const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const resOld = j('apps/market/engine/icons/data/research/fc26-vs-fc27-2026-09-18.json');
const cur = j('apps/market/engine/data/prices/fc27/current.json');

const f26 = new Map(res.rows.map((r) => [String(r.id), r.fc26Launch]));
const f26old = new Map(resOld.rows.map((r) => [String(r.id), r.fc26Launch]));
const nm = (id) => `${res.rows.find((r) => String(r.id) === id)?.nameZh || ''}(${cur.cards[id]?.name || id})`;
const rep = (c) => Math.max(c.currentValid?.console ? (c.current?.console ?? 0) : 0, c.currentValid?.pc ? (c.current?.pc ?? 0) : 0);
const mk = (map) => (c) => {
  const f = map.get(String(c.id));
  if (typeof f !== 'number') return null;
  const r = rep(c);
  const condA = r >= 1000 ? f > r : null;
  const condB = (c.priceRange?.max ?? 0) > 0 ? f > c.priceRange.max : null;
  return condA === true || condB === true;
};
const calc = mk(f26), calcOld = mk(f26old);

const nowById = new Map(hNow.cards.map((c) => [String(c.id), c]));
const prevById = new Map(hPrev.cards.map((c) => [String(c.id), c]));
const hitNow = [...nowById.keys()].filter((id) => calc(nowById.get(id)));
const hitPrev = [...prevById.keys()].filter((id) => calc(prevById.get(id)));
const hitPrevOld = [...prevById.keys()].filter((id) => calcOld(prevById.get(id)));
const P = (...a) => console.log(a.join(' '));

P(`建议集 T02=${hitPrevOld.length}（上一版 FC26 映射） · T02=${hitPrev.length}（当日映射复算） → T${HH}=${hitNow.length}`);
P(`映射差异张数 = ${[...new Set([...hitPrev, ...hitPrevOld])].filter((x) => !(hitPrev.includes(x) && hitPrevOld.includes(x))).map(nm).join(' | ') || '无'}`);

P(`--- 进（T${HH} 命中）逐张：con / pc / 代表值 / FC26开服价 / fc26Launch÷representative ---`);
for (const id of hitNow.filter((x) => !hitPrev.includes(x))) {
  const c = nowById.get(id), f = f26.get(id);
  P(`  ${nm(id)}: con${c.current?.console} pc${c.current?.pc} rep${rep(c)} vs FC26 ${f} → ratio ${(f / rep(c)).toFixed(4)}`);
}
P(`--- 出（T02 命中，T${HH} 掉出）逐张 ---`);
for (const id of hitPrev.filter((x) => !hitNow.includes(x))) {
  const p = prevById.get(id), n = nowById.get(id), f = f26.get(id);
  P(`  ${nm(id)}: T02 con${p.current?.console}/pc${p.current?.pc} rep${rep(p)} → T${HH} con${n.current?.console}/pc${n.current?.pc} rep${rep(n)} vs FC26 ${f}${hitPrevOld.includes(id) ? '' : '  ←【slug 复原 artifact，非价格驱动】'}`);
}
const kept = hitNow.filter((x) => hitPrev.includes(x))
  .map((id) => ({ id, r: f26.get(id) / Math.max(rep(nowById.get(id)), 1) }))
  .sort((a, b) => a.r - b.r);
P(`--- 保留 ${kept.length} 张，余量最窄 8（ratio 升序 = 越接近 1 越临界）---`);
for (const { id, r } of kept.slice(0, 8)) {
  const c = nowById.get(id);
  P(`  ${nm(id)}: rep${rep(c)} vs FC26 ${f26.get(id)} → ratio ${r.toFixed(4)}`);
}
