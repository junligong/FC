// 2026-09-19 市场日任务采集脚本：经 CDP Proxy 实测打开 FUTBIN 页面，
// 采集 /27/popular（双平台价+热度）、/27/popular/evolutions（进化名+热度）、
// /27/players 探测（价格分层源，历史窗口常被 403）与周黑/活动卡候选路由探测。
// 输出 work/popular-raw.json、work/evo-popular-raw.json、work/players-probe.json、work/totw-probe.json。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMarketListScript } from '../../../../../apps/market/engine/scripts/extract-market-prices.js';

const dir = new URL('.', import.meta.url).pathname;
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOME = 'https://www.futbin.com/';
const POPULAR = 'https://www.futbin.com/27/popular';
const EVO = 'https://www.futbin.com/27/popular/evolutions';
const PLAYERS = 'https://www.futbin.com/27/players';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const j = async (url, body, timeoutMs) => {
  const res = await fetch(url, { method: body === null ? 'GET' : 'POST', body: body === null ? undefined : body, signal: AbortSignal.timeout(timeoutMs) });
  return res.json();
};
const openTab = async url => (await j(`${PROXY}/new`, url, 30000)).targetId;
const closeTab = async id => { try { await j(`${PROXY}/close?target=${encodeURIComponent(id)}`, null, 5000); } catch {} };
const nav = async (id, url) => j(`${PROXY}/navigate?target=${encodeURIComponent(id)}`, url, 30000);
const ev = async (id, script, timeoutMs = 60000) => {
  const raw = await j(`${PROXY}/eval?target=${encodeURIComponent(id)}`, script, timeoutMs);
  if (raw && typeof raw.value === 'string') return raw.value;
  if (raw && raw.error) throw new Error(String(raw.error).slice(0, 160));
  throw new Error('proxy eval 异常: ' + JSON.stringify(raw).slice(0, 140));
};

async function waitForCards(id, selector, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = { n: 0, blocked: false };
  while (Date.now() < deadline) {
    const probe = JSON.parse(await ev(id, `(() => JSON.stringify({
      n: document.querySelectorAll(${JSON.stringify(selector)}).length,
      blocked: /403|does not have permission/i.test(document.body ? document.body.innerText.slice(0, 300) : '')
    }))()`, 20000));
    last = probe;
    if (probe.n > 0 || probe.blocked) return last;
    await sleep(2500);
  }
  return last;
}

// 采集一个 playercard 列表页（popular / evolutions），含一次 45s 退避重试
async function collectList(url, kind) {
  const errors = [];
  for (let i = 0; i < 2; i++) {
    if (i) { await sleep(45000); const h = await openTab(HOME); await sleep(3000); await nav(h, url); await closeTab(h); }
    let tab = null;
    try {
      tab = await openTab(url);
      const probe = await waitForCards(tab, 'a.playercard-wrapper');
      if (probe.blocked) { errors.push({ attempt: i + 1, error: 'FUTBIN 403 拦截页' }); continue; }
      if (!probe.n) { errors.push({ attempt: i + 1, error: '等待 45 秒后仍无卡片元素' }); continue; }
      const payload = JSON.parse(await ev(tab, buildMarketListScript(kind), 60000));
      if (payload.blocked) { errors.push({ attempt: i + 1, error: '解析到 403 拦截页' }); continue; }
      if (!payload.cards?.length) { errors.push({ attempt: i + 1, error: '页面可读但未解析到卡片' }); continue; }
      return { ok: true, cards: payload.cards, attempts: i + 1, errors };
    } catch (e) {
      errors.push({ attempt: i + 1, error: String(e?.message || e).slice(0, 200) });
    } finally { if (tab) await closeTab(tab); }
  }
  return { ok: false, cards: [], errors };
}

