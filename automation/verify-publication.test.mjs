// 作用：验证线上发布必须同时匹配本地内容哈希和指定日报日期。
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePublication } from './verify-publication.mjs';

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
