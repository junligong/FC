// news 采集驱动：逐账号打开 X 主页 → eval extract-timeline.js → 保存原始抽取结果
// 兼容 /eval 返回 {"value": "..."} 或 {"result": ...} 两种包裹（2026-09-17 坑①）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DAY = '2026-09-19';
const WORK = `/Users/wuyanzu/Desktop/FC/automation/runs/${DAY}/news/work`;
mkdirSync(WORK, { recursive: true });

const EXTRACT = readFileSync('/Users/wuyanzu/Desktop/FC/apps/news/extract-timeline.js', 'utf8');
const PROXY = 'http://localhost:3456';

const sources = readFileSync('/Users/wuyanzu/Desktop/FC/apps/news/sources.txt', 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)
  .map(l => {
    const parts = l.split(/\t+/).map(s => s.trim()).filter(Boolean);
    const url = parts.find(p => p.startsWith('http'));
    if (!url) return null;
    const name = parts.filter(p => !p.startsWith('http'))[0] || url;
    const handle = url.replace(/\/$/, '').split('/').pop();
    return { name, url, handle };
  })
  .filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jfetch(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function newTab(url) {
  const r = await jfetch(`${PROXY}/new`, { method: 'POST', body: url });
  const id = r.id || r.targetId || r.target || (r.data && (r.data.id || r.data.targetId));
  return id ? String(id) : null;
}

async function evalPage(target, script) {
  const r = await jfetch(`${PROXY}/eval?target=${target}`, { method: 'POST', body: script });
  if (typeof r.value === 'string') return r.value;
  if (r.result !== undefined) return typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
  return null;
}

const summary = [];
for (const s of sources) {
  const openedAt = new Date().toISOString();
  let target = null;
  let payload = null;
  let error = '';
  try {
    target = await newTab(s.url);
    if (!target) throw new Error('no target id from /new');
    // X 时间线渲染较慢：先等基础加载，再探文章节点
    let articles = 0;
    for (const wait of [6000, 4000, 4000]) {
      await sleep(wait);
      const probe = await evalPage(target, 'document.querySelectorAll("article[data-testid=\\"tweet\\"]").length');
      const n = probe ? parseInt(String(probe).replace(/[^0-9]/g, ''), 10) : NaN;
      if (Number.isFinite(n)) { articles = n; if (n > 0) break; }
    }
    for (let attempt = 0; attempt < 2 && !payload; attempt++) {
      if (attempt > 0) await sleep(4000);
      const raw = await evalPage(target, EXTRACT);
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj.count === 'number' && Array.isArray(obj.tweets)) payload = obj;
      } catch { /* retry */ }
    }
  } catch (e) {
    error = String(e && e.message || e);
  }
  if (target) { try { await jfetch(`${PROXY}/close?target=${target}`); } catch {} }
  const out = {
    handle: s.handle, name: s.name, url: s.url, openedAt,
    count: payload ? payload.count : 0,
    tweets: payload ? payload.tweets : [],
    error,
    articlesSeen: undefined,
  };
  writeFileSync(`${WORK}/raw-${s.handle}.json`, JSON.stringify(out, null, 2));
  summary.push(`${s.handle}\t${payload ? 'OK' : 'FAIL'}\tcount=${out.count}${error ? '\t' + error : ''}`);
  console.log(summary[summary.length - 1]);
}
writeFileSync(`${WORK}/collect-summary.json`, JSON.stringify(summary, null, 2));
console.log('DONE ' + summary.filter(l => l.includes('\tOK\t')).length + '/' + sources.length);
