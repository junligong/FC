#!/usr/bin/env node
// 用途：检查 Git 工作区中由自动化产生的新文件数量，用于验收“更新固定文件，不按轮次新建”。
// 输入：node automation/audit-file-growth.mjs [--json]
// 输出：按顶层目录和高风险路径统计未跟踪文件；不修改工作区。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from '../shared/lib/runtime.mjs';

const raw = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root });
const entries = raw.toString('utf8').split('\0').filter(Boolean).map(line => ({ status: line.slice(0, 2), file: line.slice(3) }));
const untracked = entries.filter(entry => entry.status === '??');
const byTop = {};
for (const entry of untracked) {
  const top = entry.file.split('/')[0] || '.';
  byTop[top] = (byTop[top] || 0) + 1;
}
const repeatedRunFiles = untracked.filter(entry => /automation\/runs\/\d{4}-\d{2}-\d{2}\/.+\/(?:work\/|hourly-.+-failed\.json$)/.test(entry.file));
const result = {
  checkedAt: new Date().toISOString(),
  changed: entries.length,
  untracked: untracked.length,
  untrackedByTop: byTop,
  repeatedRunFiles: repeatedRunFiles.length,
  policy: '高频任务只更新 current.json、累积序列、watchlist.json、attempts.json 和固定 HTML；不按轮次创建文件。',
};
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Git 变更 ${result.changed} 项 · 未跟踪 ${result.untracked} 项 · 按轮次增长风险 ${result.repeatedRunFiles} 项`);
  for (const [dir, count] of Object.entries(byTop).sort((a, b) => b[1] - a[1])) console.log(`  ${dir}: ${count}`);
}
