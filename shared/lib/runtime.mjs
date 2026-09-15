import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 作用：集中解析项目根目录、共享路径、日报日期和原子写入，供四个任务及未来 WorkBuddy 复用。
export const root = process.env.FC_PROJECT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const paths = {
  apps: path.join(root, 'apps'),
  news: path.join(root, 'apps', 'news'),
  football: path.join(root, 'apps', 'football'),
  market: path.join(root, 'apps', 'market', 'engine'),
  portal: path.join(root, 'apps', 'portal'),
  dailyReports: path.join(root, 'reports', 'daily'),
  stableIndex: path.join(root, 'daily-merged', 'index.html'),
};
export const dailyReportDir = date => path.join(paths.dailyReports, reportDate(date));
export function reportDate(value) {
  const date = value || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error(`无效日报日期: ${date}`);
  }
  return date;
}
export function atomicWrite(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, text, 'utf8');
  renameSync(temp, file);
}
export function readJSON(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
