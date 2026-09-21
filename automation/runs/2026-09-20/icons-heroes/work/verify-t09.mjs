// 一次性校验脚本（临时）：icons-pricerange-hourly 2026-09-20 T09 轮产物一致性核对（v2，字段结构已核正）。
// 全部跨文件关联一律按 cardId（FUTBIN slug 不唯一，禁用 slug/name 关联）。
// 输入：current.json / hourly T09 / hourly 前轮(2026-09-20T08) / daily 2026-09-20 / research JSON / base-icons.json / 两个 HTML
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const HH = '09';
const PREV = '2026-09-20T08';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const ex = (p) => fs.existsSync(path.join(ROOT, p));
const P = (...a) => console.log(a.join(' '));

const cur = j('apps/market/engine/data/prices/fc27/current.json');
const hNow = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T${HH}.json`);
const hPrev = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${PREV}.json`);
const daily = j(`apps/market/engine/icons/data/prices/fc27/daily/${D}.json`);
const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const roster = j('apps/market/engine/icons/data/prices/fc27/base-icons.json');

const rosterArr = Array.isArray(roster) ? roster : (roster.cards || roster.players || roster.icons || roster.rows || []);
const rosterIds = rosterArr.map((r) => String(r.cardId ?? r.id)).filter(Boolean);
P(`[名单] roster=${rosterArr.length} 唯一cardId=${new Set(rosterIds).size} · research rows=${res.rows.length} 唯一id=${new Set(res.rows.map(r => String(r.id))).size} · 双向差集=${rosterIds.filter(x => !res.rows.some(r => String(r.id) === x)).length}/${res.rows.filter(r => !rosterIds.includes(String(r.id))).length}`);

const nowCards = hNow.cards || [];
const prevCards = hPrev.cards || [];
const nowById = new Map(nowCards.map(c => [String(c.id), c]));
const prevById = new Map(prevCards.map(c => [String(c.id), c]));
P(`[快照] 顶层 scope=${hNow.scope} platform=${hNow.platform} priceBasis=${hNow.priceBasis} launchDate=${hNow.launchDate} source=${hNow.source}`);
P(`[快照] T${HH} cards=${nowCards.length} 唯一id=${nowById.size} collectedAt=${hNow.collectedAt} counts=${JSON.stringify(hNow.counts)} errors=${JSON.stringify(hNow.errors)} ok=false数=${nowCards.filter(c => c.ok === false).length}`);
P(`[快照] T${HH} missingItems=${JSON.stringify(hNow.missingItems)}`);
P(`[快照] 前轮 cards=${prevCards.length} 唯一id=${prevById.size} collectedAt=${hPrev.collectedAt}`);
P(`[快照] 快照内日环比/累计涨跌字段=${['dayChange', 'dailyChange', 'cumulativeChange', 'cumChange'].filter(k => fs.readFileSync(path.join(ROOT, `apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T${HH}.json`), 'utf8').includes(`"${k}"`)).join(',') || '无'}`);

