// 作用：当 curl/node 直连 pbs.twimg.com 失败时，改由用户浏览器把图片取回来落盘。
// 输入：待下载项 [{ url, target }]（target 为绝对文件路径）。
// 主要输出：{ saved, failed, host }；saved 里是成功落盘的文件，failed 里带可见错误摘要。
//
// 背景：本项目运行环境设有出口代理，pbs.twimg.com 在沙箱内不可达（直连被 reset、走代理 TLS 握手失败），
// 而用户浏览器能正常访问该 CDN。因此图片下载统一“先本地、后浏览器”：本地成功就不打扰浏览器。
// 浏览器侧要求页面 origin 为 https://x.com，否则该 CDN 的 CORS 不放行；这里优先复用已有的 x.com 标签页，
// 没有才自己开一个轻量页（/robots.txt，不加载完整应用），用完只关自己开的那个。
import { writeFileSync, statSync } from 'node:fs';

const DEFAULT_PROXY = 'http://127.0.0.1:3456';
const HOST_PAGE = 'https://x.com/robots.txt';
const MIN_BYTES = 100;

// 构造浏览器侧取图脚本。导出以便测试 URL 注入是否安全（URL 里常带 & 与 ?，不能直接拼接）。
export function buildImageFetchScript(url) {
  // 注意：URL 用 JSON.stringify 注入，避免引号/& 造成脚本破损
  return `(async () => {
  try {
    const r = await fetch(${JSON.stringify(url)});
    if (!r.ok) return JSON.stringify({ ok: false, error: 'HTTP ' + r.status });
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.byteLength) return JSON.stringify({ ok: false, error: 'empty body' });
    let s = '';
    for (let i = 0; i < buf.byteLength; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return JSON.stringify({ ok: true, bytes: buf.byteLength, b64: btoa(s) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) });
  }
})()`;
}

async function proxyEval(proxyBase, targetId, expression, timeoutMs) {
  const response = await fetch(`${proxyBase}/eval?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: expression,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  if (typeof payload.value !== 'string') throw new Error(`proxy eval 返回异常: ${JSON.stringify(payload).slice(0, 120)}`);
  return payload.value;
}

// 找一个可用的 x.com 宿主标签页。**始终自己新建**，不复用已有标签页：
// 复用来的页可能是半天没动过的账号页，在后台会被 Chrome 冻结（JS 停摆、fetch 永不返回），
// 一挂就是几十秒，批量取图整体卡死。自建 + 用完只关自己开的，既可靠也不会误动用户的 tab。
async function createHost(proxyBase, timeoutMs) {
  const response = await fetch(`${proxyBase}/new`, { method: 'POST', body: HOST_PAGE, signal: AbortSignal.timeout(timeoutMs) });
  const created = await response.json();
  if (!created.targetId) throw new Error('无法创建下载宿主标签页');
  // 等页面 origin 就绪（该 CDN 的 CORS 只放行 https://x.com，origin 没起来就取不到图）
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const origin = await proxyEval(proxyBase, created.targetId, 'location.origin', 8000);
      if (String(origin).includes('x.com')) return created.targetId;
    } catch { /* 页面还没准备好，继续等 */ }
  }
  throw new Error('下载宿主页未就绪');
}

async function closeTarget(proxyBase, targetId) {
  try { await fetch(`${proxyBase}/close?target=${encodeURIComponent(targetId)}`, { signal: AbortSignal.timeout(5000) }); } catch { /* 关闭失败不影响结果 */ }
}

// 并发把图片经浏览器取回并落盘。任何失败都只记进 failed，不抛错。
// 默认串行：单张约 0.3–1 秒，百余张也在半分钟内，换来的是可预测、不依赖后台页是否被冻结。
export async function downloadImagesViaBrowser(items, { proxyBase = DEFAULT_PROXY, concurrency = 1, timeoutMs = 20000, attempts = 2 } = {}) {
  const queue = [...items];
  if (!queue.length) return { saved: [], failed: [], host: null };
  let hostId = await createHost(proxyBase, timeoutMs);
  const saved = [];
  const failed = [];
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      let lastError = null;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const raw = await proxyEval(proxyBase, hostId, buildImageFetchScript(item.url), timeoutMs);
          const result = JSON.parse(raw);
          if (!result.ok) throw new Error(result.error || '未知错误');
          writeFileSync(item.target, Buffer.from(result.b64, 'base64'));
          if (statSync(item.target).size < MIN_BYTES) throw new Error('图片文件为空');
          saved.push({ url: item.url, target: item.target, bytes: result.bytes, attempt });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < attempts) {
            // 失败很可能是宿主页被冻结：换一个全新的宿主页再试
            await closeTarget(proxyBase, hostId);
            hostId = await createHost(proxyBase, timeoutMs);
          }
        }
      }
      if (lastError) failed.push({ url: item.url, target: item.target, error: lastError?.message || String(lastError) });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, () => worker()));
  await closeTarget(proxyBase, hostId);
  return { saved, failed, host: hostId };
}
