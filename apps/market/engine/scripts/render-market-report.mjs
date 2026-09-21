#!/usr/bin/env node
/**
 * FC27 市场「扫描」子页渲染器（索引 + 数据库版）
 * 用途：把结构化球员数据渲染为 reports/daily/D/market-scan.html。
 *       该文件是 FC27 市场页里的「市场扫描」标签页内容。
 * 结构：一、索引（按位置/总评/价格/进化状态分类概览，可点击联动筛选）
 *       二、数据库（可搜索/筛选/排序的球员表，含 FUTBIN /27 维度：总评、位置、六维、价格、热度、状态）
 * 平台：页面顶部提供 Console（PS / Xbox 合并）与 PC 两个平台口径切换按钮，价格为平台成交价；
 *       两个平台价均为 0 时显示列表页估值并标注「估值」，不计算涨跌。
 * 输入：automation/runs/D/market/market.json（球员名单与静态字段）；
 *       页面运行时从 assets/data/current.json 按 cardId 读取唯一当前行情。
 * 输出：reports/daily/D/market-scan.html
 * 采集缺失时渲染为如实空状态，绝不伪造或复用其他日期数据。
 *
 * 用法：node apps/market/engine/scripts/render-market-report.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avatarIndex, avatarSrc, materializeAvatars } from '../../../../shared/lib/player-avatar.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : (v ?? ''));

function todayShanghai() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

export function loadMarketData(dateStr) {
  const jsonPath = process.env.FC_MARKET_JSON
    || path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'market.json');
  if (!existsSync(jsonPath)) return { data: null, jsonPath };
  try {
    return { data: JSON.parse(readFileSync(jsonPath, 'utf8')), jsonPath };
  } catch (e) {
    return { data: null, jsonPath, error: e.message };
  }
}

// FUTBIN /27 六维（出场的标准六面）。
// 注意：数据里的键是英文大写（PAC/SHO/PAS/DRI/DEF/PHY），门将卡为 DIV/HAN/KIC/REF/SPD/POS；
// 这里的 k 只是历史遗留的中文别名，前端取值一律用 en，不要用 k（2026-09-20 修复六维列全为「—」）。
const SIX = [
  { k: '速', label: '速度', en: 'PAC' },
  { k: '射', label: '射门', en: 'SHO' },
  { k: '传', label: '传球', en: 'PAS' },
  { k: '盘', label: '盘带', en: 'DRI' },
  { k: '防', label: '防守', en: 'DEF' },
  { k: '身', label: '身体', en: 'PHY' },
];

function posGroup(pos) {
  if (!pos) return '其他';
  const p = pos.trim().toUpperCase();
  if (p === 'GK') return '门将';
  if (/CB|LB|RB|LWB|RWB/.test(p)) return '后卫';
  if (/CM|CDM|CAM|LM|RM/.test(p)) return '中场';
  if (/ST|CF|LW|RW/.test(p)) return '前锋';
  return '其他';
}

function statClass(v) {
  if (v === undefined || v === null) return 'na';
  if (v >= 80) return 'hi';
  if (v >= 70) return 'mid';
  if (v >= 60) return 'lo';
  return 'bad';
}

// 平台定义：与 FUTBIN 的 platform 表单按钮一致（value=ps 文案 Console / value=pc 文案 PC）。
// 列表页每行同时渲染 platform-ps-only 与 platform-pc-only 两个价格单元格，由 CSS 按所选平台显隐。
export const PLATFORMS = [
  { id: 'console', label: 'Console', short: 'PS / Xbox', key: 'psPrice' },
  { id: 'pc', label: 'PC', short: 'PC', key: 'pcPrice' },
];
export const DEFAULT_PLATFORM = 'console';

// ---- 价格分档（2026-09-20 用户要求：由 3 档改为 6 档）----
// 口径：按「当前平台有效价」落区间；无有效价的卡归入最高档（用户要求：默认没有价格的卡按最高价格处理）。
// id 是筛选、索引与排序的唯一键，label 只用于展示——改 label 不会破坏 chip 与下拉的联动。
export const PRICE_BUCKETS = [
  { id: 'lt1w',     label: '1 万以下',    min: 0,       max: 10000 },
  { id: '1w-5w',    label: '1 ~ 5 万',    min: 10000,   max: 50000 },
  { id: '5w-10w',   label: '5 ~ 10 万',   min: 50000,   max: 100000 },
  { id: '10w-50w',  label: '10 ~ 50 万',  min: 100000,  max: 500000 },
  { id: '50w-100w', label: '50 ~ 100 万', min: 500000,  max: 1000000 },
  { id: '100w+',    label: '100 万以上',  min: 1000000, max: Infinity },
];
export const TOP_BUCKET_ID = '100w+';
// 有效价下限：FUTBIN 列表页估值 < 1000 一律视为占位值，不得当成交价（项目既有硬约束，不因本改动放宽）。
export const MIN_VALID_PRICE = 1000;
// 「最高价」兜底下限：无有效价卡的显示值与排序值取 MAX(本快照最高有效价, 本常量)，
// 因此它们必然落在最高档，且跨快照可比。注意：这是**标注过的占位值**，不是该卡真实成交价。
export const PRICE_CEIL_FLOOR = 1000000;

export function priceBucketId(v) {
  for (const b of PRICE_BUCKETS) if (v >= b.min && v < b.max) return b.id;
  return TOP_BUCKET_ID;
}

// ---- 卡片系列排除（2026-09-20 用户要求：市场扫描去掉英雄卡和传奇卡）----
// 背景：英雄卡 / 传奇卡已有独立的「传奇/英雄专栏」（icons-heroes.html），市场扫描不得重复收录；
//      Hall of FUT 属退役名将活动卡，用户确认一并排除。
// 判据需要两条并存，缺一不可：
//   ① 卡片版本前缀命中排除家族关键词——自动、可扩展，但历史快照无此字段；
//   ② cardId 命中人工可审计的排除清单——覆盖版本信号缺失的历史数据与新活动卡系列。
// 版本前缀取自 FUTBIN 卡面图 URL img/cards/hd/<版本>.png，需与卡片同页采集（见 extract-market-prices.js）。
const SCAN_EXCLUSIONS_PATH = path.join(ROOT, 'apps', 'market', 'engine', 'data', 'players', 'fc27', 'scan-exclusions.json');
const FALLBACK_VERSION_PATTERNS = ['base_hero', 'base_icon', 'debut_icon', 'champion_icon', 'icon', 'hall_of_fut'];
const versionRegex = pats => new RegExp(`(?:^|_)(?:${pats.join('|')})(?:_|$)`, 'i');

export function loadScanExclusions() {
  if (!existsSync(SCAN_EXCLUSIONS_PATH)) {
    return { versionRe: versionRegex(FALLBACK_VERSION_PATTERNS), ids: new Map(), source: '内置默认（未找到 scan-exclusions.json）' };
  }
  try {
    const j = JSON.parse(readFileSync(SCAN_EXCLUSIONS_PATH, 'utf8'));
    const pats = Array.isArray(j.excludedVersionPatterns) && j.excludedVersionPatterns.length
      ? j.excludedVersionPatterns : FALLBACK_VERSION_PATTERNS;
    const ids = new Map();
    for (const c of (j.cards || [])) if (c && c.cardId != null) ids.set(String(c.cardId), c.series || '排除');
    return { versionRe: versionRegex(pats), ids, source: SCAN_EXCLUSIONS_PATH };
  } catch (e) {
    return { versionRe: versionRegex(FALLBACK_VERSION_PATTERNS), ids: new Map(), source: `scan-exclusions.json 解析失败：${e.message}` };
  }
}

// ---- 基础卡标识与归并（2026-09-20 新增，修复市场扫描重复球员） ----
// FUTBIN 进化卡的 URL 形如 /27/player/<基础cardId>_<进化链编码>/<slug>（例：810_15/marcus-rashford）。
// 同一张基础卡会因不同进化路径产生多条 URL，按整串 URL 去重无法去掉它们。
// 页面运行时又只按基础 cardId 从 current.json 取价与热度，变体之间本就无法区分
// （实测同一卡的 4 条变体拿到完全相同的价格与热度），所以数据库必须先按基础 cardId 归并为一人一行。
const CARD_URL_RE = /\/player\/([^/?#]+)/;
export function baseCardIdOf(p) {
  const m = String(p?.url || '').match(CARD_URL_RE);
  return m ? m[1].split('_')[0] : null;
}
function isEvolvedEntry(p) {
  const m = String(p?.url || '').match(CARD_URL_RE);
  return !!m && m[1].includes('_');
}
// 进化名可能写在 evo（历史数据把进化名塞进了 evo 字段）或 evoName；两种都兼容。
function evoNameOf(p) {
  const v = String(p?.evo || '').trim();
  if (v && v !== '非进化池' && v !== '在进化池') return v;
  return String(p?.evoName || '').trim();
}
function mergeByBaseCard(list) {
  const groups = new Map();
  const order = [];
  for (const p of list) {
    const id = baseCardIdOf(p) || `__no_id_${order.length}`;
    if (!groups.has(id)) { groups.set(id, []); order.push(id); }
    groups.get(id).push(p);
  }
  return order.map(id => {
    const items = groups.get(id);
    // 保留优先级：非进化母卡 > 热度最高的变体（母卡的总评/位置/六维才是卡库口径）
    const mother = items.find(p => !isEvolvedEntry(p)) || null;
    const rep = mother || [...items].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    const evoNames = [...new Set(items.map(evoNameOf).filter(Boolean))];
    // 同一张卡的任一变体带出版本前缀即可用于系列判定——进化卡与母卡分处两个榜单，
    // 版本信号常只落在其中一条上，按整组汇总才不会漏判（例：Zidane 只有进化条目带 160_debut_icon）。
    const versions = [...new Set(items
      .flatMap(it => [it.cardVersion, it.card_version, it.version])
      .filter(v => typeof v === 'string' && v.trim())
      .map(v => v.trim()))];
    return {
      ...rep,
      __cardId: id,
      __versions: versions,
      evo: evoNames.length ? '在进化池' : '非进化池',
      evoName: evoNames.join(' / '),
      variantCount: items.length,
    };
  });
}

// 六维键统一为 FUTBIN 的英文大写（PAC/SHO/PAS/DRI/DEF/PHY）。
// 门将卡六维是 DIV/HAN/KIC/REF/SPD/POS，页面表头只有一套出场六维，
// 因此门将只把「速度」映射到 GK 的 SPD，其余列留空——不把 GK 分项错塞进射门/传球等列。
function normSix(raw, pos) {
  const s = raw || {};
  const pick = (...keys) => {
    for (const k of keys) { const v = s[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; }
    return null;
  };
  if (/\bGK\b/.test(String(pos || '').toUpperCase())) {
    return { PAC: pick('SPD', 'spd'), SHO: null, PAS: null, DRI: null, DEF: null, PHY: null };
  }
  return {
    PAC: pick('PAC', 'pac', '速'), SHO: pick('SHO', 'sho', '射'),
    PAS: pick('PAS', 'pas', '传'), DRI: pick('DRI', 'dri', '盘'),
    DEF: pick('DEF', 'def', '防'), PHY: pick('PHY', 'phy', '身'),
  };
}

export function renderScan(dateStr, data) {
  const d = data || {};
  // 名单与静态属性来自日报 market.json；价格不再复制到独立 players.json。
  // 先按基础 cardId 归并（同一张卡的不同进化路径只保留一行），再做索引统计与渲染。
  const rawPlayers = Array.isArray(d.players) ? d.players : [];
  const mergedPlayers = mergeByBaseCard(rawPlayers);
  // 英雄 / 传奇 / 活动卡排除（判据与背景见 loadScanExclusions 注释）
  const exclusions = loadScanExclusions();
  const players = [];
  const excludedRows = [];
  for (const p of mergedPlayers) {
    const hitVer = (p.__versions || []).find(v => exclusions.versionRe.test(v));
    const hitId = exclusions.ids.get(String(p.__cardId));
    if (hitVer || hitId) excludedRows.push({ cardId: p.__cardId, name: p.name, rating: p.rating, series: hitId || hitVer, url: p.url });
    else players.push(p);
  }
  const playersSource = `market.json.players（原始 ${rawPlayers.length} 条 → 按基础 cardId 归并 ${mergedPlayers.length} 行 → 排除英雄/传奇/活动卡 ${excludedRows.length} 行 ⇒ ${players.length} 行）+ current.json`;
  const excludedNote = excludedRows.length
    ? ` · 已排除英雄/传奇/活动卡 ${excludedRows.length} 张：${excludedRows.map(e => `${e.name}（${e.series}）`).join('、')}`
    : '';
  const status = (d.status || 'partial').toUpperCase();
  const total = players.length;
  const cutoff = d.dataCutoff || d.generatedAt || '未标注';
  const platform = DEFAULT_PLATFORM;

  // 分类索引统计
  const posCounts = { '门将': 0, '后卫': 0, '中场': 0, '前锋': 0 };
  const ratingCounts = { '80+': 0, '75-79': 0, '70-74': 0, '69以下': 0 };
  // 价格分档不在服务端计数：服务端拿不到平台成交价（价格只在页面运行时从 current.json 按 cardId 取），
  // 用列表页估值兜底会让首屏把大量行错归到某一档（2026-09-20 实测：旧三档全落在「5000 以下 559」）。
  // 因此价格 chip 首屏一律渲染「—」，由页面载入 current.json 后的 refreshPriceIndex() 填入真实计数。
  const evoCounts = { '在进化池': 0, '非进化池': 0 };
  players.forEach(p => {
    const g = posGroup(p.pos); if (posCounts[g] !== undefined) posCounts[g]++;
    const r = p.rating || 0;
    if (r >= 80) ratingCounts['80+']++; else if (r >= 75) ratingCounts['75-79']++; else if (r >= 70) ratingCounts['70-74']++; else ratingCounts['69以下']++;
    if (p.evo === '在进化池') evoCounts['在进化池']++; else evoCounts['非进化池']++;
  });

  // 索引卡片：价格卡按平台分别给出计数，随顶部平台按钮一起切换；
  // counts===null 表示「服务端不知道真实价」，渲染为「—」，等页面运行时填。
  const countHtml = it => {
    if (it.counts === null) return PLATFORMS.map(p => `<b class="pv pv-${p.id}">—</b>`).join('');
    if (!it.counts) return `<b>${it.count}</b>`;
    return PLATFORMS.map(p => `<b class="pv pv-${p.id}">${it.counts[p.id]}</b>`).join('');
  };
  const idxCard = (title, items) => `<div class="idx-card"><h3>${esc(title)}</h3>${items.map(it =>
    `<button type="button" class="idx-chip" ${it.pos ? `data-set-pos="${esc(it.pos)}"` : ''}${it.rating ? ` data-set-rating="${esc(it.rating)}"` : ''}${it.price ? ` data-set-price="${esc(it.price)}"` : ''}${it.evo ? ` data-set-evo="${esc(it.evo)}"` : ''}>${esc(it.label)}${countHtml(it)}</button>`).join('')}</div>`;

  const indexHtml = `<div class="index-grid">
${idxCard('按位置', [
  { label: '门将 GK', pos: '门将', count: posCounts['门将'] },
  { label: '后卫 DF', pos: '后卫', count: posCounts['后卫'] },
  { label: '中场 MF', pos: '中场', count: posCounts['中场'] },
  { label: '前锋 FW', pos: '前锋', count: posCounts['前锋'] },
])}
${idxCard('按总评', [
  { label: '80+', rating: '80+', count: ratingCounts['80+'] },
  { label: '75-79', rating: '75-79', count: ratingCounts['75-79'] },
  { label: '70-74', rating: '70-74', count: ratingCounts['70-74'] },
  { label: '69 以下', rating: '69以下', count: ratingCounts['69以下'] },
])}
${idxCard('按价格（随平台切换）', PRICE_BUCKETS.map(b => ({
  label: b.label, price: b.id, counts: null,
})))}
${idxCard('进化状态', [
  { label: '在进化池', evo: '在进化池', count: evoCounts['在进化池'] },
  { label: '非进化池', evo: '非进化池', count: evoCounts['非进化池'] },
])}
</div>`;

  // 数据库数据注入（转义 </ 防止提前闭合 script）
  // cPrice = Console（PS/Xbox）平台价，pPrice = PC 平台价，price = 列表页估值（IS 列）。
  // image = 球员头像相对路径（assets/players/<resourceId>.png）；由合并期的
  // rewriteLocalReportAssets 改写为指向 daily-merged/assets/ 的相对路径，解析不到头像的球员如实留空。
  const idx = avatarIndex();
  const avatarResolved = players.map(p => idx.resolve(p)?.resourceId || null);
  const avatarReady = materializeAvatars(path.join(ROOT, 'reports', 'daily', dateStr),
    avatarResolved.filter(Boolean));
  const avatarStat = players.length
    ? ` · 球员头像 ${avatarResolved.filter(rid => rid && avatarReady.has(String(rid))).length}/${players.length}`
    : '';
  const avatarPath = i => {
    const rid = avatarResolved[i];
    return rid && avatarReady.has(String(rid)) ? avatarSrc(rid) : '';
  };
  const dbJson = JSON.stringify(players.map((p, i) => ({
    cardId: p.__cardId || baseCardIdOf(p),
    name: p.name, nameZh: p.nameZh, rating: p.rating, pos: p.pos, estimate: p.price,
    cPrice: 0, pPrice: 0, popularity: p.popularity, evo: p.evo, evoName: p.evoName || '',
    variantCount: p.variantCount || 1, image: avatarPath(i), url: p.url,
    stats: normSix(p.stats, p.pos),
  }))).replace(/</g, '\\u003c');

  const css = `:root{color-scheme:dark;--bg:#101713;--panel:#161e18;--line:#30392f;--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--lime:#c8f646;--coral:#ff6259;--amber:#e3b341;--green:#4fb583;--teal:#8fd6bb}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:22px 24px 40px;line-height:1.55}
h1{font-size:21px;font-weight:800;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(200,246,70,.14);border:1px solid rgba(200,246,70,.4);color:var(--lime)}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 20px}
h2{font-size:16px;font-weight:750;margin:26px 0 12px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:16px;background:var(--lime);border-radius:2px}
.index-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.idx-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.idx-card h3{font-size:13px;font-weight:700;color:var(--quiet);margin-bottom:10px}
.idx-chip{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:8px 12px;margin-bottom:6px;border-radius:8px;background:#141c15;border:1px solid var(--line);color:var(--text);font-size:13px;cursor:pointer;transition:border-color .15s,background .15s}
.idx-chip:hover{border-color:var(--lime);background:#1d271b}
.idx-chip b{color:var(--lime);font-weight:700}
.db-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 14px}
.db-toolbar input,.db-toolbar select{background:#141c15;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-size:13px;min-height:38px}
.db-toolbar input{flex:1;min-width:180px}
.db-toolbar input:focus,.db-toolbar select:focus{outline:2px solid var(--lime);outline-offset:1px}
.db-count{font-size:12px;color:var(--quiet);align-self:center}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:center;color:var(--quiet);font-weight:600;padding:9px 8px;border-bottom:1px solid var(--line);font-size:11px;letter-spacing:.02em;white-space:nowrap;position:sticky;top:0;background:#1d271b}
td{padding:7px 8px;border-bottom:1px solid #202b1a;text-align:center;white-space:nowrap}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#1d271b}
.c-rank{color:var(--quiet);width:34px;font-size:11px}
.c-name{text-align:left;min-width:170px}
.c-name .pimg{width:26px;height:26px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:7px;background:#202b1a;border:1px solid #30392f}
.c-name a{color:var(--text);text-decoration:none;font-weight:600}
.c-name a:hover{color:var(--lime)}
.c-name .zh{color:var(--quiet);font-size:10.5px;margin-left:5px;font-weight:400}
.c-rating{font-weight:800;color:var(--lime);font-size:14px}
.c-pos{color:var(--muted)}
.stat-v{font-weight:700}
.stat-v.hi{color:var(--green)}.stat-v.mid{color:var(--teal)}.stat-v.lo{color:var(--amber)}.stat-v.bad{color:var(--quiet)}.stat-v.na{color:#4a5345}
.c-price{color:var(--amber);font-weight:600}
.pv{display:none}
body[data-platform="console"] .pv-console,
body[data-platform="pc"] .pv-pc{display:inline}
.c-price .est{font-style:normal;font-size:9.5px;color:var(--quiet);border:1px solid var(--line);border-radius:4px;padding:0 4px;margin-left:4px;vertical-align:1px}
.c-price .est.noq{color:var(--coral);border-color:rgba(255,98,89,.45)}
.plat-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin:0 0 18px}
.plat-label{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--quiet);font-weight:700}
.plat-btn{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:6px 14px;border-radius:9px;border:1px solid var(--line);background:#1d271b;color:var(--muted);font-size:13px;font-weight:650;cursor:pointer;transition:.15s}
.plat-btn small{font-size:10px;color:var(--quiet);font-weight:500;letter-spacing:.05em}
.plat-btn:hover{border-color:var(--lime);color:var(--text)}
.plat-btn.active{background:rgba(200,246,70,.12);border-color:rgba(200,246,70,.5);color:var(--lime)}
.plat-btn.active small{color:rgba(200,246,70,.75)}
.plat-hint{font-size:11px;color:var(--quiet);margin-left:auto;max-width:52ch}
.c-pop{color:var(--teal);font-weight:600}
.c-evo{font-size:11px;padding:2px 8px;border-radius:999px;font-weight:600}
.c-evo.in{background:rgba(79,181,131,.16);color:var(--green)}
.c-evo.out{background:rgba(227,179,65,.14);color:var(--amber)}
.empty{color:var(--quiet);font-size:12.5px;padding:16px;border:1px dashed var(--line);border-radius:9px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:24px;border-top:1px solid var(--line);padding-top:12px}`;

  // 分档区间与阈值随服务端常量一起注入，避免两侧各自硬编码造成漂移
  const bucketJsLiteral = JSON.stringify(PRICE_BUCKETS.map(b => ({
    id: b.id, label: b.label, min: b.min, max: Number.isFinite(b.max) ? b.max : null,
  })));

  const dbJs = `
(function(){
  var raw = document.getElementById('db-data').textContent;
  var players = [];
  try { players = JSON.parse(raw); } catch (e) {}
  var BUCKETS = ${bucketJsLiteral};
  var TOP_BUCKET = '${TOP_BUCKET_ID}';
  var MIN_VALID_PRICE = ${MIN_VALID_PRICE};
  var PRICE_CEIL_FLOOR = ${PRICE_CEIL_FLOOR};
  var state = { q: '', pos: '全部', rating: '全部', price: '全部', evo: '全部', sort: 'rating-desc' };
  var tbody = document.getElementById('db-body');
  var countEl = document.getElementById('db-count');
  function fmtPrice(v){ if(v==null) return '—'; if(v>=10000) return (v/10000).toFixed(v%10000===0?0:1)+'万'; if(v>=1000) return (v/1000).toFixed(v%1000===0?0:1)+'K'; return String(v); }
  function statCls(v){ if(v==null) return 'na'; if(v>=80) return 'hi'; if(v>=70) return 'mid'; if(v>=60) return 'lo'; return 'bad'; }
  function posGroup(pos){ if(!pos) return '其他'; var p=pos.toUpperCase(); if(p==='GK') return '门将'; if(/CB|LB|RB|LWB|RWB/.test(p)) return '后卫'; if(/CM|CDM|CAM|LM|RM/.test(p)) return '中场'; if(/ST|CF|LW|RW/.test(p)) return '前锋'; return '其他'; }
  function bucketOf(v){ for(var i=0;i<BUCKETS.length;i++){ var b=BUCKETS[i]; if(v>=b.min && (b.max==null || v<b.max)) return b.id; } return TOP_BUCKET; }
  // 有效价三档优先级：平台成交价 → 列表页估值 → 都没有则 null（即「无价」）。
  // 低于 MIN_VALID_PRICE 的估值是占位值，不得当成交价（项目既有硬约束）。
  function rawPrice(p){
    var plat = document.body.getAttribute('data-platform') || 'console';
    var v = (plat==='pc') ? p.pPrice : p.cPrice;
    if (v >= MIN_VALID_PRICE) return { v: v, src: 'platform' };
    var e = p.estimate;
    if (typeof e === 'number' && e >= MIN_VALID_PRICE) return { v: e, src: 'estimate' };
    return null;
  }
  // 「无价」卡按最高价处理（用户要求）：显示值与排序值取 MAX(本快照最高有效价, 兜底下限)，
  // 因而必然落入最高档。价格列以「≥」+「无价」标注，不伪装成该卡真实成交价。
  var priceCeiling = PRICE_CEIL_FLOOR;
  function recomputeCeiling(){
    var m = PRICE_CEIL_FLOOR;
    players.forEach(function(p){ var r = rawPrice(p); if (r && r.v > m) m = r.v; });
    priceCeiling = m;
  }
  function priceOf(p){ var r = rawPrice(p); return r ? r.v : priceCeiling; }
  function priceCell(p){
    var parts = [];
    ['console','pc'].forEach(function(id){
      var v = (id==='pc') ? p.pPrice : p.cPrice;
      var est = false, noq = false;
      if (!(v >= MIN_VALID_PRICE)) {
        var e = p.estimate;
        if (typeof e === 'number' && e >= MIN_VALID_PRICE) { v = e; est = true; }
        else { v = priceCeiling; noq = true; }
      }
      var mark = noq ? '<i class="est noq">无价·按最高价</i>' : (est ? '<i class="est">估值</i>' : '');
      parts.push('<span class="pv pv-'+id+'">'+(noq ? '≥' : '')+fmtPrice(v)+mark+'</span>');
    });
    return '<td class="c-price">'+parts.join('')+'</td>';
  }
  function matches(p){
    var g = posGroup(p.pos);
    if (state.q && (p.name+' '+(p.nameZh||'')).toLowerCase().indexOf(state.q.toLowerCase()) < 0) return false;
    if (state.pos !== '全部' && g !== state.pos) return false;
    if (state.rating === '80+' && (p.rating||0) < 80) return false;
    if (state.rating === '75-79' && ((p.rating||0) < 75 || (p.rating||0) > 79)) return false;
    if (state.rating === '70-74' && ((p.rating||0) < 70 || (p.rating||0) > 74)) return false;
    if (state.rating === '69以下' && (p.rating||0) >= 70) return false;
    if (state.price !== '全部' && bucketOf(priceOf(p)) !== state.price) return false;
    if (state.evo !== '全部' && p.evo !== state.evo) return false;
    return true;
  }
  function sortFn(a, b){
    switch (state.sort) {
      case 'rating-asc': return (a.rating||0) - (b.rating||0);
      case 'price-asc': return priceOf(a) - priceOf(b);
      case 'price-desc': return priceOf(b) - priceOf(a);
      case 'pop-desc': return (b.popularity||0) - (a.popularity||0);
      default: return (b.rating||0) - (a.rating||0);
    }
  }
  // 索引卡「按价格」的服务端初始计数用列表页估值兜底，与页面上的实时行情无关；
  // 统一行情 current.json 载入后必须按当前平台价重算，否则整档会一直显示估值兜底的结果
  // （2026-09-20 实测：旧三档全落在「5000 以下 559」，与真实行情脱节）。
  function refreshPriceIndex(){
    recomputeCeiling();
    var counts = {};
    BUCKETS.forEach(function(b){ counts[b.id] = 0; });
    players.forEach(function(p){ counts[bucketOf(priceOf(p))]++; });
    document.querySelectorAll('.idx-chip[data-set-price]').forEach(function(chip){
      var n = counts[chip.getAttribute('data-set-price')] || 0;
      chip.querySelectorAll('b').forEach(function(b){ b.textContent = String(n); });
    });
  }
  function render(){
    var list = players.filter(matches).sort(sortFn);
    refreshPriceIndex();
    var six = ['PAC','SHO','PAS','DRI','DEF','PHY'];
    tbody.innerHTML = list.map(function(p, i){
      var cells = '<td class="c-rank">' + (i+1) + '</td>';
      cells += '<td class="c-name">' + (p.image ? '<img class="pimg" src="' + p.image + '" loading="lazy" alt="">' : '') + (p.url ? '<a href="' + p.url + '" target="_blank" rel="noopener">' + (p.name||'') + '</a>' : (p.name||'')) + (p.nameZh ? '<span class="zh">' + p.nameZh + '</span>' : '') + '</td>';
      cells += '<td class="c-rating">' + (p.rating||'—') + '</td>';
      cells += '<td class="c-pos">' + (p.pos||'') + '</td>';
      for (var j=0;j<6;j++){ var v = p.stats && p.stats[six[j]]; cells += '<td><span class="stat-v ' + statCls(v) + '">' + (v==null?'—':v) + '</span></td>'; }
      cells += priceCell(p);
      cells += '<td class="c-pop">' + (p.popularity!=null ? p.popularity : '—') + '</td>';
      var evoIn = p.evo === '在进化池';
      var evoLabel = p.evo || '—';
      if (evoIn && p.variantCount > 1) evoLabel += ' ×' + p.variantCount;
      var evoTip = (evoIn && p.evoName) ? ' title="进化路径：' + String(p.evoName).replace(/"/g, '&quot;') + '"' : '';
      cells += '<td><span class="c-evo ' + (evoIn ? 'in' : 'out') + '"' + evoTip + '>' + evoLabel + '</span></td>';
      return '<tr>' + cells + '</tr>';
    }).join('');
    countEl.textContent = '共 ' + list.length + ' 名球员';
  }
  function bind(el, fn){ if (el) el.addEventListener('input', fn); }
  var q = document.getElementById('db-q'), pos = document.getElementById('db-pos'), rating = document.getElementById('db-rating'), price = document.getElementById('db-price'), evo = document.getElementById('db-evo'), sort = document.getElementById('db-sort');
  bind(q, function(){ state.q = q.value; render(); });
  [pos, rating, price, evo, sort].forEach(function(el){ if (el) el.addEventListener('change', function(){ state.pos = pos.value; state.rating = rating.value; state.price = price.value; state.evo = evo.value; state.sort = sort.value; render(); }); });
  document.querySelectorAll('.idx-chip').forEach(function(chip){ chip.addEventListener('click', function(){
    if (chip.dataset.setPos !== undefined) { pos.value = chip.dataset.setPos; state.pos = chip.dataset.setPos; }
    if (chip.dataset.setRating !== undefined) { rating.value = chip.dataset.setRating; state.rating = chip.dataset.setRating; }
    if (chip.dataset.setPrice !== undefined) { price.value = chip.dataset.setPrice; state.price = chip.dataset.setPrice; }
    if (chip.dataset.setEvo !== undefined) { evo.value = chip.dataset.setEvo; state.evo = chip.dataset.setEvo; }
    render();
    var db = document.getElementById('db'); if (db && db.scrollIntoView) db.scrollIntoView({behavior:'smooth', block:'start'});
  });});
  // 平台切换：切换价格口径并重排表格（价格排序与筛选均跟随当前平台）
  function setPlatform(id){
    document.body.setAttribute('data-platform', id);
    document.querySelectorAll('.plat-btn').forEach(function(b){
      var on = b.getAttribute('data-platform') === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    render();
  }
  document.querySelectorAll('.plat-btn').forEach(function(b){
    b.addEventListener('click', function(){ setPlatform(b.getAttribute('data-platform')); });
  });
  function currentUrl(){
    try {
      var host = window.parent && window.parent !== window ? window.parent.location : window.location;
      var prefix = host.pathname.indexOf('/archive/') !== -1 ? '../' : '';
      return new URL(prefix+'assets/data/current.json', host.href).toString();
    } catch (e) { return 'assets/data/current.json'; }
  }
  fetch(currentUrl(), {cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error(String(r.status)); return r.json(); }).then(function(doc){
    var cards=doc.cards||{}, counts={console:0,pc:0,noQuote:0};
    players.forEach(function(p){
      var c=p.cardId&&cards[p.cardId]; if(c){
        p.cPrice=c.platforms&&c.platforms.console&&c.platforms.console.valid?c.platforms.console.price:0;
        p.pPrice=c.platforms&&c.platforms.pc&&c.platforms.pc.valid?c.platforms.pc.price:0;
        if(typeof c.popularity==='number') p.popularity=c.popularity;
      }
      if(p.cPrice>0) counts.console++; if(p.pPrice>0) counts.pc++;
      if(!rawPrice(p)) counts.noQuote++;
    });
    // 先 render()（内部会按当前平台重算价格上限与索引），再写提示，保证文案里的「≥」值与表内一致
    render();
    var hint=document.getElementById('live-market-hint');
    if(hint) hint.textContent='统一行情已刷新：Console 有价 '+counts.console+'、PC 有价 '+counts.pc+'，共 '+players.length+' 名球员；无有效价 '+counts.noQuote+' 张（价格列以「≥'+fmtPrice(priceCeiling)+'」展示并归入最高档，该数值为标注过的占位值）。';
  }).catch(function(){ var hint=document.getElementById('live-market-hint'); if(hint) hint.textContent='统一行情文件暂不可用，价格如实留空。'; render(); });
})();`;

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 市场扫描 ${esc(dateStr)}</title>
<style>${css}</style></head><body data-platform="${esc(platform)}">
<h1>FC27 市场扫描 <span class="badge">${esc(status)}</span></h1>
<div class="sub">数据日期 ${esc(dateStr)} · 数据截止 ${esc(cutoff)} · 索引 + 数据库 · 球员来源 ${esc(playersSource)}${esc(avatarStat)}${esc(excludedNote)} · 价格分 6 档（1 万以下 / 1~5 万 / 5~10 万 / 10~50 万 / 50~100 万 / 100 万以上） · 页面刷新时从统一行情 current.json 读取最新价</div>

<div class="plat-bar" role="group" aria-label="平台切换">
  <span class="plat-label">平台</span>
  ${PLATFORMS.map(p => `<button type="button" class="plat-btn${p.id === platform ? ' active' : ''}" data-platform="${p.id}" aria-pressed="${p.id === platform}">${esc(p.label)}<small>${esc(p.short)}</small></button>`).join('')}
  <span class="plat-hint" id="live-market-hint">正在读取统一行情 current.json…</span>
</div>

<h2>一、索引（分类概览）</h2>
${total ? indexHtml : '<div class="empty">market.json 球员名单为空，如实空状态。</div>'}

<h2>二、数据库（可搜索 · 筛选 · 排序）</h2>
<div class="db-toolbar" id="db">
  <input type="search" id="db-q" placeholder="搜索球员姓名（中/英）…">
  <select id="db-pos"><option value="全部">全部位置</option><option value="门将">门将</option><option value="后卫">后卫</option><option value="中场">中场</option><option value="前锋">前锋</option></select>
  <select id="db-rating"><option value="全部">全部总评</option><option value="80+">80+</option><option value="75-79">75-79</option><option value="70-74">70-74</option><option value="69以下">69 以下</option></select>
  <select id="db-price"><option value="全部">全部价格</option>${PRICE_BUCKETS.map(b => `<option value="${esc(b.id)}">${esc(b.label)}</option>`).join('')}</select>
  <select id="db-evo"><option value="全部">全部状态</option><option value="在进化池">在进化池</option><option value="非进化池">非进化池</option></select>
  <select id="db-sort"><option value="rating-desc">按总评 ↓</option><option value="rating-asc">按总评 ↑</option><option value="price-desc">按价格 ↓</option><option value="price-asc">按价格 ↑</option><option value="pop-desc">按热度 ↓</option></select>
  <span class="db-count" id="db-count"></span>
</div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>总评</th><th>位置</th><th>速度</th><th>射门</th><th>传球</th><th>盘带</th><th>防守</th><th>身体</th><th>价格</th><th>热度</th><th>状态</th></tr></thead><tbody id="db-body"></tbody></table></div>

<script type="application/json" id="db-data">${dbJson}</script>
<script>${dbJs}</script>

<div class="footer">FC27 市场扫描（索引 + 数据库）· ${esc(dateStr)} · 由 render-market-report.mjs 渲染 · 六维与推荐价来自 EasySBC，热度为 FUTBIN 评分 · 价格为 Console（PS/Xbox）与 PC 两个平台口径 · 已排除卡片：英雄卡 / 传奇卡 / Hall of FUT 活动卡（已有独立的传奇、英雄专栏，清单见 apps/market/engine/data/players/fc27/scan-exclusions.json） · 无有效价的卡按快照最高价 ≥${esc(num(PRICE_CEIL_FLOOR))} coins 展示并归入「100 万以上」档，该数值为标注过的占位值、不是该卡真实成交价 · 仅供游戏内研究，不构成投资建议</div>
</body></html>
`;
}

// ========== 主流程（单独调用时只渲染 market-scan.html）==========
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dateStr = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : todayShanghai();
  const { data, jsonPath, error } = loadMarketData(dateStr);
  if (error) console.error(`market.json 解析失败：${error}`);
  if (!data) console.error(`未找到或无法读取 ${jsonPath}，将渲染为如实空状态。`);
  const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'market-scan.html');
  writeFileSync(outPath, renderScan(dateStr, data), 'utf8');
  console.log(`市场扫描子页已渲染: ${outPath}`);
}
