// 一次性脚本（临时）：icons-pricerange-hourly 2026-09-21 T03 轮产物一致性校验。
// 只读，不改任何产物。全部跨文件关联一律按 cardId（禁用 slug / name）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-21';
const HH = '03';
const PREV_D = '2026-09-20';
const COLLECTED_AT = '2026-09-20T19:43:41.093Z';
const MIN_VALID_PRICE = 1000;

const P = (...a) => console.log(...a);
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex').slice(0, 16);
const stat = (p) => fs.statSync(path.join(ROOT, p));
let FAIL = 0;
const chk = (name, bad, detail = '') => {
  if (bad) FAIL++;
  P(`${bad ? '✗' : '✓'} ${name}${detail ? ' — ' + detail : ''}`);
};

const cur = j('apps/market/engine/data/prices/fc27/current.json');
const latest = j('apps/market/engine/icons/data/prices/fc27/pricerange/latest.json');
const daily = j(`apps/market/engine/icons/data/prices/fc27/daily/${D}.json`);
const series = j('apps/market/engine/icons/data/prices/fc27/series/icons.json');
const research = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const prev = j('automation/runs/2026-09-21/icons-heroes/work/research-prev-t23.json');
const samePeriod = j(`apps/market/engine/icons/data/research/same-period-${D}.json`);
const base = j('apps/market/engine/icons/data/prices/fc27/base-icons.json');
const baseList = Array.isArray(base) ? base : (base.cards || base.players || base.icons);

P('===== A. current.json 完整性 =====');
P(`current.generatedAt=${cur.generatedAt} · cards=${Object.keys(cur.cards).length}`);
const iconIds = baseList.map((c) => String(c.cardId || c.id));
chk('名单计数 131', iconIds.length !== 131, `base-icons ${iconIds.length} 张`);
const iconCards = iconIds.map((id) => cur.cards[id]).filter(Boolean);
chk('current 命中 131/131', iconCards.length !== 131, `命中 ${iconCards.length}/131`);
let v1 = 0, v2 = 0, v3 = 0, v4 = 0;
for (const id of iconIds) {
  const c = cur.cards[id];
  if (!c) continue;
  if (c.cardType !== 'icon') v1++;
  if (c.priceRange?.scope !== 'card') v2++;
  if (!c.platforms?.console || !c.platforms?.pc) v3++;
  if (c.updatedAt !== COLLECTED_AT) v4++;
}
chk('cardType=icon 违例 0', v1 !== 0, `${v1} 张`);
chk('priceRange.scope=card 违例 0', v2 !== 0, `${v2} 张`);
chk('双平台键缺失 0', v3 !== 0, `${v3} 张`);
chk(`updatedAt=采集时(${COLLECTED_AT}) 违例 0`, v4 !== 0, `${v4} 张`);
let v5 = 0, v6 = 0;
for (const id of iconIds) {
  const c = cur.cards[id];
  for (const p of ['console', 'pc']) {
    if (c.platforms[p].observedAt !== COLLECTED_AT) v5++;
    if (c.platforms[p].source !== 'futbin-icon-detail') v6++;
    if (c.platforms[p].valid && !(c.platforms[p].price >= MIN_VALID_PRICE)) v6++;
  }
  if (c.priceRange.source !== 'futbin-icon-detail' || c.priceRange.observedAt !== COLLECTED_AT) v5++;
}
chk('平台 observedAt/source + valid↔≥1000 违例 0', v5 !== 0 || v6 !== 0, `${v5}+${v6}`);
const curValid = { console: 0, pc: 0, any: 0 };
for (const id of iconIds) {
  const c = cur.cards[id];
  const cc = c.platforms.console.valid, pc = c.platforms.pc.valid;
  if (cc) curValid.console++;
  if (pc) curValid.pc++;
  if (cc || pc) curValid.any++;
}
P(`  current 有效价：Console ${curValid.console} / PC ${curValid.pc} / 任一 ${curValid.any}`);

