// 一次性脚本（临时）：T00 轮「前、本轮命中集」按分析器真实输入（research rows）自洽复算，
// 作为「判定链无回归」的独立证据（不依赖 hourly 快照口径，避免部分失败轮造成的假差异）。
// 口径：命中集 = 从 research rows 的 fc27Current.representative / fc27Max / fc26Launch 复算。
// 输入：research（T00）+ research-prev-t23.json（2026-09-19T23）+ hourly 2026-09-19T23（仅用于核查该轮是否含未采集卡）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(a.join(' '));

const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const pres = j('automation/runs/2026-09-20/icons-heroes/work/research-prev-t23.json');
const hPrev = j('apps/market/engine/icons/data/prices/fc27/pricerange/hourly/2026-09-19T23.json');

const hitFromRows = (rows) => rows.filter((r) => {
  const f = r.fc26Launch;
  if (typeof f !== 'number') return false;
  const rep = r.fc27Current?.representative ?? 0;
  const condA = rep >= 1000 ? f > rep : null;
  const max = r.fc27Max ?? 0;
  const condB = max > 0 ? f > max : null;
  return condA === true || condB === true;
}).map((r) => String(r.id)).sort();

const hitPrevRows = hitFromRows(pres.rows);
const hitNowRows = hitFromRows(res.rows);
const advPrevFile = pres.rows.filter((r) => r.advice).map((r) => String(r.id)).sort();
const advNowFile = res.rows.filter((r) => r.advice).map((r) => String(r.id)).sort();
const d = (a, b) => `${a.filter((x) => !b.includes(x)).length}/${b.filter((x) => !a.includes(x)).length}`;

P(`[自洽复算] T23(前轮) 文件自判=${advPrevFile.length} 与 rows 复算=${hitPrevRows.length} 差异=${d(hitPrevRows, advPrevFile)}`);
P(`[自洽复算] T00(本轮) 文件自判=${advNowFile.length} 与 rows 复算=${hitNowRows.length} 差异=${d(hitNowRows, advNowFile)}`);

// 上一轮是否含未采集卡（部分失败轮会令 hourly 基线口径失真，此处仅作核查）
const prevCards = new Map((hPrev.cards || []).map((c) => [String(c.id), c]));
const unfetched = (hPrev.cards || []).filter((c) => c.ok === false).map((c) => String(c.id));
P(`[基线核查] T23 未采集卡=${unfetched.length} 张${unfetched.length ? '：' + unfetched.map((id) => pres.rows.find((r) => String(r.id) === id)?.nameZh || id).join(' / ') : '（T23 为全量成功轮 ⇒ hourly 基线本轮同样可信）'}`);
const affected = unfetched.filter((id) => advPrevFile.includes(id));
P(`[基线核查] 未采集但在 T23 命中集内=${affected.length} 张${affected.length ? '：' + affected.map((id) => `${pres.rows.find((r) => String(r.id) === id)?.nameZh}(${id}) T23保留观测 con${prevCards.get(id)?.current?.console} pc${prevCards.get(id)?.current?.pc}`).join(' | ') : ''}`);

// 真实进/出（以 rows 自洽复算的 T23 命中集为基线）
const inNow = hitNowRows.filter((x) => !hitPrevRows.includes(x));
const outNow = hitPrevRows.filter((x) => !hitNowRows.includes(x));
P(`[真实变动] 建议集 T23 ${hitPrevRows.length} → T00 ${hitNowRows.length}（进 ${inNow.length} 出 ${outNow.length}）`);
P(`  进: ${inNow.map((id) => { const r = res.rows.find((x) => String(x.id) === id); return `${r.nameZh}(${id}) con${r.fc27Current?.console} pc${r.fc27Current?.pc} rep${r.fc27Current?.representative} vs FC26 ${r.fc26Launch} → ${r.condA ? 'condA' : ''}${r.condB ? 'condB' : ''}`; }).join(' · ') || '无'}`);
P(`  出: ${outNow.map((id) => { const p = pres.rows.find((x) => String(x.id) === id); const n = res.rows.find((x) => String(x.id) === id); return `${n.nameZh}(${id}) rep ${p.fc27Current?.representative}→${n.fc27Current?.representative} (FC26 ${n.fc26Launch})`; }).join(' · ') || '无'}`);

// 余量最窄 Top12（fc26Launch ÷ representative，仅含 condA 成立者）
const margins = res.rows.filter((r) => r.condA === true && (r.fc27Current?.representative ?? 0) > 0)
  .map((r) => ({ n: r.nameZh, id: r.id, m: r.fc26Launch / r.fc27Current.representative }))
  .sort((a, b) => a.m - b.m);
P(`[余量最窄 Top12] ${margins.slice(0, 12).map((x) => `${x.n} ${x.m.toFixed(4)}`).join(' · ')}`);
P(`[condB 命中] ${res.rows.filter((r) => r.condB === true).map((r) => `${r.nameZh}(${r.id}) max=${r.fc27Max} < FC26 ${r.fc26Launch}`).join(' · ') || '无'}`);
P(`[condA null 不适用] ${res.rows.filter((r) => r.condA === null).length} 张 · 无FC26对照=${res.rows.filter((r) => typeof r.fc26Launch !== 'number').length} 张`);
