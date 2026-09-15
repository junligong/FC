// 作用：回归验证日期校验、新闻同日重跑保护、去重库保护和缺失板块合并行为。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, reportDate } from '../shared/lib/runtime.mjs';
import { inlineLocalReportImages, originalXImageUrl, reportImageAssetName } from '../shared/lib/report-assets.mjs';

test('拒绝不存在的日历日期', () => {
  assert.throws(() => reportDate('2026-02-30'));
  assert.throws(() => reportDate('yesterday'));
  assert.equal(reportDate('2026-09-07'), '2026-09-07');
});

test('X 原图保存为稳定资产并可内嵌到单文件报告', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-image-'));
  const assets = path.join(dir, 'assets/news');
  mkdirSync(assets, { recursive: true });
  const remote = 'https://pbs.twimg.com/media/example?format=jpg&name=small';
  const name = reportImageAssetName(remote);
  writeFileSync(path.join(assets, name), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.ok(originalXImageUrl(remote).endsWith('format=jpg&name=orig'));
  const html = inlineLocalReportImages(`<img src="assets/news/${name}">`, dir);
  assert.ok(html.includes('src="data:image/jpeg;base64,/9j/2Q=="'));
  rmSync(dir, { recursive: true, force: true });
});

test('新闻重跑保留当天卡片，损坏去重文件不被重置；合并正确区分缺失板块', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-regression-'));
  const data = path.join(dir, 'apps/news/data');
  const reports = path.join(dir, `reports/daily/${reportDate()}`);
  mkdirSync(data, { recursive: true });
  mkdirSync(reports, { recursive: true });
  const date = reportDate();
  const env = { ...process.env, FC_PROJECT_ROOT: dir, FC_REPORT_DATE: date, DUMATE_QIANFAN_PROXY: '' };
  const run = script => spawnSync(process.execPath, [path.join(root, script), date], {env, encoding: 'utf8'});
  const tweet = { id: '123456789', text: 'EA SPORTS FC™ 27 launch confirmed', translation: 'FC27 发售消息已确认',
    images: [], author: 'EA', handle: 'easportsfc', url: 'https://x.com/easportsfc/status/123456789', timestamp: new Date().toISOString() };
  writeFileSync(path.join(data, 'raw_tweets_latest.json'), '### Result\n' + JSON.stringify(JSON.stringify({tweets: [tweet]})));
  try {
    let result = run('apps/news/generate_report.mjs');
    assert.equal(result.status, 0, result.stderr);
    result = run('apps/news/generate_report.mjs');
    assert.equal(result.status, 0, result.stderr);
    const content = readFileSync(path.join(reports, 'news.html'), 'utf8');
    assert.equal((content.match(/<article /g) || []).length, 1);
    assert.ok(content.includes('发售消息已确认'));
    assert.ok(existsSync(path.join(data, 'seen_tweets.json.bak')));
    const backupSeen = JSON.parse(readFileSync(path.join(data, 'seen_tweets.json.bak'), 'utf8'));
    const currentSeen = JSON.parse(readFileSync(path.join(data, 'seen_tweets.json'), 'utf8'));
    assert.deepEqual(backupSeen.tweets.map(item => item.id), currentSeen.tweets.map(item => item.id));
    assert.ok(!existsSync(path.join(data, 'raw_tweets_latest.json.bak')));
    writeFileSync(path.join(data, 'seen_tweets.json'), '{broken');
    result = run('apps/news/generate_report.mjs');
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(path.join(data, 'seen_tweets.json'), 'utf8'), '{broken');
    assert.equal(readFileSync(path.join(reports, 'news.html'), 'utf8'), content);
    mkdirSync(path.join(dir, `reports/daily/${date}`), {recursive: true});
    writeFileSync(path.join(dir, `reports/daily/${date}/football.html`), `<html>${date}<script>const unfinished = []`);
    result = run('apps/portal/merge_daily_report.mjs');
    assert.equal(result.status, 0, result.stderr);
    const merged = readFileSync(path.join(dir, `reports/daily/${date}/summary.html`), 'utf8');
    assert.equal((merged.match(/<iframe /g) || []).length, 1);
    assert.ok(!merged.includes('任务已暂停'));
    assert.ok(!merged.includes('href="file:'));
    const index = readFileSync(path.join(dir, 'daily-merged/index.html'), 'utf8');
    assert.ok(!index.includes('⚽ 足球</span>'));
    assert.ok(!index.includes('archive-viewer'), '历史日报不再 base64 内嵌，改用独立文件链接');
    assert.ok(index.includes(`archive/${date}.html`), 'index 历史日报应为独立文件链接');
    assert.ok(!index.includes(`href="daily-report-${date}.html"`));
    // 历史日报独立归档文件应生成
    assert.ok(existsSync(path.join(dir, `daily-merged/archive/${date}.html`)), 'archive 目录应生成当日历史日报文件');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('足球三榜校验闸门拦截“射手榜被整段填成积分榜”的历史故障', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-boards-'));
  const date = '2026-09-11';
  const target = path.join(dir, 'football.html');
  const env = { ...process.env, FC_PROJECT_ROOT: dir, FC_FOOTBALL_HTML: target };
  const rows = "epl: [[1,'曼城 Manchester City',4,4,0,0,8,2,'+6',12],[2,'阿森纳 Arsenal',4,4,0,0,8,1,'+7',12]],";
  const good = `const standingsData = {${rows}};
const scorersData = {epl: [[1,'哈兰德 Erling Haaland','曼城 Man City',5]]};
const assistsData = {epl: [[1,'加克波 Cody Gakpo','利物浦 Liverpool',4]]};`;
  const bad = `const standingsData = {${rows}};
const scorersData = {${rows}};
const assistsData = {${rows}};`;
  const write = body => writeFileSync(target, `<html><body>${date}<script>${body}</script></body></html>`);
  const runCheck = () => spawnSync(process.execPath, [path.join(here, 'verify-football-boards.mjs'), date], { env, encoding: 'utf8' });
  try {
    write(bad);
    const failed = runCheck();
    assert.notEqual(failed.status, 0, '射手榜=积分榜 时必须判失败');
    assert.match(failed.stdout, /R4/, '应指出与积分榜重复');
    write(good);
    const passed = runCheck();
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
