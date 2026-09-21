// 一次性脚本（临时）：把自动化 memory.md 中 2026-09-19 的早期轮次（T00–T07）无损移出到新归档文件，
// 以避免主文件逼近 Read 工具 256 KB 上限导致本任务第 1 步无法执行。
// 做法：按行边界切分（不删不改原文），先备份，再写新归档 + 重写主文件，最后核对行数守恒。
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/Users/wuyanzu/Desktop/FC/.workbuddy/memory/automations/7123b0fe-8129-4570-95ce-8e96834f265e';
const MAIN = path.join(DIR, 'memory.md');
const ARCH = path.join(DIR, 'memory-archive-2026-09-19.md');
const BAK = path.join(DIR, 'memory.md.bak-20260920T0045');

const src = fs.readFileSync(MAIN, 'utf8');
const lines = src.split('\n');

// 归档区间：第一条 2026-09-19 条目 起 → 下一条 T07 条目 前的空行为止
const startIdx = lines.findIndex((l) => l.startsWith('### 2026-09-19 00:37'));
const nextIdx = lines.findIndex((l) => l.startsWith('### 2026-09-19 07:54'));
if (startIdx < 0 || nextIdx < 0 || nextIdx <= startIdx) {
  throw new Error('定位失败 start=' + startIdx + ' next=' + nextIdx);
}
// 归档段尾部吃掉分隔空行，主文件保留一条空行
let endIdx = nextIdx;
while (endIdx > startIdx && lines[endIdx - 1].trim() === '') endIdx--;
const moved = lines.slice(startIdx, endIdx);
const head = lines.slice(0, startIdx);
const tail = lines.slice(nextIdx);

const archHeader = [
  '# FC·传奇价格区间（每小时）— 自动化执行记忆归档（2026-09-19 早期轮次）',
  '',
  '本文件由 `automation/runs/2026-09-20/icons-heroes/work/archive-memory-t00.mjs` 于 2026-09-20 无损移出，',
  '内容为主文件 `memory.md` 中 2026-09-19 的 T00–T07 逐轮记录（原文逐行搬移，未删未改）。',
  '移出原因：主文件逼近 Read 工具 256 KB 上限，会让本任务第 1 步「复核历轮结论」无法执行。',
  '',
  '',
].join('\n');

fs.copyFileSync(MAIN, BAK);
fs.writeFileSync(ARCH, archHeader + moved.join('\n') + '\n');
fs.writeFileSync(MAIN, head.join('\n') + '\n' + tail.join('\n'));

const chk = (p) => {
  const s = fs.readFileSync(p, 'utf8');
  return s.split('\n').length + ' 行 / ' + Buffer.byteLength(s) + ' B';
};
console.log('[归档] 移出 ' + moved.length + ' 行 → ' + ARCH);
console.log('[归档] 守恒核对：原 ' + lines.length + ' 行 = 新主 ' + (head.length + tail.length) + ' 行 + 归档 ' + moved.length + ' 行 + 余量');
console.log('[体积] memory.md → ' + chk(MAIN));
console.log('[体积] 归档 → ' + chk(ARCH));
console.log('[体积] 备份 → ' + chk(BAK));
