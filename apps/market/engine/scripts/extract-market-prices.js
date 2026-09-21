/* 作用：在浏览器内提取 FUTBIN FC27 热门榜（/27/popular）与热门进化榜（/27/popular/evolutions）的卡片数据。
 * 两个入口：
 *   - buildMarketListScript(page)        —— 宿主标签页已**导航**到目标 URL 时，对实时 document 抽取（保留兼容）
 *   - buildMarketListFetchScript(reqs)   —— 宿主页停在轻量 futbin.com 页时，**页内同源 fetch** 目标页再抽取（推荐）
 * 主要输出：JSON { byPage|url, count, cards:[{ url, slug, name, rating, pos, altPos, futbinRating, psPriceRaw,
 *            pcPriceRaw, psPrice, pcPrice, scoreRaw, popularity, evoName, cardVersion, stats }] }
 *
 * 事实依据（2026-09-17 首测，2026-09-20 复核，勿凭印象改动）：
 *   1. 卡片容器是 `a.playercard-wrapper`，最近的外层 `.column` 内含全部字段。
 *   2. **每一行同时渲染两个平台价格单元格**：`.platform-ps-only .price-segment`（Console）与
 *      `.platform-pc-only .price-segment`（PC）。页顶平台按钮只是纯前端显隐切换（不刷新、不改 URL、不重取数），
 *      因此**一次取页即可同时拿到两个平台价**，不要为切换平台重复取页。
 *   3. `.item-score-segment` 是卡片评分/指数位，**不是**任何平台的成交价，只作参考记录，绝不作为价格参与计算。
 *   4. 热度计数在 `.xxs-font.bold`（形如 "348"）；进化卡额外有 `.og-pill` 提供进化名。
 *   5. 价格文本形如 "5.9K" / "3M" / "0"；"0" 表示该平台尚未更新，属占位值（调用侧按 <1000 判无效）。
 *      **2026-09-20 实测**：该列文本会变成「币价 \n 涨跌徽标(如 14.29%)」，故价格只取**首个非空行**，
 *      徽标行必须丢弃（开服前不得计算涨跌）。见 parseCoins。
 *   6. **`/27/popular` 是服务端渲染的**（2026-09-20 实测：页内 fetch 原始 HTML 即含 250 个
 *      `a.playercard-wrapper`，`evolutions` 含 500 个），所以**不需要导航、不需要轮询等卡片出现**。
 *      旧注释「列表页是客户端渲染、必须轮询」已被实测推翻。
 *   7. 频繁**新建标签页直达** FUTBIN 可能被 Cloudflare 下发「Just a moment」挑战页，
 *      此时 `Runtime.evaluate` 持续抛 `Uncaught`（2026-09-20 17/18 两轮共 12 次建页全败）。
 *      停在 `/robots.txt` 这类轻量同源页再页内 fetch 可稳定绕开（与 collect-icons-list.mjs 一致）。
 */