const collectedAt = hNow.collectedAt;
// ---- current ↔ T09（按 cardId） ----
let missCur = 0, badScope = 0, badSrc = 0, badDual = 0, badUpdated = 0, badRange = 0, badPlat = 0;
// T09 本轮为全量成功轮（131/131）：仅对 ok!==false 的卡做严格一致核对；
// ok===false 的卡（本轮应为 0 张）保留「保留上一次观测、未被本轮空值污染」的分支，供后续部分失败轮复用。
let fMiss = 0, fClobbered = 0, fScope = 0;
const failedIds = [];
for (const c of nowCards) {
  const id = String(c.id);
  const rec = cur.cards[id];
  if (!rec) { missCur++; continue; }
  if (c.ok === false) {
    failedIds.push({ id, name: rec.name, err: c.error, curRangeAt: rec.priceRange?.observedAt, curUpd: rec.updatedAt });
    if (rec.updatedAt === collectedAt) fClobbered++;
    if (rec.priceRange?.scope !== 'card') fScope++;
    if (rec.priceRange == null && rec.platforms == null) fMiss++;
    continue;
  }
  const r = rec.priceRange || {};
  if (r.scope !== 'card') badScope++;
  if (r.source !== 'futbin-icon-detail') badSrc++;
  if (!(rec.platforms && rec.platforms.console && rec.platforms.pc)) badDual++;
  if (rec.updatedAt !== collectedAt) badUpdated++;
  if (r.min !== c.priceRange?.min || r.max !== c.priceRange?.max) badRange++;
  const hc = c.current?.console ?? 0, hp = c.current?.pc ?? 0;
  const hcv = !!c.currentValid?.console, hpv = !!c.currentValid?.pc;
  if (rec.platforms.console.price !== hc || !!rec.platforms.console.valid !== hcv
    || rec.platforms.pc.price !== hp || !!rec.platforms.pc.valid !== hpv) badPlat++;
}
P(`[current↔T${HH}] 未命中=${missCur} scope≠card=${badScope} source≠futbin-icon-detail=${badSrc} 双平台键缺=${badDual} updatedAt≠collectedAt=${badUpdated} 区间不一致=${badRange} 平台价/有效位不一致=${badPlat}`);
P(`[current↔T${HH}] 本轮 ok=false 卡（未采集到）=${failedIds.length} 被本轮空值污染=${fClobbered} 残留 scope≠card=${fScope} 无任何历史观测=${fMiss}`);
P(`[current↔T${HH}] 未采集卡的保留观测：${failedIds.map(f => `${f.name}(${f.id}) range@${f.curRangeAt} upd@${f.curUpd}`).join(' | ')}`);
const curVals = Object.values(cur.cards);
P(`[current] 总条数=${curVals.length} icon=${curVals.filter(r => r.cardType === 'icon').length} generatedAt=${cur.generatedAt} 非传奇双平台键缺失=${curVals.filter(r => r.cardType !== 'icon' && !(r.platforms?.console && r.platforms?.pc)).length}`);
P(`[current] sources=${JSON.stringify(cur.sources)}`);

// ---- current ↔ daily ----
const dArr = daily.players || daily.cards || [];
let dMiss = 0, dRange = 0, dPlat = 0, dRangeKey = 0, dPlatKey = 0;
for (const p of dArr) {
  const id = String(p.cardId ?? p.id);
  const rec = cur.cards[id];
  if (!rec) { dMiss++; continue; }
  if (!p.priceRange) dRangeKey++;
  else if (p.priceRange.min !== rec.priceRange.min || p.priceRange.max !== rec.priceRange.max) dRange++;
  if (!(p.platforms?.console && p.platforms?.pc)) dPlatKey++;
  else if (p.platforms.console.price !== rec.platforms.console.price || !!p.platforms.console.valid !== !!rec.platforms.console.valid
    || p.platforms.pc.price !== rec.platforms.pc.price || !!p.platforms.pc.valid !== !!rec.platforms.pc.valid) dPlat++;
}
const splitKey = dArr.filter(p => p.priceRange && (p.priceRange.console || p.priceRange.pc || p.priceRange.ps || p.priceRange.xbox)).length;
P(`[current↔daily] players=${dArr.length} 未命中=${dMiss} 缺priceRange键=${dRangeKey} 区间不一致=${dRange} 缺双平台键=${dPlatKey} 平台价/有效位不一致=${dPlat} 区间按平台拆分痕迹=${splitKey}`);
P(`[daily] 顶层 priceRange=${JSON.stringify(daily.priceRange)}`);
P(`[daily] counts=${JSON.stringify(daily.counts)}`);
P(`[daily] 日环比/累计涨跌字段=${['dayChange', 'dailyChange', 'changePercent', 'cumulativeChange', 'cumChange', 'pctChange'].filter(k => fs.readFileSync(path.join(ROOT, `apps/market/engine/icons/data/prices/fc27/daily/${D}.json`), 'utf8').includes(`"${k}"`)).join(',') || '无'}`);

