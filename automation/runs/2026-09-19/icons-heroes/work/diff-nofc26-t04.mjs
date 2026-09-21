// 一次性辅助校验（临时）：跨日 noFc26 名单与 slug 漂移集合差（按 cardId，禁用 slug 关联）。
// 输入：research fc26-vs-fc27-2026-09-18.json（上一版底稿）与 2026-09-19.json。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(a.join(' '));

const prev = j('apps/market/engine/icons/data/research/fc26-vs-fc27-2026-09-18.json');
const now = j('apps/market/engine/icons/data/research/fc26-vs-fc27-2026-09-19.json');

const noPrev = new Set(prev.rows.filter((r) => typeof r.fc26Launch !== 'number').map((r) => String(r.id)));
const noNow = new Set(now.rows.filter((r) => typeof r.fc26Launch !== 'number').map((r) => String(r.id)));
const pBy = new Map(prev.rows.map((r) => [String(r.id), r]));
const nBy = new Map(now.rows.map((r) => [String(r.id), r]));
const label = (id) => `${nBy.get(id)?.nameZh || pBy.get(id)?.nameZh || id}(${id})`;

P(`[noFc26] 09-18 版=${noPrev.size} → 09-19 版=${noNow.size}`);
P(`[noFc26] 仅在旧版=${[...noPrev].filter((x) => !noNow.has(x)).map(label).join(' | ') || '无'}`);
P(`[noFc26] 仅在新版=${[...noNow].filter((x) => !noPrev.has(x)).map(label).join(' | ') || '无'}`);

const slugDrift = [];
for (const [id, r] of nBy) {
  const p = pBy.get(id);
  if (p && p.slug !== r.slug) slugDrift.push(`${label(id)} ${p.slug} → ${r.slug}`);
}
P(`[slug] 09-18 → 09-19 slug 漂移 ${slugDrift.length} 处：${slugDrift.join(' | ') || '无'}`);
