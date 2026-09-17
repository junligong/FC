// 作用：2026-09-17 资讯采集编排——经 Web Access CDP Proxy(:3456) 逐账号打开 X 主页后台标签页，
//       对页面执行 apps/news/extract-timeline.js 的抽取逻辑（仅取推文 ID/链接/作者/时间/正文/媒体存在标记），
//       汇总去重后原子写入 apps/news/data/tweets-2026-09-17.json，并输出逐账号采集证据。
// 输入：apps/news/sources.txt（账号清单）、apps/news/extract-timeline.js（抽取脚本）。
// 主要输出：apps/news/data/tweets-2026-09-17.json；automation/runs/2026-09-17/news/work/collect-log.json。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-17';
const PROXY = 'http://localhost:3456';
const SOURCES = path.join(ROOT, 'apps/news/sources.txt');
const EXTRACT = path.join(ROOT, 'apps/news/extract-timeline.js');
const OUT = path.join(ROOT, 'apps/news/data', `tweets-${D}.json`);
const LOG = path.join(ROOT, 'automation/runs', D, 'news/work/collect-log.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sources = fs.readFileSync(SOURCES, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.includes('https://x.com/'))
  .map((line) => {
    const m = line.match(/^(.*?)\s*https:\/\/x\.com\/(\w+)\s*$/);
    return { name: (m ? m[1] : '').trim().replace(/\t/g, ' ').trim(), handle: m[2], url: `https://x.com/${m[2]}` };
  });
console.log(`账号清单：${sources.length} 个`);
const extractScript = fs.readFileSync(EXTRACT, 'utf8');

function parseEvalResult(raw) {
  try {
    const outer = JSON.parse(raw);
    const inner = typeof outer === 'object' && outer !== null && ('result' in outer || 'value' in outer)
      ? (outer.result ?? outer.value)
      : outer;
    if (typeof inner === 'string') return JSON.parse(inner);
    return inner;
  } catch {
    try { return JSON.parse(raw); } catch { return null; }
  }
}

async function collectOne(src) {
  const rec = { name: src.name, handle: src.handle, url: src.url, openedAt: new Date().toISOString(), ok: false, count: 0, attempts: 0, error: null };
  let targetId = null;
  try {
    const newRes = await fetch(`${PROXY}/new`, { method: 'POST', body: src.url });
    const newJson = await newRes.json();
    targetId = newJson.targetId || newJson.id || newJson.target?.id;
    if (!targetId) throw new Error(`创建标签页失败: ${raw(newRes)}`);
    await sleep(4000);
    await fetch(`${PROXY}/scroll?target=${targetId}&y=1000`);
    await sleep(1500);
    for (let attempt = 1; attempt <= 3; attempt++) {
      rec.attempts = attempt;
      const evalRes = await fetch(`${PROXY}/eval?target=${targetId}`, { method: 'POST', body: extractScript });
      const rawText = await evalRes.text();
      const parsed = parseEvalResult(rawText);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tweets)) {
        rec.error = `eval 返回异常: ${rawText.slice(0, 200)}`;
        await sleep(3000);
        continue;
      }
      // 页面骨架/加载态兜底：0 条时多等再抽一次
      if (parsed.count === 0 && attempt < 3) {
        await sleep(4000);
        await fetch(`${PROXY}/scroll?target=${targetId}&y=2200`);
        await sleep(1500);
        continue;
      }
      rec.ok = true;
      rec.count = parsed.count;
      rec.error = null;
      return { rec, tweets: parsed.tweets.map((t) => ({ ...t, accountName: src.name, sourceHandle: src.handle })) };
    }
    return { rec, tweets: [] };
  } catch (err) {
    rec.error = String(err && err.message || err).slice(0, 300);
    return { rec, tweets: [] };
  } finally {
    if (targetId) {
      try { await fetch(`${PROXY}/close?target=${targetId}`); } catch {}
    }
  }
}

function raw(res) { return `status ${res.status}`; }

const allTweets = new Map();
const evidence = [];
for (const src of sources) {
  const { rec, tweets } = await collectOne(src);
  for (const t of tweets) if (t.id && !allTweets.has(t.id)) allTweets.set(t.id, t);
  evidence.push(rec);
  console.log(`${rec.ok ? 'OK ' : 'ERR'} @${src.handle} (${src.name}) → ${rec.count} 条 ${rec.error ? '| ' + rec.error : ''}`);
}

const tweets = [...allTweets.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
const snapshot = { date: D, count: tweets.length, collectedAt: new Date().toISOString(), tweets };
const tmp = OUT + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
fs.renameSync(tmp, OUT);
fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, JSON.stringify({ date: D, startedAt: evidence[0]?.openedAt, accounts: evidence }, null, 2));
console.log(`合计去重后 ${tweets.length} 条 → ${OUT}`);
const opened = evidence.filter((e) => e.ok).length;
console.log(`账号覆盖: ${opened}/${evidence.length}`);
