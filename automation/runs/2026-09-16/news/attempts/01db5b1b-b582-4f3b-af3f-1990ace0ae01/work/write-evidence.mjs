// 作用：生成本轮 news 重跑的证据文件 automation/runs/2026-09-16/news/evidence.json。
// 输入：work/opened.tsv（实际打开的账号与打开时间）、work/dom/*.json（每账号抽取条数）、data/tweets-2026-09-16.json、assets/news 落盘结果。
// 主要输出：evidence.json（date / sources / dataCutoff / missingItems / 图片落盘统计）。
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = '/Users/wuyanzu/Desktop/FC';
const DATE = '2026-09-16';
const work = path.join(root, 'automation/runs', DATE, 'news', 'work');
const assetsDir = path.join(root, 'reports/daily', DATE, 'assets/news');

const tsv = readFileSync(path.join(work, 'opened.tsv'), 'utf8').trim().split('\n');
const snapshot = JSON.parse(readFileSync(path.join(root, 'apps/news/data', `tweets-${DATE}.json`), 'utf8'));

const sources = tsv.map(line => {
  const [handle, url, openedAt, count] = line.split('\t');
  const n = Number(count);
  return {
    handle,
    url,
    openedAt,
    tweetsInWindow: Number.isFinite(n) && n >= 0 ? n : 0,
    ok: Number.isFinite(n) && n >= 0,
  };
});

const timestamps = snapshot.tweets.map(t => t.timestamp).filter(Boolean).sort();
const dataCutoff = timestamps[timestamps.length - 1] || new Date().toISOString();

const files = existsSync(assetsDir) ? readdirSync(assetsDir).filter(f => !f.startsWith('.')) : [];
const totalBytes = files.reduce((sum, f) => {
  try { return sum + readFileSync(path.join(assetsDir, f)).length; } catch { return sum; }
}, 0);

const html = existsSync(path.join(root, 'reports/daily', DATE, 'news.html'))
  ? readFileSync(path.join(root, 'reports/daily', DATE, 'news.html'), 'utf8') : '';
const expected = new Set();
for (const t of snapshot.tweets) {
  for (const img of [...(t.images || []), ...(t.quoted?.images || [])]) expected.add(img);
  if (t.video?.thumbnail) expected.add(t.video.thumbnail);
  if (t.card?.image) expected.add(t.card.image);
  if (t.quoted?.video?.thumbnail) expected.add(t.quoted.video.thumbnail);
}
const remoteHotlinks = (html.match(/src="https?:\/\/pbs\.twimg\.com[^"]*"/g) || []).length;
const cardsInHtml = (html.match(/class="tweet-card"/g) || []).length;

const totalRequests = Number(process.env.ASSET_TOTAL || expected.size);
const landed = Number(process.env.ASSET_LANDED || files.length);
const failedCount = Number(process.env.ASSET_FAILED_COUNT || Math.max(0, totalRequests - landed));
const failedItems = [];
failedCount && failedItems.push(`共 ${failedCount} 张`);

const missingItems = [
  '图片落盘未完成：本轮需落盘 117 张 medium 档图片，实际仅落盘 2 张。curl 直连 pbs.twimg.com 失败属本环境预期现象，但浏览器兜底路径本轮同样不可用——在 x.com 页内 fetch 该 CDN 单次 22 秒无任何返回（挂起，非快速报错），generate_report.mjs 因此阻塞在图片落盘阶段约 11 分钟后被终止。这是本轮提交 partial 的直接原因。',
  '报告未按 medium 档重新生成：reports/daily/2026-09-16/news.html 仍是上一轮 14:14 的版本，其引用的 98 张 name=orig 资产已被清空，故报告内配图当前不可用；assets/news 目录现仅 2 个文件 / 0.26MB。',
  'X 账号主页时间线在后台标签页只渲染有限条数（本轮实测每账号 0–12 条，多数 3–11 条），滚到底后不再增长，24 小时窗口覆盖无法保证 100%。这是通道固有限制，非本轮回归。',
  'EASFCDirect（https://x.com/EASFCDirect）页面已成功打开并渲染 17 条推文，但其最新一条时间为 2026-09-15T00:47:28Z，早于本轮 24 小时窗口，故窗口内抽取 0 条，属「窗口内无新推文」而非采集失败。',
  '因 finish 硬上限为 startedAt+20 分钟（2026-09-16T14:37:49+08:00），本轮在第 15 分钟收口提交 partial，未继续等待图片落盘。',
];

if (remoteHotlinks > 0) {
  missingItems.push(`报告中仍有 ${remoteHotlinks} 处 pbs.twimg.com 远程热链，未落盘。`);
}

const evidence = {
  date: DATE,
  module: 'news',
  runId: process.env.RUN_ID || null,
  attempt: 'rerun',
  goal: '重跑：核验来源、按 medium 档重新落图、重新提交快照（上一轮误用 name=orig 导致单文件站点膨胀至 34MB）',
  startedAt: process.env.STARTED_AT || null,
  imagesTier: 'medium',
  sources,
  accountsOpened: sources.filter(s => s.ok).length,
  accountsTotal: sources.length,
  snapshotFile: `apps/news/data/tweets-${DATE}.json`,
  snapshotCount: snapshot.tweets.length,
  snapshotCountBeforeRerun: 94,
  newTweetsThisRun: snapshot.tweets.length - 94,
  dataCutoff,
  mediaResolvedFailed: snapshot.tweets.filter(t => t.mediaResolved === false).length,
  videoTweets: snapshot.tweets.filter(t => t.video).length,
  imageCount: snapshot.tweets.reduce((s, t) => s + (t.images || []).length, 0),
  cardsInReportHtml: cardsInHtml,
  assetRequests: totalRequests,
  assetsLanded: landed,
  assetsFailed: failedItems.length,
  assetDirBytes: totalBytes,
  assetDirMB: Number((totalBytes / 1048576).toFixed(2)),
  remoteHotlinks,
  missingItems,
  reportPath: `reports/daily/${DATE}/news.html`,
  evidenceWrittenAt: new Date().toISOString(),
};

writeFileSync(path.join(root, 'automation/runs', DATE, 'news/evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({
  accounts: `${evidence.accountsOpened}/${evidence.accountsTotal}`,
  snapshot: evidence.snapshotCount,
  cardsInHtml,
  assetRequests: totalRequests,
  assetsLanded: landed,
  assetsFailed: failedItems.length,
  assetDirMB: evidence.assetDirMB,
  remoteHotlinks,
}, null, 2));
