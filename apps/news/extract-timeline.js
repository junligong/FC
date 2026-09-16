/* 作用：在浏览器里对 X 账号时间线做一次确定性抽取，供 Web Access 技能的 /eval 直接执行。
 * 输入：已在当前标签页打开的 X 账号页（或推文详情页）DOM。
 * 主要输出：JSON 字符串 { count, tweets:[{ id, url, handle, author, timestamp, text, hasVideo, hasPhoto, hasCard, domImages }] }。
 *
 * 与旧脚本的关键差异：
 *   1. 不再丢弃带视频/动图的推文（旧 auto_news.sh 见到 video 元素直接 continue，是「带视频的都截取不到」的直接原因）。
 *   2. 媒体只作“有没有”的标记，具体图片/视频地址一律交给 syndication 接口解析——X 在后台标签页把媒体渲染成
 *      骨架占位符，DOM 里的图片地址既不可靠也不完整。
 *   3. 只按 <time datetime> 过滤窗口，不臆造时间。
 */
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
