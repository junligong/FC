// 作用：回归验证日期校验、新闻同日重跑保护、去重库保护和缺失板块合并行为。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, reportDate } from '../shared/lib/runtime.mjs';

test('拒绝不存在的日历日期', () => {
  assert.throws(() => reportDate('2026-02-30'));
  assert.throws(() => reportDate('yesterday'));
  assert.equal(reportDate('2026-09-07'), '2026-09-07');
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
  const tweet = { id: '123456789', text: 'FC27 launch confirmed', translation: 'FC27 发售消息已确认',
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
    assert.ok(!existsSync(path.join(data, 'seen_tweets.json.bak')));
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
    assert.ok(index.includes('archive-viewer'));
    assert.ok(index.includes(`#report-${date}`));
    assert.ok(!index.includes(`href="daily-report-${date}.html"`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
