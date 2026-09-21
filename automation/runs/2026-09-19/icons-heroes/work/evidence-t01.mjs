// 一次性脚本（临时）：T01 轮投资建议集合变化的价格证据（按 cardId 关联，禁 slug）。
import fs from 'node:fs';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-19';
const j = (p) => JSON.parse(fs.readFileSync(`${ROOT}/${p}`, 'utf8'));
const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const now = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T01.json`);
const prev = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T00.json`);
const cur = j('apps/market/engine/data/prices/fc27/current.json');
const byId = new Map(now.cards.map((c) => [String(c.id), c]));
const pById = new Map(prev.cards.map((c) => [String(c.id), c]));
const rep = (c) => Math.max(c?.currentValid?.console ? c.current.console ?? 0 : 0, c?.currentValid?.pc ? c.current.pc ?? 0 : 0);
const fc26 = new Map(res.rows.map((r) => [String(r.id), r.fc26Launch]));
const row = (id) => res.rows.find((r) => String(r.id) === id);
const ids = ['21531', '21829', '21846', '21886', '21901', '21501', '21528', '21804', '21809', '21884', '21897', '21911', '21916'];
console.log('id | nameZh | con p→n | pc p→n | rep p→n | fc26Launch | fc26/rep | advice');
for (const id of ids) {
  const n = byId.get(id), p = pById.get(id);
  const r = rep(n), rp = rep(p), f = fc26.get(id);
  console.log([id, row(id)?.nameZh, `${p?.current?.console}→${n?.current?.console}`, `${p?.current?.pc}→${n?.current?.pc}`,
    `${rp}→${r}`, f, f && r >= 1000 ? (f / r).toFixed(4) : 'n/a', row(id)?.advice].join(' | '));
}
// 临界保留项（余量最窄 5 张）
const kept = res.rows.filter((r) => r.advice && typeof r.fc26Launch === 'number' && r.fc27Current?.representative >= 1000)
  .map((r) => ({ id: r.id, n: r.nameZh, f: r.fc26Launch, v: r.fc27Current.representative, ratio: r.fc26Launch / r.fc27Current.representative }))
  .sort((a, b) => a.ratio - b.ratio).slice(0, 6);
console.log('--- 余量最窄（fc26Launch/representative 越接近 1 越临界） ---');
for (const k of kept) console.log(`${k.n}(${k.id}) rep=${k.v} vs fc26=${k.f} ratio=${k.ratio.toFixed(4)}`);
// 报告目录 current.json 副本一致性
const copy = j(`reports/daily/${D}/assets/data/current.json`);
console.log('--- 报告副本 generatedAt 与主文件一致 =', copy.generatedAt === cur.generatedAt, copy.generatedAt, cur.generatedAt);
