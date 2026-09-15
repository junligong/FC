#!/usr/bin/env node
/**
 * FC27 市场报告渲染器
 * 用途：把结构化的市场数据（market.json）渲染为统一版式的 reports/daily/D/market.html。
 * 输入：reports/daily/D/market.json（由 market 任务采集后写入；也可用 FC_MARKET_JSON 指定路径）。
 * 输出：reports/daily/D/market.html（双维度版式：价格维度 + 热门球员维度）。
 *
 * 版式固定，保证：
 *   维度一 价格维度 —— 大卡(≥100万) / 中卡(30-100万) / 热门卡(10-30万) / 适用卡(1-10万) / 万元以下；
 *   维度二 热门球员维度 —— 热门进化卡（/27/popular/evolutions）与 价值卡（/27/popular 中非进化卡）。
 * 采集缺失时渲染为如实空状态，绝不伪造或复用其他日期数据。
 *
 * 用法：node apps/market/engine/scripts/render-market-report.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : (v ?? ''));

function todayShanghai() {
  const now = new Date(Date.now() + 8 * 3600e3);
  return now.toISOString().slice(0, 10);
}

function loadData(dateStr) {
  // 数据写在模块运行目录（automation/runs/D/market/），reports/ 只保存最终 HTML。
  const jsonPath = process.env.FC_MARKET_JSON
    || path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'market.json');
  if (!existsSync(jsonPath)) return { data: null, jsonPath };
  try {
    return { data: JSON.parse(readFileSync(jsonPath, 'utf8')), jsonPath };
  } catch (e) {
    return { data: null, jsonPath, error: e.message };
  }
}

// 价格分层表格
function priceTable(items) {
  if (!items || !items.length) {
    return `<div class="empty">本档本期无已核验价格数据。</div>`;
  }
  const rows = items.map((it, i) => `<tr>
<td class="c-rank">${it.rank || i + 1}</td>
<td class="c-name">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</td>
<td class="c-ver">${esc(it.rating ?? '')}</td>
<td class="c-pos">${esc(it.pos ?? '')}</td>
<td class="c-type">${esc(it.cardType ?? '')}</td>
<td class="c-price">${it.price ? num(it.price) : '—'}</td>
<td class="c-note">${esc(it.note ?? '')}</td>
</tr>`).join('');
  return `<table class="tbl"><thead><tr><th>#</th><th>球员</th><th>总评</th><th>位置</th><th>卡版本</th><th>价格(coins)</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// 热门球员表格（含热度）
function popularTable(items) {
  if (!items || !items.length) {
    return `<div class="empty">本子类本期无已核验数据。</div>`;
  }
  const rows = items.map((it, i) => `<tr>
<td class="c-rank">${it.rank || i + 1}</td>
<td class="c-name">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</td>
<td class="c-ver">${esc(it.rating ?? '')}</td>
<td class="c-pos">${esc(it.pos ?? '')}</td>
<td class="c-pop">${it.popularity ? num(it.popularity) : '—'}</td>
<td class="c-note">${esc(it.note ?? '')}</td>
</tr>`).join('');
  return `<table class="tbl"><thead><tr><th>#</th><th>球员</th><th>总评</th><th>位置</th><th>热度</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function render(dateStr, data) {
  const d = data || {};
  const status = (d.status || 'partial').toUpperCase();
  const platform = d.platform || 'cross';
  const t = d.tiers || {};
  const priceDims = d.priceDimensions || [];
  const pop = d.popular || {};
  const evo = (pop.evolutions && pop.evolutions.items) || [];
  const value = (pop.value && pop.value.items) || [];
  const notes = d.notes || [];
  const missing = d.missing || [];
  const sources = d.sources || [];

  const priceCards = priceDims.length
    ? priceDims.map(tier => `<div class="card"><div class="tier-head"><h3>${esc(tier.name)}</h3><span class="tier-range">${esc(tier.range || '')}</span><span class="tier-count">${(tier.items || []).length} 张</span></div>${priceTable(tier.items)}</div>`).join('')
    : `<div class="card"><div class="empty">价格维度数据缺失（未提供分层结果）。</div></div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 市场扫描 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#0b0708;--surface:#161113;--surface2:#1d1619;--line:rgba(255,255,255,.08);
--text:#f4eff1;--muted:#a89aa0;--quiet:#786b73;--red:#c8102e;--gold:#e9c84a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:22px 26px;line-height:1.6}
h1{font-size:21px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(200,16,46,.16);border:1px solid rgba(200,16,46,.45);color:#ffb9c4}
.badge.ok{background:rgba(233,200,74,.13);border-color:rgba(233,200,74,.4);color:var(--gold)}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 20px}
h2{font-size:16px;font-weight:750;margin:26px 0 12px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:16px;background:var(--red);border-radius:2px}
h2.dim2:before{background:var(--gold)}
h3{font-size:14.5px;font-weight:700}
.card{background:linear-gradient(180deg,var(--surface),#120c0e);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.tier-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.tier-range{font-size:12px;color:var(--gold);background:rgba(233,200,74,.1);border:1px solid rgba(233,200,74,.28);padding:2px 9px;border-radius:999px}
.tier-count{font-size:12px;color:var(--quiet);margin-left:auto}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--quiet);font-weight:600;padding:7px 9px;border-bottom:1px solid var(--line);font-size:11.5px;letter-spacing:.03em}
td{padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.045)}
tr:last-child td{border-bottom:0}
.c-rank{color:var(--gold);font-weight:700;width:36px}
.c-name a{color:#7fc7ff;text-decoration:none}
.c-name a:hover{text-decoration:underline}
.c-ver{color:#d9c9cf;width:52px}
.c-pos{color:var(--muted)}
.c-type,.c-note{color:var(--quiet);font-size:12px}
.c-price{color:var(--gold);font-weight:600}
.c-pop{color:#ff9db0;font-weight:700}
.empty{color:var(--quiet);font-size:12.5px;padding:12px 14px;border:1px dashed var(--line);border-radius:9px;background:rgba(255,255,255,.015)}
.note{background:rgba(200,16,46,.07);border:1px solid rgba(200,16,46,.25);border-radius:10px;padding:13px 15px;font-size:12.5px;color:#e8c9cf;margin:16px 0}
.note b{color:#ffd0d8}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
code{background:rgba(255,255,255,.06);padding:1px 5px;border-radius:4px;font-size:11.5px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:26px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body>
<h1>FC27 市场扫描 <span class="badge ${status === 'SUCCESS' ? 'ok' : ''}">${esc(status)}</span></h1>
<div class="sub">数据日期 ${esc(dateStr)} · 平台默认 ${esc(platform)} · 双维度：价格分层 × 热门球员 · 来源 FUTBIN</div>

${notes.length ? `<div class="note"><b>本轮说明：</b>${notes.map(esc).join('<br>')}</div>` : ''}

<h2>维度一 · 价格维度</h2>
${priceCards}

<h2 class="dim2">维度二 · 热门球员维度</h2>
<div class="card">
  <div class="tier-head"><h3>① 热门进化卡</h3><span class="tier-range">/27/popular/evolutions</span><span class="tier-count">${evo.length} 张</span></div>
  ${popularTable(evo)}
</div>
<div class="card">
  <div class="tier-head"><h3>② 价值卡（热门非进化卡）</h3><span class="tier-range">/27/popular</span><span class="tier-count">${value.length} 张</span></div>
  ${popularTable(value)}
</div>

<h2>数据来源与核验</h2>
<div class="card">${sources.length ? `<ul>${sources.map(s => `<li><code>${esc(s.url)}</code>${s.openedAt ? ` · 打开 ${esc(s.openedAt)}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</li>`).join('')}</ul>` : `<div class="empty">未记录来源。</div>`}</div>

<h2>缺失项记录</h2>
<div class="card">${missing.length ? `<ul>${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : `<div class="empty">无缺失项记录。</div>`}</div>

<div class="footer">FC27 市场扫描 · ${esc(dateStr)} · 双维度版式由 render-market-report.mjs 渲染 · 数据仅作游戏市场研究，不构成投资或交易建议</div>
</body></html>
`;
}

// ========== 主流程 ==========
const dateStr = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : todayShanghai();
const { data, jsonPath, error } = loadData(dateStr);
if (error) console.error(`market.json 解析失败：${error}`);
if (!data) console.error(`未找到或无法读取 ${jsonPath}，将渲染为如实空状态。`);

const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'market.html');
writeFileSync(outPath, render(dateStr, data), 'utf8');
console.log(`市场报告已渲染: ${outPath}`);
