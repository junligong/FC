// 2026-09-20 修正版 /27/players 抓取：经已打开的 futbin 宿主页，页内 fetch 页 1-4，
// 解析今日行结构（nameTd.innerText 第1行=评分、第2行=姓名、第3行=版本标签；价格在 td 内 .price 首元素，
// .price-diff 是 FUTBIN 自带涨跌徽标，仅采集不参与计算）。输出 work/players-rows.json。
// 输入：CDP Proxy + 宿主页 targetId（环境变量 FC_HOST_TAB，或自动新建宿主页）；输出 work/players-rows.json。
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('.', import.meta.url).pathname;
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
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

// 宿主页：优先复用环境变量指定 tab，否则新建
let host = process.env.FC_HOST_TAB || '';
if (!host) {
  host = (await j(`${PROXY}/new`, 'https://www.futbin.com/27/players', 30000)).targetId;
  await sleep(6000);
}

// 直接注入的函数定义（不要包 IIFE——外层 async IIFE 需要直接调用 parseRows）
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
      // 行结构（2026-09-20 实测）：第1行=评分、第2行=姓名、第3行=版本标签（可能多行）
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
        version,
        rating: ratingTd || ratingFromName,
        pos,
        score,
        psPrice: ps.v, pcPrice: pc.v, psRaw: ps.raw, pcRaw: pc.raw,
      });
    }
  return rows;
}
`;

// 把解析函数注入页内并逐页 fetch + DOMParser
const pages = {};
const allRows = [];
for (const p of [1, 2, 3, 4]) {
  const script = `(async () => {
    ${PARSE};
    const html = await (await fetch('https://www.futbin.com/27/players?page=${p}', { credentials: 'same-origin' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocked = /403|does not have permission/i.test(html.slice(0, 600));
    const rows = blocked ? [] : parseRows(doc);
    return JSON.stringify({ blocked, rows, tbodyRows: doc.querySelectorAll('tbody tr').length, hasName: doc.querySelectorAll('td.table-name').length });
  })()`;
  const out = JSON.parse(await ev(host, script, 60000));
  pages[p] = { blocked: out.blocked, rowCount: out.rows.length, tbodyRows: out.tbodyRows, hasName: out.hasName };
  if (!out.blocked) allRows.push(...out.rows);
  process.stdout.write(`page ${p}: blocked=${out.blocked} rows=${out.rows.length} tbody=${out.tbodyRows} nameCells=${out.hasName}\n`);
  await sleep(1200);
}

writeFileSync(dir + 'players-rows.json', JSON.stringify({ collectedAt: new Date().toISOString(), pages: Object.entries(pages).map(([p, v]) => ({ page: Number(p), ...v })), rows: allRows }, null, 1));
console.log('total rows', allRows.length, '| validPS', allRows.filter(r => r.psPrice >= 1000).length, '| validPC', allRows.filter(r => r.pcPrice >= 1000).length);
