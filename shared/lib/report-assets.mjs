// 作用：统一生成报告图片文件名，并在单文件汇总时把本地图片转为可携带的 data URL。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

// X 上可以下载并打进报告的图片路径。历史上只放行了 /media/，导致两类图被静默丢弃：
//   - /card_img/…            链接卡片（YouTube/官网等）的缩略图
//   - /amplify_video_thumb/… 视频首帧占位图（syndication 接口一般给 /media/ 海报，这里作为兜底）
const X_IMAGE_PREFIXES = ['/media/', '/card_img/', '/amplify_video_thumb/', '/ext_tw_video_thumb/'];
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

export function reportAssetDataUrl(reportDir, relativePath) {
  if (!relativePath || /^data:image\//.test(relativePath)) return relativePath || '';
  const base = path.resolve(reportDir);
  const file = path.resolve(base, relativePath);
  if (!file.startsWith(`${base}${path.sep}`) || !existsSync(file)) return '';
  const extension = path.extname(file).slice(1).toLowerCase();
  const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
    : extension === 'svg' ? 'image/svg+xml' : `image/${extension || 'png'}`;
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

export function inlineLocalReportImages(html, reportDir) {
  return html.replace(/(<img\b[^>]*\bsrc=")([^"#]+)(")/gi, (match, prefix, src, suffix) => {
    if (!/^(?:\.\/)?assets\//.test(src)) return match;
    const dataUrl = reportAssetDataUrl(reportDir, src);
    return dataUrl ? `${prefix}${dataUrl}${suffix}` : match;
  });
}