P('\n===== B. current ↔ latest.json（本轮采集） =====');
P(`latest.collectedAt=${latest.collectedAt} · priceBasis=${latest.priceBasis} · counts=${JSON.stringify(latest.counts)}`);
chk('latest.collectedAt = 本轮采集时', latest.collectedAt !== COLLECTED_AT, latest.collectedAt);
const latestById = new Map(latest.cards.map((c) => [String(c.id), c]));
let b1 = 0, b2 = 0, b3 = 0;
for (const id of iconIds) {
  const c = cur.cards[id], l = latestById.get(id);
  if (!l) { b3++; continue; }
  if (c.platforms.console.price !== l.current.console || c.platforms.pc.price !== l.current.pc) b1++;
  if (c.platforms.console.valid !== l.currentValid.console || c.platforms.pc.valid !== l.currentValid.pc) b2++;
  if (c.priceRange.min !== l.priceRange.min || c.priceRange.max !== l.priceRange.max) b3++;
}
chk('current ↔ latest 平台价不一致 0', b1 !== 0, `${b1} 张`);
chk('current ↔ latest 有效性不一致 0', b2 !== 0, `${b2} 张`);
chk('current ↔ latest 区间不一致/缺卡 0', b3 !== 0, `${b3} 张`);

P('\n===== C. current ↔ 当日快照 =====');
const dPlayers = daily.players || daily.cards;
P(`daily players=${dPlayers.length} · counts=${JSON.stringify(daily.counts)} · launchDate=${daily.launchDate} · priceBasis=${daily.priceBasis}`);
chk('daily players 131', dPlayers.length !== 131, `${dPlayers.length}`);
const dById = new Map(dPlayers.map((p) => [String(p.id || p.cardId), p]));
let c1 = 0, c2 = 0;
for (const id of iconIds) {
  const c = cur.cards[id], d = dById.get(id);
  if (!d) { c1++; continue; }
  if (d.platforms.console.price !== c.platforms.console.price || d.platforms.pc.price !== c.platforms.pc.price) c1++;
  if (d.platforms.console.valid !== c.platforms.console.valid || d.platforms.pc.valid !== c.platforms.pc.valid) c1++;
  if (d.priceRange?.min !== c.priceRange.min || d.priceRange?.max !== c.priceRange.max) c2++;
}
chk('current ↔ daily 平台价不一致/缺卡 0', c1 !== 0, `${c1} 张`);
chk('current ↔ daily 区间不一致 0', c2 !== 0, `${c2} 张`);
P(`  daily 顶层 priceRange：${JSON.stringify(daily.priceRange)}`);
const dValid = { console: 0, pc: 0, any: 0 };
for (const p of dPlayers) {
  if (p.platforms.console.valid) dValid.console++;
  if (p.platforms.pc.valid) dValid.pc++;
  if (p.platforms.console.valid || p.platforms.pc.valid) dValid.any++;
  if (p.platforms.console.price !== undefined && p.platforms.console.valid !== undefined) { /* ok */ }
}
P(`  daily 有效价：Console ${dValid.console} / PC ${dValid.pc} / 任一 ${dValid.any}`);
// 快照内不得出现涨跌字段
const dText = fs.readFileSync(path.join(ROOT, `apps/market/engine/icons/data/prices/fc27/daily/${D}.json`), 'utf8');
const trendHits = ['dayOverDay', 'changePct', 'cumulative', 'dailyChange', 'priceChange'].filter((k) => dText.includes(k));
chk('当日快照内无涨跌字段', trendHits.length !== 0, trendHits.join(','));

P('\n===== D. current ↔ series 本轮观测行 =====');
const lastPoint = series.points[series.points.length - 1];
P(`series.points=${series.points.length} · 末点 hour=${lastPoint.hour} at=${lastPoint.at} counts=${JSON.stringify(lastPoint.counts)}`);
chk(`series 末点 hour=${D}T${HH}`, lastPoint.hour !== `${D}T${HH}`, lastPoint.hour);
chk('series 末点 at = 本轮采集时', lastPoint.at !== COLLECTED_AT, lastPoint.at);
let d1 = 0, d2 = 0, d3 = 0;
for (const id of iconIds) {
  const c = cur.cards[id];
  const row = (series.cards[id]?.price || []).find((r) => r.h === `${D}T${HH}`);
  if (!row) { d3++; continue; }
  if (row.ps !== c.platforms.console.price || row.pc !== c.platforms.pc.price) d1++;
  if (row.rmin !== c.priceRange.min || row.rmax !== c.priceRange.max) d2++;
}
chk('current ↔ series 平台价不一致 0', d1 !== 0, `${d1} 张`);
chk('current ↔ series 区间(rmin/rmax)不一致 0', d2 !== 0, `${d2} 张`);
chk('series 本轮行缺失 0', d3 !== 0, `${d3} 张`);