// ---- 极值 / 有效价 ----
let minFloor = Infinity, maxCeiling = -Infinity, minN = '', maxN = '';
let conValid = 0, pcValid = 0, anyValid = 0;
for (const c of nowCards) {
  const id = String(c.id);
  const r = c.priceRange || {};
  if (typeof r.min === 'number' && r.min < minFloor) { minFloor = r.min; minN = cur.cards[id]?.name ?? id; }
  if (typeof r.max === 'number' && r.max > maxCeiling) { maxCeiling = r.max; maxN = cur.cards[id]?.name ?? id; }
  if (c.currentValid?.console) conValid++;
  if (c.currentValid?.pc) pcValid++;
  if (c.currentValid?.console || c.currentValid?.pc) anyValid++;
}
P(`[极值] 下沿=${minFloor}（${minN}） 上沿=${maxCeiling}（${maxN}） counts 声明 minFloor=${hNow.counts?.minFloor} maxCeiling=${hNow.counts?.maxCeiling}`);
P(`[有效价] 任一平台有效=${anyValid} Console=${conValid} PC=${pcValid} · daily 声明=${JSON.stringify(daily.counts?.platformValid)} valid=${daily.counts?.valid}`);

// ---- 前轮 → T09 变动 ----
const rep = (c) => Math.max(c.currentValid?.console ? (c.current?.console ?? 0) : 0, c.currentValid?.pc ? (c.current?.pc ?? 0) : 0);
let rangeChg = 0, repChg = 0, newValid = 0, lostValid = 0, skippedFail = 0;
const rangeChgList = [], repChgList = [];
for (const [id, c] of nowById) {
  const p = prevById.get(id);
  if (!p) continue;
  // 本轮未采集到的卡在快照内为空值，不代表真实行情变动 ⇒ 排除出对比，避免假「有效转无效」
  if (c.ok === false) { skippedFail++; continue; }
  if (c.priceRange?.min !== p.priceRange?.min || c.priceRange?.max !== p.priceRange?.max) {
    rangeChg++; rangeChgList.push(`${cur.cards[id]?.name}(${id}) ${p.priceRange?.min}-${p.priceRange?.max}→${c.priceRange?.min}-${c.priceRange?.max}`);
  }
  if (rep(c) !== rep(p)) { repChg++; if (repChgList.length < 12) repChgList.push(`${cur.cards[id]?.name} ${rep(p)}→${rep(c)}`); }
  const pv = !!(p.currentValid?.console || p.currentValid?.pc), nv = !!(c.currentValid?.console || c.currentValid?.pc);
  if (!pv && nv) newValid++;
  if (pv && !nv) lostValid++;
}
const prevValidAny = [...prevById.values()].filter(c => c.currentValid?.console || c.currentValid?.pc).length;
P(`[前轮→T${HH}] 区间变动=${rangeChg} 张 ${rangeChgList.join(' | ')}`);
P(`[前轮→T${HH}] 代表价变动=${repChg} 张 · 新转有效=${newValid} · 有效转无效=${lostValid} · 任一平台有效 ${prevValidAny} → ${anyValid}（对比已排除本轮未采集的 ${skippedFail} 张）`);
P(`[前轮→T${HH}] 代表价变动样例：${repChgList.join(' | ')}`);