// 注意：注入浏览器的代码是独立作用域，不能引用本模块的变量/函数，所有辅助函数必须在模板字符串内部重新定义。
const CARD_HELPERS = `
  // "5.9K" / "3M" / "1,234" / "0" → 数字；无法解析一律 0（如实空值，不猜测）
  function parseCoins(text) {
    if (typeof text !== 'string') return 0;
    // 行结构变化：价格单元格文本为「币价 \\n 涨跌徽标」。价格固定在首个非空行，徽标行丢弃。
    const lines = text.split('\\n').map(s => s.replace(/\\s+/g, ' ').trim()).filter(s => s.length > 0);
    const t = (lines[0] || '').replace(/,/g, '');
    const m = /^([\\d.]+)\\s*([KM]?)$/i.exec(t);
    if (!m) return 0;
    let v = parseFloat(m[1]);
    if (!Number.isFinite(v)) return 0;
    const unit = m[2].toUpperCase();
    if (unit === 'K') v *= 1000;
    if (unit === 'M') v *= 1000000;
    return Math.round(v);
  }
  function parseCount(text) {
    if (typeof text !== 'string') return null;
    const v = parseInt(text.trim().replace(/,/g, ''), 10);
    return Number.isFinite(v) ? v : null;
  }

  // 对任意 document 抽取（实时页传 document，页内 fetch 传 DOMParser 结果）
  function extractCards(doc) {
    const seen = new Set();
    const cards = [];
    let rank = 0;
    for (const a of doc.querySelectorAll('a.playercard-wrapper')) {
      const href = a.getAttribute('href') || '';
      // 进化卡 URL 形如 /27/player/1272_8/pierre-emerick-aubameyang（带版本后缀），用整段 href 去重
      if (!href || seen.has(href)) continue;
      seen.add(href);
      rank++;
      const col = a.closest('.column') || a.parentElement || a;

      const q = sel => { const el = col.querySelector(sel); return el ? el.innerText.trim() : null; };
      const psRaw = q('.platform-ps-only .price-segment');
      const pcRaw = q('.platform-pc-only .price-segment');

      // 六维（门将只有 DIV/HAN/KIC/REF/SPD/POS，字段名不同，按出现顺序映射即可，缺失如实留空）
      const stats = {};
      const statNums = col.querySelectorAll('.playercard-27-stat-number');
      const statKeys = col.querySelectorAll('.playercard-27-stat-value');
      for (let i = 0; i < statKeys.length && i < statNums.length; i++) {
        const k = statKeys[i].innerText.trim();
        const v = parseInt(statNums[i].innerText.trim(), 10);
        if (k && Number.isFinite(v)) stats[k] = v;
      }

      const slug = href.split('/').pop();
      const nameEl = col.querySelector('.playercard-27-name');
      const pill = col.querySelector('.og-pill');
      const popEl = col.querySelector('.xxs-font.bold');

      cards.push({
        rank,
        url: 'https://www.futbin.com' + href,
        href,
        slug,
        // 名字缺失时用 URL slug 兜底，保证条目永远可识别（不带名字的空行会让下游误判为解析失败）
        name: nameEl ? nameEl.innerText.trim() : slug,
        rating: parseCount(q('.playercard-27-rating')),
        pos: q('.playercard-27-position'),
        altPos: q('.playercard-27-alt-pos'),
        futbinRating: q('.playercard-27-futbin-rating'),
        psPriceRaw: psRaw,
        pcPriceRaw: pcRaw,
        psPrice: parseCoins(psRaw),
        pcPrice: parseCoins(pcRaw),
        scoreRaw: q('.item-score-segment'),
        popularity: popEl ? parseCount(popEl.innerText) : null,
        evoName: pill ? pill.innerText.trim() : null,
        // 卡片系列（英雄/传奇/活动卡的唯一可靠判据）：卡面图文件名版本前缀。
        // 例：0_gold 普通金卡、72_base_hero 英雄卡、160_debut_icon 传奇卡、9_hall_of_fut 活动卡、
        // 3_team_of_the_week 周黑、150_ones_to_watch OTW。解析不到时如实留空（不猜）。
        cardVersion: (() => {
          for (const im of col.querySelectorAll('img')) {
            const s = im.getAttribute('src') || im.getAttribute('data-src') || '';
            const m = /img\\/cards\\/hd\\/([^?"']+?)\\.png/.exec(s);
            if (m) return m[1];
          }
          return null;
        })(),
        stats,
      });
    }
    return cards;
  }
  // 挑战页/403 判定：只扫 HTML 头部，避免超大正文误命中
  function looksBlocked(text) {
    return /403|does not have permission|Just a moment|cf-challenge|challenge-platform|Attention Required/i.test(String(text || '').slice(0, 4000));
  }
`;

/**
 * 对**已导航到目标 URL 的实时页面**抽取（兼容旧链路）。
 * @param {'popular'|'popular-evolutions'} page 页面类型（当前两页抽取逻辑相同，仅作标记）
 */
export function buildMarketListScript(page = 'popular') {
  return `(() => {${CARD_HELPERS}
  const cards = extractCards(document);
  const head = document.body ? document.body.innerText.slice(0, 300) : '';
  return JSON.stringify({
    page: ${JSON.stringify(page)},
    url: location.href,
    title: document.title,
    blocked: looksBlocked(head),
    count: cards.length,
    cards,
  });
})()`;
}

/**
 * 在**停在轻量 futbin.com 页的宿主标签页内**执行：同源 fetch 目标页 → DOMParser → 抽取。
 * 宿主页只需 futbin.com origin（推荐 `https://www.futbin.com/robots.txt`）。
 * @param {Array<{kind:string, path:string}>} requests 例 [{kind:'popular', path:'/27/popular'}]
 */
export function buildMarketListFetchScript(requests) {
  return `(async () => {${CARD_HELPERS}
  const reqs = ${JSON.stringify(requests)};
  const out = { ok: true, byPage: {}, cards: [] };
  for (const req of reqs) {
    try {
      const res = await fetch(req.path, { credentials: 'include' });
      const html = await res.text();
      const head = html.slice(0, 4000);
      if (res.status !== 200) { out.byPage[req.kind] = { status: res.status, cards: 0, blocked: false }; out.ok = false; continue; }
      // 挑战页/拦截页体积远小于真实榜单（实测 popular 3.36MB、evolutions 5.43MB）
      if (looksBlocked(head) && html.length < 200000) {
        out.byPage[req.kind] = { status: res.status, cards: 0, blocked: true, bytes: html.length }; out.ok = false; continue;
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const cards = extractCards(doc);
      out.byPage[req.kind] = { status: res.status, cards: cards.length, bytes: html.length, blocked: false };
      for (const c of cards) out.cards.push(c);
    } catch (e) {
      out.byPage[req.kind] = { err: String(e) };
      out.ok = false;
    }
  }
  return JSON.stringify(out);
})()`;
}

export default buildMarketListScript;