P('\n===== E. 三副本 sha256 =====');
const copies = [
  'apps/market/engine/data/prices/fc27/current.json',
  `reports/daily/${D}/assets/data/current.json`,
  'daily-merged/assets/data/current.json',
];
const hashes = copies.map((p) => { try { return sha(p); } catch (e) { return 'MISSING'; } });
hashes.forEach((h, i) => P(`  ${h}  ${copies[i]}`));
chk('三副本 sha256 全等', new Set(hashes).size !== 1, hashes.join(' / '));
P(`  主文件 ${stat(copies[0]).size} B`);

P('\n===== F. 区间极值 =====');
const minMap = new Map(), maxMap = new Map();
let equalCeil = 0, outOfRange = 0, zeroWidth = 0, noRange = 0;
for (const id of iconIds) {
  const c = cur.cards[id];
  const { min, max } = c.priceRange || {};
  if (typeof min !== 'number' || typeof max !== 'number') { noRange++; continue; }
  minMap.set(min, (minMap.get(min) || 0) + 1);
  maxMap.set(max, (maxMap.get(max) || 0) + 1);
  if (min === max) zeroWidth++;
  for (const p of ['console', 'pc']) {
    const v = c.platforms[p];
    if (v.valid && (v.price < min || v.price > max)) outOfRange++;
    if (v.valid && v.price === max) equalCeil++;
  }
}
const minFloor = Math.min(...minMap.keys()), maxCeil = Math.max(...maxMap.keys());
P(`  下沿最低 ${minFloor.toLocaleString()}（${minMap.get(minFloor)} 张并列）· 上沿最高 ${maxCeil.toLocaleString()}（${maxMap.get(maxCeil)} 张并列）`);
chk('区间缺失 0', noRange !== 0, `${noRange} 张`);
chk('区间宽度 0 违例 0', zeroWidth !== 0, `${zeroWidth} 张`);
chk('有效平台价越界 0', outOfRange !== 0, `${outOfRange} 处`);
chk('latest.counts.minFloor/maxCeiling 与实算一致', latest.counts.minFloor !== minFloor || latest.counts.maxCeiling !== maxCeil,
  `latest ${latest.counts.minFloor}/${latest.counts.maxCeiling} vs 实算 ${minFloor}/${maxCeil}`);
P(`  恰等于上沿 15,000,000 者 ${equalCeil} 处 · 有效平台价合计 ${curValid.console + curValid.pc}`);

P('\n===== G. 研究文件复算（按 cardId 独立重算） =====');
chk('rows 131', research.rows.length !== 131, `${research.rows.length}`);
const rowIds = research.rows.map((r) => String(r.id));
chk('rows id 去重 131', new Set(rowIds).size !== 131, `${new Set(rowIds).size}`);
const rc = (rows) => {
  let condA = 0, condB = 0, both = 0, advice = 0, noFc26 = 0, noRange = 0;
  for (const r of rows) {
    if (r.fc26Launch == null) { noFc26++; continue; }
    const rep = r.fc27Current?.representative;
    const a = rep != null && rep >= MIN_VALID_PRICE && r.fc26Launch > rep;
    const b = r.fc27Max != null && r.fc26Launch > r.fc27Max;
    if (r.fc27Max == null && r.fc27Min == null) noRange++;
    if (a) condA++;
    if (b) condB++;
    if (a && b) both++;
    if (a || b) advice++;
  }
  return { condA, condB, both, advice, noFc26, noRange };
};
const re = rc(research.rows);
const sc = research.counts;
P(`  脚本自判 ${JSON.stringify(sc)}`);
P(`  独立重算 ${JSON.stringify(re)}`);
chk('复算 = 脚本自判', re.advice !== sc.advice || re.condA !== sc.condA || re.condB !== sc.condB || re.noFc26 !== sc.noFc26 || re.noRange !== sc.noRange);
const rePrev = rc(prev.rows);
P(`  前轮基线(research-prev-t23) 自判 advice=${prev.counts.advice} · 我的复算 advice=${rePrev.advice}`);
chk('前轮基线自判与复算一致', rePrev.advice !== prev.counts.advice, `${rePrev.advice} vs ${prev.counts.advice}`);
const prevIds = new Set(prev.rows.map((r) => String(r.id)));
const newIn = rowIds.filter((id) => !prevIds.has(id));
P(`  前轮 rows=${prev.rows.length} / 本轮 rows=${rowIds.length}`);
// 命中集双向差集
const hitCur = research.rows.filter((r) => r.advice === true).map((r) => String(r.id));
const hitPrev = prev.rows.filter((r) => r.advice === true).map((r) => String(r.id));
const inSet = hitCur.filter((id) => !hitPrev.includes(id));
const outSet = hitPrev.filter((id) => !hitCur.includes(id));
P(`  命中集：前轮 ${hitPrev.length} → 本轮 ${hitCur.length}（进 ${inSet.length} / 出 ${outSet.length}）`);
P(`  进: ${inSet.join(',')}`);
P(`  出: ${outSet.join(',')}`);
chk('命中集双向差集自洽（= 数量差）', hitCur.length - hitPrev.length !== inSet.length - outSet.length);
const nullAdvice = research.rows.filter((r) => r.condA === null).length;
P(`  condA=null(不适用) ${nullAdvice} 张 · priceBasis=${research.priceBasis} · rangeCollectedAt=${research.rangeCollectedAt}`);

