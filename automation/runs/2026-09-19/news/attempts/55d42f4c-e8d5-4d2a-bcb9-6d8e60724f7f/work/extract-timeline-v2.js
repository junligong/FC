// v2 时间线抽取（2026-09-19）：X 已全局移除 data-testid 与 <time> 元素，改用新结构定位器。
// 输入：已打开的 X 账号页 DOM。输出：JSON {count, tweets:[{id,url,handle,author,timeText,...}]}。
// 时间窗口过滤由驱动脚本在 syndication created_at 回填后统一执行，这里只做粗筛（明显早于昨日即丢弃）。
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
    const author = lines.find(s => s.startsWith('@')) || ('@' + handle);
    const displayName = lines.find(s => !s.startsWith('@') && !/分钟|小时|天|月|日/.test(s)) || '';

    // 粗筛：明显早于窗口（9月18日之前）的日期型时间直接跳过；相对时间与 9月18日 保留待精确回填
    const dm = timeText.match(/^(\d{1,2})月(\d{1,2})日/);
    if (dm) {
      const mo = parseInt(dm[1], 10), da = parseInt(dm[2], 10);
      if (mo < 9 || (mo === 9 && da < 18)) continue;
    } else if (/\d+\s*天/.test(timeText)) {
      continue;
    }

    const imgs = [...article.querySelectorAll('img[src*="pbs.twimg.com"]')]
      .map(img => img.getAttribute('src') || '').filter(src => src.includes('/media/'));
    const mediaArea = article.querySelector('div.flex.flex-col.gap-3.empty\\:hidden');

    tweets.push({
      id, url, handle,
      author: displayName ? displayName + ' ' + author : author,
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
