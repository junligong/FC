// 作用：统一生成报告图片文件名；合并日报时把本地图片引用改写成共享资源目录的相对路径。
import { createHash } from 'node:crypto';

const FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

// X 上可以下载并打进报告的图片路径。历史上只放行了 /media/，导致三类图被静默丢弃：
//   - /card_img/…            链接卡片（YouTube/官网等）的缩略图
//   - /amplify_video_thumb/… 视频首帧占位图（syndication 接口一般给 /media/ 海报，这里作为兜底）
//   - /tweet_video_thumb/…   动图（animated_gif）封面（2026-09-17：GIF 封面走该路径，
//                            未放行时报告会残留远程热链）
const X_IMAGE_PREFIXES = ['/media/', '/card_img/', '/amplify_video_thumb/', '/ext_tw_video_thumb/', '/tweet_video_thumb/'];
// 这些路径的尺寸写在 query 的 name= 上，可以安全地改写成指定尺寸
const X_ORIGINALIZABLE_PREFIXES = ['/media/', '/card_img/'];
// 允许请求的尺寸档位。注意 orig 是原图，单张可达 1.5MB；
// 报告内部展示用 medium（约 1200px）即可，能把「单文件汇总」的体积压到原图的 1/4~1/5。
export const X_IMAGE_SIZES = new Set(['orig', 'large', 'medium', 'small']);

// 判断是否是可直接落盘缓存的 X 图片地址（按路径放行，不再只认 /media/）。
export function isCacheableXImage(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'pbs.twimg.com' && X_IMAGE_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

// size 默认为 orig 以保持既有调用方行为；报告类产物应显式传 'medium' 控制体积。
export function originalXImageUrl(value, size = 'orig') {
  try {
    const url = new URL(value);
    if (url.hostname !== 'pbs.twimg.com') return value;
    if (!X_ORIGINALIZABLE_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) return value;
    url.searchParams.set('name', X_IMAGE_SIZES.has(size) ? size : 'orig');
    return url.toString();
  } catch {
    return value;
  }
}

export function reportImageAssetName(value, size = 'orig') {
  const normalized = originalXImageUrl(value, size);
  let format = 'jpg';
  try {
    const requested = new URL(normalized).searchParams.get('format')?.toLowerCase();
    if (requested && FORMATS.has(requested)) format = requested === 'jpeg' ? 'jpg' : requested;
  } catch {}
  return `${createHash('sha256').update(normalized).digest('hex').slice(0, 20)}.${format}`;
}

// 把报告 HTML 里以 assets/ 开头的本地引用，改写成「指向 daily-merged 共享资源目录」的相对路径。
//
// 取代此前的 base64 内联写法（2026-09-20，用户要求「图片被复制一次完全没有必要」）。
// 旧写法把每张图各自的 base64 塞进 index.html / archive/<D>.html / summary.html 三份文档，
// 同一张图按「文档数 × 出现次数」重复膨胀：实测 daily-merged 191 MB，其中 9,336 处 data:image
// 占 170.5 MB，且单篇 archive 就达 46 MB。
//
// 现在资源只存一份。可行性的依据是**资源命名本身就是内容寻址的**：
//   - assets/players/<cardId>.png —— 按卡 id 命名，跨日同名必同图
//   - assets/news/<sha256 前 20 位>.jpg —— 按内容哈希命名
// 已实测核对 4 天数据：players 816 个跨日重名、news 2 个跨日重名，**同名内容不一致 0 例**，
// 因此可以安全地合并进同一个目录共用。
//
// assetBase：本页回到 daily-merged/ 的相对前缀。
//   daily-merged/index.html        → ''
//   daily-merged/archive/<D>.html  → '../'
//   reports/daily/<D>/summary.html → '../../../daily-merged/'
export function rewriteLocalReportAssets(html, assetBase = '') {
  const strip = src => src.replace(/^\.\//, '');
  // 第一遍：<img src="assets/…">
  const withImg = html.replace(/(<img\b[^>]*\bsrc=")([^"#]+)(")/gi, (match, prefix, src, suffix) => {
    if (!/^(?:\.\/)?assets\//.test(src)) return match;
    return `${prefix}${assetBase}${strip(src)}${suffix}`;
  });
  // 第二遍：不是所有本地图片都写在 <img src> 里。市场扫描页把球员头像路径塞在
  // <script type="application/json" id="db-data"> 的数据块里，由前端 JS 拼成 <img>；
  // 合并期若不改写就会在站点里变成断链。这里对所有以 assets/ 开头的带引号字符串做同样处理。
  // 第一遍已改写的不会再匹配：改写后引号后紧跟的是 assetBase（''、'../' 或 '../../../daily-merged/'），
  // 均不满足「引号后可选 './' 再紧跟 assets/」，因此不会重复加前缀。
  return withImg.replace(/(")((?:\.\/)?assets\/[^"\\\n]+)(")/g, (match, prefix, src, suffix) =>
    `${prefix}${assetBase}${strip(src)}${suffix}`);
}
