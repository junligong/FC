// 一次性辅助校验（临时）：noFc26 由 15 张回落到 14 张的根因核验（eto-o 跨代 slug 漂移项是否复原）。
// 输入：research fc26-vs-fc27-2026-09-19.json / icons base-icons.json。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-19';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(a.join(' '));

const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const roster = j('apps/market/engine/icons/data/prices/fc27/base-icons.json');
const rosterArr = Array.isArray(roster) ? roster : (roster.cards || roster.players || roster.icons || roster.rows || []);
const byId = new Map(rosterArr.map((r) => [String(r.cardId ?? r.id), r]));

for (const id of ['21805']) {
  const rr = byId.get(id);
  const row = res.rows.find((r) => String(r.id) === id);
  P(`[slug] cardId=${id} roster=${rr && rr.slug} name=${rr && rr.name} · research.slug=${row && row.slug} fc26Launch=${row && row.fc26Launch} condA=${row && row.condA} condB=${row && row.condB}`);
}

const dupSlug = {};
for (const r of res.rows) dupSlug[r.slug] = (dupSlug[r.slug] || 0) + 1;
P(`[slug] 重复 slug = ${JSON.stringify(Object.entries(dupSlug).filter(([, n]) => n > 1))}`);

const noFc26 = res.rows.filter((r) => typeof r.fc26Launch !== 'number').map((r) => `${r.nameZh || r.name}(${r.id}) slug=${r.slug}`);
P(`[研究] noFc26 数量=${noFc26.length}`);
P(`[研究] noFc26 名单 = ${noFc26.join(' | ')}`);
