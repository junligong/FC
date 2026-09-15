// 作用：统一生成报告图片文件名，并在单文件汇总时把本地图片转为可携带的 data URL。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export function originalXImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'pbs.twimg.com' || !url.pathname.startsWith('/media/')) return value;
    url.searchParams.set('name', 'orig');
    return url.toString();
  } catch {
    return value;
  }
}

export function reportImageAssetName(value) {
  const normalized = originalXImageUrl(value);
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
