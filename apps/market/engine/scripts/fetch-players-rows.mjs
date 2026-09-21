#!/usr/bin/env node
/**
 * FC27 /27/players 翻页行采集器（常驻脚本，2026-09-20 新建）
 *
 * 用途：为日任务的价格分层与 83+ 补采提供「实测翻页行」。此前这份逻辑每天由 agent 在
 *       automation/runs/<D>/market/work/fetch-players-pages.mjs 里现写一份，本脚本把它固化。
 *
 * 输入：CDP Proxy（默认 http://127.0.0.1:3456）。宿主页优先复用 FC_HOST_TAB，否则新建一个停在
 *       https://www.futbin.com/robots.txt 的轻量同源页——**不要**用 /27/players 当宿主页，
 *       频繁新建标签页直达榜单类页面会被 Cloudflare 下发挑战页（见根 AGENTS.md
 *       「来源页取数失败 ≠ 通道故障」）。
 * 输出：automation/runs/<D>/market/work/players-rows.json（或 --out 指定）
 *       { collectedAt, pages:[{page,blocked,rowCount,tbodyRows,hasName}], attempts:[…], rows:[…] }
 *
 * 口径（2026-09-20 实测，勿凭印象改动）：
 *   - `td.table-name` 的 innerText 行序：第 1 行=评分、第 2 行=姓名、第 3 行起=版本标签。
 *   - 价格在 `td.table-price.platform-ps-only|platform-pc-only` 的 `.price` 子元素内；
 *     FUTBIN 自带涨跌徽标 `.price-diff` **只采集不参与计算**（开服初期无涨跌可讲）。
 *   - 无有效价（<1000）的行由调用侧按占位处理，本脚本如实落库不猜测。
 *
 * 用法：node apps/market/engine/scripts/fetch-players-rows.mjs [--date YYYY-MM-DD] [--max-page N] [--out PATH]
 *       （采集前先跑 node automation/browser-triage.mjs，exit 0 才继续）
 */
import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOST_URL = 'https://www.futbin.com/robots.txt';
const LIST_URL = 'https://www.futbin.com/27/players';

const argv = process.argv.slice(2);
const argOf = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(argOf('--date') || '') ? argOf('--date') : todayShanghai();
const maxPage = Math.max(1, Number.parseInt(argOf('--max-page') || '', 10) || 4);
const outPath = argOf('--out') || path.join(ROOT, 'automation', 'runs', dateStr, 'market', 'work', 'players-rows.json');
const PAGE_GAP_MS = Number.parseInt(argOf('--gap-ms') || '', 10) || 1200;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async (url, body, timeoutMs) => {
  const res = await fetch(url, { method: body === null ? 'GET' : 'POST', body: body === null ? undefined : body, signal: AbortSignal.timeout(timeoutMs) });
  return res.json();
};
const ev = async (id, script, timeoutMs = 60000) => {
  // CDP Proxy 已知坑：较长 eval 偶发返回 {"value":{}}，重试即可
  for (let i = 0; i < 3; i++) {
    const raw = await j(`${PROXY}/eval?target=${encodeURIComponent(id)}`, script, timeoutMs);
    if (raw && typeof raw.value === 'string') return raw.value;
    if (raw && raw.error) throw new Error(String(raw.error).slice(0, 160));
    await sleep(2000);
  }
  throw new Error('proxy eval 连续返回空对象');
};

// 宿主页：优先复用 FC_HOST_TAB，否则新建轻量同源页（勿改成 /27/players）
let host = process.env.FC_HOST_TAB || '';
let ownHost = false;
if (!host) {
  host = (await j(`${PROXY}/new`, HOST_URL, 30000)).targetId;
  ownHost = true;
  await sleep(2500);
}

