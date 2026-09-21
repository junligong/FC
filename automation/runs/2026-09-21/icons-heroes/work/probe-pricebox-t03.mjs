// 一次性探针（只读，不写任何产物）：复核 21880 布兰科 / 21779 里瓦尔多 的 Console 价格盒取值。
// 目的：确认「有效平台价 == FUTBIN 区间上沿 15,000,000」是真实挂单价还是取数口径问题。
// 通道：CDP Proxy(:3456) + 宿主页 https://www.futbin.com/robots.txt + 页内同源 fetch（契约第 6 条口径）。
const PROXY = 'http://127.0.0.1:3456';
const HOST = 'https://www.futbin.com/robots.txt';

const created = await (await fetch(`${PROXY}/new`, { method: 'POST', body: HOST })).json();
console.log('宿主页 targetId =', created.targetId);
const target = created.targetId;

const script = `(async () => {
  const out = [];
  const urls = [
    ['21880','https://www.futbin.com/27/player/21880/blanc'],
    ['21779','https://www.futbin.com/27/player/21779/kaka'],
    ['21806','https://www.futbin.com/27/player/21806/kelly-smith'],
  ];
  for (const [id,url] of urls) {
    try {
      const r = await fetch(url, { credentials:'include' });
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html,'text/html');
      const psBox = doc.querySelector('div.price-box.platform-ps-only');
      const pcBox = doc.querySelector('div.price-box.platform-pc-only');
      const low = (b) => { const e=b&&b.querySelector('.lowest-price-1'); return e?e.textContent.replace(/\\s+/g,' ').trim():null; };
      const full = doc.querySelector('div.price-box-full-width');
      out.push({
        id, status:r.status,
        consoleLowest: low(psBox),
        pcLowest: low(pcBox),
        rangeText: full ? full.textContent.replace(/\\s+/g,' ').trim().slice(0,200) : null,
        psBoxText: psBox ? psBox.textContent.replace(/\\s+/g,' ').trim().slice(0,300) : null,
        title: (doc.title||'').slice(0,80),
      });
    } catch(e) { out.push({ id, error:String(e&&e.message?e.message:e) }); }
    await new Promise(s=>setTimeout(s,1200));
  }
  return JSON.stringify(out);
})()`;

const res = await (await fetch(`${PROXY}/eval?target=${encodeURIComponent(target)}`, { method: 'POST', body: script, signal: AbortSignal.timeout(90000) })).json();
if (res && res.value) {
  const arr = JSON.parse(res.value);
  for (const o of arr) console.log(JSON.stringify(o, null, 1));
} else console.log('代理返回异常:', JSON.stringify(res).slice(0, 400));
try { await fetch(`${PROXY}/close?target=${encodeURIComponent(target)}`); } catch {}
