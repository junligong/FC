/* 作用：把本轮 DOM 抽取结果合并进当日快照（一次性脚本，位于 work 目录）。
 * 输入：automation/runs/2026-09-16/news/work/dom-timelines.json + apps/news/data/tweets-2026-09-16.json
 * 输出：原地原子更新 apps/news/data/tweets-2026-09-16.json（只新增本轮发现的新推文 ID，不覆盖已有条目的媒体/翻译）
 * 说明：不做去重库写入，seen_tweets.json 只由 generate_report.mjs 更新。
 */
import fs from 'node:fs';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const SNAPSHOT = `${ROOT}/apps/news/data/tweets-2026-09-16.json`;
const DOM = `${ROOT}/automation/runs/2026-09-16/news/work/dom-timelines.json`;

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const dom = JSON.parse(fs.readFileSync(DOM, 'utf8'));

const existing = new Set(snapshot.tweets.map((t) => t.id));
const added = [];
for (const src of dom.sources) {
  for (const t of src.tweets) {
    if (existing.has(t.id)) continue;
    existing.add(t.id);
    added.push({
      id: t.id,
      text: t.text,
      author: t.author,
      handle: t.handle,
      url: t.url,
      timestamp: t.timestamp,
      timeText: t.timeText,
      hasVideo: !!t.hasVideo,
      hasPhoto: !!t.hasPhoto,
      hasCard: !!t.hasCard,
      sourceType: 'x',
    });
  }
}

snapshot.tweets = snapshot.tweets.concat(added);
snapshot.count = snapshot.tweets.length;
snapshot.collectedAt = new Date().toISOString();

const tmp = `${SNAPSHOT}.tmp-${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 1));
fs.renameSync(tmp, SNAPSHOT);

console.log(`新增 ${added.length} 条，快照共 ${snapshot.tweets.length} 条`);
console.log(`新增明细: ${added.map((a) => a.handle + '/' + a.id).join(', ') || '（无）'}`);
