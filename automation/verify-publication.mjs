// 作用：对比本地固定入口与线上归档内容，只有日期和哈希均匹配才判定发布成功。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, reportDate, atomicWrite, readJSON } from '../shared/lib/runtime.mjs';

const projectConfig = readJSON(path.join(root, 'shared/config/project.json'), {});
export const publicUrl = projectConfig.fixedPublicUrl || 'https://www.dumate.cn/artifacts/7vbc68mkblkg';
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function comparePublication(local, remote, date) {
  const html = remote.toString('utf8');
  const checks = {
    matchesLocal: local.equals(remote),
    hasArchiveViewer: html.includes('id="archive-viewer"'),
    hasDateAnchor: html.includes(`#report-${date}`),
    completeHtml: /<\/html>\s*$/i.test(html),
  };
  return {
    verified: Object.values(checks).every(Boolean),
    checks,
    localSha256: sha256(local),
    remoteSha256: sha256(remote),
    bytes: remote.length,
  };
}

export async function verify(date) {
  date = reportDate(date);
  const file = path.join(root, 'automation', `publish-status-${date}.json`);
  const previous = readJSON(file, {});
  const localIndexHtml = path.join(root, projectConfig.fixedLocalIndex || 'daily-merged/index.html');
  const checkedAt = new Date().toISOString();
  let verification;
  try {
    const local = readFileSync(localIndexHtml);
    const response = await fetch(publicUrl, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`公网 HTTP ${response.status}`);
    verification = { ...comparePublication(local, Buffer.from(await response.arrayBuffer()), date), checkedAt };
  } catch (error) {
    verification = { verified: false, checkedAt, error: error.message };
  }
  // A successful HTTP comparison proves current content, not how it was published.
  const status = {
    ...previous, date, localIndexHtml, publicUrl,
    published: verification.verified ? true : null,
    reason: verification.verified ? '公网首页与本地文件逐字节一致；发布触发方式未确认' : '未能确认当前本地版本已上线，详见 publicVerification',
    publicVerification: verification,
    unattendedPublishingVerified: false,
  };
  if (previous.publicVerification?.localSha256 !== verification.localSha256) delete status.browserVerification;
  if (previous.reason && !previous.publicVerification) {
    status.previousAttempt = { published: previous.published, reason: previous.reason, details: previous.details };
  }
  delete status.details;
  delete status.suggestedActions;
  atomicWrite(file, JSON.stringify(status, null, 2) + '\n');
  console.log(JSON.stringify({ date, publicUrl, ...verification }, null, 2));
  return verification.verified;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await verify(process.argv[2]) ? 0 : 1;
}
