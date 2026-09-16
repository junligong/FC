(() => {
  const HOURS = 24;
  const now = Date.now();
  const cutoff = now - HOURS * 3600 * 1000;
  const seen = new Set();
  const tweets = [];
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const timeEl = article.querySelector('time');
    const timestamp = timeEl ? timeEl.getAttribute('datetime') : '';
    if (!timestamp) continue;
    const ts = Date.parse(timestamp);
    if (!Number.isFinite(ts) || ts < cutoff || ts > now) continue;

    let url = '';
    let handle = '';
    for (const anchor of article.querySelectorAll('a[href*="/status/"]')) {
      const href = anchor.getAttribute('href') || '';
      const match = href.match(/^\/([^/]+)\/status\/(\d+)(?:\/)?$/);
      if (match && href.indexOf('/analytics') === -1) {
        handle = match[1];
        url = `https://x.com${href}`;
        break;
      }
    }
    const idMatch = url.match(/status\/(\d+)/);
    const id = idMatch ? idMatch[1] : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const textEl = article.querySelector('[data-testid="tweetText"]');
    const userNameEl = article.querySelector('[data-testid="User-Name"] span');
    tweets.push({
      id,
      url,
      handle,
      author: userNameEl ? userNameEl.innerText.trim() : '',
      timestamp,
      timeText: timeEl ? timeEl.innerText : '',
      text: textEl ? textEl.innerText.trim() : '',
      // 媒体存在性标记：供报告区分「确实纯文本」与「有媒体但地址需另行解析」
      hasVideo: !!article.querySelector('video, [data-testid="videoComponent"], [data-testid="videoPlayer"]'),
      hasPhoto: article.querySelectorAll('[data-testid="tweetPhoto"]').length > 0,
      hasCard: !!article.querySelector('[data-testid="card.wrapper"]'),
      // 尽力而为的 DOM 图片地址；权威来源是 syndication 接口
      domImages: [...article.querySelectorAll('img[src*="pbs.twimg.com"]')]
        .map(img => img.getAttribute('src') || '')
        .filter(src => src.includes('/media/')),
      isRetweet: !!article.querySelector('[data-testid="socialContext"]'),
    });
  }
  return JSON.stringify({ count: tweets.length, tweets });
})()
