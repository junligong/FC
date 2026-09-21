// news 采集驱动 v2（2026-09-19）：适配 X 移除 data-testid 后的新 DOM。
// 流程：逐账号打开 → 等待 → 滚动累积抽取 → 合并原始抽取 → enrich（项目脚本）→
//       syndication created_at 回填 timestamp 并按 24h 窗口过滤 → 原子写 tweets-D.json。
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DAY = '2026-09-19';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const WORK = `${ROOT}/automation/runs/${DAY}/news/work`;
mkdirSync(WORK, { recursive: true });

const EXTRACT = readFileSync(`${WORK}/extract-timeline-v2.js`, 'utf8');
const PROXY = 'http://localhost:3456';

const sources = readFileSync(`${ROOT}/apps/news/sources.txt`, 'utf8')
  .split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => {
    const parts = l.split(/\t+/).map(s => s.trim()).filter(Boolean);
    const url = parts.find(p => p.startsWith('http'));
    if (!url) return null;
    const name = parts.filter(p => !p.startsWith('http'))[0] || url;
    const handle = url.replace(/\/$/, '').split('/').pop();
    return { name, url, handle };
  }).filter(Boolean);

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
  let target = null, error = '';
  const byId = new Map();
  try {
    target = await newTab(s.url);
    if (!target) throw new Error('no target id from /new');
    await sleep(7000);
    for (let round = 0; round < 3; round++) {
      const raw = await evalPage(target, EXTRACT);
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          if (obj && Array.isArray(obj.tweets)) {
            const before = byId.size;
            for (const t of obj.tweets) if (!byId.has(t.id)) byId.set(t.id, t);
            if (byId.size === before && round > 0) { /* 无新增 */ }
          }
        } catch { /* ignore */ }
      }
      await jfetch(`${PROXY}/scroll?target=${target}&y=${2200 * (round + 1)}`);
      await sleep(2200);
    }
    // 末轮再抽一次（滚动后新增内容）
    const raw = await evalPage(target, EXTRACT);
    if (raw) { try { const obj = JSON.parse(raw); for (const t of (obj.tweets || [])) if (!byId.has(t.id)) byId.set(t.id, t); } catch {} }
  } catch (e) {
    error = String(e && e.message || e);
  }
  if (target) { try { await jfetch(`${PROXY}/close?target=${target}`); } catch {} }
  const tweets = [...byId.values()];
  const out = { handle: s.handle, name: s.name, url: s.url, openedAt, count: tweets.length, tweets, error };
  writeFileSync(`${WORK}/raw-${s.handle}.json`, JSON.stringify(out, null, 2));
  summary.push(`${s.handle}\t${error ? 'FAIL' : 'OK'}\tcount=${tweets.length}${error ? '\t' + error : ''}`);
  console.log(summary[summary.length - 1]);
}
writeFileSync(`${WORK}/collect-summary.json`, JSON.stringify(summary, null, 2));
const okCount = summary.filter(l => l.includes('\tOK\t')).length;
console.log('DONE ' + okCount + '/' + sources.length);

// ---- 合并 + enrich + 时间回填 ----
const merged = [];
const seen = new Set();
for (const s of sources) {
  try {
    const raw = JSON.parse(readFileSync(`${WORK}/raw-${s.handle}.json`, 'utf8'));
    for (const t of raw.tweets || []) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push({ ...t, sourceAccount: s.handle });
    }
  } catch {}
}
console.log('merged raw tweets: ' + merged.length);
writeFileSync(`${WORK}/raw-merged.json`, JSON.stringify({ date: DAY, count: merged.length, tweets: merged }, null, 2));

// 写 tweets-D.json（采集快照初版）
writeFileSync(`${ROOT}/apps/news/data/tweets-${DAY}.json`,
  JSON.stringify({ schemaVersion: 1, date: DAY, collectedAt: new Date().toISOString(), count: merged.length, tweets: merged }, null, 2));

// enrich（项目脚本）
execFileSync('node', [`${ROOT}/apps/news/enrich-tweet-media.mjs`, DAY], { stdio: 'inherit' });

// syndication created_at 回填 + 24h 窗口过滤
const snap = JSON.parse(readFileSync(`${ROOT}/apps/news/data/tweets-${DAY}.json`, 'utf8'));
const now = Date.now();
const cutoff = now - 24 * 3600 * 1000;
async function fetchCreatedAt(id) {
  try {
    const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&token=a&lang=zh`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    return payload && payload.created_at ? payload.created_at : null;
  } catch { return null; }
}
const todo = snap.tweets;
let cursor = 0;
async function worker() {
  while (cursor < todo.length) {
    const t = todo[cursor++];
    const created = await fetchCreatedAt(t.id);
    if (created) {
      const ts = Date.parse(created);
      if (Number.isFinite(ts)) { t.timestamp = created; t.timestampSource = 'syndication'; }
    }
  }
}
await Promise.all(Array.from({ length: 6 }, () => worker()));

const kept = [];
const dropped = [];
for (const t of snap.tweets) {
  const ts = t.timestamp ? Date.parse(t.timestamp) : NaN;
  if (Number.isFinite(ts) && ts >= cutoff && ts <= now + 60000) kept.push(t);
  else dropped.push({ id: t.id, timeText: t.timeText, timestamp: t.timestamp, reason: Number.isFinite(ts) ? 'outside-24h' : 'no-timestamp' });
}
// 无 created_at 的相对时间兜底（approx 标记，不臆造为精确时间）
for (const t of kept) {
  if (!t.timestamp) {
    const rel = t.timeText.match(/^(\d+)\s*分钟/);
    const relH = t.timeText.match(/^(\d+)\s*小时/);
    if (rel) { t.timestamp = new Date(now - parseInt(rel[1], 10) * 60000).toISOString(); t.timestampSource = 'dom-relative'; }
    else if (relH) { t.timestamp = new Date(now - parseInt(relH[1], 10) * 3600000).toISOString(); t.timestampSource = 'dom-relative'; }
  }
}
const finalKept = kept.filter(t => t.timestamp);
snap.count = finalKept.length;
snap.tweets = finalKept;
snap.windowFilteredAt = new Date().toISOString();
snap.droppedOutsideWindow = dropped;
writeFileSync(`${WORK}/window-dropped.json`, JSON.stringify({ date: DAY, droppedCount: dropped.length, dropped }, null, 2));
const { atomicWrite } = await import(`${ROOT}/shared/lib/runtime.mjs`);
atomicWrite(`${ROOT}/apps/news/data/tweets-${DAY}.json`, JSON.stringify(snap, null, 2));
console.log(`时间回填+窗口过滤: 保留 ${finalKept.length} / 丢弃 ${dropped.length}`);
console.log('PIPELINE-DONE');
