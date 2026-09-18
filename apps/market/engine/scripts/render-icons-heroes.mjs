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
 *     代际口径（2026-09-17 固化）：只监控 FC27；fc26 目录下的历史英雄数据仅渲染在
 *     「FC26 参考对比」独立区，禁止混入 FC27 台账。
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
import { avatarIndex, avatarSrc, materializeAvatars } from '../../../../shared/lib/player-avatar.mjs';

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

// ---- 英雄卡（Hero）：只把 FC27 英雄数据计入监控台账；FC26 数据仅作参考对比 ----
// 递归扫描 heroes/data 下的 json（采集结果可能落在 players/ 或 prices/ 子目录），
// 每个文件接受 cards / players 两种数组字段名，并带上来源文件的代际标记（__game）。
// 口径（2026-09-17 固化）：本模块只监控 FC27；heroes/data/**/fc26/** 下的历史数据
// 不属于 FC27 监控范围，禁止混入 FC27 台账，只能渲染在独立的「FC26 参考对比」区。
function collectHeroes(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { collectHeroes(full, out); continue; }
    if (!/\.json$/i.test(entry.name)) continue;
    try {
      const data = JSON.parse(readFileSync(full, 'utf8'));
      const list = Array.isArray(data) ? data : (data.cards || data.players || []);
      // 代际判定：优先文件内 game 字段，否则按路径中的 fc26 / fc27 目录名
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      const game = typeof data.game === 'string' && /^fc2[67]$/.test(data.game)
        ? data.game
        : (/\/fc26\//.test(rel) ? 'fc26' : (/\/fc27\//.test(rel) ? 'fc27' : 'unknown'));
      for (const item of list) if (item && (item.name || item.nameZh || item.id)) out.push({ ...item, __file: rel, __game: game });
    } catch { /* 单个文件损坏不影响整体 */ }
  }
  return out;
}
const heroDir = path.join(ROOT, 'apps', 'market', 'engine', 'heroes', 'data');
const allHeroItems = collectHeroes(heroDir);
const heroes = allHeroItems.filter(h => h.__game === 'fc27' || (h.__game === 'unknown' && !/fc26/.test(h.__file)));
const heroesFc26Ref = allHeroItems.filter(h => h.__game === 'fc26');
if (!heroes.length) console.error(`未找到 FC27 英雄卡（Hero）数据（${path.relative(ROOT, heroDir)} 下 fc27 代际），英雄台账渲染为如实空状态；FC26 数据仅作参考对比。`);

let html = renderIcons(dateStr, { snapshots, ledger });

// 英雄卡区块：FC27 台账（有数据才出表，缺失时如实空状态）+ FC26 参考对比（独立区、明确标注）
const heroCell = h => ICON_PLATFORMS.map(pl => {
  const cell = h.platforms && typeof h.platforms === 'object' ? h.platforms[pl.id] : null;
  const v = cell && typeof cell.price === 'number' ? cell.price : (typeof h.currentPrice === 'number' ? h.currentPrice : null);
  const valid = cell ? Boolean(cell.valid) : (typeof h.currentPrice === 'number' && h.currentPrice >= 1000);
  const est = !valid && h.__file.includes('prices');
  return `<span class="pv pv-${pl.id}">${typeof v === 'number' && v > 0 ? v.toLocaleString('en-US') : '—'}${est ? '<span class="hint">估值</span>' : ''}</span>`;
}).join('');
// 与传奇台账一致：中文名在前、英文原名在后（便于回 FUTBIN 对照）。
// 头像：英雄卡与传奇卡共用同一套头像解析（本地卡库对英雄卡覆盖有限，
// 解析不到的条目如实不显示头像，绝不用其他球员的图顶替）。
const avatarIdx = avatarIndex();
const avatarResolvedHeroes = [...heroes, ...heroesFc26Ref].map(h => avatarIdx.resolve(h)?.resourceId || null);
const avatarReady = materializeAvatars(outDir, avatarResolvedHeroes.filter(Boolean));
const avatarHitCount = list => list.filter(h => {
  const rid = avatarIdx.resolve(h)?.resourceId;
  return rid && avatarReady.has(String(rid));
}).length;
// FC26 参考对比区**不配头像**（2026-09-17 实测结论）：
// FC26 的 FUTBIN 卡 ID 与 FC27 头像库不同源，复用 FC27 索引会命中「同数值卡 ID」或
// 「同姓」的另一个人 —— 实测 82 张里至少 6 张配错（Ledley King→Joshua King、
// Micah Richards→Chris Richards、Jill Scott→Alex Scott 等）。按「宁可缺图，不可配错人」
// 的口径，跨代参考区一律不出头像。
const heroAvatar = h => {
  if (h && h.__game === 'fc26') return '';
  const rid = avatarIdx.resolve(h)?.resourceId;
  return rid && avatarReady.has(String(rid)) ? avatarSrc(rid) : '';
};
const heroRows = list => list.map((h, i) => `<tr><td class="c-rank">${i + 1}</td><td class="c-name">${heroAvatar(h) ? `<img class="pimg" src="${esc(heroAvatar(h))}" loading="lazy" alt="">` : ''}<span class="pname">${esc(h.nameZh || h.name || '')}${h.nameZh && h.name && h.nameZh !== h.name ? `<span class="en">${esc(h.name)}</span>` : ''}</span></td><td class="c-rating">${esc(h.rating ?? '—')}</td><td class="c-pos">${esc(h.pos ?? '—')}</td><td class="c-price">${heroCell(h)}</td></tr>`).join('');

