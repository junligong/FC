/* 作用：在浏览器里逐卡提取 FC27 传奇卡（Icon）的 FUTBIN 价格区间（最低价 / 最高价）与双平台当前价。
 * 输入：batch —— [{ id, url }]，url 为 FUTBIN 球员详情页绝对地址。
 * 主要输出：JSON 字符串 { results:[{ id, ok, min, max, rangeText, updatedAt, updatedText, priceUpdatedAt, current:{console,pc}, estimate, status, error }] }
 *
 * 事实依据（2026-09-17 实机核验，勿凭印象改动）：
 *   1. 详情页是**服务端渲染**的，"Price Range: 69,000 - 2,100,000" 与 "Price Updated: N mins ago"
 *      直接存在于返回的 HTML 中，因此可用 fetch + DOMParser 解析，无需整页导航（单卡约 1.2 秒）。
 *   2. **价格区间是卡级的，不是平台级的**：同一张卡的 platform-ps-only 与 platform-pc-only
 *      两个价格盒渲染出**完全相同**的区间值（2026-09-17 对 20 张卡批量比对，差异数为 0）。
 *      因此本脚本只落一份 min/max，绝不伪造「每平台各一套区间」。
 *   3. 平台级的「当前价」取自各平台价格盒内的 lowest-price 单元格（.lowest-price-1）；
 *      未开服前普遍为 0，属占位值，需由调用侧按 <1000 判无效，不得当作成交价。
 *   4. FUTBIN 会限流：同页并发 5 时出现 HTTP 429。因此这里用**串行 + 间隔**，并对 429/5xx 退避重试。
 *
 * 用法：由 collect-icon-priceranges.mjs 经 Web Access 的 CDP Proxy（:3456/eval）注入执行；
 *      宿主标签页的 origin 必须是 https://www.futbin.com，否则同源策略会拦掉请求。
 */

// 注意：注入浏览器的代码是独立作用域，**不能**引用本模块的变量/函数，
// 所有辅助函数必须在下面的模板字符串内部重新定义。

/**
 * 构造注入浏览器执行的抽取脚本。
 * @param {{id:string,url:string}[]} batch 一批待抽取的卡（建议 6~10 张，保持单次 eval 在 30 秒内）
 * @param {{gapMs?:number, attempts?:number}} [opts] 卡间隔毫秒与重试次数
 */
export function buildPriceRangeScript(batch, opts = {}) {
  const gapMs = Number.isFinite(opts.gapMs) ? opts.gapMs : 350;
  const attempts = Number.isFinite(opts.attempts) ? opts.attempts : 3;
  // 用 JSON.stringify 注入，避免 URL / 卡名里的引号与 & 破坏脚本
  return `(async () => {
  const BATCH = ${JSON.stringify(batch)};
  const GAP = ${gapMs};
  const ATTEMPTS = ${attempts};
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 把 "1,234,567" 这类文本转成数字；取不到有效数字一律返回 null（如实空状态）
  function parseCoins(text) {
    if (typeof text !== 'string') return null;
    const m = /([\\d][\\d,]*)/.exec(text.replace(/\\s+/g, ' ').trim());
    if (!m) return null;
    const v = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(v) ? v : null;
  }

  async function fetchWithBackoff(url) {
    let last = null;
    for (let i = 1; i <= ATTEMPTS; i++) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (r.status === 200) return { html: await r.text(), status: 200 };
        last = 'HTTP ' + r.status;
        // 429/5xx 退避后重试；403 是站点级拦截，重试无益，直接抛给调用侧判定
        if (r.status === 403) return { html: null, status: 403 };
        if (r.status !== 429 && r.status < 500) return { html: null, status: r.status };
      } catch (e) {
        last = String(e && e.message ? e.message : e);
      }
      await sleep(600 * i * i);
    }
    return { html: null, status: 0, error: last };
  }

  // 取某个平台价格盒里的当前价（lowest-price-1），读不到则 null
  function currentOf(doc, platClass) {
    const box = doc.querySelector('div.price-box.' + platClass);
    if (!box) return null;
    const el = box.querySelector('.lowest-price-1');
    if (!el) return null;
    const txt = el.textContent.replace(/\\s+/g, ' ').trim();
    return txt ? txt : null;
  }

  const results = [];
  for (let idx = 0; idx < BATCH.length; idx++) {
    const item = BATCH[idx];
    const row = { id: String(item.id), url: item.url, ok: false };
    try {
      const res = await fetchWithBackoff(item.url);
      if (!res.html) {
        row.status = res.status;
        row.error = res.error || ('HTTP ' + res.status);
        results.push(row);
        await sleep(GAP);
        continue;
      }
      const doc = new DOMParser().parseFromString(res.html, 'text/html');
      row.status = 200;

      // 价格区间：取第一个价格盒里的 price-box-full-width
      const full = doc.querySelector('div.price-box-full-width');
      const fullText = full ? full.textContent.replace(/\\s+/g, ' ').trim() : '';
      row.rangeText = fullText || null;
      const ru = /Price Updated:\\s*([^]*)Price Range/i.exec(fullText);
      row.updatedText = ru ? ru[1].trim() : null;

      // 区间值形如 "69,000 - 2,100,000"；解析失败即如实留空
      const rangeEl = doc.querySelectorAll('div.price-box-full-width div');
      let rangeStr = null;
      for (const el of rangeEl) {
        const t = el.textContent.replace(/\\s+/g, ' ').trim();
        if (/\\d[\\d,]*\\s*-\\s*\\d[\\d,]*/.test(t) && !/Price/i.test(t)) { rangeStr = t; break; }
      }
      if (rangeStr) {
        const m = /([\\d][\\d,]*)\\s*-\\s*([\\d][\\d,]*)/.exec(rangeStr);
        if (m) { row.min = parseCoins(m[1]); row.max = parseCoins(m[2]); }
      }

      // 标题形如 "SCHOLES - Icon EA FC 27 Prices and Rating"，只取卡名段，避免把整串标题当名字
      row.title = (doc.title || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
      const h1 = doc.querySelector('div.player-header-name, h1');
      const rawName = h1 ? h1.textContent.replace(/\\s+/g, ' ').trim() : row.title;
      row.name = rawName ? rawName.split(' - ')[0].trim().slice(0, 60) : null;

      // 双平台当前价（未开服前多为 0，属占位）
      row.current = {
        console: parseCoins(currentOf(doc, 'platform-ps-only')),
        pc: parseCoins(currentOf(doc, 'platform-pc-only')),
      };
      // 开服前估值列（IS），单独记录，绝不与平台成交价混同
      const isEl = doc.querySelector('div.platform-price-wrapper-medium.player-card-item-score');
      row.estimate = isEl ? parseCoins(isEl.textContent.replace(/K$/i, '')) : null;
      // K 后缀（如 "60K"）需要单独放大
      if (isEl && /K/i.test(isEl.textContent) && row.estimate !== null) row.estimate = row.estimate * 1000;

      row.ok = typeof row.min === 'number' && typeof row.max === 'number';
      if (!row.ok) row.error = '未解析到价格区间';
    } catch (e) {
      row.error = String(e && e.message ? e.message : e);
    }
    results.push(row);
    if (idx < BATCH.length - 1) await sleep(GAP);
  }
  return JSON.stringify({ count: results.length, ok: results.filter(r => r.ok).length, results });
})()`;
}

export default buildPriceRangeScript;
