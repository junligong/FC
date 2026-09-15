#!/usr/bin/env node
/**
 * 足球日报「三榜」数据校验闸门
 * 用途：检查 reports/daily/D/football.html 的积分榜 / 射手榜 / 助攻榜是否结构正确、互不混淆，
 *       重点拦截历史上出现过的错误——射手榜或助攻榜被整段填成积分榜数据（或三榜互相复制）。
 * 输入：reports/daily/D/football.html（可用 FC_FOOTBALL_HTML 覆盖路径）。
 * 输出：stdout 的校验报告；退出码 0=通过，1=不通过。可用 --json 输出机器可读结果。
 *
 * 判定规则：
 *   R1 三榜数据块均存在且为对象；
 *   R2 积分榜每行 10 列（排名/球队/赛/胜/平/负/进/失/净/积分）；
 *   R3 射手榜、助攻榜每行 4 列，且末列为数字（排名/球员/球队/进球或助攻）；
 *   R4 任一联赛的射手榜/助攻榜不得与积分榜逐行相同（原文重复即判失败）；
 *   R5 射手榜与助攻榜不得互相完全相同；
 *   R6 覆盖率：至少 1 个联赛有射手榜、至少 1 个联赛有助攻榜；
 *   R7 积分榜缺口：单个联赛超过 30% 行含 '-' 占位时给出告警（不判失败）。
 *
 * 用法：node automation/verify-football-boards.mjs [YYYY-MM-DD] [--json]
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '..');

function todayShanghai() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const dateStr = dateArg || todayShanghai();

const htmlPath = process.env.FC_FOOTBALL_HTML || path.join(ROOT, 'reports', 'daily', dateStr, 'football.html');

function extractBlock(html, name) {
  const re = new RegExp('const ' + name + ' = \\{[\\s\\S]*?\\};');
  const m = html.match(re);
  return m ? m[0] : null;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const result = { date: dateStr, html: htmlPath, ok: false, errors: [], warnings: [], stats: {} };

if (!existsSync(htmlPath)) {
  result.errors.push(`未找到足球日报：${htmlPath}`);
} else {
  const html = readFileSync(htmlPath, 'utf8');
  if (!html.includes(dateStr)) result.errors.push(`报告内容未包含日期 ${dateStr}`);

  const blocks = {
    standingsData: extractBlock(html, 'standingsData'),
    scorersData: extractBlock(html, 'scorersData'),
    assistsData: extractBlock(html, 'assistsData'),
  };
  for (const [k, v] of Object.entries(blocks)) {
    if (!v) result.errors.push(`R1 未找到数据块 ${k}`);
  }

  if (!result.errors.length) {
    let data;
    try {
      data = new Function(`${blocks.standingsData}\n${blocks.scorersData}\n${blocks.assistsData}\nreturn {standingsData,scorersData,assistsData};`)();
    } catch (e) {
      result.errors.push(`数据块无法解析：${e.message}`);
    }
    if (data) {
      const { standingsData, scorersData, assistsData } = data;
      const leagues = Object.keys(standingsData || {});
      result.stats.leagues = leagues;

      // R2 积分榜列数
      for (const lg of leagues) {
        const rows = standingsData[lg] || [];
        if (!rows.length) { result.warnings.push(`积分榜 ${lg} 为空`); continue; }
        const bad = rows.findIndex(r => !Array.isArray(r) || r.length !== 10);
        if (bad >= 0) result.errors.push(`R2 积分榜 ${lg} 第 ${bad + 1} 行列数不是 10（实为 ${(rows[bad] || []).length}）`);
        const gap = rows.filter(r => r.some(c => c === '-')).length;
        if (rows.length && gap / rows.length > 0.3) {
          result.warnings.push(`R7 积分榜 ${lg} 有 ${gap}/${rows.length} 行含「-」占位，需补齐进失球/积分`);
        }
      }

      // R3 + R4 射手/助攻榜结构与非重复
      for (const [name, board] of [['射手榜', scorersData], ['助攻榜', assistsData]]) {
        if (!board || typeof board !== 'object') { result.errors.push(`R1 ${name} 数据缺失`); continue; }
        for (const lg of Object.keys(board)) {
          const rows = board[lg] || [];
          const bad = rows.findIndex(r => !Array.isArray(r) || r.length !== 4 || typeof r[3] !== 'number');
          if (bad >= 0) result.errors.push(`R3 ${name} ${lg} 第 ${bad + 1} 行不是 [排名,球员,球队,数字] 结构`);
          if (standingsData[lg] && deepEqual(rows, standingsData[lg])) {
            result.errors.push(`R4 ${name} ${lg} 与积分榜数据完全相同（整段误填积分榜）`);
          }
        }
      }
      // R5 射手榜与助攻榜不得互相完全相同
      for (const lg of Object.keys(scorersData || {})) {
        if (assistsData && assistsData[lg] && deepEqual(scorersData[lg], assistsData[lg])) {
          result.errors.push(`R5 ${lg} 射手榜与助攻榜数据完全相同`);
        }
      }
      // R6 覆盖率
      const scLeagues = Object.keys(scorersData || {}).filter(l => (scorersData[l] || []).length);
      const asLeagues = Object.keys(assistsData || {}).filter(l => (assistsData[l] || []).length);
      result.stats.scorerLeagues = scLeagues;
      result.stats.assistLeagues = asLeagues;
      if (!scLeagues.length) result.errors.push('R6 没有任何联赛提供射手榜数据');
      if (!asLeagues.length) result.errors.push('R6 没有任何联赛提供助攻榜数据');
      const uncoveredS = leagues.filter(l => !scLeagues.includes(l) && l !== 'ucl');
      const uncoveredA = leagues.filter(l => !asLeagues.includes(l) && l !== 'ucl');
      if (uncoveredS.length) result.warnings.push(`射手榜未覆盖联赛：${uncoveredS.join('、')}`);
      if (uncoveredA.length) result.warnings.push(`助攻榜未覆盖联赛：${uncoveredA.join('、')}`);
    }
  }
}

result.ok = result.errors.length === 0;

// 校验报告落盘
try {
  const dir = path.join(ROOT, 'automation', 'runs', dateStr, 'football');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'board-check.json'), JSON.stringify(result, null, 2), 'utf8');
} catch { /* 忽略落盘失败 */ }

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`=== 足球三榜校验（${dateStr}）===`);
  if (result.errors.length) { console.log('✗ 不通过：'); result.errors.forEach(e => console.log('  - ' + e)); }
  else console.log('✓ 三榜结构与去重检查通过');
  if (result.warnings.length) { console.log('提醒：'); result.warnings.forEach(w => console.log('  - ' + w)); }
  if (result.stats.scorerLeagues) console.log(`射手榜覆盖：${result.stats.scorerLeagues.join('、') || '无'}`);
  if (result.stats.assistLeagues) console.log(`助攻榜覆盖：${result.stats.assistLeagues.join('、') || '无'}`);
}

process.exit(result.ok ? 0 : 1);
