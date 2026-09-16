#!/usr/bin/env node
// 作用：给当日推文快照补齐权威媒体信息（配图 / 视频封面与 mp4 / 链接卡片缩略图 / 被引用推文的配图）。
// 输入：apps/news/data/tweets-<D>.json（由采集阶段写入，至少含 id/text/timestamp/url）。
// 主要输出：原地原子更新同一个当日快照文件，为每条推文补上 mediaResolved / images / video / card / quoted；
//           打印一条统计行，并在 <work>/media-report.json 留下逐条结果，便于留证。
// 说明：只处理当日文件，不触碰去向库与其他日期快照；解析失败写 mediaResolved=false，绝不用旧数据顶替。
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { root, reportDate, atomicWrite, readJSON } from '../../shared/lib/runtime.mjs';
import { fetchTweetMedia, applyMediaToTweet } from './x-media.mjs';

const CONCURRENCY = 4;
const today = reportDate(process.argv[2] || process.env.FC_REPORT_DATE);
const DATA_DIR = path.join(root, 'apps/news/data');
const DAILY_FILE = path.join(DATA_DIR, `tweets-${today}.json`);
const WORK_DIR = path.join(root, 'automation/runs', today, 'news', 'work');
mkdirSync(WORK_DIR, { recursive: true });

const snapshot = readJSON(DAILY_FILE, null);
if (!snapshot || !Array.isArray(snapshot.tweets)) {
  console.error(`未找到当日推文快照：${DAILY_FILE}`);
  process.exitCode = 1;
} else if (snapshot.date !== today) {
  console.error(`快照日期 ${snapshot.date} 与目标日期 ${today} 不一致，拒绝改写`);
  process.exitCode = 1;
} else {
  const tweets = snapshot.tweets;
  const results = new Array(tweets.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tweets.length) {
      const index = cursor++;
      const tweet = tweets[index];
      const media = await fetchTweetMedia(tweet.id);
      results[index] = { id: tweet.id, ok: Boolean(media.ok), error: media.error || null };
      tweets[index] = applyMediaToTweet(tweet, media);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tweets.length) }, () => worker()));

  const enriched = {
    ...snapshot,
    count: tweets.length,
    mediaEnrichedAt: new Date().toISOString(),
    tweets,
  };
  atomicWrite(DAILY_FILE, JSON.stringify(enriched, null, 2));
  writeFileSync(path.join(WORK_DIR, 'media-report.json'), JSON.stringify({ date: today, results }, null, 2));

  const failed = results.filter(item => !item.ok);
  const photos = tweets.reduce((sum, t) => sum + (t.images?.length || 0), 0);
  const videos = tweets.filter(t => t.video).length;
  const cards = tweets.filter(t => t.card).length;
  const quotedWithImages = tweets.filter(t => t.quoted?.images?.length).length;
  console.log(`媒体解析: 共 ${tweets.length} 条 | 成功 ${tweets.length - failed.length} / 失败 ${failed.length}`);
  console.log(`配图 ${photos} 张（${tweets.filter(t => t.images?.length).length} 条推文）| 视频 ${videos} 条 | 链接卡片 ${cards} 条 | 被引用推文带图 ${quotedWithImages} 条`);
  if (failed.length) {
    console.log(`解析失败（将如实标记为媒体未解析）: ${failed.map(item => `${item.id}(${item.error})`).join(', ')}`);
  }
}
