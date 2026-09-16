/* 作用：把本轮 DOM 抽取到的新推文合并进当日快照（只增不删，同 ID 去重）。
 * 输入：apps/news/data/tweets-<D>.json（已有条目，保留不动）、work/timeline.json（本轮抽取结果）。
 * 主要输出：原地原子更新当日快照；work/added.json 记录本轮新增条目，供人工翻译使用。
 */
import fs from 'node:fs';

const D = '2026-09-16';
const FILE = `apps/news/data/tweets-${D}.json`;
const W = `automation/runs/${D}/news/work`;

const snap = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (snap.date !== D) throw new Error('快照日期不符，拒绝改写');
const before = snap.tweets.length;
const existing = new Set(snap.tweets.map(t => t.id));

const timeline = JSON.parse(fs.readFileSync(`${W}/timeline.json`, 'utf8'));
const added = [];
for (const t of timeline.tweets || []) {
  if (!t.id || existing.has(t.id)) continue;
  existing.add(t.id);
  added.push({
    id: t.id,
    text: t.text || '',
    author: t.author || '',
    handle: t.handle || '',
    url: t.url || `https://x.com/${t.handle}/status/${t.id}`,
    timestamp: t.timestamp || '',
    timeText: t.timeText || '',
    hasVideo: !!t.hasVideo,
    hasPhoto: !!t.hasPhoto,
    hasCard: !!t.hasCard,
    images: [],
    translation: '',
    sourceType: 'standard',
    localImages: [],
  });
}

snap.tweets = [...snap.tweets, ...added];
snap.count = snap.tweets.length;
fs.writeFileSync(`${W}/added.json`, JSON.stringify(added, null, 1));
const tmp = `${FILE}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(snap, null, 2));
fs.renameSync(tmp, FILE);

console.log(`快照合并：${before} -> ${snap.count}（本轮新增 ${added.length} 条）`);
for (const t of added) {
  console.log(`\n--- ${t.handle} | ${t.timestamp} | v=${t.hasVideo} p=${t.hasPhoto} c=${t.hasCard}\n${t.text}`);
}
