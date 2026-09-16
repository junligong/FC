#!/usr/bin/env node
/**
 * FC27「传奇/英雄监控」页的传奇区块渲染器
 * 现状（2026-09-16 拆分后）：本文件是**组件**，由 `render-icons-heroes.mjs` 引入，
 *       负责渲染「传奇卡（Icon）台账」区块（today / 日环比 / 累计涨跌 / 逐卡走势，
 *       每个指标按 Console / PC 双平台各出一份），最终合并产物为
 *       `reports/daily/D/icons-heroes.html`，挂在站点「传奇/英雄专栏」。
 *       直接运行本文件时仍会写出历史路径 `reports/daily/D/market-icons.html`，
 *       仅供回归测试与旧链接兼容使用，**不再是站点产物**，市场任务也不再调用它。
 * 输入：
 *   apps/market/engine/icons/data/prices/fc27/daily/*.json       逐日价格快照（由 record-icons-daily.mjs 写入）
 *   apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json  卡库台账（131 张：评分/位置/六维/特技）
 *   （可用 FC_PROJECT_ROOT 指定项目根，FC_ICON_DAILY_DIR / FC_ICON_LEDGER 指定数据位置）
 * 输出：合并进 reports/daily/D/icons-heroes.html（直接运行时另写 reports/daily/D/market-icons.html）
 * 口径：
 *   开服日（2026-09-25）前 FUTBIN 只有列表页占位价，非市场成交价 —— 此时页面如实标注
 *   listing-estimate 口径，涨跌列不计算（占位价的日变化没有行情含义），只做台账与记录进度；
 *   开服后自动切换为 market 口径，逐日计算日环比与累计涨跌。
 *   平台口径：Console（PS/Xbox 合并）与 PC 两档都必须采集与展示，缺一不可。
 *   任何缺失一律渲染为如实空状态，不伪造、不用 FC26 或旧日期数据填充。
 * 用法：node apps/market/engine/scripts/render-market-icons.mjs [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const ICON_DIR = path.join(ROOT, 'apps', 'market', 'engine', 'icons');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : '—');
const price = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v.toLocaleString('en-US') : '—');
const pct = v => (typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '—');
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekday = d => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()] || '';
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const ICON_DAILY_DIR = process.env.FC_ICON_DAILY_DIR || path.join(ICON_DIR, 'data', 'prices', 'fc27', 'daily');
export const ICON_LEDGER_PATH = process.env.FC_ICON_LEDGER || path.join(ICON_DIR, 'data', 'players', 'fc27', 'fc27-icons-playstyles.json');

// 平台定义：FUTBIN 只提供 Console（PS / Xbox 合并）与 PC 两个市场口径。
// 逐卡快照写入 platforms.console / platforms.pc；旧快照（无 platforms 字段）回退到单一 price 字段。
export const ICON_PLATFORMS = [
  { id: 'console', label: 'Console', short: 'PS / Xbox' },
  { id: 'pc', label: 'PC', short: 'PC' },
];
export const ICON_DEFAULT_PLATFORM = 'console';

// 取某张卡在指定平台的价格单元；旧快照回退到 price / priceValid（两个平台显示同一口径）
function platformCell(snap, pid) {
  if (!snap) return null;
  const cell = snap.platforms && typeof snap.platforms === 'object' ? snap.platforms[pid] : null;
  if (cell && (typeof cell.price === 'number' || cell.price === null)) {
    return { price: typeof cell.price === 'number' ? cell.price : null, valid: Boolean(cell.valid) };
  }
  if (typeof snap.price === 'number' || snap.price === null) {
    return { price: typeof snap.price === 'number' ? snap.price : null, valid: Boolean(snap.priceValid) };
  }
  return null;
}

export function loadIconSnapshots() {
  if (!existsSync(ICON_DAILY_DIR)) return [];
  const list = [];
  for (const f of readdirSync(ICON_DAILY_DIR)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
    const data = readJSON(path.join(ICON_DAILY_DIR, f));
    if (data && isDate(data.date) && Array.isArray(data.players)) list.push(data);
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function loadIconLedger() {
  const data = readJSON(ICON_LEDGER_PATH);
  return Array.isArray(data) ? data : [];
}

// ============ 基础卡片/表格片段 ============
function statCard(value, label) {
  return `<div class="stat"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
}

function emptyBox(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

// 逐卡走势迷你折线：仅在真实成交口径且有效点 ≥ 2 时绘制
function sparkline(points, up) {
  if (!Array.isArray(points) || points.length < 2) return '—';
  const w = 96, h = 26, pad = 3;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${coords.join(' ')}" fill="none" stroke="${up ? '#ff6259' : '#4ec08a'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// 大盘中位价走势：SVG 折线 + 日期轴
function trendChart(series) {
  const pts = series.filter(s => typeof s.median === 'number');
  if (pts.length < 2) return emptyBox('逐日快照不足两天，暂无法绘制大盘中位价走势；开服后每日累积，第 2 天起自动显示。');
  const w = 900, h = 240, padL = 68, padR = 18, padT = 18, padB = 34;
  const min = Math.min(...pts.map(p => p.median)), max = Math.max(...pts.map(p => p.median));
  const span = max - min || 1;
  const x = i => padL + (i * (w - padL - padR)) / Math.max(pts.length - 1, 1);
  const y = v => padT + (1 - (v - min) / span) * (h - padT - padB);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.median).toFixed(1)}`).join(' ');
  const area = `${padL},${h - padB} ${line} ${x(pts.length - 1).toFixed(1)},${h - padB}`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const v = min + span * (1 - t), yy = padT + t * (h - padT - padB);
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${w - padR}" y2="${yy.toFixed(1)}" stroke="#30392f" stroke-width="1"/><text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" fill="#859080" font-size="11" text-anchor="end">${num(Math.round(v))}</text>`;
  }).join('');
  const labels = pts.map((p, i) => (i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 8) === 0)
    ? `<text x="${x(i).toFixed(1)}" y="${h - 12}" fill="#859080" font-size="11" text-anchor="middle">${esc(p.date.slice(5))}</text>` : '').join('');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.median).toFixed(1)}" r="2.6" fill="#e3b341"/>`).join('');
  return `<div class="tbl-wrap"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="传奇卡大盘中位价走势">
<path d="M${area}Z" fill="rgba(227,179,65,.1)" stroke="none"/>
${grid}<polyline points="${line}" fill="none" stroke="#e3b341" stroke-width="2" stroke-linejoin="round"/>
${dots}${labels}</svg></div>`;
}

export function renderIcons(dateStr, { snapshots = [], ledger = [] } = {}) {
  const days = snapshots.map(s => s.date);
  const today = snapshots.find(s => s.date === dateStr) || snapshots[snapshots.length - 1] || null;
  // 历史序列：以日期升序，取当日及之前（未来日期不参与“今日”计算）
  const history = snapshots.filter(s => !isDate(dateStr) || s.date <= dateStr);
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const basis = today?.priceBasis || 'listing-estimate';
  const isMarket = basis === 'market';
  const launchDate = today?.launchDate || '2026-09-25';
  const activePlatform = ICON_DEFAULT_PLATFORM;
  // 平台有效价计数：用于页面顶部的口径说明（开服前两平台均为 0，属预期）
  const platformValid = Object.fromEntries(ICON_PLATFORMS.map(pl => [
    pl.id, (today?.players || []).filter(p => platformCell(p, pl.id)?.valid).length,
  ]));

  // 卡库基线：优先台账文件，缺失则退回最近快照的名单
  const ledgerById = new Map(ledger.map(i => [String(i.id), i]));
  const rosterIds = new Set([...ledger.map(i => String(i.id)), ...(today?.players || []).map(p => String(p.id))]);
  const roster = [...rosterIds].map(id => {
    const meta = ledgerById.get(id) || {};
    const snap = today?.players?.find(p => String(p.id) === id) || null;
    return {
      id,
      nameZh: meta.nameZh || snap?.nameZh || snap?.name || `#${id}`,
      name: snap?.name || meta.name || '',
      rating: meta.rating ?? snap?.rating ?? null,
      pos: meta.position || snap?.pos || '—',
      six: meta.six || snap?.six || null,
      golds: (meta.playstyles || []).filter(s => s?.gold).map(s => s.name),
      skills: meta.skills ?? null,
      weakFoot: meta.weakFoot ?? null,
      snap,
    };
  }).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || String(a.nameZh).localeCompare(String(b.nameZh), 'zh'));

  // 逐卡历史：按指定平台取有效价格序列（仅真实成交口径参与涨跌与走势）。
  // 旧快照没有 platforms 字段时回退到单一 price，两个平台显示同一口径。
  const seriesOf = (id, pid) => history
    .map(s => {
      const p = s.players?.find(x => String(x.id) === String(id));
      const cell = platformCell(p, pid);
      return { date: s.date, price: cell && cell.valid ? cell.price : null };
    })
    .filter(x => typeof x.price === 'number');

  // 逐卡台账行：价格 / 日环比 / 累计涨跌 / 走势均按平台各算一份，由顶部平台按钮切换显示
  const rows = roster.map((p, i) => {
    const priceCells = [], d1Cells = [], cumCells = [], sparkCells = [];
    let rec = 0;
    for (const pl of ICON_PLATFORMS) {
      // 价格列：只有通过有效性校验的才当作价格展示，FUTBIN 返回的占位值如实标注为无效
      const cell = platformCell(p.snap, pl.id);
      const shown = cell && cell.valid
        ? price(cell.price)
        : (cell && typeof cell.price === 'number'
          ? `—<span class="hint" title="FUTBIN 返回 ${esc(cell.price)}，低于有效价格下限，按占位值处理">占位</span>`
          : '—');
      priceCells.push(`<span class="pv pv-${pl.id}">${shown}</span>`);

      let d1 = '—', cum = '—', sparks = '—';
      if (isMarket) {
        const s = seriesOf(p.id, pl.id);
        rec = Math.max(rec, s.length);
        const cur = s.find(x => x.date === dateStr)?.price ?? null;
        const prv = prev ? (s.find(x => x.date === prev.date)?.price ?? null) : null;
        if (typeof cur === 'number' && typeof prv === 'number' && prv !== 0) {
          const v = (cur - prv) / prv;
          d1 = `<span class="${v >= 0 ? 'up' : 'dn'}">${pct(v)}</span>`;
        }
        const base = s[0]?.price ?? null;
        if (typeof cur === 'number' && typeof base === 'number' && base !== 0) {
          const v = (cur - base) / base;
          cum = `<span class="${v >= 0 ? 'up' : 'dn'}">${pct(v)}</span>`;
        }
        const pts = s.slice(-30).map(x => x.price);
        sparks = sparkline(pts, pts.length >= 2 && pts[pts.length - 1] >= pts[0]);
      }
      d1Cells.push(`<span class="pv pv-${pl.id}">${d1}</span>`);
      cumCells.push(`<span class="pv pv-${pl.id}">${cum}</span>`);
      sparkCells.push(`<div class="pv pv-${pl.id}">${sparks}</div>`);
    }
    const six = p.six
      ? `<span class="six" title="PAC 速度 / SHO 射门 / PAS 传球 / DRI 盘带 / DEF 防守 / PHY 身体">${['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'].map(k => p.six[k] ?? '-').join('/')}</span>`
      : '—';
    const golds = p.golds.length
      ? `<span class="gold-n" title="${esc(p.golds.join(' / '))}">${p.golds.length} <span class="hint">金</span></span>`
      : '—';
    return `<tr>
<td class="c-rank">${i + 1}</td>
<td class="c-name">${esc(p.nameZh)}${p.name ? `<span class="en">${esc(p.name)}</span>` : ''}</td>
<td class="c-rating">${esc(p.rating ?? '—')}</td>
<td class="c-pos">${esc(p.pos)}</td>
<td class="c-six">${six}</td>
<td class="c-gold">${golds}</td>
<td class="c-price">${priceCells.join('')}</td>
<td class="c-price">${d1Cells.join('')}</td>
<td class="c-price">${cumCells.join('')}</td>
<td class="c-num">${isMarket ? rec || '—' : '—'}</td>
<td class="c-spark">${sparkCells.join('')}</td>
</tr>`;
  }).join('');

  // 逐日快照记录表
  const snapshotRows = history.slice().reverse().map(s => {
    const valid = (s.players || []).filter(p => p.priceValid);
    const vals = valid.map(p => p.price).sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor((vals.length - 1) / 2)] : null;
    return `<tr>
<td class="c-date">${esc(s.date)} <span class="hint">${esc(weekday(s.date))}</span></td>
<td class="c-num">${s.counts?.total ?? (s.players || []).length}</td>
<td class="c-num">${s.counts?.valid ?? valid.length}</td>
<td class="c-basis">${s.priceBasis === 'market' ? '<span class="tag ok">成交价</span>' : '<span class="tag warn">列表页占位价</span>'}</td>
<td class="c-price">${price(median)}</td>
<td class="c-note">${esc(s.capturedAt || '')}</td>
</tr>`;
  }).join('');

  // 全球盘统计
  const validPrices = (today?.players || []).filter(p => p.priceValid).map(p => p.price);
  const medians = history.map(s => {
    const v = (s.players || []).filter(p => p.priceValid).map(p => p.price).sort((a, b) => a - b);
    return { date: s.date, median: v.length ? v[Math.floor((v.length - 1) / 2)] : null };
  });

  const countdown = isDate(launchDate) ? daysBetween(dateStr, launchDate) : null;
  const recordingDays = history.filter(s => (s.counts?.valid ?? 0) > 0).length;
  const stateBadge = !today
    ? '<span class="badge">NO SNAPSHOT</span>'
    : isMarket ? '<span class="badge">LIVE MARKET</span>' : '<span class="badge">PRE-LAUNCH</span>';

  const missing = [];
  if (!today) missing.push(`未找到 ${dateStr} 的传奇卡快照，本期无当日价格可展示。`);
  if (today && !isMarket) missing.push(`FC27 尚未开服（开服日 ${launchDate}），FUTBIN 列表页价不是市场成交价，因此本期不计算日环比与累计涨跌。`);
  if (today && (today.counts?.missing || 0) > 0) missing.push(`当日 ${today.counts.missing} 张传奇卡无有效价格（FUTBIN 返回占位值），已在表中如实标注为占位。`);
  if (history.length < 2) missing.push('历史快照不足两天，逐日变化与走势需开服后连续累积才有意义。');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 传奇/英雄监控 ${esc(dateStr)}</title>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--line:#30392f;--line2:#3a4438;
--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--gold:#e3b341;
--up:#ff6259;--dn:#4ec08a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px 28px 40px;line-height:1.6}
h1{font-size:21px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(227,179,65,.16);border:1px solid rgba(227,179,65,.4);color:var(--gold)}
.sub{color:var(--quiet);font-size:12.5px;margin:8px 0 18px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:10px;margin-bottom:22px}
.stat{background:linear-gradient(180deg,var(--surface),#141c15);border:1px solid var(--line);border-radius:12px;padding:13px 15px}
.stat b{display:block;font-size:22px;font-weight:800;line-height:1.25;color:var(--text)}
.stat b em{font-size:13px;font-style:normal;color:var(--quiet);font-weight:600;margin-left:3px}
.stat small{display:block;color:var(--quiet);font-size:11.5px;margin-top:4px}
h2{font-size:17px;font-weight:750;margin:30px 0 14px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:17px;background:var(--red);border-radius:2px}
.card{background:linear-gradient(180deg,var(--surface),#141c15);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.toolbar input{background:#1d271b;border:1px solid var(--line2);border-radius:9px;color:var(--text);padding:8px 12px;font-size:13px;min-width:220px}
.toolbar input:focus{outline:2px solid var(--gold);outline-offset:2px}
.toolbar .tip{font-size:11.5px;color:var(--quiet)}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--quiet);font-weight:600;padding:8px 9px;border-bottom:1px solid var(--line);font-size:11.5px;letter-spacing:.03em;white-space:nowrap}
th.sortable{cursor:pointer;user-select:none}
th.sortable:hover{color:var(--text)}
td{padding:7px 9px;border-bottom:1px solid #242d25;vertical-align:middle}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#1a211b}
.c-rank{color:var(--gold);font-weight:700;width:38px}
.c-name{font-weight:600;white-space:nowrap}
.c-name .en{display:block;color:var(--quiet);font-size:10.5px;font-weight:400;letter-spacing:.02em}
.c-rating{font-weight:700;width:56px}
.c-pos{color:var(--muted);width:64px}
.c-six{color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:11.5px;letter-spacing:.02em}
.six{cursor:help;border-bottom:1px dotted var(--line2)}
.c-gold{width:62px}
.gold-n{color:var(--gold);font-weight:700}
.c-price{font-variant-numeric:tabular-nums;white-space:nowrap}
.c-num{color:var(--muted);font-variant-numeric:tabular-nums;width:60px}
.c-date{white-space:nowrap;font-weight:600}
.c-basis{white-space:nowrap}
.c-note{color:var(--quiet);font-size:11.5px;white-space:nowrap}
.c-spark{width:110px}
.spark{display:block}
.pv{display:none}
body[data-platform="console"] .pv-console,
body[data-platform="pc"] .pv-pc{display:inline}
body[data-platform="console"] .c-spark .pv-console,
body[data-platform="pc"] .c-spark .pv-pc{display:block}
.plat-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin:0 0 18px}
.plat-label{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--quiet);font-weight:700}
.plat-btn{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:6px 14px;border-radius:9px;border:1px solid var(--line);background:#1d271b;color:var(--muted);font-size:13px;font-weight:650;cursor:pointer;transition:.15s}
.plat-btn small{font-size:10px;color:var(--quiet);font-weight:500;letter-spacing:.05em}
.plat-btn:hover{border-color:var(--gold);color:var(--text)}
.plat-btn.active{background:rgba(227,179,65,.14);border-color:rgba(227,179,65,.5);color:var(--gold)}
.plat-btn.active small{color:rgba(227,179,65,.75)}
.plat-hint{font-size:11px;color:var(--quiet);margin-left:auto;max-width:54ch}
.up{color:var(--up);font-weight:700}
.dn{color:var(--dn);font-weight:700}
.hint{color:var(--quiet);font-size:10px;font-weight:500;margin-left:4px}
.tag{font-size:10.5px;padding:2px 8px;border-radius:999px;font-weight:600}
.tag.ok{background:rgba(78,192,138,.16);color:var(--dn);border:1px solid rgba(78,192,138,.4)}
.tag.warn{background:rgba(227,179,65,.16);color:var(--gold);border:1px solid rgba(227,179,65,.4)}
.empty{color:var(--quiet);font-size:12.5px;padding:14px;border:1px dashed var(--line);border-radius:9px;background:#161d17}
ul{padding-left:18px}li{margin:5px 0;font-size:12.5px;color:var(--muted)}
code{background:#2a3329;padding:1px 5px;border-radius:4px;font-size:11.5px}
.footer{color:var(--quiet);font-size:11.5px;margin-top:30px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body data-platform="${esc(activePlatform)}">
<h1>FC27 传奇/英雄监控 ${stateBadge}</h1>
<div class="sub">数据日期 ${esc(dateStr)} · 平台 Console（PS / Xbox）+ PC 双口径可切换 · 监控对象 FC27 全部基础传奇卡（Icon，全量 ${roster.length} 张）· 来源 FUTBIN · 逐日快照累积</div>

<div class="plat-bar" role="group" aria-label="平台切换">
  <span class="plat-label">平台</span>
  ${ICON_PLATFORMS.map(pl => `<button type="button" class="plat-btn${pl.id === activePlatform ? ' active' : ''}" data-platform="${pl.id}" aria-pressed="${pl.id === activePlatform}">${esc(pl.label)}<small>${esc(pl.short)}</small></button>`).join('')}
  <span class="plat-hint">FUTBIN 仅提供 Console（PS / Xbox 合并）与 PC 两个市场口径。当前 Console 有效价 ${platformValid.console} 张 / PC 有效价 ${platformValid.pc} 张；开服前两平台均为 0，此时显示列表页估值并以「占位」标注。</span>
</div>

<div class="stat-grid">
${statCard(roster.length, '监控传奇卡总数')}
${statCard(today ? `${today.counts?.valid ?? validPrices.length}<em>/${roster.length}</em>` : '—', '当日有效价格卡数')}
${statCard(recordingDays, '已记录快照天数')}
${statCard(isMarket ? '已开服' : (countdown !== null && countdown > 0 ? `D-${countdown}` : '—'), isMarket ? `口径 ${basis}` : `距 FC27 开服（${launchDate}）`)}
</div>

<h2>一、本期监控口径</h2>
<div class="card">
<ul>
<li>监控对象：FC27 全部基础传奇卡（Icon）<strong>${roster.length}</strong> 张，逐日记录每一张的价格，含评分、位置、六维、金特技台账。</li>
<li>平台口径：FUTBIN 只提供 <b>Console（PS / Xbox 合并）</b> 与 <b>PC</b> 两个市场，页面顶部按钮可切换；每张卡的「今日价 / 日环比 / 累计涨跌 / 走势」均按所选平台分别计算，不混用。当前有效价 Console ${platformValid.console} 张 / PC ${platformValid.pc} 张。</li>
<li>当前口径：<code>${esc(basis)}</code> —— ${esc(today?.priceBasisNote || '暂无当日快照，口径待定。')}</li>
<li>快照位置：<code>apps/market/engine/icons/data/prices/fc27/daily/&lt;DATE&gt;.json</code>，一天一份、同日重跑只覆盖当天，历史不被清空。</li>
<li>${isMarket ? '已开服：下方「今日价 / 日环比 / 累计涨跌 / 走势」按真实成交价逐日计算。' : '未开服：列表页占位价的日变化没有行情含义，因此本期不计算日环比与累计涨跌，仅做台账与记录进度；开服后自动切换为成交价监控。'}</li>
<li>本页只做<b>逐日价格监控台账</b>；FC26↔FC27 阵容对照、属性与金特技变化、131 张首月价格预测与投资分档，见本栏目「<b>传奇卡研究</b>」子标签。</li>
</ul>
</div>

<h2>二、大盘中位价走势（全部传奇卡）</h2>
<div class="card">${trendChart(medians)}</div>

<h2>三、传奇卡（Icon）台账（全量 ${roster.length} 张）</h2>
<div class="card">
<div class="toolbar">
<input type="search" id="q" placeholder="搜索球员中文名 / 英文名 / 位置" aria-label="搜索传奇卡">
<span class="tip">点击「${esc(isMarket ? '今日价' : '列表页价')}」「评分」表头可排序 · 共 ${roster.length} 张</span>
</div>
<div class="tbl-wrap"><table class="tbl" id="icons-table">
<thead><tr>
<th class="sortable" data-key="rank">#</th>
<th class="sortable" data-key="name">球员</th>
<th class="sortable" data-key="rating">评分</th>
<th class="sortable" data-key="pos">位置</th>
<th>六维</th>
<th>金特技</th>
<th class="sortable" data-key="price">${esc(isMarket ? '今日价' : '列表页价(非市场价)')}</th>
<th class="sortable" data-key="d1">日环比</th>
<th class="sortable" data-key="cum">累计涨跌</th>
<th>记录天数</th>
<th>走势(近30条)</th>
</tr></thead><tbody>${rows}</tbody></table></div>
</div>

<h2>四、逐日快照记录</h2>
<div class="card">
${snapshotRows ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th><th>卡数</th><th>有效价</th><th>口径</th><th>中位价(coins)</th><th>采集时间</th></tr></thead><tbody>${snapshotRows}</tbody></table></div>` : emptyBox('尚无任何传奇卡快照。首次记录后此处按日倒序列出每次采集的卡数、有效价与中位价。')}
</div>

<h2>五、数据来源与缺失项</h2>
<div class="card">
<ul>
<li>来源：<code>${esc(today?.source?.listUrl || 'https://www.futbin.com/27/players')}</code>${today?.source?.capturedAt ? ` · 抓取时间 ${esc(today.source.capturedAt)}` : ''}</li>
<li>原始抓取文件：<code>${esc(today?.source?.rawFile || 'apps/market/engine/icons/data/prices/fc27/base-icons.json')}</code></li>
</ul>
${missing.length ? `<ul>${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : emptyBox('本期无缺失项。')}
</div>

<div class="footer">FC27 传奇/英雄监控 · ${esc(dateStr)} · 由 render-icons-heroes.mjs（传奇区块由 render-market-icons.mjs 渲染）生成 · 价格为 FUT 金币，Console / PC 双平台口径，仅作游戏市场研究，不构成投资或交易建议</div>
<script>
(function(){
  var table=document.getElementById('icons-table');if(!table)return;
  var tbody=table.tBodies[0];
  function cells(tr){return Array.prototype.slice.call(tr.children);}
  // 平台切换：只取当前平台那一份取值，避免两个平台的值被拼在一起影响排序与数值解析
  function activeText(cell){
    var plat=document.body.getAttribute('data-platform')||'console';
    var el=cell.querySelector('.pv.pv-'+plat);
    return el?el.textContent:cell.textContent;
  }
  var specs={rank:{i:0,type:'num'},rating:{i:2,type:'num'},pos:{i:3,type:'str'},name:{i:1,type:'str'}};
  var priceKeys=(function(){var th=table.tHead.rows[0].cells;var m={};for(var i=0;i<th.length;i++){var k=th[i].getAttribute('data-key');if(k)m[k]=i;}return m;})();
  function val(tr,key){
    var i=(key==='price')?priceKeys.price:(key==='d1'?priceKeys.d1:(key==='cum'?priceKeys.cum:null));
    var raw;
    if(i!==null&&i!==undefined){raw=activeText(tr.children[i]).replace(/[^0-9.+-]/g,'');return raw===''?null:parseFloat(raw);}
    var s=specs[key];if(!s)return null;raw=activeText(tr.children[s.i]).trim();
    return s.type==='num'?(isNaN(parseFloat(raw))?null:parseFloat(raw)):raw;
  }
  var dir={};
  Array.prototype.forEach.call(table.tHead.rows[0].querySelectorAll('th.sortable'),function(th){
    th.addEventListener('click',function(){
      var key=th.getAttribute('data-key');dir[key]=dir[key]==='asc'?'desc':'asc';
      var rows=cells(tbody.rows).slice();
      rows.sort(function(a,b){var x=val(a,key),y=val(b,key);
        if(x===null&&y===null)return 0;if(x===null)return 1;if(y===null)return -1;
        var r=(typeof x==='string')?x.localeCompare(y,'zh'):x-y;return dir[key]==='asc'?r:-r;});
      rows.forEach(function(tr){tbody.appendChild(tr);});
    });
  });
  var q=document.getElementById('q');
  if(q)q.addEventListener('input',function(){
    var s=q.value.trim().toLowerCase();
    Array.prototype.forEach.call(tbody.rows,function(tr){
      tr.style.display=!s||tr.children[1].textContent.toLowerCase().indexOf(s)>-1||tr.children[3].textContent.toLowerCase().indexOf(s)>-1?'':'none';
    });
  });
  // 平台切换按钮（纯展示切换，不重新渲染）
  Array.prototype.forEach.call(document.querySelectorAll('.plat-btn'),function(b){
    b.addEventListener('click',function(){
      var id=b.getAttribute('data-platform');
      document.body.setAttribute('data-platform',id);
      Array.prototype.forEach.call(document.querySelectorAll('.plat-btn'),function(x){
        var on=x.getAttribute('data-platform')===id;
        x.classList.toggle('active',on);x.setAttribute('aria-pressed',on?'true':'false');
      });
    });
  });
})();
</script>
</body></html>
`;
}

// ========== 主流程 ==========
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dateStr = isDate(process.argv[2]) ? process.argv[2] : todayShanghai();
  const snapshots = loadIconSnapshots();
  const ledger = loadIconLedger();
  if (!snapshots.length) console.error(`未找到任何传奇卡快照（${ICON_DAILY_DIR}），将渲染为如实空状态。`);
  if (!ledger.length) console.error(`未找到传奇卡台账（${ICON_LEDGER_PATH}），卡名单将退回最近快照。`);
  const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'market-icons.html');
  writeFileSync(outPath, renderIcons(dateStr, { snapshots, ledger }), 'utf8');
  console.log(`传奇监控已渲染: ${outPath}`);
}
