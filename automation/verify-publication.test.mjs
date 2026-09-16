// 作用：验证线上发布必须同时匹配本地内容哈希和指定日报日期。
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePublication, buildPublishStatus } from './verify-publication.mjs';

const html = Buffer.from('<html><a href="archive/2026-09-09.html">日报</a><h1>2026-09-09 每日日报</h1></html>');
test('only matching complete current archive verifies', () => {
  assert.equal(comparePublication(html, html, '2026-09-09').verified, true);
  assert.equal(comparePublication(html, html, '2026-09-10').verified, false);
  assert.equal(comparePublication(html, Buffer.from('<html>2026-09-09</html>'), '2026-09-09').verified, false);
  const truncated = html.subarray(0, -7);
  assert.equal(comparePublication(truncated, truncated, '2026-09-09').verified, false);
  const stale = Buffer.from(html.toString().replace('日报', '旧日报'));
  assert.equal(comparePublication(html, stale, '2026-09-09').verified, false);
});

// 同日「先失败、后重跑成功」时，若沿用上一轮的失败记账，会出现
// 「published:true 却写着 failureCause / no_current_snapshot」的自相矛盾记录。
test('successful verification drops stale failure bookkeeping', () => {
  const previous = {
    published: null,
    reason: '未能确认当前本地版本已上线，详见 publicVerification',
    mergeResult: 'no_current_snapshot',
    publishResult: 'skipped',
    modules: { football: 'failed', news: 'failed', market: 'failed', evolution: 'failed' },
    failureCause: '浏览器通道不可用',
    unattendedPublishingVerified: false,
  };
  const coordinator = {
    merge: 'success',
    publish: 'delegated',
    modules: {
      football: { status: 'partial', runId: 'run-fb' },
      news: { status: 'partial', runId: 'run-news' },
      market: { status: 'partial', runId: 'run-mkt' },
      evolution: { status: 'partial', runId: 'run-evo' },
    },
  };
  const status = buildPublishStatus({
    previous,
    verification: { verified: true, localSha256: 'abc', remoteSha256: 'abc' },
    date: '2026-09-16',
    localIndexHtml: '/tmp/index.html',
    coordinator,
  });
  assert.equal(status.published, true);
  assert.equal('failureCause' in status, false);
  assert.equal(status.mergeResult, 'success');
  assert.equal(status.publishResult, 'delegated');
  assert.deepEqual(status.modules, { football: 'partial', news: 'partial', market: 'partial', evolution: 'partial' });
  assert.equal(status.runIds.football, 'run-fb');
});

// 验证失败时必须保留失败原因，供排查使用。
test('failed verification keeps failure bookkeeping', () => {
  const status = buildPublishStatus({
    previous: { failureCause: '浏览器通道不可用', mergeResult: 'no_current_snapshot' },
    verification: { verified: false, error: '公网 HTTP 503' },
    date: '2026-09-16',
    localIndexHtml: '/tmp/index.html',
    coordinator: { merge: 'success', publish: 'delegated', modules: {} },
  });
  assert.equal(status.published, null);
  assert.equal(status.failureCause, '浏览器通道不可用');
  assert.equal(status.mergeResult, 'no_current_snapshot');
});
