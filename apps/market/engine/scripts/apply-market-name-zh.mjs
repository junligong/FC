#!/usr/bin/env node
/**
 * FC27 市场/进化/英雄 中文译名注入器
 * 用途：把持久化译名词库里的中文球员名写入当日数据文件（market.json / evolution.json 等），
 *       让渲染器直接输出「英文名 + 中文名」，无需手工改 HTML。
 * 数据源（按优先级合并为一个 slug→中文 索引）：
 *   1) apps/market/engine/data/players/name-zh-supplement-fc27.json   （FC27 增量词库，执行 AI 每日追加）
 *   2) data/players/chinese-name-supplement.json                      （历史人工补充表）
 *   3) data/players/player-name-zh.json                               （Wikidata 解析库，227 人）
 *   4) gold/data/prices/fc26/fc26-first-month*.json                   （FC26 首月研究数据自带 nameZh）
 *   5) icons/data/players/fc27/fc27-icons-playstyles.json             （131 张传奇卡台账）
 *   6) heroes/data/prices/fc27/base-heroes.json                       （FC27 英雄卡）
 * 匹配顺序：先按 URL 里的 slug，再按球员名归一化成的 slug。
 * 未命中的名字写入未命中清单（默认 automation/runs/D/market/work/missing-name-zh.json），
 * 由当日任务在执行预算内翻译后追加到增量词库，再重跑本脚本。
 * 输出：就地更新目标 JSON（原子写入），并打印命中/未命中统计。
 * 用法：
 *   node apps/market/engine/scripts/apply-market-name-zh.mjs D
 *   node apps/market/engine/scripts/apply-market-name-zh.mjs D --file automation/runs/D/evolution/evolution.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const BASE = path.join(ROOT, 'apps', 'market', 'engine');

const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
// 支持重复传 --file（如同时注入多个业务 JSON），未传时默认注入当日 market.json
const fileArgs = process.argv.reduce((acc, a, i) => (a === '--file' && process.argv[i + 1] ? acc.concat([process.argv[i + 1]]) : acc), []);
const targetFiles = fileArgs.length
  ? fileArgs.map(f => path.resolve(f))
  : [path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'market.json')];

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const atomicWrite = (target, content) => {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
};
// FUTBIN 球员 URL 的 id 段既有 `/player/1234/slug`，也有带版本后缀的
// `/player/1272_8/pierre-emerick-aubameyang`、`/player/1442_10AA_4/marco-palestra`
// （进化榜常见）。旧写法只匹配纯数字 id，导致进化条目的 URL slug 全部提取失败、
// 退化成按姓氏匹配（重名风险高）。这里放宽 id 段为「任意非斜杠字符」。
const slugOfUrl = u => {
  const m = String(u || '').match(/\/player\/[^/?#]+\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).toLowerCase() : '';
};
const slugOfName = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// 兜底显示名：采集侧偶有行取不到 name（本轮 750 行里 3 行为 null，均为 FUTBIN 卡面
// 名字单元格结构异常的行）。若 name 缺失但有球员 URL，则从 URL slug 反推一个英文显示名，
// 避免渲染成空白单元格；中文名仍走正常词库解析。
const nameFromUrl = u => {
  const s = slugOfUrl(u);
  if (!s) return '';
  return s.split('-').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// ---- 构建译名索引 ----
const lookup = new Map();
const add = (slug, zh) => {
  if (!slug || !zh) return;
  const k = String(slug).toLowerCase();
  if (!lookup.has(k)) lookup.set(k, String(zh));   // 先到先得：增量词库优先级最高
};
const supplementFc27 = readJSON(path.join(BASE, 'data', 'players', 'name-zh-supplement-fc27.json'));
for (const [slug, zh] of Object.entries(supplementFc27?.mappings || {})) add(slug, zh);
const supplementLegacy = readJSON(path.join(BASE, 'data', 'players', 'chinese-name-supplement.json'));
for (const [slug, zh] of Object.entries(supplementLegacy?.mappings || {})) add(slug, zh);
for (const p of (readJSON(path.join(BASE, 'data', 'players', 'player-name-zh.json'))?.players || [])) add(p.slug, p.nameZh);
for (const f of ['fc26-first-month.json', 'fc26-first-month-dashboard.json']) {
  for (const p of (readJSON(path.join(BASE, 'gold', 'data', 'prices', 'fc26', f))?.players || [])) add(p.slug, p.nameZh);
}
for (const p of (readJSON(path.join(BASE, 'icons', 'data', 'players', 'fc27', 'fc27-icons-playstyles.json')) || [])) add(p.slug, p.nameZh);
for (const p of (readJSON(path.join(BASE, 'heroes', 'data', 'prices', 'fc27', 'base-heroes.json'))?.players || [])) add(p.slug, p.nameZh);

const resolveZh = item => (item && typeof item === 'object')
  ? (lookup.get(slugOfUrl(item.url || item.marketUrl || item.link || item.fc27Url)) || lookup.get(slugOfName(item.name)) || '')
  : '';

// ---- 注入 ----
const missing = new Set();
let hit = 0, scanned = 0, nameBackfilled = 0;
const applyList = (list, missingTag) => {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.name !== 'string' || !item.name.trim()) {
      const derived = nameFromUrl(item.url || item.marketUrl || item.link || item.fc27Url);
      if (!derived) continue;
      item.name = derived;
      nameBackfilled++;
    }
    scanned++;
    const zh = resolveZh(item);
    if (zh) { item.nameZh = zh; hit++; }
    else if (!item.nameZh) missing.add(`${missingTag}:${item.name} [${slugOfUrl(item.url) || slugOfName(item.name)}]`);
  }
};

for (const file of targetFiles) {
  const data = readJSON(file);
  if (!data) { console.error(`跳过：无法读取 ${file}`); continue; }
  applyList(data.players, 'players');
  applyList(data.popular?.value?.items, 'popular');
  applyList(data.popular?.evolutions, 'popular-evo');
  applyList(data.evolutions, 'evolutions');
  applyList(data.overview?.evolutions, 'overview-evo');
  for (const tier of (data.overview?.priceTiers || [])) applyList(tier.items, 'tier:' + (tier.id || tier.name));
  for (const dim of (data.priceDimensions || [])) applyList(dim.items, 'dim:' + (dim.id || dim.name));
  // 关注列表（market-watch 数据）：lists.watch / undervalued / trending / hotEvo / pendingPrice 等
  for (const [key, arr] of Object.entries(data.lists || {})) applyList(arr, 'watch:' + key);
  atomicWrite(file, JSON.stringify(data, null, 1));
  console.log(`译名已注入: ${path.relative(ROOT, file)}`);
}

const missingPath = path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'work', 'missing-name-zh.json');
if (missing.size) {
  atomicWrite(missingPath, JSON.stringify({ date: dateStr, generatedAt: new Date().toISOString(), count: missing.size, items: [...missing].sort() }, null, 1));
}
console.log(`译名索引 ${lookup.size} 条 · 扫描 ${scanned} 个名字 · 命中 ${hit} · 未命中 ${missing.size}${nameBackfilled ? ` · 由 URL 回填英文名 ${nameBackfilled} 条` : ''}`);
if (missing.size) console.log(`未命中清单: ${path.relative(ROOT, missingPath)}（由当日任务翻译后追加到 name-zh-supplement-fc27.json 并重跑本脚本）`);
