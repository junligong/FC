#!/usr/bin/env node
/**
 * FC27 进化专栏数据增强器（行情关联键 + 派生指标）
 * 用途：进化卡本身在 FUTBIN 上没有挂牌价（榜单卡片无任何价格元素），
 *       因此按「球员 ID」写入基础卡 cardId，页面运行时再从统一 current.json 读取最新价格；
 *       同时补齐两个榜单原生派生指标。
 * 输入：automation/runs/D/evolution/evolution.json（就地改写）
 *       apps/market/engine/data/prices/fc27/current.json（只用于核验关联覆盖，不复制价格）
 * 输出：automation/runs/D/evolution/evolution.json 增加逐卡字段：
 *       futbinRating  榜单原生「FUTBIN Rating」（旧字段 futbinListValue 为同一数值，命名有误，仅为兼容保留）
 *       totalStats    六维（PAC/SHO/PAS/DRI/DEF/PHY）之和，对应 FUTBIN 卡片的 "Total Stats"
 *       baseCardId    对应基础卡 cardId；价格只在页面运行时从 current.json 读取
 *       以及顶层 marketJoin 汇总（匹配率、覆盖率），供渲染器如实标注。
 *
 * 用法：node apps/market/engine/scripts/enrich-evolution-prices.mjs [YYYY-MM-DD]
 *
 * 口径说明：
 * - 关接键 = 球员 URL 中的数字 ID（进化卡 URL 带版本后缀如 /1272_8/，市场基础卡不带）。
 * - 只关接市场数据集中**非进化**条目（进化条目自身的价格在来源页就是空的，用了会自欺）。
 * - 关接得到的是「该球员基础卡」的市价，不是进化后卡版本的价格；渲染器必须如实标注为「参考价（基础卡）」。
 * - 未命中或两平台均为 0 时 valid=false，渲染器留空，不猜、不用其他来源顶替。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_MARKET_PATH, readCurrentMarket } from '../src/current-market.mjs';

const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();
const runDir = path.join(ROOT, 'automation', 'runs', dateStr, 'evolution');
const evoPath = path.join(runDir, 'evolution.json');

const readJSON = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const baseId = u => { const m = String(u || '').match(/\/player\/(\d+)/); return m ? m[1] : null; };
const current = readCurrentMarket(CURRENT_MARKET_PATH);

// ── 2. 就地写回逐卡派生字段 ──
const evo = readJSON(evoPath);
if (!evo) { console.error(`未找到 ${evoPath}`); process.exit(1); }

let matched = 0, priced = 0;
for (const c of evo.evolutions || []) {
  // FUTBIN Rating（榜单原生数值，旧名 futbinListValue 有误，仅兼容保留）
  const fr = String(c.futbinListValue ?? '').trim();
  c.futbinRating = fr || null;

  // 六维合计 = FUTBIN 卡片的 Total Stats
  const st = c.stats || {};
  const six = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'].map(k => Number(st[k]));
  c.totalStats = six.every(Number.isFinite) ? six.reduce((a, b) => a + b, 0) : null;

  c.baseCardId = baseId(c.url);
  delete c.priceRef;
  const hit = c.baseCardId ? current.cards?.[c.baseCardId] : null;
  if (hit) matched++;
  if (hit && ['console', 'pc'].some(pid => hit.platforms?.[pid]?.valid)) priced++;
}

evo.marketJoin = {
  matchedToMarket: matched,
  withPrice: priced,
  total: (evo.evolutions || []).length,
  note: '进化候选只保存基础卡 cardId；页面每次加载时从统一 current.json 读取该基础卡的双平台最新价。该价格不是进化后卡版本的价格。',
  sources: [path.relative(ROOT, CURRENT_MARKET_PATH)],
};

writeFileSync(evoPath, JSON.stringify(evo, null, 2) + '\n');
console.log(`进化数据增强完成: ${evoPath}`);
console.log(`  关联到统一行情卡 ${matched}/${evo.marketJoin.total}，其中当前有有效报价 ${priced}`);