// 注入页内的解析函数（不要包 IIFE——外层 async IIFE 需要直接调用 parseRows）
const PARSE = `
  function parseCoins(text) {
    if (typeof text !== 'string') return 0;
    const t = text.trim().replace(/,/g, '');
    const m = /^([\\d.]+)\\s*([KM]?)$/i.exec(t);
    if (!m) return 0;
    let v = parseFloat(m[1]);
    if (!Number.isFinite(v)) return 0;
    const u = m[2].toUpperCase();
    if (u === 'K') v *= 1000;
    if (u === 'M') v *= 1000000;
    return Math.round(v);
  }
  function firstCoin(text) {
    if (!text) return { v: 0, raw: '' };
    const lines = String(text).split('\\n').map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      const m = /^([\\d.,]+)\\s*([KM]?)$/i.exec(line.replace(/,/g, ''));
      if (m) return { v: parseCoins(line), raw: line };
    }
    return { v: 0, raw: lines[0] || '' };
  }
  function parseRows(root) {
    const rows = [];
    for (const tr of root.querySelectorAll('tbody tr')) {
      const nameTd = tr.querySelector('td.table-name');
      if (!nameTd) continue;
      const lines = nameTd.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
      // 行结构：第1行=评分、第2行=姓名、第3行起=版本标签
      const ratingFromName = parseInt(lines[0] || '0', 10) || 0;
      const name = lines[1] || '';
      const version = lines.slice(2).join(' ');
      const ratingTd = parseInt(((tr.querySelector('td.table-item-rating') || {}).innerText || '').trim(), 10) || 0;
      const pos = ((tr.querySelector('td.table-pos') || {}).innerText || '').trim();
      const score = (((tr.querySelector('td.table-item-score') || {}).innerText || '')).trim().split('\\n')[0] || '';
      const psCell = tr.querySelector('td.table-price.platform-ps-only');
      const pcCell = tr.querySelector('td.table-price.platform-pc-only');
      const ps = firstCoin(psCell ? (psCell.querySelector('.price') || {}).innerText || psCell.innerText : '');
      const pc = firstCoin(pcCell ? (pcCell.querySelector('.price') || {}).innerText || pcCell.innerText : '');
      const a = nameTd.querySelector('a');
      rows.push({
        name,
        href: a ? a.getAttribute('href') : null,
        version, rating: ratingTd || ratingFromName, pos, score,
        psPrice: ps.v, pcPrice: pc.v, psRaw: ps.raw, pcRaw: pc.raw,
      });
    }
    return rows;
  }
`;

const pages = [];
const attempts = [];
const allRows = [];
for (let p = 1; p <= maxPage; p++) {
  const pageUrl = `${LIST_URL}?page=${p}`;
  const script = `(async () => {
    ${PARSE};
    const res = await fetch(${JSON.stringify(pageUrl)}, { credentials: 'same-origin' });
    const html = await res.text();
    const blocked = (res.status !== 200) || (/403|does not have permission|Just a moment|cf-challenge/i.test(html.slice(0, 2000)) && html.length < 200000);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = blocked ? [] : parseRows(doc);
    return JSON.stringify({ status: res.status, blocked, rows, tbodyRows: doc.querySelectorAll('tbody tr').length, hasName: doc.querySelectorAll('td.table-name').length });
  })()`;
  let out = null;
  for (let attempt = 1; attempt <= 2 && !out; attempt++) {
    try {
      const parsed = JSON.parse(await ev(host, script, 60000));
      if (parsed.blocked) {
        attempts.push({ page: p, attempt, note: attempt === 1 ? '首次取页' : '退避后重试', error: `拦截/challenge 页（HTTP ${parsed.status}）` });
        if (attempt < 2) await sleep(45000); // 站点经验：分钟级退避，禁止秒级密集重试
        continue;
      }
      out = parsed;
    } catch (e) {
      attempts.push({ page: p, attempt, note: attempt === 1 ? '首次取页' : '退避后重试', error: String(e && e.message ? e.message : e).slice(0, 160) });
      if (attempt < 2) await sleep(5000);
    }
  }
  if (!out) { pages.push({ page: p, blocked: true, rowCount: 0, tbodyRows: 0, hasName: 0 }); continue; }
  pages.push({ page: p, blocked: false, rowCount: out.rows.length, tbodyRows: out.tbodyRows, hasName: out.hasName });
  allRows.push(...out.rows);
  process.stdout.write(`page ${p}: rows=${out.rows.length} tbody=${out.tbodyRows} nameCells=${out.hasName}\n`);
  await sleep(PAGE_GAP_MS);
}

mkdirSync(path.dirname(outPath), { recursive: true });
const tmp = `${outPath}.tmp-${process.pid}`;
writeFileSync(tmp, JSON.stringify({
  collectedAt: new Date().toISOString(), date: dateStr, source: `${LIST_URL}?page=1..${maxPage}`,
  pages, attempts, rows: allRows,
}, null, 1), 'utf8');
renameSync(tmp, outPath);

console.log(`players-rows.json → ${path.relative(ROOT, outPath)}`);
console.log(`total rows ${allRows.length} | validPS ${allRows.filter(r => r.psPrice >= 1000).length} | validPC ${allRows.filter(r => r.pcPrice >= 1000).length}`);
if (ownHost) { try { await fetch(`${PROXY}/close?target=${encodeURIComponent(host)}`); } catch { /* 关闭失败不影响结果 */ } }
