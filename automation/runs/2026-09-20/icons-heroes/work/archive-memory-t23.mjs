// archive-memory-t23.mjs —— 确定性归档：把 09-20 早轮（T00–T10）移出主文件，保留 T15/T19，行数守恒
import fs from 'node:fs';
const DIR = '/Users/wuyanzu/Desktop/FC/.workbuddy/memory/automations/7123b0fe-8129-4570-95ce-8e96834f265e';
const MAIN = `${DIR}/memory.md`;
const ARCH = `${DIR}/memory-archive-2026-09-20-early.md`;
const bak = `${MAIN}.bak-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`;

const raw = fs.readFileSync(MAIN, 'utf8');
const lines = raw.split('\n');
fs.writeFileSync(bak, raw);

// 边界：第一个 '### ' 行之前为文件头；T15 标题行之前为待归档段
const idx = [];
lines.forEach((l, i) => { if (l.startsWith('### ')) idx.push(i); });
const firstHeading = idx[0];
const t15 = lines.findIndex(l => l.startsWith('### ') && /（T15）/.test(l));
if (firstHeading !== 32 || t15 < 0) throw new Error(`边界断言失败：firstHeading=${firstHeading} t15=${t15}`);

const header = lines.slice(0, firstHeading);
const toArchive = lines.slice(firstHeading, t15);
const keep = lines.slice(t15);

const archHeader = [
  '# FC·传奇价格区间 — 历史执行记忆（2026-09-20 早轮 T00–T10 归档）',
  '',
  '> 由 `archive-memory-t23.mjs` 于 2026-09-20 T23 轮确定性切分（按 `### ` 行边界），原文未改写。',
  '> 主文件保留 09-20 的 T15 / T19 / T23。跨轮追溯请开本文件。',
  '',
];
const archExists = fs.existsSync(ARCH);
fs.writeFileSync(ARCH, (archExists ? fs.readFileSync(ARCH, 'utf8') + '\n' : archHeader.join('\n')) + toArchive.join('\n') + '\n');
fs.writeFileSync(MAIN, header.join('\n') + '\n' + keep.join('\n'));

const total = lines.length;
console.log(`主文件 ${total} 行 → ${keep.length + header.length + 1} 行（头 ${header.length} + 保留 ${keep.length}）`);
console.log(`归档段 ${toArchive.length} 行（T00–T10，首个标题行 ${firstHeading + 1} / T15 标题行 ${t15 + 1}）`);
console.log(`守恒校验：${header.length} + ${toArchive.length} + ${keep.length} = ${header.length + toArchive.length + keep.length} vs 原文 ${total} → ${header.length + toArchive.length + keep.length === total ? 'OK ✔' : 'MISMATCH ✘'}`);
console.log(`备份 ${bak}`);
console.log(`归档文件 ${ARCH} ${fs.statSync(ARCH).size} B · 主文件 ${fs.statSync(MAIN).size} B`);
