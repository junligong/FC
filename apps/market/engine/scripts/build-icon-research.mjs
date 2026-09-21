#!/usr/bin/env node
/**
 * FC27「传奇卡研究」—— FC26 开服价 vs FC27 当前价 / 最高价，输出投资建议
 *
 * 用途：把 FC26 的历史开服行情当作跨代参照，逐卡与 FC27 的当前价、价格区间最高价对照，
 *       把「FC26 开服价高于 FC27」的卡单独摘出来作为投资建议候选，并渲染成
 *       「传奇/英雄专栏 → 传奇卡研究」子标签的内容（跨日期常驻研究报告）。
 *
 * 输入：
 *   - FC27 价格区间：apps/market/engine/icons/data/prices/fc27/pricerange/latest.json（每 4 小时的传奇价格区间任务采集）
 *   - FC27 当日快照：apps/market/engine/icons/data/prices/fc27/daily/<DATE>.json（当前价，按平台）
 *   - FC26 历史价格：apps/market/engine/icons/data/prices/fc26/base-icons.json（开服日与首月逐日均价）
 *   - 卡库台账：apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json（中文名/位置）
 *
 * 输出：
 *   - reports/daily/<DATE>/market-icons-research.html   当日研究报告（供 merge_daily_report 的「传奇卡研究」子标签优先取用）
 *   - apps/market/engine/icons/data/research/fc26-vs-fc27-<DATE>.json  结构化分析结果（可复核、可复用）
 *
 * 判定规则（来自用户 2026-09-17 的明确要求）：
 *   条件 A：FC26 开服价 > FC27 当前价
 *   条件 B：FC26 开服价 > FC27 最高价
 *   满足任一即摘出作为投资建议。
 *
 *   **重要口径约束（否则规则会退化成噪声）**：FC27 开服初期（含 2026-09-18 开服当天），
 *   FUTBIN 的平台当前价普遍为 0，0 是「尚无挂单」的占位值而非价格。若不加判据，
 *   「FC26 开服价 > 0」对每一张卡都成立，会把全部卡都判成投资建议 —— 那是错误结论。
 *   因此条件 A 只在**当前价为有效价（≥ minValidPrice，默认 1000）**时参与判定；
 *   无效价的卡 A 条件记为「不适用（无有效当前价）」，并如实展示。
 *   条件 B 使用价格区间最高价，该字段开服初期即持续更新，是当前唯一可用的有效对照。
 *
 * 口径说明：FC26 开服价取该卡在 FC26 开服日（2025-09-18）的 Console（PS/Xbox 合并）均价，
 *   即原始文件 prices.cross 的首日值；FC26 与 FC27 的卡按 FUTBIN slug 关联。
 *   本报告仅为游戏内市场研究，不构成任何投资或交易建议。
 *
 * 用法：node apps/market/engine/scripts/build-icon-research.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_MARKET_PATH, readCurrentMarket } from '../src/current-market.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const ICON_DIR = path.join(ROOT, 'apps', 'market', 'engine', 'icons');

const PRICERANGE_PATH = process.env.FC_ICON_PRICERANGE || path.join(ICON_DIR, 'data', 'prices', 'fc27', 'pricerange', 'latest.json');
const FC26_PATH = process.env.FC_ICON_FC26 || path.join(ICON_DIR, 'data', 'prices', 'fc26', 'base-icons.json');
const LEDGER_PATH = path.join(ICON_DIR, 'data', 'players', 'fc27', 'fc27-icons-playstyles.json');
const DAILY_DIR = path.join(ICON_DIR, 'data', 'prices', 'fc27', 'daily');
const RESEARCH_DIR = path.join(ICON_DIR, 'data', 'research');

const MIN_VALID_PRICE = 1000; // 与采集侧一致：低于此值视为占位值
// FC27 开服日（用户 2026-09-19 明确口径）：2026-09-18；FC26 开服日 2025-09-18，两代开服日同月同日，
// 便于做「同时段（开服第 N 天）」逐卡对照。历史上曾按 2026-09-25（正式发售）口径，现已修正。
const FALLBACK_LAUNCH_DATE = '2026-09-18';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coins = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v.toLocaleString('en-US') : '—');
const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
// 英文名清洗：采集侧的 name 历史上有过整串页面标题（"XXX - Icon EA FC 27 Prices and Rating"），
// 统一只取第一段，避免把页面标题当球员名展示
const cleanName = v => {
  const s = String(v || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const head = s.split(' - ')[0].trim();
  return /Icon EA FC|Prices and Rating/i.test(head) ? '' : head;
};
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

const dateStr = isDate(process.argv[2]) ? process.argv[2] : todayShanghai();

// ---------- 1. 载入三个数据源 ----------
const pricerange = readJSON(PRICERANGE_PATH);
const fc26 = readJSON(FC26_PATH);
const ledger = readJSON(LEDGER_PATH);
const dailySnapshot = readJSON(path.join(DAILY_DIR, `${dateStr}.json`));
const currentMarket = readCurrentMarket(CURRENT_MARKET_PATH);

const ledgerById = new Map((Array.isArray(ledger) ? ledger : []).map(i => [String(i.id), i]));
const rangeById = new Map(
  (pricerange && Array.isArray(pricerange.cards) ? pricerange.cards : [])
    .filter(c => c && c.ok && c.priceRange)
    .map(c => [String(c.id), c]),
);
// FC26：按 slug 关联，开服价取首日 Console 均价；同时算首月区间供参考
const fc26BySlug = new Map();
for (const p of (fc26 && Array.isArray(fc26.players) ? fc26.players : [])) {
  const series = (p.prices && (p.prices.cross || p.prices.console)) || {};
  const days = Object.keys(series).filter(d => typeof series[d] === 'number' && series[d] > 0).sort();
  if (!days.length) continue;
  const vals = days.map(d => series[d]);
  fc26BySlug.set(String(p.slug || ''), {
    id: String(p.id || ''),
    slug: p.slug || '',
    rating: p.rating ?? null,
    launchDate: days[0],
    launchPrice: series[days[0]],
    monthMin: Math.min(...vals),
    monthMax: Math.max(...vals),
    days: days.length,
  });
}

const currentById = new Map(Object.entries(currentMarket.cards || {}));
const launchDate = (pricerange && pricerange.launchDate) || (dailySnapshot && dailySnapshot.launchDate) || FALLBACK_LAUNCH_DATE;

// ---------- 2. 逐卡对照与判定 ----------
// 名单以 FC27 价格区间为准（含全部已采集到的卡），保证「有区间」的卡都能参与条件 B
const rowsAll = [];
for (const card of (pricerange && Array.isArray(pricerange.cards) ? pricerange.cards : [])) {
  const id = String(card.id);
  const meta = ledgerById.get(id) || {};
  const current = currentById.get(id) || null;
  const f26 = fc26BySlug.get(String(card.slug || '')) || null;

  // 当前价与价格区间都只读统一 current.json；pricerange 快照在这里仅提供 131 张名单与采集审计信息。
  const range = current?.priceRange || null;
  const maxPrice = range && typeof range.max === 'number' ? range.max : null;

  // FC27 当前价：唯一读取统一 current.json；逐日快照仅保留历史，不再作为“当前值”副本。
  const curConsole = current?.platforms?.console?.price ?? null;
  const curPc = current?.platforms?.pc?.price ?? null;
  const curValid = {
    console: typeof curConsole === 'number' && curConsole >= MIN_VALID_PRICE,
    pc: typeof curPc === 'number' && curPc >= MIN_VALID_PRICE,
  };
  // 取两个平台中的最高有效当前价作为「FC27 当前价」代表值（对判定最保守：越高越不容易误判为便宜）
  const validCurs = [curValid.console ? curConsole : null, curValid.pc ? curPc : null].filter(v => v !== null);
  const curRepresentative = validCurs.length ? Math.max(...validCurs) : null;

  const launchPrice26 = f26 ? f26.launchPrice : null;
  const condA = launchPrice26 !== null && curRepresentative !== null ? launchPrice26 > curRepresentative : null; // null = 不适用
  const condB = launchPrice26 !== null && maxPrice !== null ? launchPrice26 > maxPrice : null;

  // 空间倍数：FC26 开服价相对 FC27 最高价的倍数；>1 表示 FC27 区间上沿仍低于 FC26 开服价
  const maxRatio = launchPrice26 !== null && maxPrice ? launchPrice26 / maxPrice : null;

  rowsAll.push({
    id,
    slug: card.slug || '',
    nameZh: meta.nameZh || card.nameZh || card.name || `#${id}`,
    name: cleanName(meta.name) || cleanName(card.name),
    rating: meta.rating ?? card.rating ?? null,
    pos: meta.position || '',
    fc26: f26,
    fc26Launch: launchPrice26,
    fc27Current: { console: curConsole, pc: curPc, valid: curValid, representative: curRepresentative },
    fc27Max: maxPrice,
    fc27Min: range && typeof range.min === 'number' ? range.min : null,
    rangeUpdatedText: card.priceRange?.updatedText || null,
    rangeFetchedAt: range?.observedAt || null,
    condA,
    condB,
    advice: Boolean(condA) || Boolean(condB),
    maxRatio,
  });
}

const advice = rowsAll.filter(r => r.advice).sort((a, b) => (b.maxRatio ?? 0) - (a.maxRatio ?? 0));
const noFc26 = rowsAll.filter(r => !r.fc26);
const noRange = rowsAll.filter(r => r.fc27Max === null);
const condAOnly = advice.filter(r => r.condA && !r.condB).length;
const condBOnly = advice.filter(r => !r.condA && r.condB).length;
const bothConds = advice.filter(r => r.condA && r.condB).length;
const priceBasis = pricerange?.priceBasis || 'listing-estimate';

// ---------- 3. 渲染 HTML ----------
const badge = r => r.condA && r.condB
  ? '<span class="tag both">双条件命中</span>'
  : r.condB ? '<span class="tag b">高于 FC27 最高价</span>' : '<span class="tag a">高于 FC27 当前价</span>';

const adviceRows = advice.map((r, i) => `<tr>
<td class="c-rank">${i + 1}</td>
<td class="c-name">${esc(r.nameZh)}${r.name ? `<span class="en">${esc(r.name)}</span>` : ''}</td>
<td class="c-rating">${esc(r.rating ?? '—')}</td>
<td class="c-num">${coins(r.fc26Launch)}<span class="hint">${esc(r.fc26?.launchDate || '')}</span></td>
<td class="c-num">${coins(r.fc27Current.console)}<span class="hint">C</span> ${coins(r.fc27Current.pc)}<span class="hint">PC</span></td>
<td class="c-num">${coins(r.fc27Max)}</td>
<td class="c-num">${r.maxRatio !== null ? `${r.maxRatio.toFixed(2)}×` : '—'}</td>
<td class="c-tag">${badge(r)}</td>
</tr>`).join('');

const allRows = rowsAll.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || String(a.nameZh).localeCompare(String(b.nameZh), 'zh'))
  .map((r, i) => `<tr${r.advice ? ' class="hit"' : ''}>
<td class="c-rank">${i + 1}</td>
<td class="c-name">${esc(r.nameZh)}${r.name ? `<span class="en">${esc(r.name)}</span>` : ''}</td>
<td class="c-rating">${esc(r.rating ?? '—')}</td>
<td class="c-num">${r.fc26 ? coins(r.fc26.launchPrice) : '<span class="miss">无 FC26 对照</span>'}</td>
<td class="c-num">${coins(r.fc27Current.representative)}${r.fc27Current.representative === null ? '<span class="hint">无有效价</span>' : ''}</td>
<td class="c-num">${coins(r.fc27Max)}</td>
<td class="c-num">${r.maxRatio !== null ? `${r.maxRatio.toFixed(2)}×` : '—'}</td>
<td class="c-tag">${r.advice ? badge(r) : '—'}</td>
</tr>`).join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 传奇卡研究 · FC26 开服价对照 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--gold:#e3b341;--dn:#4ec08a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;padding:22px}
h1{font-size:20px;margin-bottom:6px}
h2{font-size:15px;margin:26px 0 10px;padding-left:9px;border-left:3px solid var(--gold)}
.sub{color:var(--quiet);font-size:12.5px;margin-bottom:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:14px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:8px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px}
.stat b{display:block;font-size:21px;color:var(--gold)}
.stat small{color:var(--quiet);font-size:11.5px}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
code{background:#2a3329;padding:1px 5px;border-radius:4px;font-size:11.5px}
.tbl-wrap{overflow-x:auto}
table.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
table.tbl th{text-align:left;color:var(--quiet);font-weight:600;font-size:11.5px;padding:8px;border-bottom:1px solid var(--line2,#3a4438);white-space:nowrap}
table.tbl td{padding:7px 8px;border-bottom:1px solid #232c24;vertical-align:top}
tbody tr:hover{background:#1b241c}
.c-rank{color:var(--quiet);width:38px}
.c-name{min-width:132px}
.c-name .en{display:block;color:var(--quiet);font-size:10.5px;font-weight:400}
.c-rating{width:52px}
.c-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.c-num .hint{color:var(--quiet);font-size:10px;margin-left:3px}
.hint{color:var(--quiet);font-size:10.5px}
.miss{color:var(--quiet);font-size:11px}
.tag{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10.5px;white-space:nowrap}
.tag.b{background:rgba(255,98,89,.14);color:var(--red);border:1px solid rgba(255,98,89,.4)}
.tag.a{background:rgba(227,179,65,.14);color:var(--gold);border:1px solid rgba(227,179,65,.4)}
.tag.both{background:rgba(255,98,89,.2);color:#ff8f88;border:1px solid rgba(255,98,89,.55)}
tr.hit{background:rgba(255,98,89,.05)}
.empty{color:var(--quiet);font-size:12.5px;padding:14px;border:1px dashed var(--line);border-radius:9px;background:#161d17}
.footer{color:var(--quiet);font-size:11.5px;margin-top:28px;border-top:1px solid var(--line);padding-top:12px}
details{margin-top:8px}
summary{cursor:pointer;color:var(--muted);font-size:12.5px}
</style></head><body>
<h1>FC27 传奇卡研究 · FC26 开服价对照</h1>
<div class="sub">成稿日期 ${esc(dateStr)} · 数据源 FUTBIN · FC26 开服日 2025-09-18 口径 · FC27 开服日 ${esc(launchDate)} · 价格区间采集于 ${esc(pricerange?.collectedAt || '—')} · 当前口径 <code>${esc(priceBasis)}</code></div>

<div class="stat-grid">
<div class="stat"><b>${rowsAll.length}</b><small>参与对照的传奇卡</small></div>
<div class="stat"><b>${advice.length}</b><small>触发投资建议卡数</small></div>
<div class="stat"><b>${condBOnly + bothConds}</b><small>FC26 开服价 &gt; FC27 最高价</small></div>
<div class="stat"><b>${noFc26.length}</b><small>无 FC26 对照（新卡）</small></div>
</div>

<h2>一、判定规则与口径</h2>
<div class="card">
<ul>
<li><b>条件 A</b>：FC26 开服价 &gt; FC27 当前价 —— 命中 ${condAOnly + bothConds} 张（其中与条件 B 同时命中 ${bothConds} 张）。</li>
<li><b>条件 B</b>：FC26 开服价 &gt; FC27 最高价 —— 命中 ${condBOnly + bothConds} 张。满足 A 或 B 任一即计入下方「投资建议」。</li>
<li><b>为什么不加判据会让规则失效</b>：FC27 开服初期（含开服当天），FUTBIN 的平台当前价普遍是 <code>0</code>（尚无挂单的占位值，不是价格）。若直接比较，<code>FC26 开服价 &gt; 0</code> 对每一张卡都成立，会得出「全部卡都值得投资」的错误结论。因此条件 A <b>只在当前价为有效价（≥ ${MIN_VALID_PRICE} coins）时参与判定</b>，无有效价的卡记为「不适用」，不当作命中。</li>
<li>当前处于 <code>${esc(priceBasis)}</code> 口径：FC27 平台价是 FUTBIN 滚动挂单/估价，不等于成交价；条件 B 使用的「最高价」是 FUTBIN 详情页 Price Range 的高值（开服初期即持续更新），是目前唯一可用的有效对照；该字段是<b>卡级</b>口径（Console 与 PC 渲染同值）。</li>
<li>对照口径：FC26 开服价取该卡在 FC26 开服日（2025-09-18）的 Console（PS/Xbox 合并）均价，即原始文件 <code>prices.cross</code> 首日值；FC27「当前价」取当日快照的平台价（C = Console，PC = PC），取两平台最高有效价作为代表值参与判定（判定更保守）。两代卡按 FUTBIN slug 关联。</li>
<li>倍数列 = FC26 开服价 ÷ FC27 最高价。<b>＞1 表示 FC27 的区间上沿仍低于 FC26 开服价</b>，是本次投资建议的主要排序依据。</li>
<li><b>信号强度</b>：条件 B（对照区间上沿）比条件 A（对照单一刊例价）更稳健 —— 当前价只是一个挂单价，可能因个别低价挂单而偏低，容易放大差额；条件 A 命中项建议结合区间上沿一并复核，不要单看倍数。</li>
</ul>
</div>

<h2>二、投资建议（条件 A 或 B 命中，按空间倍数降序）</h2>
<div class="card">
${advice.length
  ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>评分</th><th>FC26 开服价</th><th>FC27 当前价(C/PC)</th><th>FC27 最高价</th><th>倍数</th><th>触发条件</th></tr></thead><tbody>${adviceRows}</tbody></table></div>`
  : '<div class="empty">本期没有卡命中投资建议条件：要么 FC27 各卡的最高价已高于对应的 FC26 开服价，要么尚未采集到价格区间。缺失一律如实留空，不做其他推断。</div>'}
</div>

<h2>三、全量对照（全部 ${rowsAll.length} 张）</h2>
<div class="card">
<details open><summary>展开 / 收起全量对照表（命中行以淡红底标注）</summary>
<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>评分</th><th>FC26 开服价</th><th>FC27 当前价</th><th>FC27 最高价</th><th>倍数</th><th>建议</th></tr></thead><tbody>${allRows}</tbody></table></div>
</details>
</div>

<h2>四、数据来源与缺失项</h2>
<div class="card">
<ul>
<li>来源：<code>https://www.futbin.com/27/player/&lt;id&gt;/&lt;slug&gt;</code>（FC27 价格区间，每 4 小时采集）· <code>https://www.futbin.com/27/players</code>（FC27 当前价）· FC26 历史价格文件 <code>apps/market/engine/icons/data/prices/fc26/base-icons.json</code>。</li>
<li>价格区间采集时间：<code>${esc(pricerange?.collectedAt || '—')}</code>；区间覆盖 ${(pricerange?.counts?.ok ?? 0)}/${(pricerange?.counts?.total ?? 0)} 张。</li>
${noFc26.length ? `<li>${noFc26.length} 张卡在 FC26 无同名对照（新增传奇卡），无法做跨代比较，已如实标注为「无 FC26 对照」：${esc(noFc26.slice(0, 12).map(r => r.nameZh).join('、'))}${noFc26.length > 12 ? ' 等' : ''}。</li>` : ''}
${noRange.length ? `<li>${noRange.length} 张卡本期未采集到价格区间（FUTBIN 详情页请求失败或超时），未参与条件 B 判定。</li>` : ''}
<li>不计算日环比与累计涨跌：FC27 当前无成交价（平台价是 FUTBIN 滚动挂单/估价），任何环比都无行情含义。</li>
<li>本报告是<b>实时行情驱动</b>的投资建议，每 4 小时刷新一次；另有<b>静态预测底稿</b>《FC27 vs FC26 传奇卡对比与 FC27 价格预测报告》（<code>apps/market/engine/icons/reports/fc27-icon-analysis.html</code>），含双版本阵容对照、属性与金特技变化、131 张首月价格预测与投资分档，两者口径不同、互为补充，本报告不覆盖该底稿。</li>
</ul>
</div>

<div class="footer">FC27 传奇卡研究 · 成稿 ${esc(dateStr)} · 生成脚本 build-icon-research.mjs · 价格为 FUT 金币，仅作游戏市场研究，<b>不构成投资或交易建议</b>。跨代价格受卡池供给、活动节奏与版本改动影响，历史开服价不代表 FC27 会重演。</div>
</body></html>
`;

const outPath = path.join(ROOT, 'reports', 'daily', dateStr, 'market-icons-research.html');
atomicWrite(outPath, html);
// 跨日期常驻副本：当日产物只对「今天」有效，为让本报告在往期与未来日期仍可见，
// 同步刷新一份不带日期的常驻底稿。**不覆盖** fc27-icon-analysis.html（那是静态预测底稿，内容独立）。
const persistentPath = path.join(ICON_DIR, 'reports', 'fc27-icon-live-research.html');
atomicWrite(persistentPath, html);
const jsonPath = path.join(RESEARCH_DIR, `fc26-vs-fc27-${dateStr}.json`);
atomicWrite(jsonPath, JSON.stringify({
  date: dateStr,
  generatedAt: new Date().toISOString(),
  minValidPrice: MIN_VALID_PRICE,
  priceBasis,
  rangeCollectedAt: pricerange?.collectedAt || null,
  counts: {
    compared: rowsAll.length,
    advice: advice.length,
    condA: condAOnly + bothConds,
    condB: condBOnly + bothConds,
    both: bothConds,
    noFc26: noFc26.length,
    noRange: noRange.length,
  },
  rows: rowsAll,
}, null, 2) + '\n');

console.log(`传奇卡研究已生成: ${path.relative(ROOT, outPath)}`);
console.log(`  对照 ${rowsAll.length} 张（口径 ${priceBasis}）· 投资建议 ${advice.length} 张（条件A ${condAOnly + bothConds} / 条件B ${condBOnly + bothConds} / 双命中 ${bothConds}）`);
console.log(`  无 FC26 对照 ${noFc26.length} 张 · 无价格区间 ${noRange.length} 张`);
console.log(`  结构化结果: ${path.relative(ROOT, jsonPath)}`);
console.log(`  常驻底稿: ${path.relative(ROOT, persistentPath)}`);
