// 作用：本轮重跑加速用的图片落盘器——直接经用户浏览器（CDP Proxy，origin 为 x.com）按 medium 档把推文媒体取回并落盘。
// 输入：apps/news/data/tweets-2026-09-16.json 中的 images / video.poster / card.image / quoted 媒体。
// 主要输出：reports/daily/2026-09-16/assets/news/<sha256(medium url)>.{jpg,png,...}；打印落盘统计。
// 说明：与 generate_report.mjs 使用同一套命名规则（reportImageAssetName + X_IMAGE_SIZE='medium'），
//       目的是让随后运行的生成器发现文件已存在，跳过本机不可达的 curl 尝试。
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectTweetImageUrls } from '/Users/wuyanzu/Desktop/FC/apps/news/x-media.mjs';

const root = '/Users/wuyanzu/Desktop/FC';
const DATE = '2026-09-16';
const SIZE = 'medium';
const PROXY = 'http://127.0.0.1:3456';
const imageDir = path.join(root, 'reports/daily', DATE, 'assets/news');
mkdirSync(imageDir, { recursive: true });

const { isCacheableXImage, originalXImageUrl, reportImageAssetName } = await import('/Users/wuyanzu/Desktop/FC/shared/lib/report-assets.mjs');

const snapshot = JSON.parse(readFileSync(path.join(root, 'apps/news/data', `tweets-${DATE}.json`), 'utf8'));

const queue = new Map();
for (const tweet of snapshot.tweets) {
  for (const image of collectTweetImageUrls(tweet)) {
    if (!isCacheableXImage(image)) continue;
    const url = originalXImageUrl(image, SIZE);
    const name = reportImageAssetName(url, SIZE);
    const target = path.join(imageDir, name);
    if (!existsSync(target)) queue.set(url, { url, target });
  }
}
const items = [...queue.values()];
console.log(`待落盘 ${items.length} 张（已有 ${readdirSync(imageDir).length} 张）`);

const targetsResp = await fetch(`${PROXY}/targets`).then(r => r.json());
const list = Array.isArray(targetsResp) ? targetsResp : (targetsResp.targets || []);
const host = list.find(t => typeof t?.url === 'string' && t.url.startsWith('https://x.com'));
if (!host) { console.error('没有可用的 x.com 宿主标签页'); process.exit(1); }
const tid = host.targetId || host.id;
console.log(`宿主标签页 ${tid} ${host.url}`);

const script = url => `(async () => {
  try {
    const r = await fetch(${JSON.stringify(url)});
    if (!r.ok) return JSON.stringify({ ok: false, error: 'HTTP ' + r.status });
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.byteLength) return JSON.stringify({ ok: false, error: 'empty body' });
    let s = '';
    for (let i = 0; i < buf.byteLength; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return JSON.stringify({ ok: true, bytes: buf.byteLength, b64: btoa(s) });
  } catch (e) { return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }); }
})()`;

const saved = [];
const failed = [];
let cursor = 0;
async function worker() {
  while (cursor < items.length) {
    const item = items[cursor++];
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(`${PROXY}/eval?target=${encodeURIComponent(tid)}`, {
          method: 'POST', body: script(item.url), signal: AbortSignal.timeout(45000),
        });
        const payload = await resp.json();
        if (payload.error) throw new Error(payload.error);
        const result = JSON.parse(payload.value);
        if (!result.ok) throw new Error(result.error || '未知错误');
        writeFileSync(item.target, Buffer.from(result.b64, 'base64'));
        if (statSync(item.target).size < 100) throw new Error('图片文件为空');
        saved.push(item.target);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise(r => setTimeout(r, 400 * attempt));
      }
    }
    if (lastError) failed.push({ url: item.url, error: lastError.message });
  }
}
await Promise.all(Array.from({ length: Number(process.env.CONC || 6) }, () => worker()));

const files = readdirSync(imageDir);
const total = files.reduce((s, f) => s + statSync(path.join(imageDir, f)).size, 0);
console.log(`落盘成功 ${saved.length} / 待落盘 ${items.length} | 失败 ${failed.length}`);
if (failed.length) console.log('失败样例:', JSON.stringify(failed.slice(0, 5)));
console.log(`assets/news 现有 ${files.length} 张 | ${(total / 1048576).toFixed(2)} MB`);
writeFileSync(path.join(root, 'automation/runs', DATE, 'news/work/prefetch-report.json'),
  JSON.stringify({ requests: items.length, saved: saved.length, failed, files: files.length, bytes: total }, null, 2));
