/* 作用：在浏览器内提取 FUTBIN FC27 热门榜（/27/popular）与热门进化榜（/27/popular/evolutions）的卡片数据。
 * 输入：{ page: 'popular' | 'popular-evolutions' }，宿主标签页已导航到对应 URL。
 * 主要输出：JSON 字符串 { count, cards:[{ url, slug, name, rating, pos, altPos, futbinRating, psPriceRaw, pcPriceRaw,
 *            psPrice, pcPrice, scoreRaw, popularity, evoName, stats }] }
 *
 * 事实依据（2026-09-17 实机核验，勿凭印象改动）：
 *   1. 卡片容器是 `a.playercard-wrapper`，最近的外层 `.column` 内含全部字段。
 *   2. **每一行同时渲染两个平台价格单元格**：`.platform-ps-only .price-segment`（Console）与
 *      `.platform-pc-only .price-segment`（PC）。页顶平台按钮只是纯前端显隐切换（不刷新、不改 URL、不重取数），
 *      因此**一次导航即可同时拿到两个平台价**，不要为切换平台重复导航。
 *   3. `.item-score-segment` 是卡片评分/指数位，**不是**任何平台的成交价，只作参考记录，绝不作为价格参与计算。
 *   4. 热度计数在 `.xxs-font.bold`（形如 "348"）；进化卡额外有 `.og-pill` 提供进化名。
 *   5. 价格文本形如 "5.9K" / "3M" / "0"；"0" 表示该平台尚未更新，属占位值（调用侧按 <1000 判无效）。
 */

// 注意：注入浏览器的代码是独立作用域，不能引用本模块的变量/函数，所有辅助函数必须在模板字符串内部重新定义。

/**
 * 构造注入浏览器执行的抽取脚本。
 * @param {'popular'|'popular-evolutions'} page 页面类型，决定是否解析进化名
 */
export function buildMarketListScript(page = 'popular') {
  return `(() => {
  // "5.9K" / "3M" / "1,234" / "0" → 数字；无法解析一律 0（如实空值，不猜测）
  function parseCoins(text) {
    if (typeof text !== 'string') return 0;
    const t = text.trim().replace(/,/g, '');
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

  const seen = new Set();
  const cards = [];
  let rank = 0;
  for (const a of document.querySelectorAll('a.playercard-wrapper')) {
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
      stats,
    });
  }

  return JSON.stringify({
    page: ${JSON.stringify(page)},
    url: location.href,
    title: document.title,
    blocked: /403|does not have permission/i.test(document.body ? document.body.innerText.slice(0, 300) : ''),
    count: cards.length,
    cards,
  });
})()`;
}

export default buildMarketListScript;
