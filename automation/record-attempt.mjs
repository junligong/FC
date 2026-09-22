#!/usr/bin/env node
// 用途：把高频任务每轮结果 upsert 到单一 attempts.json，避免每轮新建 hourly-<HH>-failed.json。
// 输入：node automation/record-attempt.mjs <module> <YYYY-MM-DD> <ok|partial|failed> <stage> [reason]
// 输出：automation/runs/<D>/<module>/attempts.json，同一小时重跑覆盖该小时，不新增文件。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from '../shared/lib/runtime.mjs';

const [moduleName, date, status, stage, ...reasonParts] = process.argv.slice(2);
const allowedModules = new Set(['market', 'icons-heroes']);
const allowedStatuses = new Set(['ok', 'partial', 'failed']);
if (!allowedModules.has(moduleName) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !allowedStatuses.has(status) || !stage) {
  console.error('用法: node automation/record-attempt.mjs <market|icons-heroes> <YYYY-MM-DD> <ok|partial|failed> <stage> [reason]');
  process.exit(2);
}

const now = new Date();
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(now);
const part = type => parts.find(item => item.type === type)?.value;
const hourKey = `${part('year')}-${part('month')}-${part('day')}T${part('hour')}`;
const target = path.join(root, 'automation', 'runs', date, moduleName, 'attempts.json');
let doc = { schemaVersion: 1, module: moduleName, date, updatedAt: null, attempts: {} };
try { doc = { ...doc, ...JSON.parse(readFileSync(target, 'utf8')) }; } catch { /* 首次写入 */ }
doc.attempts = doc.attempts && typeof doc.attempts === 'object' ? doc.attempts : {};
doc.updatedAt = now.toISOString();
doc.attempts[hourKey] = {
  at: now.toISOString(),
  status,
  stage,
  reason: reasonParts.join(' ').trim() || null,
};

mkdirSync(path.dirname(target), { recursive: true });
const temp = `${target}.tmp-${process.pid}`;
writeFileSync(temp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
renameSync(temp, target);
console.log(path.relative(root, target));