P('\n===== H. FC26 换名缺陷（14 张对照，按 cardId） =====');
const PAIRS = [
  [21488, 'pele', 'arantes-nascimento'],
  [21492, 'ronaldo', 'nazario-de-lima'],
  [21495, 'garrincha', 'franc-dos-santos'],
  [21501, 'ronaldinho', 'de-assis-moreira'],
  [21526, 'carlos-alberto-torres', 'torres'],
  [21531, 'zico', 'antunes-coimbra'],
  [21560, 'roberto-carlos-da-silva-rocha', 'da-silva-rocha'],
  [21567, 'rivaldo', 'borba-ferreira'],
  [21779, 'kaka', 'dos-santos-leite'],
  [21807, 'jairzinho', 'ventura-filho'],
  [21815, 'lucio', 'da-silva-ferreira'],
  [21829, 'socrates', 'vieira-de-oliveira'],
  [21839, 'marcelo', 'vieira-da-silva'],
  [21877, 'sissi', 'lima-do-amor'],
];
const slugById = new Map(baseList.map((c) => [String(c.cardId || c.id), String(c.slug)]));
const pairsOk = PAIRS.filter(([id, newSlug]) => slugById.get(String(id)) === newSlug).length;
chk('换名对照表 14/14 与台账 slug 全等', pairsOk !== 14, `${pairsOk}/14`);
const fc26 = j('apps/market/engine/icons/data/prices/fc26/base-icons.json');
const fc26BySlug = new Map();
for (const p of (fc26.players || [])) {
  const s = (p.prices && (p.prices.cross || p.prices.console)) || {};
  const days = Object.keys(s).filter((d) => typeof s[d] === 'number' && s[d] > 0).sort();
  if (days.length) fc26BySlug.set(String(p.slug || ''), s[days[0]]);
}
const look = (slug) => {
  for (const c of [slug, slug.replace(/-/g, ' '), slug.replace(/ /g, '-')]) if (fc26BySlug.has(c)) return fc26BySlug.get(c);
  return null;
};
const researchById = new Map(research.rows.map((r) => [String(r.id), r]));
let bridged = 0, bridgeHit = 0, bridgeUnresolvable = [];
const bridgedNoHit = [];
const bridgeHits = [];
for (const [id, newSlug, oldSlug] of PAIRS) {
  const lp = look(oldSlug);
  const row = researchById.get(String(id));
  if (lp == null || !row) { bridgeUnresolvable.push(`${id} 旧键「${oldSlug}」在 FC26 无匹配（新 slug「${newSlug}」直连命中=${!!(newSlug && researchById.get(String(id))?.fc26Launch)}）`); continue; }
  bridged++;
  const c = cur.cards[String(id)];
  const rep = Math.max(c.platforms.console.valid ? c.platforms.console.price : 0, c.platforms.pc.valid ? c.platforms.pc.price : 0);
  const a = rep >= MIN_VALID_PRICE && lp > rep;
  const b = cur.cards[String(id)].priceRange.max != null && lp > cur.cards[String(id)].priceRange.max;
  if (a || b) { bridgeHit++; bridgeHits.push(`${id}(${row.nameZh}) ratio=${(lp / rep).toFixed(4)}`); }
  else bridgedNoHit.push(`${id}(${row.nameZh}) rep=${rep} vs ${lp} ratio=${rep ? (lp / rep).toFixed(4) : 'n/a'}`);
}
P(`  可桥回 ${bridged}/${PAIRS.length}（无 FC26 旧键者 ${bridgeUnresolvable.length} 张）· 其中修正后命中 ${bridgeHit}`);
bridgeUnresolvable.forEach((s) => P(`    无需桥回 ${s}`));
bridgeHits.forEach((s) => P(`    命中 ${s}`));
bridgedNoHit.forEach((s) => P(`    未命中 ${s}`));
chk('可桥回全部成功', bridged !== 13, `${bridged}/13`);
const noFc26Ids = research.rows.filter((r) => r.fc26Launch == null).map((r) => String(r.id));
const overlap = noFc26Ids.filter((id) => PAIRS.some(([pid]) => String(pid) === id));
P(`  noFc26=${noFc26Ids.length} · 修正值 = ${noFc26Ids.length} − ${overlap.length} = ${noFc26Ids.length - overlap.length}`);
P(`  修正后建议集 = ${sc.advice} + ${bridgeHit} = ${sc.advice + bridgeHit}`);