// /27/players 表格行提取（页内 fetch + DOMParser，宿主页必须已在 futbin 同源）
const PLAYERS_PAGE_SCRIPT = `(() => {
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
  function parseRows(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [];
    for (const tr of doc.querySelectorAll('tbody tr')) {
      const nameTd = tr.querySelector('td.table-name');
      if (!nameTd) continue;
      const a = nameTd.querySelector('a');
      const verEl = nameTd.querySelector('.table-player-version a, .table-player-version span, span');
      const rating = parseInt((tr.querySelector('td.table-item-rating, td[data-title="OVR"]') || {}).innerText || '0', 10) || 0;
      const score = (tr.querySelector('td.table-item-score') || {}).innerText || '';
      const psRaw = (tr.querySelector('td.table-price.platform-ps-only') || {}).innerText || '';
      const pcRaw = (tr.querySelector('td.table-price.platform-pc-only') || {}).innerText || '';
      rows.push({
        name: (a ? a.innerText : nameTd.innerText).trim(),
        href: a ? a.getAttribute('href') : null,
        version: verEl ? verEl.innerText.trim() : '',
        rating, score: score.trim(),
        psPrice: parseCoins(psRaw), pcPrice: parseCoins(pcRaw),
        psRaw: psRaw.trim(), pcRaw: pcRaw.trim(),
      });
    }
    return rows;
  }
  return JSON.stringify({
    location: location.href,
    blocked: /403|does not have permission/i.test(document.body ? document.body.innerText.slice(0, 300) : ''),
    domRows: parseRows(document.documentElement.outerHTML).length,
    rows: parseRows(document.documentElement.outerHTML),
  });
})()`;

async function probePlayers() {
  const result = { url: PLAYERS, attempts: [] };
  for (let i = 0; i < 2; i++) {
    if (i) await sleep(30000);
    let tab = null;
    try {
      tab = await openTab(i === 0 ? HOME : PLAYERS);
      if (i === 0) { await sleep(3000); await nav(tab, PLAYERS); }
      const probe = await waitForCards(tab, 'tbody tr', 40000);
      result.attempts.push({ attempt: i + 1, probe });
      if (probe.blocked) continue;
      if (!probe.n) continue;
      const payload = JSON.parse(await ev(tab, PLAYERS_PAGE_SCRIPT, 60000));
      result.ok = !payload.blocked && payload.rows?.length > 0;
      result.rows = payload.rows || [];
      result.domRows = payload.domRows;
      // 页内 fetch 页 2-4（同源会话）
      if (result.ok) {
        result.extraPages = {};
        for (const p of [2, 3, 4]) {
          const html = await ev(tab, `(async () => {
            try {
              const r = await fetch('https://www.futbin.com/27/players?page=${p}', { credentials: 'same-origin' });
              const t = await r.text();
              return JSON.stringify({ status: r.status, len: t.length, blocked: /403|does not have permission/i.test(t.slice(0, 400)), html: t.slice(0, 900000) });
            } catch (e) { return JSON.stringify({ status: 0, error: String(e).slice(0, 120) }); }
          })()`, 60000);
          const pj = JSON.parse(html);
          if (pj.status === 200 && !pj.blocked && pj.html) {
            const docParsed = JSON.parse(await ev(tab, `(async () => {
              const doc = new DOMParser().parseFromString(${JSON.stringify(pj.html)}, 'text/html');
              const rows = [];
              for (const tr of doc.querySelectorAll('tbody tr')) {
                const nameTd = tr.querySelector('td.table-name');
                if (!nameTd) continue;
                const a = nameTd.querySelector('a');
                const verEl = nameTd.querySelector('.table-player-version a, .table-player-version span, span');
                rows.push({
                  name: (a ? a.innerText : nameTd.innerText).trim(),
                  href: a ? a.getAttribute('href') : null,
                  version: verEl ? verEl.innerText.trim() : '',
                  rating: parseInt((tr.querySelector('td.table-item-rating, td[data-title="OVR"]') || {}).innerText || '0', 10) || 0,
                  score: ((tr.querySelector('td.table-item-score') || {}).innerText || '').trim(),
                  psPrice: 0, pcPrice: 0,
                  psRaw: ((tr.querySelector('td.table-price.platform-ps-only') || {}).innerText || '').trim(),
                  pcRaw: ((tr.querySelector('td.table-price.platform-pc-only') || {}).innerText || '').trim(),
                });
              }
              return JSON.stringify({ rows });
            })()`, 60000));
            result.extraPages[p] = { status: pj.status, rows: docParsed.rows };
          } else {
            result.extraPages[p] = { status: pj.status, blocked: pj.blocked || undefined, error: pj.error };
            if (pj.status !== 200) break;
          }
        }
      }
      return result;
    } catch (e) {
      result.attempts.push({ attempt: i + 1, error: String(e?.message || e).slice(0, 200) });
    } finally { if (tab) await closeTab(tab); }
  }
  return result;
}

