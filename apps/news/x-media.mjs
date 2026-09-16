// 作用：把单条推文的媒体信息解析成报告可直接使用的结构。
// 输入：X 公开 syndication 接口（https://cdn.syndication.twimg.com/tweet-result?id=<推文ID>&token=<任意值>）的响应 JSON。
// 输出：{ mediaResolved, mediaSource, images[], video, card, quoted }，以及 collectTweetImageUrls() 汇总的可缓存图片地址。
//
// 为什么不再从 DOM 里抠图片：X 在后台标签页里把推文媒体渲染成模糊骨架占位符（[data-testid="tweetPhoto"]
// 里没有 <img>），必须强制出帧才会补图；视频与链接卡片的图更是取不到。经实测，DOM 只能稳定拿到推文 ID、
// 正文和时间，媒体一律以本接口为准。

const ENDPOINT = 'https://cdn.syndication.twimg.com/tweet-result';
// 该接口按 UA 判浏览器，必须带一个常规 UA。
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

// 卡片缩略图在 binding_values 里的候选键，按“越原图越靠前”排序
const CARD_IMAGE_KEYS = [
  'thumbnail_image_original',
  'player_image_original',
  'summary_photo_image_original',
  'photo_image_full_size_original',
  'image_original',
  'thumbnail_image_x_large',
  'player_image_x_large',
  'thumbnail_image_large',
  'player_image_large',
  'thumbnail_image',
  'player_image',
];

function readString(binding) {
  const value = binding?.value;
  if (!value || typeof value !== 'object') return '';
  return value.string_value || value.scribe_key || '';
}

function readImage(binding) {
  const value = binding?.value;
  if (!value || typeof value !== 'object') return '';
  return value.image_value?.url || '';
}

// 把 syndication 的 card 结构压平成报告要用的形状；没有可用信息时返回 null。
export function normalizeCard(card) {
  if (!card || typeof card !== 'object') return null;
  const bindings = card.binding_values || {};
  let image = '';
  for (const key of CARD_IMAGE_KEYS) {
    const candidate = readImage(bindings[key]);
    if (candidate) { image = candidate; break; }
  }
  // 新版卡片把内容塞在 unified_card 的 JSON 字符串里，作为兜底解析
  if (!image && typeof bindings.unified_card?.string_value === 'string') {
    try {
      const unified = JSON.parse(bindings.unified_card.string_value);
      const media = unified?.media_entities?.[0]?.media_url_https
        || unified?.component_objects?.media_entity?.data?.media_url_https
        || '';
      if (media) image = media;
    } catch { /* 结构不可解析时忽略，不影响其他字段 */ }
  }
  const title = readString(bindings.title) || readString(bindings.app_name);
  const description = readString(bindings.description);
  const url = readString(bindings.player_url)
    || readString(bindings.app_url_resolved)
    || readString(bindings.vanity_url)
    || card.url
    || '';
  if (!image && !title && !url) return null;
  return { name: card.name || '', title, description, url, image };
}

function normalizeQuoted(quoted) {
  if (!quoted || typeof quoted !== 'object') return null;
  const screenName = quoted.user?.screen_name || '';
  const id = quoted.id_str || '';
  const images = (Array.isArray(quoted.mediaDetails) ? quoted.mediaDetails : [])
    .filter(item => item?.type === 'photo' && item.media_url_https)
    .map(item => item.media_url_https);
  return {
    id,
    url: id && screenName ? `https://x.com/${screenName}/status/${id}` : '',
    handle: screenName,
    text: quoted.text || '',
    images,
  };
}

// 判定载荷里是否真的含有推文信息。空的 {} 或纯数组不算解析成功——
// 否则「接口返回了但什么都没拿到」会被当成「这条推文没有媒体」，正是要避免的误报。
const IDENTITY_KEYS = ['id_str', 'text', 'mediaDetails', 'photos', 'card', 'quoted_tweet', 'user', 'created_at'];

function hasContent(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

// 纯函数：把接口响应规范化。载荷为空/非法/无信息时返回 mediaResolved=false，绝不抛错。
export function normalizeTweetMedia(payload) {
  const usable = payload !== null
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && IDENTITY_KEYS.some(key => hasContent(payload[key]));
  if (!usable) {
    return { mediaResolved: false, mediaSource: 'syndication', images: [], video: null, card: null, quoted: null };
  }
  const details = Array.isArray(payload.mediaDetails) ? payload.mediaDetails : [];
  const images = [];
  let video = null;
  for (const item of details) {
    const url = item?.media_url_https || '';
    if (item?.type === 'photo') {
      if (url) images.push(url);
      continue;
    }
    if (item?.type === 'video' || item?.type === 'animated_gif') {
      // 视频/动图的 media_url_https 是首帧海报，可作为封面缓存
      const variants = (item?.video_info?.variants || [])
        .filter(variant => variant?.content_type === 'video/mp4' && variant.url)
        .map(variant => ({ contentType: variant.content_type, bitrate: variant.bitrate ?? null, url: variant.url }))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      video = {
        kind: item.type,
        poster: url,
        durationMs: item?.video_info?.duration_millis ?? null,
        width: item?.original_info?.width ?? null,
        height: item?.original_info?.height ?? null,
        variants,
      };
      continue;
    }
    // 未知类型：是图片就收，避免静默丢弃
    if (url) images.push(url);
  }
  // 少数响应只给 photos 数组
  if (!images.length && Array.isArray(payload.photos)) {
    for (const photo of payload.photos) if (photo?.url) images.push(photo.url);
  }
  return {
    mediaResolved: true,
    mediaSource: 'syndication',
    images,
    video,
    card: normalizeCard(payload.card),
    quoted: normalizeQuoted(payload.quoted_tweet),
  };
}

// 汇总一条推文里所有需要下载/内嵌的图片地址（正文配图 + 视频封面 + 卡片缩略图）。
// 顺序即展示顺序，去重但保留首次出现的位置。
export function collectTweetImageUrls(tweet) {
  const urls = [];
  const push = value => { if (value && typeof value === 'string' && !urls.includes(value)) urls.push(value); };
  for (const image of tweet?.images || []) push(image);
  push(tweet?.video?.poster);
  push(tweet?.card?.image);
  return urls;
}

// 取单条推文的媒体。失败返回 { ok:false, error }，由调用方决定是否标记为未解析。
export async function fetchTweetMedia(id, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const url = `${ENDPOINT}?id=${encodeURIComponent(id)}&token=a`;
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const payload = await response.json();
    return { ok: true, ...normalizeTweetMedia(payload) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

// 把解析结果合并进推文对象（不覆盖本轮新解析出来的媒体）。
export function applyMediaToTweet(tweet, media) {
  if (!media?.mediaResolved) return { ...tweet, mediaResolved: false, mediaSource: 'syndication' };
  return {
    ...tweet,
    mediaResolved: true,
    mediaSource: 'syndication',
    images: media.images,
    video: media.video,
    card: media.card,
    quoted: media.quoted,
  };
}
