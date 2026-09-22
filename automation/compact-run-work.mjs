#!/usr/bin/env node
// 用途：成功或部分成功后清理当日任务 work/ 临时文件，防止每次自动化累积一次性脚本和原始页面副本。
// 输入：node automation/compact-run-work.mjs <YYYY-MM-DD> [module] [--apply]
// 输出：默认只预览；仅 --apply 且 state.status 为 success/partial 时删除 runs/D/<module>/work/。
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { root } from '../shared/lib/runtime.mjs';

const args = process.argv.slice(2);
const date = args.find(value => /^\d{4}-\d{2}-\d{2}$/.test(value));
const apply = args.includes('--apply');
const requestedModule = args.find(value => !value.startsWith('--') && value !== date) || null;
if (!date) {
  console.error('用法: node automation/compact-run-work.mjs <YYYY-MM-DD> [module] [--apply]');
  process.exit(2);
}
if (requestedModule && !/^[a-z0-9-]+$/.test(requestedModule)) {
  console.error('模块名不合法');
  process.exit(2);
}

const dayRoot = path.join(root, 'automation', 'runs', date);
if (!existsSync(dayRoot)) process.exit(0);
const modules = requestedModule
  ? [requestedModule]
  : readdirSync(dayRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);

for (const moduleName of modules) {
  const moduleRoot = path.join(dayRoot, moduleName);
  const work = path.join(moduleRoot, 'work');
  if (!existsSync(work)) continue;
  let state = null;
  try { state = JSON.parse(readFileSync(path.join(moduleRoot, 'state.json'), 'utf8')); } catch { /* 高频任务可能没有 state */ }
  const status = state?.status || null;
  const removable = status === 'success' || status === 'partial';
  let files = 0;
  let bytes = 0;
  const stack = [work];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) { files++; bytes += statSync(full).size; }
    }
  }
  console.log(`${moduleName}: ${files} 个临时文件，${(bytes / 1024 / 1024).toFixed(2)} MB${removable ? '' : `，状态 ${status || 'unknown'} 不允许清理`}`);
  if (apply && removable) rmSync(work, { recursive: true, force: false });
}
