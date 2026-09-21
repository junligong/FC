// verify-t23.mjs —— 本轮（2026-09-20 T23）产物一致性校验（只读，不改任何产物）
// 覆盖：current.json 完整性 / 三副本 sha256 / current↔序列 / current↔daily 快照 /
//       区间极值（含并列张数与越界） / 研究判定链独立按 cardId 重算 / 同时段建议分级分布
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const HH = '23';
const PREV_AT = '2026-09-20T11:25:01.064Z'; // 上一实际轮 T19 的采集时刻
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');
const size = p => fs.statSync(path.join(ROOT, p)).size;
const out = [];
const say = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

const cur = read('apps/market/engine/data/prices/fc27/current.json');
const series = read('apps/market/engine/icons/data/prices/fc27/series/icons.json');
const latest = read('apps/market/engine/icons/data/prices/fc27/pricerange/latest.json');
const daily = read(`apps/market/engine/icons/data/prices/fc27/daily/${D}.json`);
const research = read(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const advice = read(`apps/market/engine/icons/data/research/same-period-${D}.json`);
const baseIcons = read('apps/market/engine/icons/data/prices/fc27/base-icons.json');
const fc26 = read('apps/market/engine/icons/data/prices/fc26/base-icons.json');

const roster = (baseIcons.cards || baseIcons.players || baseIcons).filter
  ? (baseIcons.cards || baseIcons.players || baseIcons)
  : null;
const rosterIds = (Array.isArray(roster) ? roster : Object.values(roster)).map(x => String(x.cardId ?? x.id));
say(`[名单] base-icons.json 传奇卡 ${rosterIds.length} 张，launchDate=${baseIcons.launchDate}`);

// ---------- 1. current.json 传奇段完整性 ----------
const allKeys = Object.keys(cur.cards);
const iconKeys = allKeys.filter(k => cur.cards[k].cardType === 'icon');
let miss = [], scopeBad = 0, dualBad = 0, updBad = 0, srcBad = 0;
for (const id of rosterIds) {
  const c = cur.cards[id];
  if (!c) { miss.push(id); continue; }
  if (c.priceRange?.scope !== 'card') scopeBad++;
  if (!c.platforms || !('console' in c.platforms) || !('pc' in c.platforms)) dualBad++;
  if (c.updatedAt !== c.priceRange?.observedAt) updBad++;
  if (c.platforms.console?.source !== 'futbin-icon-detail' || c.platforms.pc?.source !== 'futbin-icon-detail') srcBad++;
}
say(`[current.json] 总条目 ${allKeys.length}（icon ${iconKeys.length} / 非传奇 ${allKeys.length - iconKeys.length}）· generatedAt ${cur.generatedAt} · minValidPrice ${cur.minValidPrice}`);
say(`[current.json] 传奇命中 ${rosterIds.length - miss.length}/${rosterIds.length} · 缺失 ${miss.length} ${miss.slice(0, 10).join(',')}`);
say(`[current.json] 违例：scope≠card ${scopeBad} · 双平台键缺失 ${dualBad} · updatedAt≠observedAt ${updBad} · source≠futbin-icon-detail ${srcBad}`);
say(`[current.json] sources=${JSON.stringify(Object.fromEntries(Object.entries(cur.sources || {}).map(([k, v]) => [k, `${v.count ?? '?'}@${v.at ?? v.observedAt ?? '?'}`])))}`);

// ---------- 2. current ↔ 序列本轮观测 ----------
const lastPoint = series.points[series.points.length - 1];
const prevPoint = series.points[series.points.length - 2];
say(`[series] points ${series.points.length} · 本轮 ${lastPoint.hour} @${lastPoint.at} basis=${lastPoint.priceBasis} counts=${JSON.stringify(lastPoint.counts)} errors=${lastPoint.errors.length}`);
say(`[series] 上一实际轮 ${prevPoint.hour} @${prevPoint.at} basis=${prevPoint.priceBasis}（与 T19 记录 ${PREV_AT} ${prevPoint.at === PREV_AT ? '一致 ✔' : '不一致 ✘'}）`);
let serMis = 0, serChk = 0;
for (const id of rosterIds) {
  const card = series.cards?.[id]; const c = cur.cards[id];
  if (!card || !c) continue;
  const row = card.price.find(r => r.h === lastPoint.hour);
  if (!row) { serMis++; continue; }
  serChk++;
  const psOk = (row.ps || 0) === (c.platforms.console.price || 0);
  const pcOk = (row.pc || 0) === (c.platforms.pc.price || 0);
  const rOk = (row.rmin ?? null) === (c.priceRange.min ?? null) && (row.rmax ?? null) === (c.priceRange.max ?? null);
  if (!psOk || !pcOk || !rOk) serMis++;
}
say(`[current↔序列] 逐卡核对 ${serChk} 张，不一致 ${serMis} 张`);

// ---------- 3. current ↔ daily 快照 ----------
let dMis = 0, dChk = 0, dRange = 0;
for (const id of rosterIds) {
  const c = cur.cards[id];
  const p = (daily.players || []).find(x => String(x.id ?? x.cardId) === id);
  if (!c || !p) continue;
  dChk++;
  const pl = p.platforms || {};
  if ((pl.console?.price || 0) !== (c.platforms.console.price || 0)) dMis++;
  else if ((pl.pc?.price || 0) !== (c.platforms.pc.price || 0)) dMis++;
  if ((p.priceRange?.min ?? null) !== (c.priceRange.min ?? null)) dRange++;
}
say(`[current↔daily] 逐卡核对 ${dChk} 张 · 平台价不一致 ${dMis} · 区间不一致 ${dRange}`);
say(`[daily] 顶层 priceRange=${JSON.stringify(daily.priceRange)} · counts=${JSON.stringify(daily.counts)} · launchDate=${daily.launchDate} · priceBasis=${daily.priceBasis}`);

// ---------- 4. 区间极值 ----------
const mins = rosterIds.map(id => cur.cards[id]?.priceRange?.min).filter(v => v != null);
const maxs = rosterIds.map(id => cur.cards[id]?.priceRange?.max).filter(v => v != null);
const lo = Math.min(...mins), hi = Math.max(...maxs);
const loIds = rosterIds.filter(id => cur.cards[id]?.priceRange?.min === lo);
const hiIds = rosterIds.filter(id => cur.cards[id]?.priceRange?.max === hi);
const nm = id => `${cur.cards[id]?.nameZh || cur.cards[id]?.name}(${id})`;
say(`[极值] 下沿最低 ${lo.toLocaleString()}（${loIds.length} 张并列）: ${loIds.map(nm).join(' / ')}`);
say(`[极值] 上沿最高 ${hi.toLocaleString()}（${hiIds.length} 张并列）`);
let oob = 0, eqHi = 0, zeroW = 0;
for (const id of rosterIds) {
  const c = cur.cards[id]; if (!c) continue;
  for (const pl of ['console', 'pc']) {
    const v = c.platforms[pl];
    if (v?.valid && (v.price < c.priceRange.min || v.price > c.priceRange.max)) oob++;
    if (v?.valid && v.price === hi) eqHi++;
  }
  if (c.priceRange.max === c.priceRange.min) zeroW++;
}
say(`[极值] 有效平台价越界 [min,max] ${oob} 处 · 恰等于上沿 ${eqHi} 处 · 区间宽度 0 ${zeroW} 张 · 区间缺失 ${131 - mins.length} 张`);
say(`[极值] latest.json minFloor=${latest.counts?.minFloor} maxCeiling=${latest.counts?.maxCeiling} 与实算 ${lo}/${hi} ${latest.counts?.minFloor === lo && latest.counts?.maxCeiling === hi ? '一致 ✔' : '不一致 ✘'}`);

// ---------- 5. 研究判定链独立重算（按 cardId） ----------
const fc26bySlug = new Map();
for (const c of (fc26.cards || fc26.players || [])) fc26bySlug.set(c.slug, c.prices?.cross?.[0] ?? null);
const slugOf = id => (baseIcons.cards || baseIcons).find?.(x => String(x.cardId) === id)?.slug ?? cur.cards[id]?.slug;
let reAdv = 0, reA = 0, reB = 0, reNo = 0, nullA = 0, drift = 0;
for (const id of rosterIds) {
  const c = cur.cards[id]; if (!c) continue;
  const launch = fc26bySlug.get(slugOf(id));
  if (launch == null) { reNo++; continue; }
  const rep = Math.max(c.platforms.console.valid ? c.platforms.console.price : 0, c.platforms.pc.valid ? c.platforms.pc.price : 0);
  const a = rep >= 1000 ? launch > rep : null;
  const b = c.priceRange.max != null ? launch > c.priceRange.max : null;
  if (a === true) reA++; else if (a === null) nullA++;
  if (b === true) reB++;
  if (a === true || b === true) reAdv++;
  const rr = (research.rows || []).find(x => String(x.id ?? x.cardId) === id);
  if (rr && rr.fc26Launch != null && Math.abs(rr.fc26Launch - launch) > 1) drift++;
}
say(`[研究] 脚本自判 advice=${research.counts.advice} condA=${research.counts.condA} condB=${research.counts.condB} noFc26=${research.counts.noFc26} noRange=${research.counts.noRange}`);
say(`[研究] verify 独立重算 advice=${reAdv} condA=${reA} condB=${reB} noFc26=${reNo} condA不适用(null)=${nullA}`);
say(`[研究] 差异：advice ${research.counts.advice - reAdv} · condA ${research.counts.condA - reA} · condB ${research.counts.condB - reB} · noFc26 ${research.counts.noFc26 - reNo}`);
say(`[研究] FC26 映射并发漂移 ${drift} 张 · counts=${JSON.stringify(research.counts)} · rangeCollectedAt=${research.rangeCollectedAt} · priceBasis=${research.priceBasis}`);
const hit = (research.rows || []).filter(r => r.advice === true || r.isAdvice === true || r.condA === true || r.condB === true);
say(`[研究] rows 命中数 ${hit.length} · nameZh 缺失 ${hit.filter(r => !r.nameZh).length} · rows 行数 ${(research.rows || []).length}`);

// ---------- 6. 同时段建议 ----------
say(`[同时段] meta dayOffset=${advice.dayOffset} dayN=${advice.dayN} fc27=${advice.fc27LaunchDate} fc26=${advice.fc26LaunchDate} sameDay=${advice.fc26SameDayDate} minValid=${advice.minValidPrice}`);
for (const g of ['icons', 'heroes']) {
  const rows = advice[g] || [];
  const cnt = {}; let cmp = 0;
  for (const r of rows) {
    cnt[r.tierLabel] = (cnt[r.tierLabel] || 0) + 1;
    if (r.sameDayRatio != null) cmp++;
  }
  say(`[同时段] ${g} 共 ${rows.length} 张（可对照 ${cmp}）· ${JSON.stringify(cnt)}`);
  const buy = rows.filter(r => r.tier === 'buy');
  if (buy.length) say(`[同时段] ${g} 买入窗口: ${buy.map(r => `${r.nameZh || r.name}(${r.id}) 同期比${r.sameDayRatio?.toFixed(4)} 走势${r.forwardRatio?.toFixed(4)}`).join(' / ')}`);
  const missZh = rows.filter(r => !r.nameZh).length;
  say(`[同时段] ${g} nameZh 缺失 ${missZh}/${rows.length}`);
}

// ---------- 7. 三个行情副本 sha256 ----------
const copies = ['apps/market/engine/data/prices/fc27/current.json',
  `reports/daily/${D}/assets/data/current.json`, 'daily-merged/assets/data/current.json'];
const hashes = copies.map(sha);
say(`[副本] ${copies.map((p, i) => `${p} ${hashes[i].slice(0, 16)} ${size(p)}B`).join(' | ')}`);
say(`[副本] 三副本 sha256 ${new Set(hashes).size === 1 ? '全等 ✔' : '不等 ✘'}`);

// ---------- 8. 产物大小 ----------
for (const p of [`reports/daily/${D}/market-icons-research.html`, `reports/daily/${D}/icons-heroes.html`,
  `reports/daily/${D}/same-period-advice.html`, 'apps/market/engine/icons/reports/fc27-icon-live-research.html',
  'apps/market/engine/icons/reports/fc27-same-period-advice.html']) {
  say(`[产物] ${p} ${size(p)}B sha=${sha(p).slice(0, 16)}`);
}
say(`[产物] 研究当日页 ↔ 常驻底稿 ${sha(`reports/daily/${D}/market-icons-research.html`) === sha('apps/market/engine/icons/reports/fc27-icon-live-research.html') ? '逐字节一致 ✔' : '不一致 ✘'}`);
say(`[产物] 同时段当日页 ↔ 常驻底稿 ${sha(`reports/daily/${D}/same-period-advice.html`) === sha('apps/market/engine/icons/reports/fc27-same-period-advice.html') ? '逐字节一致 ✔' : '不一致 ✘'}`);
say(`[产物] latest.json ↔ 序列本轮行数一致性（latest ${latest.cards?.length ?? Object.keys(latest.cards || {}).length}）`);
fs.writeFileSync(path.join(ROOT, `automation/runs/${D}/icons-heroes/work/verify-t23-report.txt`), out.join('\n'));
