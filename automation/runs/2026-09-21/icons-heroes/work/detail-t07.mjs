// 一次性脚本（临时）：icons-pricerange-hourly 2026-09-21 T07 轮明细（进/出、临界、极值集、改动面、红线）。
// 只读。全部按 cardId。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-21';
const MIN = 1000;
const P = (...a) => console.log(...a);
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const cur = j('apps/market/engine/data/prices/fc27/current.json');
const base = j('apps/market/engine/icons/data/prices/fc27/base-icons.json');
const L = Array.isArray(base) ? base : (base.cards || base.players);
const iconIds = L.map((c) => String(c.cardId || c.id));
const zh = new Map(L.map((c) => [String(c.cardId || c.id), c.nameZh || c.name]));

const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const prev = j('automation/runs/2026-09-21/icons-heroes/work/research-prev-t03.json');
const prevById = new Map(prev.rows.map((r) => [String(r.id), r]));
const resById = new Map(res.rows.map((r) => [String(r.id), r]));

const price = (id) => {
  const c = cur.cards[id];
  return { con: c.platforms.console.price, pc: c.platforms.pc.price, cv: c.platforms.console.valid, pv: c.platforms.pc.valid, rep: Math.max(c.platforms.console.valid ? c.platforms.console.price : 0, c.platforms.pc.valid ? c.platforms.pc.price : 0), max: c.priceRange.max, min: c.priceRange.min };
};
const ratio = (id) => { const r = resById.get(id); const f = r.fc26Launch; return f != null ? f / (r.fc27Current.representative || NaN) : NaN; };

const hitCur = res.rows.filter((r) => r.advice).map((r) => String(r.id));
const hitPrev = prev.rows.filter((r) => r.advice).map((r) => String(r.id));
const inSet = hitCur.filter((id) => !hitPrev.includes(id));
const outSet = hitPrev.filter((id) => !hitCur.includes(id));

P('===== 进（新命中） =====');
for (const id of inSet) {
  const r = resById.get(id), p = prevById.get(id), q = price(id);
  P(`  ${zh.get(id)} ${id} | con ${q.con.toLocaleString()} pc ${q.pc.toLocaleString()} rep ${q.rep.toLocaleString()} | fc26Launch ${r.fc26Launch.toLocaleString()} | 余量比 ${(r.fc26Launch / q.rep).toFixed(4)} | 前轮 rep ${p.fc27Current.representative} 余量比 ${p.fc26Launch ? (p.fc26Launch / p.fc27Current.representative).toFixed(4) : 'n/a'} | condA=${r.condA} condB=${r.condB}`);
}
P('\n===== 出（掉出） =====');
for (const id of outSet) {
  const r = resById.get(id), p = prevById.get(id), q = price(id);
  P(`  ${zh.get(id)} ${id} | 前轮 con ${p.fc27Current.console.toLocaleString()} pc ${p.fc27Current.pc.toLocaleString()} → 本轮 con ${q.con.toLocaleString()} pc ${q.pc.toLocaleString()} | rep ${q.rep.toLocaleString()} | fc26Launch ${p.fc26Launch.toLocaleString()} | 余量比 ${p.fc26Launch ? (p.fc26Launch / p.fc27Current.representative).toFixed(4) : 'n/a'} → ${q.rep ? (p.fc26Launch / q.rep).toFixed(4) : 'null(双平台失效)'} | condA=${r.condA}`);
}
P('\n===== condB 命中（全场） =====');
for (const r of res.rows.filter((x) => x.condB)) P(`  ${r.nameZh} ${r.id} | fc27Max ${r.fc27Max?.toLocaleString()} < fc26Launch ${r.fc26Launch.toLocaleString()} | rep ${r.fc27Current.representative}`);
P(`\ncondA=null 不适用 ${res.rows.filter((r) => r.condA === null).length} 张（多为双平台无有效价）`);

P('\n===== 保留卡余量最窄 Top12（fc26Launch ÷ representative 升序） =====');
const rowsT = res.rows.filter((r) => r.advice).map((r) => {
  const q = price(String(r.id));
  return { id: String(r.id), n: zh.get(String(r.id)), v: r.fc26Launch / q.rep, rep: q.rep, f: r.fc26Launch };
}).filter((x) => isFinite(x.v)).sort((a, b) => a.v - b.v);
rowsT.slice(0, 12).forEach((x, i) => P(`  ${i + 1}. ${x.n} ${x.id} ${x.v.toFixed(4)}（fc26 ${x.f.toLocaleString()} ÷ rep ${x.rep.toLocaleString()}）`));

P('\n===== 区间极值并列集 =====');
const minSet = [], maxSet = [];
for (const id of iconIds) {
  const c = cur.cards[id];
  if (c.priceRange.min === 69000) minSet.push(`${zh.get(id)} ${id}`);
  if (c.priceRange.max === 15000000) maxSet.push(id);
}
P(`  下沿 69,000 并列 ${minSet.length} 张: ${minSet.join(' / ')}`);
P(`  上沿 15,000,000 并列 ${maxSet.length} 张（仅计数）`);

P('\n===== 改动面（绝对时刻 2026-09-21 07:47:00 之后，排除 work/ .git .workbuddy） =====');
const exec = (cmd) => {
  const r = execSync(cmd, { cwd: ROOT, encoding: 'utf8' });
  return r.trim().split('\n').filter(Boolean);
};
const changed = exec(`find . -type f -newermt '2026-09-21 07:47:00' -not -path './.git/*' -not -path './.workbuddy/*' -not -path '*/work/*' -not -path './node_modules/*'`);
changed.forEach((f) => {
  const st = fs.statSync(path.join(ROOT, f));
  P(`  ${f}  ${st.size} B  ${st.mtime.toISOString()}`);
});
P(`  合计 ${changed.length} 项`);

P('\n===== 红线核查（关键文件 mtime，均须早于本轮起跑） =====');
for (const f of [
  'automation/publish-status-2026-09-21.json',
  'automation/publish-status-2026-09-20.json',
  `automation/runs/${D}/icons-heroes/owner.json`,
  `reports/daily/${D}/market.html`,
  'daily-merged/index.html',
  `automation/runs/${D}/icons-heroes/hourly-07-failed.json`,
]) {
  try { const st = fs.statSync(path.join(ROOT, f)); P(`  ${f} → ${st.mtime.toISOString()} (${st.size} B)`); }
  catch { P(`  ${f} → 不存在`); }
}
