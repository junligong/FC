#!/usr/bin/env node
/**
 * FC27 进化专栏渲染器
 * 用途：把结构化的进化数据（evolution.json）渲染为 reports/daily/D/evolution.html，
 *       即站点「进化专栏」（首页右栏 + 独立视图）的内容。
 * 输入：automation/runs/D/evolution/evolution.json（可用 FC_EVOLUTION_JSON 指定其他路径）。
 * 输出：reports/daily/D/evolution.html
 *
 * 固定结构：
 *   一、热门进化卡 —— 来源 https://www.futbin.com/27/popular/evolutions
 *   二、进化路线与前置条件核验（可选）
 *   三、数据来源与核验 / 缺失项记录
 * 采集缺失时渲染为如实空状态，绝不伪造或沿用旧日期数据。
 *
 * 用法：node apps/market/engine/scripts/render-evolution.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : (v ?? ''));

const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

function loadData(dateStr) {
  const jsonPath = process.env.FC_EVOLUTION_JSON
    || path.join(ROOT, 'automation', 'runs', dateStr, 'evolution', 'evolution.json');
  if (!existsSync(jsonPath)) return { data: null, jsonPath };
  try { return { data: JSON.parse(readFileSync(jsonPath, 'utf8')), jsonPath }; }
  catch (e) { return { data: null, jsonPath, error: e.message }; }
}

export function renderEvolution(dateStr, data) {
  const d = data || {};
  const status = (d.status || 'partial').toUpperCase();
  const cards = Array.isArray(d.evolutions) ? d.evolutions : [];
  const routes = Array.isArray(d.routes) ? d.routes : [];
  const sources = d.sources || [];
  const missing = d.missing || [];
  const notes = d.notes || [];
  const cutoff = d.dataCutoff || d.generatedAt || '未标注';

  const rows = cards.map((it, i) => {
    const req = Array.isArray(it.requirements) ? it.requirements.join('；') : (it.requirements || '');
    return `<tr>
<td class="c-rank">${it.rank || i + 1}</td>
<td class="c-name">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</td>
<td class="c-rating">${esc(it.rating ?? '')}</td>
<td class="c-pos">${esc(it.pos ?? '')}</td>
<td class="c-evo">${esc(it.evolutionName ?? '')}</td>
<td class="c-cost">${it.cost ? num(it.cost) : '—'}</td>
<td class="c-exp">${esc(it.expires ?? '')}</td>
<td class="c-note">${esc(req)}</td>
</tr>`;
  }).join('');

  const cardBlock = cards.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>球员</th><th>Rating</th><th>位置</th><th>进化名称</th><th>费用</th><th>到期</th><th>前置条件</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="empty">FC27 当前无可用热门进化卡（来源 <code>/27/popular/evolutions</code>），如实空状态。</div>`;

  const routeBlock = routes.length
    ? routes.map(r => `<div class="card"><div class="tier-head"><h3>${esc(r.name || '进化路线')}</h3>${r.cost ? `<span class="tier-range">费用 ${esc(num(r.cost))}</span>` : ''}</div>${r.desc ? `<p class="desc">${esc(r.desc)}</p>` : ''}${Array.isArray(r.steps) && r.steps.length ? `<ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${r.note ? `<div class="tier-src">${esc(r.note)}</div>` : ''}</div>`).join('')
    : `<div class="empty">本期未输出进化路线建议。</div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 进化专栏 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;
--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--gold:#e3b341}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px 28px 40px;line-height:1.6}
h1{font-size:21px;font-weight:800;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(233,200,74,.14);border:1px solid rgba(227,179,65,.4);color:var(--gold)}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 22px}
h2{font-size:17px;font-weight:750;margin:28px 0 14px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:17px;background:var(--gold);border-radius:2px}
h3{font-size:14.5px;font-weight:700}
.card{background:linear-gradient(180deg,var(--surface),#141c15);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.tier-head{display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.tier-range{font-size:12px;color:var(--gold);background:rgba(227,179,65,.14);border:1px solid rgba(227,179,65,.35);padding:2px 9px;border-radius:999px}
.tier-src{font-size:11.5px;color:var(--quiet);margin-top:8px}
.desc{color:var(--muted);font-size:13px}
.steps{padding-left:20px;margin-top:8px}.steps li{font-size:12.5px;color:var(--muted);margin:4px 0}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--quiet);font-weight:600;padding:8px 9px;border-bottom:1px solid var(--line);font-size:11.5px;white-space:nowrap}
td{padding:7px 9px;border-bottom:1px solid #242d25}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#1a211b}
.c-rank{color:var(--gold);font-weight:700;width:38px}
.c-name a{color:#8fd6bb;text-decoration:none}.c-name a:hover{text-decoration:underline}
.c-rating{font-weight:700;width:60px}
.c-pos,.c-evo{color:var(--muted)}
.c-cost{color:var(--gold);font-weight:600}
.c-exp,.c-note{color:var(--quiet);font-size:12px}
.empty{color:var(--quiet);font-size:12.5px;padding:14px;border:1px dashed var(--line);border-radius:9px;background:#161d17}
.note{background:rgba(233,200,74,.07);border:1px solid rgba(227,179,65,.3);border-radius:10px;padding:13px 15px;font-size:12.5px;color:#aeb5aa;margin:16px 0}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
code{background:#2a3329;padding:1px 5px;border-radius:4px;font-size:11.5px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:30px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body>
<h1>FC27 进化专栏 <span class="badge">${esc(status)}</span></h1>
<div class="sub">数据日期 ${esc(dateStr)} · 数据截止 ${esc(cutoff)} · 来源 FUTBIN Popular Evolutions</div>

${notes.length ? `<div class="note"><b>本轮说明：</b>${notes.map(esc).join('<br>')}</div>` : ''}

<h2>一、热门进化卡（${cards.length} 张）</h2>
<div class="card">${cardBlock}</div>

<h2>二、进化路线与前置条件核验</h2>
${routeBlock}

<h2>三、数据来源与核验</h2>
<div class="card">${sources.length ? `<ul>${sources.map(s => `<li><code>${esc(s.url)}</code>${s.openedAt ? ` · 打开 ${esc(s.openedAt)}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</li>`).join('')}</ul>` : '<div class="empty">未记录来源。</div>'}</div>

<h2>缺失项记录</h2>
<div class="card">${missing.length ? `<ul>${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<div class="empty">无缺失项记录。</div>'}</div>

<div class="footer">FC27 进化专栏 · ${esc(dateStr)} · 由 render-evolution.mjs 渲染 · 仅作游戏内研究，不构成交易建议</div>
</body></html>
`;
}

// ========== 主流程 ==========
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();
  const { data, jsonPath, error } = loadData(dateStr);
  if (error) console.error(`evolution.json 解析失败：${error}`);
  if (!data) console.error(`未找到 ${jsonPath}，将渲染为如实空状态。`);
  const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'evolution.html');
  writeFileSync(outPath, renderEvolution(dateStr, data), 'utf8');
  console.log(`进化专栏已渲染: ${outPath}`);
}
