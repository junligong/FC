// 一次性脚本（临时）：T17 轮「前轮命中集」按分析器真实输入复算，消除部分失败轮（T16 首批 8 张 403）造成的假差异。
// 口径：前轮命中集一律从 research-prev-t16.json 的 rows（= T16 分析器实际读取的 fc27Current/priceRange + fc26Launch）复算，
//      不得用 hourly T16 快照复算（其未采集卡为空值，会产生假「出」项）。当前轮同样从 res.rows 自洽复算做交叉验证。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-19';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(a.join(' '));

const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const pres = j('automation/runs/2026-09-19/icons-heroes/work/research-prev-t16.json');
const hPrev = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T16.json`);

// 从「研究文件 rows」自洽复算（分析器输入口径）：fc27Current.representative 为当前价，priceRange.max 为区间上沿
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

P(`[自洽复算] T16(前轮) 文件自判=${advPrevFile.length} 与 rows 复算=${hitPrevRows.length} 差异=${d(hitPrevRows, advPrevFile)}`);
P(`[自洽复算] T18(本轮) 文件自判=${advNowFile.length} 与 rows 复算=${hitNowRows.length} 差异=${d(hitNowRows, advNowFile)}`);

// 定位假差异：T16 快照未采集卡（current 两平台均为 0）在「快照口径复算」中会丢失
const prevCards = new Map((hPrev.cards || []).map((c) => [String(c.id), c]));
const unfetched = (hPrev.cards || []).filter((c) => c.ok === false).map((c) => String(c.id));
P(`[假差异根因] T16 未采集卡=${unfetched.length} 张：${unfetched.map((id) => pres.rows.find((r) => String(r.id) === id)?.nameZh || id).join(' / ')}`);
const affected = unfetched.filter((id) => advPrevFile.includes(id));
P(`[假差异清单] 未采集但在 T16 命中集内=${affected.length} 张：${affected.map((id) => `${pres.rows.find((r) => String(r.id) === id)?.nameZh}(${id}) T16保留观测 con${prevCards.get(id)?.current?.console} pc${prevCards.get(id)?.current?.pc} → 复算时判为不适用`).join(' | ')}`);

// 真实进/出（以 rows 自洽复算的 T16 命中集为基线）
const inNow = hitNowRows.filter((x) => !hitPrevRows.includes(x));
const outNow = hitPrevRows.filter((x) => !hitNowRows.includes(x));
const nm = (id, src) => { const r = src.rows.find((x) => String(x.id) === id); return `${r?.nameZh || r?.name}(${id})`; };
P(`[真实变动] 建议集 T16 ${hitPrevRows.length} → T18 ${hitNowRows.length}（进 ${inNow.length} 出 ${outNow.length}）`);
P(`  进: ${inNow.map((id) => { const r = res.rows.find((x) => String(x.id) === id); return `${r.nameZh}(${id}) con${r.fc27Current?.console} pc${r.fc27Current?.pc} rep${r.fc27Current?.representative} vs FC26 ${r.fc26Launch} → ${r.condA ? 'condA' : ''}${r.condB ? 'condB' : ''}`; }).join(' · ')}`);
P(`  出: ${outNow.map((id) => { const p = pres.rows.find((x) => String(x.id) === id); const n = res.rows.find((x) => String(x.id) === id); return `${n.nameZh}(${id}) rep ${p.fc27Current?.representative}→${n.fc27Current?.representative} (FC26 ${n.fc26Launch})`; }).join(' · ')}`);

// 余量最窄 Top12（fc26Launch ÷ representative，仅含 condA 成立者）
const margins = res.rows.filter((r) => r.condA === true && (r.fc27Current?.representative ?? 0) > 0)
  .map((r) => ({ n: r.nameZh, id: r.id, m: r.fc26Launch / r.fc27Current.representative }))
  .sort((a, b) => a.m - b.m);
P(`[余量最窄 Top12] ${margins.slice(0, 12).map((x) => `${x.n} ${x.m.toFixed(4)}`).join(' · ')}`);
P(`[condB 命中] ${res.rows.filter((r) => r.condB === true).map((r) => `${r.nameZh}(${r.id}) max=${r.fc27Max} < FC26 ${r.fc26Launch}`).join(' · ') || '无'}`);
