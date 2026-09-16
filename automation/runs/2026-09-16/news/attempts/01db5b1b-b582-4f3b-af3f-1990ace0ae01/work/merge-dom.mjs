// 作用：本轮 news 重跑第 2 步的合并环节——把 DOM 时间线抽取结果并入当日快照。
// 输入：automation/runs/2026-09-16/news/work/dom/*.json + apps/news/data/tweets-2026-09-16.json（已有 94 条）。
// 主要输出：原地原子更新当日快照，只增不删，按推文 ID 去重；打印合并前后条数。
import { readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const root = '/Users/wuyanzu/Desktop/FC';
const DATE = '2026-09-16';
const dataFile = path.join(root, 'apps/news/data', `tweets-${DATE}.json`);
const domDir = path.join(root, 'automation/runs', DATE, 'news', 'work/dom');

const snapshot = JSON.parse(readFileSync(dataFile, 'utf8'));
const before = snapshot.tweets.length;
const ids = new Set(snapshot.tweets.map(t => t.id));

let added = 0;
let scanned = 0;
for (const file of readdirSync(domDir).filter(f => f.endsWith('.json'))) {
  const dom = JSON.parse(readFileSync(path.join(domDir, file), 'utf8'));
  for (const tweet of dom.tweets || []) {
    scanned++;
    if (!tweet.id || ids.has(tweet.id)) continue;
    ids.add(tweet.id);
    snapshot.tweets.push({
      id: tweet.id,
      text: tweet.text || '',
      author: tweet.author || '',
      handle: tweet.handle || '',
      url: tweet.url || `https://x.com/i/status/${tweet.id}`,
      timestamp: tweet.timestamp || '',
      timeText: tweet.timeText || '',
      hasVideo: Boolean(tweet.hasVideo),
      hasPhoto: Boolean(tweet.hasPhoto),
      hasCard: Boolean(tweet.hasCard),
      isRetweet: Boolean(tweet.isRetweet),
      source: 'dom-timeline-2026-09-16-rerun',
    });
    added++;
  }
}

snapshot.tweets.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
snapshot.count = snapshot.tweets.length;
snapshot.collectedAt = new Date().toISOString();

const tmp = `${dataFile}.tmp`;
writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
renameSync(tmp, dataFile);
console.log(`DOM 扫描 ${scanned} 条 | 新增 ${added} 条 | 快照 ${before} -> ${snapshot.count} 条`);
