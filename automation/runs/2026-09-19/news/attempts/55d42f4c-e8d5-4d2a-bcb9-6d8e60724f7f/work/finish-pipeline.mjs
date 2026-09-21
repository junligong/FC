// 补完管道：合并原始抽取 → 写 tweets-D.json → enrich → syndication created_at 回填 → 24h 窗口过滤
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const DAY = '2026-09-19';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const WORK = `${ROOT}/automation/runs/${DAY}/news/work`;
const handles = ['EASFCDirect','easportsfc','fifa_romania','AsyFutTrader','FIFA22_INFO','FutSheriff','FutPoliceLeaks','FUTBIN','easysbc','Razzerstrading','EAFCassist','Fut_scoreboard','DetectiveFUT','FGZNews','futagentt','Futdonk'];
const merged = []; const seen = new Set();
for (const h of handles) {
  try {
    const raw = JSON.parse(readFileSync(`${WORK}/raw-${h}.json`, 'utf8'));
    for (const t of raw.tweets || []) { if (seen.has(t.id)) continue; seen.add(t.id); merged.push({ ...t, sourceAccount: h }); }
  } catch {}
}
console.log('merged raw tweets: ' + merged.length);
writeFileSync(`${ROOT}/apps/news/data/tweets-${DAY}.json`, JSON.stringify({ schemaVersion: 1, date: DAY, collectedAt: new Date().toISOString(), count: merged.length, tweets: merged }, null, 2));
execFileSync('node', [`${ROOT}/apps/news/enrich-tweet-media.mjs`, DAY], { stdio: 'inherit' });
const snap = JSON.parse(readFileSync(`${ROOT}/apps/news/data/tweets-${DAY}.json`, 'utf8'));
const now = Date.now(); const cutoff = now - 24 * 3600 * 1000;
async function fetchCreatedAt(id) {
  try {
    const res = await fetch('https://cdn.syndication.twimg.com/tweet-result?id=' + encodeURIComponent(id) + '&token=a&lang=zh', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', Accept: 'application/json' },
      signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const p = await res.json();
    return p && p.created_at ? p.created_at : null;
  } catch { return null; }
}
let cursor = 0;
async function worker() { while (cursor < snap.tweets.length) { const t = snap.tweets[cursor++]; const c = await fetchCreatedAt(t.id); if (c) { const ts = Date.parse(c); if (Number.isFinite(ts)) { t.timestamp = c; t.timestampSource = 'syndication'; } } } }
await Promise.all(Array.from({ length: 6 }, () => worker()));
const kept = []; const dropped = [];
for (const t of snap.tweets) {
  const ts = t.timestamp ? Date.parse(t.timestamp) : NaN;
  if (Number.isFinite(ts) && ts >= cutoff && ts <= now + 60000) kept.push(t);
  else dropped.push({ id: t.id, timeText: t.timeText, timestamp: t.timestamp, reason: Number.isFinite(ts) ? 'outside-24h' : 'no-timestamp' });
}
for (const t of kept) {
  if (!t.timestamp) {
    const rel = t.timeText.match(/^(\d+)\s*分钟/); const relH = t.timeText.match(/^(\d+)\s*小时/);
    if (rel) { t.timestamp = new Date(now - parseInt(rel[1], 10) * 60000).toISOString(); t.timestampSource = 'dom-relative'; }
    else if (relH) { t.timestamp = new Date(now - parseInt(relH[1], 10) * 3600000).toISOString(); t.timestampSource = 'dom-relative'; }
  }
}
const finalKept = kept.filter(t => t.timestamp);
snap.count = finalKept.length; snap.tweets = finalKept; snap.windowFilteredAt = new Date().toISOString(); snap.droppedOutsideWindow = dropped;
writeFileSync(`${WORK}/window-dropped.json`, JSON.stringify({ date: DAY, droppedCount: dropped.length, dropped }, null, 2));
writeFileSync(`${ROOT}/apps/news/data/tweets-${DAY}.json.tmp`, JSON.stringify(snap, null, 2));
execFileSync('mv', [`${ROOT}/apps/news/data/tweets-${DAY}.json.tmp`, `${ROOT}/apps/news/data/tweets-${DAY}.json`]);
console.log('时间回填+窗口过滤: 保留 ' + finalKept.length + ' / 丢弃 ' + dropped.length);
console.log('PIPELINE-DONE');
