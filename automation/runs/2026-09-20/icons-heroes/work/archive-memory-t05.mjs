// 一次性脚本（临时）：把 memory.md 中 2026-09-19 的 T07–T23 逐轮记录无损移入归档文件。
// 规则：主文件保留「头部（1..34 行的契约/字段备忘/待决）」+「2026-09-20 起的轮次」，行内容逐字不改写。
// 先 cp 备份，写入后打印行数守恒与字节数。
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/Users/wuyanzu/Desktop/FC/.workbuddy/memory/automations/7123b0fe-8129-4570-95ce-8e96834f265e';
const MAIN = path.join(DIR, 'memory.md');
const ARCH = path.join(DIR, 'memory-archive-2026-09-19.md');
const BAK = path.join(DIR, 'memory.md.bak-20260920T0508');

const FROM = 35;   // 1-based，含
const TO = 279;    // 1-based，含

const main = fs.readFileSync(MAIN, 'utf8');
fs.copyFileSync(MAIN, BAK);
const lines = main.split('\n');
const before = lines.length;

// 边界自检：起始行必须是 09-19 T07 标题，结束行必须是空行，下一行必须是 09-20 条目
if (!/^### 2026-09-19 07:54–07:58（T07）/.test(lines[FROM - 1])) throw new Error('起始边界不符: ' + lines[FROM - 1]);
if (lines[TO - 1].trim() !== '') throw new Error('结束边界应为空行: ' + JSON.stringify(lines[TO - 1]));
if (!/^### 2026-09-20 00:34–00:41（T00/.test(lines[TO])) throw new Error('结束边界后一行不符: ' + lines[TO]);

const head = lines.slice(0, FROM - 1);
const moved = lines.slice(FROM - 1, TO);
const rest = lines.slice(TO);

const archHeader = [
  '',
  '---',
  '',
  `## 归档补充（2026-09-20 05:08 执行）：2026-09-19 的 T07–T23 逐轮记录（共 ${moved.length} 行，原文未改写）`,
  '',
].join('\n');
fs.appendFileSync(ARCH, archHeader + moved.join('\n') + '\n');

fs.writeFileSync(MAIN, head.join('\n') + '\n' + rest.join('\n'));

const afterLines = fs.readFileSync(MAIN, 'utf8').split('\n');
console.log(`主文件：${before} 行 / ${Buffer.byteLength(main)} B → ${afterLines.length} 行 / ${Buffer.byteLength(fs.readFileSync(MAIN, 'utf8'))} B`);
console.log(`移出：${moved.length} 行（含首行 ${moved[0].slice(0, 30)}…）`);
console.log(`守恒：${before} = 头部 ${head.length} + 移出 ${moved.length} + 保留 ${rest.length} → ${head.length + moved.length + rest.length}`);
console.log(`归档文件：${Buffer.byteLength(fs.readFileSync(ARCH, 'utf8'))} B`);
console.log(`备份：${BAK}`);
