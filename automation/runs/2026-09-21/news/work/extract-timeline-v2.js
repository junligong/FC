/* 作用：在浏览器里对 X 账号时间线做一次确定性抽取，供 Web Access 技能的 /eval 直接执行。
 * 输入：已在当前标签页打开的 X 账号页（或推文详情页）DOM。
 * 主要输出：JSON 字符串 { count, tweets:[{ id, url, handle, author, timestamp, timeText, text, hasVideo, hasPhoto, hasCard, domImages, isPinned, isRetweet }] }。
 *
 * v2（2026-09-19）：X 前端已全局移除 data-testid 与 <time datetime>（反爬改动），旧选择器 article[data-testid="tweet"]
 * 全部失效。本版改用无标记结构：
 *   - 推文容器：任意 <article>；推文 ID/链接：a[href="/<handle>/status/<id>"]
 *   - 正文：div.font-chirp；头部行：div.flex.items-start.justify-between（含作者与相对时间文本）
 *   - 媒体标记：video 元素 / img[src*="pbs.twimg.com/media/"]；链接卡片以 syndication 权威结果为准（hasCard 恒 false）
 *   - 时间：DOM 已无 <time>，这里只做粗筛（明显早于窗口的「M月D日」与「N天」丢弃）并保留 timeText；
 *     精确 timestamp 由采集驱动经 syndication created_at 权威回填，不臆造。
 * 与旧脚本相同的原则：不丢弃带视频/动图的推文；媒体只作存在性标记，具体地址交给 syndication 接口。
 */
(() => {
  const seen = new Set();
  const tweets = [];
  for (const article of document.querySelectorAll('article')) {
    let url = '';
    let handle = '';
    for (const anchor of article.querySelectorAll('a[href*="/status/"]')) {
      const href = anchor.getAttribute('href') || '';
      const m = href.match(/^\/([^/]+)\/status\/(\d+)(?:\/)?$/);
      if (m && href.indexOf('/analytics') === -1) { handle = m[1]; url = 'https://x.com' + href; break; }
    }
    const idMatch = url.match(/status\/(\d+)/);
    const id = idMatch ? idMatch[1] : '';
    if (!id || seen.has(id)) continue;

    const textEl = article.querySelector('div.font-chirp');
    const headerEl = article.querySelector('div.flex.items-start.justify-between');
    const lines = (headerEl ? headerEl.innerText : '').split('\n').map(s => s.trim()).filter(Boolean);
    const timeText = [...lines].reverse().find(s => /分钟|小时|天|月|日/.test(s)) || '';
    const authorAt = lines.find(s => s.startsWith('@')) || ('@' + handle);
    const displayName = lines.find(s => !s.startsWith('@') && !/分钟|小时|天|月|日/.test(s)) || '';

    // 粗筛：明显早于 24h 窗口的日期型时间直接丢弃；相对时间与「9月18日」型保留，由驱动回填 created_at 后精筛
    const dm = timeText.match(/^(\d{1,2})月(\d{1,2})日/);
    if (dm) {
      const mo = parseInt(dm[1], 10), da = parseInt(dm[2], 10);
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      const ymo = yesterday.getMonth() + 1, yda = yesterday.getDate();
      if (mo < ymo || (mo === ymo && da < yda)) continue;
    } else if (/\d+\s*天/.test(timeText)) {
      continue;
    }

    const imgs = [...article.querySelectorAll('img[src*="pbs.twimg.com"]')]
      .map(img => img.getAttribute('src') || '').filter(src => src.includes('/media/'));
    const mediaArea = article.querySelector('div.flex.flex-col.gap-3.empty\\:hidden');

    tweets.push({
      id, url, handle,
      author: displayName ? displayName + ' ' + authorAt : authorAt,
      timestamp: '', timeText,
      text: textEl ? textEl.innerText.trim() : '',
      hasVideo: !!article.querySelector('video'),
      hasPhoto: imgs.length > 0 || !!(mediaArea && mediaArea.querySelector('img[src*="pbs.twimg.com/media/"]')),
      hasCard: false, // 旧 card.wrapper 选择器已死；链接卡片以 syndication 权威结果为准
      domImages: imgs,
      isPinned: /已置顶/.test(article.innerText.slice(0, 200)),
      isRetweet: /转推了|转推/.test(article.innerText.slice(0, 200)),
    });
    seen.add(id);
  }
  return JSON.stringify({ count: tweets.length, tweets });
})()