async function probeUrl(url) {
  let tab = null;
  const out = { url, openedAt: new Date().toISOString() };
  try {
    tab = await openTab(url);
    await sleep(4000);
    const state = JSON.parse(await ev(tab, `(() => JSON.stringify({
      title: document.title,
      status: document.body ? document.body.innerText.slice(0, 200) : '',
      hasCards: document.querySelectorAll('a.playercard-wrapper').length,
      hasRows: document.querySelectorAll('tbody tr').length
    }))()`, 20000));
    out.state = state;
    out.note = /404|not found|page cannot be found/i.test(state.status) || /404|not found/i.test(state.title) ? '404' : (state.hasCards || state.hasRows ? 'has-content' : 'empty');
  } catch (e) {
    out.error = String(e?.message || e).slice(0, 160);
  } finally { if (tab) await closeTab(tab); }
  return out;
}

// ---------- 主流程 ----------
const summary = { startedAt: new Date().toISOString() };

process.stdout.write('[1/4] 建立会话 + 热门榜 ' + POPULAR + '\n');
const host = await openTab(HOME);
await sleep(3000);
await closeTab(host);
const pop = await collectList(POPULAR, 'popular');
summary.popular = { ok: pop.ok, count: pop.cards.length, attempts: pop.attempts, errors: pop.errors };
writeFileSync(dir + 'popular-raw.json', JSON.stringify({ collectedAt: new Date().toISOString(), url: POPULAR, ok: pop.ok, attempts: pop.attempts, errors: pop.errors, cards: pop.cards }, null, 1));
process.stdout.write(`  -> ${pop.ok ? '成功 ' + pop.cards.length + ' 张' : '失败: ' + pop.errors.map(e => e.error).join(' / ')}\n`);

process.stdout.write('[2/4] 热门进化榜 ' + EVO + '\n');
const evo = await collectList(EVO, 'popular-evolutions');
summary.evolutions = { ok: evo.ok, count: evo.cards.length, attempts: evo.attempts, errors: evo.errors };
writeFileSync(dir + 'evo-popular-raw.json', JSON.stringify({ collectedAt: new Date().toISOString(), url: EVO, ok: evo.ok, attempts: evo.attempts, errors: evo.errors, cards: evo.cards }, null, 1));
process.stdout.write(`  -> ${evo.ok ? '成功 ' + evo.cards.length + ' 张' : '失败: ' + evo.errors.map(e => e.error).join(' / ')}\n`);

process.stdout.write('[3/4] /27/players 价格分层源探测\n');
const pl = await probePlayers();
writeFileSync(dir + 'players-probe.json', JSON.stringify(pl, null, 1));
process.stdout.write(`  -> ${pl.ok ? '成功: domRows ' + pl.domRows + ', 页2-4 ' + JSON.stringify(Object.fromEntries(Object.entries(pl.extraPages || {}).map(([k, v]) => [k, v.rows?.length ?? v.status]))) : '失败/被拦截: ' + JSON.stringify(pl.attempts).slice(0, 200)}\n`);

process.stdout.write('[4/4] 周黑/活动卡候选路由探测\n');
const totw = await probeUrl('https://www.futbin.com/27/totw');
const promos = await probeUrl('https://www.futbin.com/27/promos');
writeFileSync(dir + 'totw-probe.json', JSON.stringify({ totw, promos }, null, 1));
process.stdout.write(`  -> /27/totw=${totw.note || totw.error} /27/promos=${promos.note || promos.error}\n`);

summary.finishedAt = new Date().toISOString();
writeFileSync(dir + 'collect-summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
