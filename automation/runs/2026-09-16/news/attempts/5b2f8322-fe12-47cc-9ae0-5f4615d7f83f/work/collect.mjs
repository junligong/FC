/* 作用：news 模块当日重跑的 DOM 抽取编排器（临时脚本，位于 work 目录）。
 * 输入：work/accounts.txt（16 个 X 账号 URL）、work/target.txt（本任务自建的 CDP targetId）。
 * 主要输出：work/raw_<NN>.json（每个账号的抽取原文）、work/timeline.json（合并去重后的推文）、
 *          work/opened.json（每个账号的实际打开时间与条数，供 evidence.json 使用）。
 * 说明：媒体地址一律不在此处解析，只保留 hasVideo/hasPhoto/hasCard 标记，交由 enrich-tweet-media.mjs。
 */
import fs from 'node:fs';
import path from 'node:path';

const W = 'automation/runs/2026-09-16/news/work';
const PROXY = 'http://localhost:3456';
const START = Date.parse('2026-09-16T06:08:56.919Z');
const COLLECT_DEADLINE = START + 9 * 60 * 1000;

const accounts = fs.readFileSync(path.join(W, 'accounts.txt'), 'utf8').trim().split('\n').map(s => s.trim()).filter(Boolean);
const target = fs.readFileSync(path.join(W, 'target.txt'), 'utf8').trim();
const script = fs.readFileSync('apps/news/extract-timeline.js', 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const shanghai = d => {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return t.toISOString().replace('Z', '+08:00');
};

async function evalJs(code) {
  const res = await fetch(`${PROXY}/eval?target=${target}`, { method: 'POST', body: code });
  const txt = await res.text();
  let j;
  try { j = JSON.parse(txt); } catch { return null; }
  const v = typeof j.value === 'string' ? j.value : j.value;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v ?? null;
}

async function navigate(url) {
  await fetch(`${PROXY}/navigate?target=${target}`, { method: 'POST', body: url });
}

const merged = new Map();
const opened = [];
let idx = 0;

for (const url of accounts) {
  idx += 1;
  const nn = String(idx).padStart(2, '0');
  if (Date.now() > COLLECT_DEADLINE) {
    opened.push({ url, openedAt: shanghai(new Date()), count: 0, status: 'skipped-time-budget' });
    continue;
  }
  await navigate(url);
  // 轮询等待目标内容（推文卡片）出现，最多约 15 秒
  let count = 0;
  for (let i = 0; i < 10; i++) {
    await sleep(1500);
    const probe = await evalJs('document.querySelectorAll(\'article[data-testid="tweet"]\').length');
    count = Number(probe) || 0;
    if (count > 0) break;
  }
  const openedAt = shanghai(new Date());
  let out = { count: 0, tweets: [] };
  const first = await evalJs(script);
  if (first && Array.isArray(first.tweets)) out = first;
  // 滚到底触发懒加载后再抽一次，取并集（已知限制：后台标签页滚到底后不再增长）
  const scrollTo = async (y) => { await fetch(`${PROXY}/scroll?target=${target}&y=${y}`); };
  const before = out.tweets.length;
  for (const y of [2000, 5000, 9000]) {
    await scrollTo(y);
    await sleep(1200);
  }
  const second = await evalJs(script);
  if (second && Array.isArray(second.tweets)) {
    const known = new Set(out.tweets.map(t => t.id));
    for (const t of second.tweets) if (!known.has(t.id)) { known.add(t.id); out.tweets.push(t); }
  }
  fs.writeFileSync(path.join(W, `raw_${nn}.json`), JSON.stringify({ account: url, openedAt, first, second, added: out.tweets.length - before }, null, 1));
  for (const t of out.tweets) if (!merged.has(t.id)) merged.set(t.id, t);
  opened.push({ url, openedAt, count: out.tweets.length, domArticles: count, status: 'ok' });
  console.log(`${nn} ${url} domArticles=${count} extracted=${out.tweets.length} merged=${merged.size}`);
}

fs.writeFileSync(path.join(W, 'timeline.json'), JSON.stringify({ tweets: [...merged.values()] }, null, 1));
fs.writeFileSync(path.join(W, 'opened.json'), JSON.stringify(opened, null, 1));
console.log('DONE merged=' + merged.size + ' opened=' + opened.filter(o => o.status === 'ok').length + '/' + accounts.length);