P('\n===== I. 同时段建议 =====');
P(`  dayOffset=${samePeriod.dayOffset} dayN=${samePeriod.dayN} fc27=${samePeriod.fc27LaunchDate} fc26=${samePeriod.fc26LaunchDate} fc26SameDay=${samePeriod.fc26SameDayDate} minValid=${samePeriod.minValidPrice}`);
const expOffset = Math.round((Date.parse(D + 'T00:00:00Z') - Date.parse('2026-09-18T00:00:00Z')) / 86400000);
const expFc26 = new Date(Date.parse('2025-09-18T00:00:00Z') + expOffset * 86400000).toISOString().slice(0, 10);
chk(`dayOffset=${expOffset} · dayN=${expOffset + 1} · FC26 同日=${expFc26}`,
  samePeriod.dayOffset !== expOffset || samePeriod.dayN !== expOffset + 1 || samePeriod.fc26SameDayDate !== expFc26);
const tierOf = (arr) => {
  const m = {};
  for (const r of arr) m[r.tierLabel || r.tier] = (m[r.tierLabel || r.tier] || 0) + 1;
  return m;
};
const ti = tierOf(samePeriod.icons), th = tierOf(samePeriod.heroes);
P(`  传奇 ${samePeriod.icons.length} 张：${JSON.stringify(ti)}`);
P(`  英雄 ${samePeriod.heroes.length} 张：${JSON.stringify(th)}`);
chk('传奇 131 张', samePeriod.icons.length !== 131, `${samePeriod.icons.length}`);
const noZh = [...samePeriod.icons, ...samePeriod.heroes].filter((r) => !r.nameZh).length;
chk('same-period nameZh 缺失 0', noZh !== 0, `${noZh}`);
const htmlSP = fs.readFileSync(path.join(ROOT, `reports/daily/${D}/same-period-advice.html`), 'utf8');
const baseSP = fs.readFileSync(path.join(ROOT, 'apps/market/engine/icons/reports/fc27-same-period-advice.html'), 'utf8');
chk('当日页与常驻底稿逐字节一致', htmlSP !== baseSP, `当日 ${htmlSP.length} B / 底稿 ${baseSP.length} B`);
chk('免责声明在页（不构成）', !htmlSP.includes('不构成任何投资或交易建议'));
chk('免责声明在页（不重演）', !htmlSP.includes('FC26 历史走势不代表 FC27 会重演'));
const ext = [...htmlSP.matchAll(/src\s*=\s*["']https?:/g)].length;
chk('单文件无外链（src= 外链 0）', ext !== 0, `${ext} 处`);
const tiers = ['买入窗口', '分批买入', '观望等待', '谨慎', '数据不足'];
chk('五档标签齐备', tiers.some((t) => !htmlSP.includes(t)), tiers.filter((t) => !htmlSP.includes(t)).join(','));

P('\n===== J. 监控页 / 研究页 HTML =====');
const htmlMon = fs.readFileSync(path.join(ROOT, `reports/daily/${D}/icons-heroes.html`), 'utf8');
P(`  icons-heroes.html ${htmlMon.length} B · sha ${sha(`reports/daily/${D}/icons-heroes.html`)}`);
chk("表头含「当前价」", !htmlMon.includes('当前价'));
chk('表头五列齐备（最低价/最高价/当前价/…）', !['最低价', '最高价', '当前价'].every((h) => htmlMon.includes(h)));
chk('data-key=min/max 各 1', (htmlMon.match(/data-key="min"/g) || []).length !== 1 || (htmlMon.match(/data-key="max"/g) || []).length !== 1);
chk('运行时读 assets/data/current.json', !htmlMon.includes('assets/data/current.json'));
P(`  头像 img=${(htmlMon.match(/<img[^>]*class="pimg"/g) || []).length} · data-card-id=${(htmlMon.match(/data-card-id=/g) || []).length} · %=${(htmlMon.match(/%/g) || []).length}`);
const fc26Anchor = htmlMon.indexOf('七、FC26');
if (fc26Anchor > 0) {
  const tail = htmlMon.slice(fc26Anchor);
  const n = (tail.match(/<img[^>]*class="pimg"/g) || []).length;
  P(`  FC26 参考区（锚点「七、FC26」=${fc26Anchor}，段长 ${tail.length} B）pimg=${n}`);
  chk('跨代 FC26 参考区不配头像（红线）', n !== 0, `${n} 张`);
} else {
  chk('跨代 FC26 参考区不配头像（红线）', true, '未找到「七、FC26」锚点');
}
P(`  （导航处另有「FC26」文字位置 ${[...htmlMon.matchAll(/FC26/g)].map((m) => m.index).join(',')}）`);
const htmlRes = fs.readFileSync(path.join(ROOT, `reports/daily/${D}/market-icons-research.html`), 'utf8');
const baseRes = fs.readFileSync(path.join(ROOT, 'apps/market/engine/icons/reports/fc27-icon-live-research.html'), 'utf8');
P(`  market-icons-research.html ${htmlRes.length} B · sha ${sha(`reports/daily/${D}/market-icons-research.html`)}`);
chk('研究页与常驻底稿逐字节一致', htmlRes !== baseRes);
chk('研究页含 partial-live', !htmlRes.includes('partial-live'));
chk('研究页无 2026-09-25（开服日口径统一）', htmlRes.includes('2026-09-25'));
chk('研究页含免责「不构成投资」', !htmlRes.includes('不构成投资'));
const resExt = [...htmlRes.matchAll(/src\s*=\s*["']https?:/g)].length;
chk('研究页无外链', resExt !== 0, `${resExt} 处`);
const adviceRows = research.rows.filter((r) => r.advice === true);
const missingZh = adviceRows.filter((r) => !r.nameZh).length;
chk(`建议卡 nameZh 齐备 ${adviceRows.length}/${adviceRows.length}`, missingZh !== 0, `缺 ${missingZh}`);

P('\n===== K. 前轮区间对照（连续持平判定） =====');
const prevSeries = series.points[series.points.length - 2];
P(`  前轮 point: hour=${prevSeries.hour} at=${prevSeries.at} counts=${JSON.stringify(prevSeries.counts)}`);
const prevRowMap = new Map();
for (const id of iconIds) {
  const rows = series.cards[id]?.price || [];
  const r = rows.find((x) => x.h === prevSeries.hour);
  if (r) prevRowMap.set(id, r);
}
let rangeChanged = 0, priceChanged = 0, newValid = 0, lostValid = 0;
for (const id of iconIds) {
  const p = prevRowMap.get(id), c = cur.cards[id];
  if (!p) continue;
  if (p.rmin !== c.priceRange.min || p.rmax !== c.priceRange.max) rangeChanged++;
  if (p.ps !== c.platforms.console.price || p.pc !== c.platforms.pc.price) priceChanged++;
  const pvAny = (p.ps >= MIN_VALID_PRICE) || (p.pc >= MIN_VALID_PRICE);
  const cvAny = c.platforms.console.valid || c.platforms.pc.valid;
  if (!pvAny && cvAny) newValid++;
  if (pvAny && !cvAny) lostValid++;
}
P(`  区间变动 ${rangeChanged} 张 · 代表价变动 ${priceChanged} 张 · 新转有效 ${newValid} · 有效转无效 ${lostValid}`);
P(`  前轮任一平台有效 ${[...prevRowMap.values()].filter((r) => r.ps >= MIN_VALID_PRICE || r.pc >= MIN_VALID_PRICE).length} → 本轮 ${curValid.any}`);

P(`\n===== 汇总：失败项 ${FAIL} =====`);
process.exit(FAIL ? 1 : 0);
