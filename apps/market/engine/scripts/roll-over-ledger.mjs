#!/usr/bin/env node
/**
 * roll-over-ledger.mjs — FC27 台账滚动合并（周黑 / 活动卡 / 83+ 池）
 *
 * 用途：按周滚动规则把「当前」台账并入「历史」库，为下一轮采集腾出「当前」位。
 *
 * 滚动规则（需求 2/3，2026-09-20 定稿）：
 *   - 周四 03:00：`totw-current.json`（上周周黑）→ 并入 `totw-history.json` 历史库（累加，按 cardId 去重）。
 *   - 周六 03:00：`activity-current.json`（上周活动卡）→ 并入 `rating83plus.json`（83+ 池，累加，按 cardId 去重），
 *     并同时并入 `activity-history.json` 活动卡历史库。
 *
 * 用法：
 *   node apps/market/engine/scripts/roll-over-ledger.mjs totw       # 周四：周黑滚动
 *   node apps/market/engine/scripts/roll-over-ledger.mjs activity   # 周六：活动卡滚动
 *   node apps/market/engine/scripts/roll-over-ledger.mjs all        # 两者都滚（调试用）
 *
 * 幂等与安全：
 *   - 按 cardId 去重（项目铁律：跨文件关联一律按 cardId，禁用 slug/name）。
 *   - 原子写；history 文件累加不删；current 文件在滚动后清空为骨架，等待下一轮采集覆盖。
 *   - 若 current 为空（无上周数据），只清空 current，不向 history 写入空记录。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const ENGINE = path.join(ROOT, 'apps', 'market', 'engine');

const PATHS = {
  totw: {
    current: path.join(ENGINE, 'totw/data/players/fc27/totw-current.json'),
    history: path.join(ENGINE, 'totw/data/players/fc27/totw-history.json'),
    label: '周黑',
  },
  activity: {
    current: path.join(ENGINE, 'promo/data/players/fc27/activity-current.json'),
    history: path.join(ENGINE, 'promo/data/players/fc27/activity-history.json'),
    r83: path.join(ENGINE, 'promo/data/players/fc27/rating83plus.json'),
    label: '活动卡',
  },
};

const readJSON = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const nowIso = () => new Date().toISOString();

function atomicWrite(target, obj) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  renameSync(tmp, target);
}

// 按 cardId 去重合并（保留先到者，后到同 cardId 丢弃）
function mergeByCardId(a, b) {
  const seen = new Set();
  const out = [];
  for (const p of [...a, ...b]) {
    if (!p || !p.cardId && !p.id) continue;
    const k = String(p.cardId ?? p.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function asPlayers(doc) {
  if (!doc) return [];
  return Array.isArray(doc) ? doc : (doc.players || []);
}

function emptyLedger(category, label) {
  return { schemaVersion: 1, game: 'fc27', category, label, generatedAt: nowIso(), players: [] };
}

function rollTotw() {
  const cur = readJSON(PATHS.totw.current);
  const his = readJSON(PATHS.totw.history);
  const curPlayers = asPlayers(cur);
  const hisPlayers = asPlayers(his);

  const merged = mergeByCardId(hisPlayers, curPlayers);
  const added = merged.length - hisPlayers.length;

  atomicWrite(PATHS.totw.history, {
    schemaVersion: 1, game: 'fc27', category: 'totw', label: '周黑历史库',
    generatedAt: nowIso(), count: merged.length, players: merged,
  });
  atomicWrite(PATHS.totw.current, emptyLedger('totw', '本周周黑'));

  return { kind: 'totw', moved: curPlayers.length, addedNew: added, historyTotal: merged.length };
}

function rollActivity() {
  const cur = readJSON(PATHS.activity.current);
  const his = readJSON(PATHS.activity.history);
  const r83 = readJSON(PATHS.r83);
  const curPlayers = asPlayers(cur);
  const hisPlayers = asPlayers(his);
  const r83Players = asPlayers(r83);

  // 活动卡并入活动卡历史库
  const mergedHist = mergeByCardId(hisPlayers, curPlayers);
  atomicWrite(PATHS.activity.history, {
    schemaVersion: 1, game: 'fc27', category: 'activity', label: '活动卡历史库',
    generatedAt: nowIso(), count: mergedHist.length, players: mergedHist,
  });

  // 活动卡并入 83+ 池（累加）
  const mergedR83 = mergeByCardId(r83Players, curPlayers);
  const r83Added = mergedR83.length - r83Players.length;
  atomicWrite(PATHS.r83, {
    schemaVersion: 1, game: 'fc27', category: 'rating83plus', label: '83+ 卡池',
    generatedAt: nowIso(), count: mergedR83.length, players: mergedR83,
  });

  atomicWrite(PATHS.activity.current, emptyLedger('activity', '本周活动卡'));

  return {
    kind: 'activity', moved: curPlayers.length,
    historyTotal: mergedHist.length, r83Total: mergedR83.length, r83AddedNew: r83Added,
  };
}

const mode = process.argv[2] || 'all';
const results = [];
if (mode === 'totw' || mode === 'all') results.push(rollTotw());
if (mode === 'activity' || mode === 'all') results.push(rollActivity());

console.log(JSON.stringify(results, null, 2));