// ---- 研究判定链独立重算（按 cardId） ----
const fc26ById = new Map(res.rows.map(r => [String(r.id), r.fc26Launch]));
// 双映射：复算前轮必须用「生成前轮产物时的同一版 FC26 映射」，避免 slug 漂移/复原造成 ±N 假差异
const pres = j('automation/runs/2026-09-20/icons-heroes/work/research-prev-t08.json');
const fc26ByIdPrev = new Map(pres.rows.map(r => [String(r.id), r.fc26Launch]));
const recompute = (byId, map = fc26ById) => {
  const hit = [];
  for (const [id, c] of byId) {
    const f = map.get(id);
    if (typeof f !== 'number') continue;
    const r = rep(c);
    const condA = r >= 1000 ? (f > r) : null;
    const condB = (c.priceRange?.max ?? 0) > 0 ? f > c.priceRange.max : null;
    if (condA === true || condB === true) hit.push(id);
  }
  return hit.sort();
};
// 本轮复算口径 = current.json（分析器实际读取的源；未采集到的卡保留上次观测，不按本快照空值判）
const curIconById = new Map(Object.entries(cur.cards).filter(([, r]) => r.cardType === 'icon'));
const normFromCur = () => new Map([...curIconById].map(([id, r]) => [id, {
  current: { console: r.platforms?.console?.price ?? 0, pc: r.platforms?.pc?.price ?? 0 },
  currentValid: { console: !!r.platforms?.console?.valid, pc: !!r.platforms?.pc?.valid },
  priceRange: { min: r.priceRange?.min ?? null, max: r.priceRange?.max ?? null },
}]));
const hitNow = recompute(normFromCur(), fc26ById), hitPrev = recompute(prevById, fc26ByIdPrev);
const scriptAdv = res.rows.filter(r => r.advice).map(r => String(r.id)).sort();
const scriptAdvPrev = pres.rows.filter(r => r.advice).map(r => String(r.id)).sort();
P(`[研究] 前轮 research 文件自判 advice=${scriptAdvPrev.length} 与独立复算(前轮映射)=${hitPrev.length} 差异=${hitPrev.filter(x => !scriptAdvPrev.includes(x)).length}/${scriptAdvPrev.filter(x => !hitPrev.includes(x)).length}`);
const drift = res.rows.filter(r => { const p = fc26ByIdPrev.get(String(r.id)); return (typeof p === 'number') !== (typeof r.fc26Launch === 'number') || (typeof p === 'number' && p !== r.fc26Launch); });
P(`[研究] FC26 映射在本轮前后并发漂移的卡=${drift.length} → ${drift.map(r => `${r.name}(${r.id}) ${fc26ByIdPrev.get(String(r.id))}→${r.fc26Launch}`).join(' | ') || '无'}`);
P(`[研究] 脚本 counts=${JSON.stringify(res.counts)}`);
P(`[研究] 独立重算 T${HH} 命中=${hitNow.length} 与脚本 advice 集差异=${hitNow.filter(x => !scriptAdv.includes(x)).length}/${scriptAdv.filter(x => !hitNow.includes(x)).length}`);
P(`[研究] 独立重算 前轮 命中=${hitPrev.length} 张（用于证明判定链无回归）`);
const inNow = hitNow.filter(x => !hitPrev.includes(x)), outNow = hitPrev.filter(x => !hitNow.includes(x));
const nm = (id) => { const r = res.rows.find(x => String(x.id) === id); const c = nowById.get(id) || prevById.get(id); return `${r?.nameZh || ''}(${id}) con${c?.current?.console} pc${c?.current?.pc}`; };
P(`[研究] 建议集 前轮 ${hitPrev.length} → T${HH} ${hitNow.length}（进 ${inNow.length} 出 ${outNow.length}）`);
if (inNow.length) P(`  进: ${inNow.map(nm).join(' · ')}`);
if (outNow.length) P(`  出: ${outNow.map(nm).join(' · ')}`);
P(`[研究] 无FC26对照=${res.rows.filter(r => typeof r.fc26Launch !== 'number').length} 无区间=${res.rows.filter(r => !(r.fc27Max > 0)).length} condA=true=${res.rows.filter(r => r.condA === true).length} condB=true=${res.rows.filter(r => r.condB === true).length} condA=null(不适用)=${res.rows.filter(r => r.condA === null).length}`);
const advRows = res.rows.filter(r => r.advice);
P(`[研究] 建议卡 nameZh 缺失=${advRows.filter(r => !r.nameZh).length}/${advRows.length}`);
P(`[研究] 行 id 去重=${new Set(res.rows.map(r => String(r.id))).size}/${res.rows.length} minValidPrice=${res.minValidPrice} priceBasis=${res.priceBasis} rangeCollectedAt=${res.rangeCollectedAt}`);

// ---- 研究页 HTML ----
const resPath = path.join(ROOT, `reports/daily/${D}/market-icons-research.html`);
const resHtml = fs.readFileSync(resPath, 'utf8');
const ns = resHtml.replace(/\s+/g, '');
const elems = {
  '不构成投资': ns.includes('不构成投资'), '历史开服价不代表重演': ns.includes('重演'),
  'listing-estimate': resHtml.includes('listing-estimate'), '卡级': ns.includes('卡级'),
  '条件A有效价判据': ns.includes('1000'), '无FC26对照': ns.includes('无FC26对照') || ns.includes('没有FC26对照'),
  '占位': ns.includes('占位'), '不适用': ns.includes('不适用'),
};
P(`[研究页] bytes=${fs.statSync(resPath).size} 要素=${Object.entries(elems).map(([k, v]) => `${k}:${v ? 'OK' : '缺'}`).join(' ')}`);
P(`[研究页] 建议卡页内命中=${advRows.filter(r => (r.nameZh && resHtml.includes(r.nameZh)) || (r.name && resHtml.toLowerCase().includes(String(r.name).toLowerCase()))).length}/${advRows.length}`);
const livePath = path.join(ROOT, 'apps/market/engine/icons/reports/fc27-icon-live-research.html');
P(`[研究页] 常驻底稿存在=${ex('apps/market/engine/icons/reports/fc27-icon-live-research.html')} 与当日页逐字节一致=${fs.readFileSync(livePath, 'utf8') === resHtml}`);

