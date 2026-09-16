#!/usr/bin/env node
/**
 * FC27「传奇/英雄监控」渲染入口（icons-heroes 任务）
 * 用途：渲染传奇/英雄专栏的主视图 —— reports/daily/D/icons-heroes.html。
 *       本文件在 2026-09-16 由市场栏目拆分而来：传奇/英雄内容不再属于 FC27 市场，
 *       改由独立的 icons-heroes 任务产出，并挂在站点「传奇/英雄专栏」下。
 *
 * 输入：
 *   - 传奇卡逐日快照 apps/market/engine/icons/data/prices/fc27/daily/*.json（record-icons-daily.mjs 写入）
 *   - 传奇卡卡库台账 apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json（131 张）
 *   - 英雄卡（Hero）数据：apps/market/engine/heroes/data/**（由 icons-heroes 任务采集，目前尚未建立，缺失时如实空状态）
 * 平台：传奇卡区块由 render-market-icons.mjs 渲染，自带 Console（PS / Xbox）/ PC 双平台切换；
 *       英雄卡区块同样按 platforms.console / platforms.pc 输出双平台价格列。
 * 输出：reports/daily/D/icons-heroes.html
 *
 * 用法：node apps/market/engine/scripts/render-icons-heroes.mjs [YYYY-MM-DD]
 *   （市场侧仍由 render-market.mjs 渲染 market.html / market-scan.html，不再产出传奇监控）
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIcons, loadIconSnapshots, loadIconLedger, ICON_DAILY_DIR, ICON_PLATFORMS } from './render-market-icons.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();

const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
mkdirSync(outDir, { recursive: true });

// ---- 传奇卡（Icon）：沿用既有逐日快照 + 卡库台账 ----
const snapshots = loadIconSnapshots();
const ledger = loadIconLedger();
if (!snapshots.length) console.error(`未找到传奇卡逐日快照（${ICON_DAILY_DIR}），传奇/英雄监控将渲染为如实空状态。`);

// ---- 英雄卡（Hero）：数据源尚未建立，存在则计入，缺失时如实空状态 ----
// 递归扫描 heroes/data 下的 json（采集结果可能落在 players/ 或 prices/ 子目录），
// 每个文件接受 cards / players 两种数组字段名。
function collectHeroes(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { collectHeroes(full, out); continue; }
    if (!/\.json$/i.test(entry.name)) continue;
    try {
      const data = JSON.parse(readFileSync(full, 'utf8'));
      const list = Array.isArray(data) ? data : (data.cards || data.players || []);
      for (const item of list) if (item && (item.name || item.nameZh || item.id)) out.push({ ...item, __file: path.relative(ROOT, full) });
    } catch { /* 单个文件损坏不影响整体 */ }
  }
  return out;
}
const heroDir = path.join(ROOT, 'apps', 'market', 'engine', 'heroes', 'data');
const heroes = collectHeroes(heroDir);
if (!heroes.length) console.error(`未找到英雄卡（Hero）数据（${path.relative(ROOT, heroDir)}），英雄部分渲染为如实空状态。`);

let html = renderIcons(dateStr, { snapshots, ledger });

// 英雄卡区块：有数据才插入（插在页脚之前，保持既有版式不动）
if (heroes.length) {
  const heroCell = h => ICON_PLATFORMS.map(pl => {
    const cell = h.platforms && typeof h.platforms === 'object' ? h.platforms[pl.id] : null;
    const v = cell && typeof cell.price === 'number' ? cell.price : (typeof h.currentPrice === 'number' ? h.currentPrice : null);
    const valid = cell ? Boolean(cell.valid) : (typeof h.currentPrice === 'number' && h.currentPrice >= 1000);
    const est = !valid && h.__file.includes('prices');
    return `<span class="pv pv-${pl.id}">${typeof v === 'number' && v > 0 ? v.toLocaleString('en-US') : '—'}${est ? '<span class="hint">估值</span>' : ''}</span>`;
  }).join('');
  const rows = heroes.map((h, i) => `<tr><td class="c-rank">${i + 1}</td><td class="c-name">${esc(h.nameZh || h.name || '')}</td><td class="c-rating">${esc(h.rating ?? '—')}</td><td class="c-pos">${esc(h.pos ?? '—')}</td><td class="c-price">${heroCell(h)}</td></tr>`).join('');
  const unique = new Set(heroes.map(h => h.__file)).size;
  const block = `
<h2>六、英雄卡（Hero）台账</h2>
<div class="card">
<div class="sub" style="margin:0 0 12px">英雄卡全量 ${heroes.length} 张 · 数据来源 ${unique} 个文件 · 价格为 Console（PS / Xbox）/ PC 双平台口径，随顶部平台按钮切换。</div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>评分</th><th>位置</th><th>价格(coins)</th></tr></thead><tbody>${rows}</tbody></table></div>
</div>
`;
  html = html.includes('<div class="footer">')
    ? html.replace('<div class="footer">', `${block}<div class="footer">`)
    : html + block;
}

const outPath = path.join(outDir, 'icons-heroes.html');
writeFileSync(outPath, html, 'utf8');
console.log(`传奇/英雄监控已渲染: ${outPath}（传奇 ${ledger.length} 张台账 / 快照 ${snapshots.length} 天，英雄 ${heroes.length} 张）`);