let block = `\n<h2>六、英雄卡（Hero）台账（FC27）</h2>\n<div class="card">\n`;
if (heroes.length) {
  const unique = new Set(heroes.map(h => h.__file)).size;
  block += `<div class="sub" style="margin:0 0 12px">FC27 英雄卡 ${heroes.length} 张 · 数据来源 ${unique} 个文件 · 球员头像 ${avatarHitCount(heroes)}/${heroes.length} · 价格为 Console（PS / Xbox）/ PC 双平台口径，随顶部平台按钮切换。</div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>评分</th><th>位置</th><th>价格(coins)</th></tr></thead><tbody>${heroRows(heroes)}</tbody></table></div>
`;
} else {
  block += `<div class="empty">FC27 英雄卡（Hero）暂无监控数据：本模块只监控 FC27，英雄名单与双平台价格需由 icons-heroes 任务经 FUTBIN 采集后落库（heroes/data/**/fc27/**），缺失时如实空状态，不使用 FC26 或其他代际数据顶替。</div>
`;
}
block += `</div>\n`;

// FC26 参考对比：仅作跨代参考，不参与 FC27 监控统计，默认折叠
if (heroesFc26Ref.length) {
  const refUnique = new Set(heroesFc26Ref.map(h => h.__file)).size;
  block += `\n<h2>七、FC26 英雄卡参考对比（仅供参考，非 FC27 监控口径）</h2>\n<div class="card">\n<div class="sub" style="margin:0 0 12px">以下 ${heroesFc26Ref.length} 张为 FC26 英雄卡历史参考数据（来源 ${refUnique} 个文件），<b>仅用于跨代对比参考</b>，不属于 FC27 监控范围，不参与上方任何统计与台账。本区不出头像：FC26 卡 ID 与 FC27 头像库不同源，复用会误配他人头像。</div>
<details><summary style="cursor:pointer;color:var(--muted);font-size:12.5px">展开 FC26 参考数据（${heroesFc26Ref.length} 张）</summary>
<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>评分</th><th>位置</th><th>FC26 价格参考(coins)</th></tr></thead><tbody>${heroRows(heroesFc26Ref)}</tbody></table></div>
</details>
</div>
`;
}

html = html.includes('<div class="footer">')
  ? html.replace('<div class="footer">', `${block}<div class="footer">`)
  : html + block;

const outPath = path.join(outDir, 'icons-heroes.html');
writeFileSync(outPath, html, 'utf8');
console.log(`传奇/英雄监控已渲染: ${outPath}（传奇 ${ledger.length} 张台账 / 快照 ${snapshots.length} 天，FC27 英雄 ${heroes.length} 张，FC26 参考 ${heroesFc26Ref.length} 张）`);