// ---- 监控页 HTML ----
const ihPath = path.join(ROOT, `reports/daily/${D}/icons-heroes.html`);
const ihRaw = fs.readFileSync(ihPath, 'utf8');
const ih = ihRaw.replace(/\s+/g, '');
P(`[监控页] bytes=${Buffer.byteLength(ihRaw)} 表头五列齐备=${['当前价(列表页)', '最低价', '最高价', '日环比', '累计涨跌'].every(h => ih.includes(h))}`);
P(`[监控页] data-key=min=${(ihRaw.match(/data-key="min"/g) || []).length} data-key=max=${(ihRaw.match(/data-key="max"/g) || []).length}`);
P(`[监控页] % 出现=${(ihRaw.match(/%/g) || []).length} 处（应全为 CSS 宽高，非涨跌百分数）`);
P(`[监控页] 头像声明=${(ih.match(/球员头像\d+\/\d+/) || ['无'])[0]} img=${(ihRaw.match(/<img/g) || []).length} pimg=${(ihRaw.match(/class="pimg"/g) || []).length} data-card-id=${(ihRaw.match(/data-card-id/g) || []).length} 读current.json=${ihRaw.includes('assets/data/current.json')}`);
const anchorIdx = ihRaw.indexOf('FC26 英雄卡参考对比');
const tail = anchorIdx > 0 ? ihRaw.slice(anchorIdx) : '';
P(`[监控页] FC26参考区锚点偏移=${anchorIdx} 区内 img=${(tail.match(/<img/g) || []).length} pimg=${(tail.match(/class="pimg"/g) || []).length}（跨代不配头像红线）`);
const splitHits = [...ihRaw.matchAll(/(Console|PC)[^<]{0,30}区间/g)].map(m => m[0]);
P(`[监控页] 按平台拆区间正则命中=${splitHits.length} → ${splitHits.map(s => JSON.stringify(s)).join(' ')}`);
P(`[监控页] 「—」=${(ihRaw.match(/—/g) || []).length} 处`);

// ---- 历史与越权 ----
P(`[历史] daily 目录=${fs.readdirSync(path.join(ROOT, 'apps/market/engine/icons/data/prices/fc27/daily')).join(',')}`);
P(`[历史] 09-16/09-17/09-18 快照 mtime=${['2026-09-16', '2026-09-17', '2026-09-18'].map(d => fs.statSync(path.join(ROOT, `apps/market/engine/icons/data/prices/fc27/daily/${d}.json`)).mtime.toISOString().slice(0, 19)).join(' ')}`);
P(`[越权] hourly-${HH}-failed.json 存在=${ex(`automation/runs/${D}/icons-heroes/hourly-${HH}-failed.json`)}（本轮成功应为 false）`);
P(`[越权] run-state owner.json=${ex(`automation/runs/${D}/icons-heroes/owner.json`) ? fs.statSync(path.join(ROOT, `automation/runs/${D}/icons-heroes/owner.json`)).mtime.toISOString() : '不存在'}`);
P(`[越权] market.html 存在=${ex(`reports/daily/${D}/market.html`)}（03:05 日任务未跑则不存在，属正常；本任务不得渲染）`);
P(`[越权] publish-status-${D}.json 存在=${ex(`automation/publish-status-${D}.json`)}`);
P(`[越权] 09-18 发布记录 mtime=${ex('automation/publish-status-2026-09-18.json') ? fs.statSync(path.join(ROOT, 'automation/publish-status-2026-09-18.json')).mtime.toISOString() : '不存在'}`);
