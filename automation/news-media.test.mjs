// 作用：验证 X 推文媒体解析（syndication → 报告字段）与 X 图片地址放行规则。
// 这些用例的期望值取自真实接口响应，防止再次出现「视频/动图/链接卡片被静默丢弃」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTweetMedia, normalizeCard, collectTweetImageUrls, applyMediaToTweet } from '../apps/news/x-media.mjs';
import { buildImageFetchScript } from '../apps/news/fetch-images-browser.mjs';
import { isCacheableXImage, originalXImageUrl, reportImageAssetName } from '../shared/lib/report-assets.mjs';

const PHOTO_PAYLOAD = {
  text: 'We are ready for the launch',
  mediaDetails: [
    { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/HRzKhEJWQAUwHZh.jpg', original_info: { width: 1320, height: 1080 } },
    { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/HRzKhEUWYAkAcru.jpg' },
  ],
};

const VIDEO_PAYLOAD = {
  mediaDetails: [{
    type: 'video',
    media_url_https: 'https://pbs.twimg.com/media/HSR-9_WXAAA-Qov.jpg',
    original_info: { width: 1080, height: 1080 },
    video_info: {
      duration_millis: 20000,
      variants: [
        { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
        { content_type: 'video/mp4', bitrate: 320000, url: 'https://video.twimg.com/vid/320x320/a.mp4' },
        { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/vid/720x720/c.mp4' },
        { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/vid/540x540/b.mp4' },
      ],
    },
  }],
};

const GIF_PAYLOAD = {
  mediaDetails: [{
    type: 'animated_gif',
    media_url_https: 'https://pbs.twimg.com/media/GIFTHUMB.jpg',
    video_info: { variants: [{ content_type: 'video/mp4', bitrate: 0, url: 'https://video.twimg.com/gif.mp4' }] },
  }],
};

const PLAYER_CARD_PAYLOAD = {
  card: {
    name: 'player',
    url: 'https://t.co/5UbDZdUCOF',
    binding_values: {
      title: { type: 'STRING', value: { string_value: 'EA SPORTS FC 27 | First Gameplay Livestream' } },
      description: { type: 'STRING', value: { string_value: 'Watch the first exclusive gameplay stream' } },
      player_url: { type: 'STRING', value: { string_value: 'https://www.youtube.com/embed/wftr3DZ-Luw' } },
      player_image_original: { type: 'IMAGE', value: { image_value: { url: 'https://pbs.twimg.com/card_img/2099839960262025216/YeLvqi7x?format=jpg&name=orig', width: 1280, height: 720 } } },
    },
  },
};

test('normalizeTweetMedia keeps every photo of the tweet', () => {
  const media = normalizeTweetMedia(PHOTO_PAYLOAD);
  assert.equal(media.mediaResolved, true);
  assert.deepEqual(media.images, [
    'https://pbs.twimg.com/media/HRzKhEJWQAUwHZh.jpg',
    'https://pbs.twimg.com/media/HRzKhEUWYAkAcru.jpg',
  ]);
  assert.equal(media.video, null);
  assert.equal(media.card, null);
});

test('normalizeTweetMedia turns a video tweet into poster + mp4 variants sorted by bitrate', () => {
  const media = normalizeTweetMedia(VIDEO_PAYLOAD);
  assert.equal(media.video.kind, 'video');
  assert.equal(media.video.poster, 'https://pbs.twimg.com/media/HSR-9_WXAAA-Qov.jpg');
  assert.equal(media.video.durationMs, 20000);
  // m3u8 被剔除，mp4 按码率降序
  assert.deepEqual(media.video.variants.map(v => v.url), [
    'https://video.twimg.com/vid/720x720/c.mp4',
    'https://video.twimg.com/vid/540x540/b.mp4',
    'https://video.twimg.com/vid/320x320/a.mp4',
  ]);
  // 视频不再被丢弃
  assert.equal(media.mediaResolved, true);
});

test('normalizeTweetMedia marks animated gifs distinctly', () => {
  const media = normalizeTweetMedia(GIF_PAYLOAD);
  assert.equal(media.video.kind, 'animated_gif');
  assert.equal(media.video.poster, 'https://pbs.twimg.com/media/GIFTHUMB.jpg');
});

test('normalizeCard reads link-card thumbnail, title and target url', () => {
  const card = normalizeCard(PLAYER_CARD_PAYLOAD.card);
  assert.equal(card.name, 'player');
  assert.equal(card.image, 'https://pbs.twimg.com/card_img/2099839960262025216/YeLvqi7x?format=jpg&name=orig');
  assert.equal(card.title, 'EA SPORTS FC 27 | First Gameplay Livestream');
  assert.equal(card.url, 'https://www.youtube.com/embed/wftr3DZ-Luw');
});

test('normalizeCard returns null when the card carries nothing usable', () => {
  assert.equal(normalizeCard(null), null);
  assert.equal(normalizeCard({}), null);
  assert.equal(normalizeCard({ binding_values: {} }), null);
});

test('normalizeTweetMedia separates quoted tweet images from the main tweet', () => {
  const media = normalizeTweetMedia({
    ...PHOTO_PAYLOAD,
    quoted_tweet: {
      id_str: '2097000000000000000',
      text: 'earlier post',
      user: { screen_name: 'fifa_romania' },
      mediaDetails: [
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/QUOTED1.jpg' },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/QUOTED2.jpg' },
      ],
    },
  });
  assert.equal(media.images.length, 2, '主推文只算自己的 2 张');
  assert.deepEqual(media.quoted.images, [
    'https://pbs.twimg.com/media/QUOTED1.jpg',
    'https://pbs.twimg.com/media/QUOTED2.jpg',
  ]);
  assert.equal(media.quoted.url, 'https://x.com/fifa_romania/status/2097000000000000000');
});

test('normalizeTweetMedia never throws on a broken payload and reports unresolved', () => {
  for (const bad of [null, undefined, 0, 'x', [], {}]) {
    const media = normalizeTweetMedia(bad);
    assert.equal(media.mediaResolved, false);
    assert.deepEqual(media.images, []);
  }
  // 只有 photos 字段时作为兜底
  const fallback = normalizeTweetMedia({ photos: [{ url: 'https://pbs.twimg.com/media/A.jpg' }] });
  assert.deepEqual(fallback.images, ['https://pbs.twimg.com/media/A.jpg']);
});

test('collectTweetImageUrls gathers photos, video poster and card thumbnail without duplicates', () => {
  const tweet = {
    images: ['https://pbs.twimg.com/media/A.jpg', 'https://pbs.twimg.com/media/A.jpg'],
    video: { poster: 'https://pbs.twimg.com/media/A.jpg' },
    card: { image: 'https://pbs.twimg.com/card_img/1/x?format=jpg&name=orig' },
  };
  assert.deepEqual(collectTweetImageUrls(tweet), [
    'https://pbs.twimg.com/media/A.jpg',
    'https://pbs.twimg.com/card_img/1/x?format=jpg&name=orig',
  ]);
  assert.deepEqual(collectTweetImageUrls({}), []);
  assert.deepEqual(collectTweetImageUrls({ video: {} }), []);
});

test('applyMediaToTweet keeps an explicit unresolved flag when the API fails', () => {
  const failed = applyMediaToTweet({ id: '1', images: [] }, { ok: false, error: 'HTTP 503' });
  assert.equal(failed.mediaResolved, false);
  const ok = applyMediaToTweet({ id: '1' }, { ok: true, ...normalizeTweetMedia(PHOTO_PAYLOAD) });
  assert.equal(ok.mediaResolved, true);
  assert.equal(ok.images.length, 2);
});

test('X image whitelist accepts media, card and video thumbs but not avatars', () => {
  assert.equal(isCacheableXImage('https://pbs.twimg.com/media/A.jpg'), true);
  assert.equal(isCacheableXImage('https://pbs.twimg.com/card_img/1/x?format=jpg&name=orig'), true);
  assert.equal(isCacheableXImage('https://pbs.twimg.com/amplify_video_thumb/1/img/x.jpg'), true);
  assert.equal(isCacheableXImage('https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg'), true);
  // 头像与站外地址不进报告资产
  assert.equal(isCacheableXImage('https://pbs.twimg.com/profile_images/1/x_normal.jpg'), false);
  assert.equal(isCacheableXImage('https://video.twimg.com/vid/320/a.mp4'), false);
  assert.equal(isCacheableXImage('https://example.com/a.jpg'), false);
  assert.equal(isCacheableXImage('not a url'), false);
});

test('originalXImageUrl upgrades size only where the name parameter is meaningful', () => {
  assert.equal(
    originalXImageUrl('https://pbs.twimg.com/media/A?format=jpg&name=small'),
    'https://pbs.twimg.com/media/A?format=jpg&name=orig',
  );
  assert.equal(
    originalXImageUrl('https://pbs.twimg.com/card_img/1/x?format=jpg&name=large'),
    'https://pbs.twimg.com/card_img/1/x?format=jpg&name=orig',
  );
  // 尺寸写在路径里的缩略图不做改写，避免 404
  assert.equal(
    originalXImageUrl('https://pbs.twimg.com/amplify_video_thumb/1/img/x.jpg'),
    'https://pbs.twimg.com/amplify_video_thumb/1/img/x.jpg',
  );
  assert.equal(originalXImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});

test('reportImageAssetName is deterministic and keeps the declared format', () => {
  const a = reportImageAssetName('https://pbs.twimg.com/media/A?format=png&name=small');
  const b = reportImageAssetName('https://pbs.twimg.com/media/A?format=png&name=orig');
  assert.equal(a, b, '同一原图的不同尺寸必须落到同一个资产名');
  assert.match(a, /^[0-9a-f]{20}\.png$/);
});

// 报告内展示统一取 medium：orig 单张可达 1.5MB，百余张会把单文件汇总顶到 30MB+。
test('size parameter bounds the requested image resolution', () => {
  const url = 'https://pbs.twimg.com/media/A.jpg';
  assert.equal(originalXImageUrl(url, 'medium'), 'https://pbs.twimg.com/media/A.jpg?name=medium');
  assert.equal(originalXImageUrl(url, 'small'), 'https://pbs.twimg.com/media/A.jpg?name=small');
  assert.equal(originalXImageUrl(url), 'https://pbs.twimg.com/media/A.jpg?name=orig', '默认仍是原图，保持既有调用方行为');
  assert.equal(originalXImageUrl(url, 'bogus'), 'https://pbs.twimg.com/media/A.jpg?name=orig', '非法档位回落到 orig');
  // 尺寸进哈希，因此换档位必须换资产名，否则会误用旧分辨率文件
  assert.notEqual(reportImageAssetName(url, 'medium'), reportImageAssetName(url, 'orig'));
  // 尺寸写在路径里的缩略图不受档位影响
  assert.equal(
    originalXImageUrl('https://pbs.twimg.com/amplify_video_thumb/1/img/x.jpg', 'medium'),
    'https://pbs.twimg.com/amplify_video_thumb/1/img/x.jpg',
  );
});

test('browser fetch script embeds the url safely even with quotes and ampersands', () => {
  // X 图片地址普遍带 ?format=…&name=…，直接插值会破坏脚本或截断参数
  const url = 'https://pbs.twimg.com/media/A?format=jpg&name=orig&x="1"';
  const script = buildImageFetchScript(url);
  assert.ok(script.includes(JSON.stringify(url)), 'URL 必须以 JSON 字符串形式注入');
  // 脚本自身必须是合法可解析的表达式
  assert.doesNotThrow(() => new Function(`return ${script}`));
  // 注入的引号不能逃出字符串字面量
  assert.equal(script.includes('name=orig&x="1"'), false, '原始引号不应裸露在脚本文本里');
});
