#!/usr/bin/env node
/**
 * build-player-ledger.mjs — 构建 FC27 五类球员台账（传奇 / 英雄 / 周黑 / 活动卡 / 83+）
 *
 * 用途：把项目已有的传奇卡、英雄卡、金卡数据，归一成统一的五类台账（category 字段区分），
 *       并初始化周黑 / 活动卡 / 83+ 的台账骨架（前两者为空骨架，等待采集脚本填充；
 *       83+ 从金卡库筛 ovr>=83 即时生成）。
 *
 * 输入（全部本地文件，不联网）：
 *   apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json   传奇卡 131 张
 *   apps/market/engine/heroes/data/prices/fc27/base-heroes.json             英雄卡 50 张
 *   apps/market/engine/gold/data/players/fc27/fc27-gold-playstyles.json     金卡 227 张
 *
 * 输出（统一 schema，cardId 为唯一键，跨文件关联一律按 cardId）：
 *   apps/market/engine/icons/data/players/fc27/ledger-icons.json            传奇台账
 *   apps/market/engine/heroes/data/players/fc27/ledger-heroes.json          英雄台账
 *   apps/market/engine/totw/data/players/fc27/totw-current.json             本周周黑（空骨架）
 *   apps/market/engine/totw/data/players/fc27/totw-history.json             周黑历史库（空骨架）
 *   apps/market/engine/promo/data/players/fc27/activity-current.json        本周活动卡（空骨架）
 *   apps/market/engine/promo/data/players/fc27/activity-history.json        活动卡历史（空骨架）
 *   apps/market/engine/promo/data/players/fc27/rating83plus.json            83+ 池（金卡 ovr>=83）
 *
 * 统一卡结构（每张卡）：
 *   cardId   卡片唯一 ID（从 url/id 提取的纯数字串）
 *   slug / name / nameZh
 *   rating    能力值（金卡用 ovr，传奇/英雄用 rating）
 *   position / altPos
 *   category  icon | hero | totw | activity | rating83plus
 *   version   版本标签（Icon / Base Heroes / TOTW / 活动系列名 / ""）
 *   marketUrl FUTBIN 详情页 URL
 *   source    数据来源文件（审计用）
 *
 * 用法：node apps/market/engine/scripts/build-player-ledger.mjs
 *       幂等：重跑覆盖同名台账，不删改历史（history 文件仅在首次不存在时创建）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT ? path.resolve(process.env.FC_PROJECT_ROOT) : path.resolve(HERE, '../../../..');
const ENGINE = path.join(ROOT, 'apps', 'market', 'engine');

const readJSON = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const writeJSON = (p, obj) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
};
const atomicWriteJSON = (p, obj) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
};

// 从 url 或 id 提取纯数字 cardId（项目铁律：跨文件关联一律按 cardId）
function cardIdOf(value) {
  const s = String(value ?? '');
  const m = s.match(/\/player\/([^/?#]+)/);
  return m ? m[1] : s;
}

// ── 1. 传奇卡 ─────────────────────────────────────────────────────────────
const icons = readJSON(path.join(ENGINE, 'icons/data/players/fc27/fc27-icons-playstyles.json')) || [];
const iconLedger = icons.map(p => ({
  cardId: cardIdOf(p.id),
  slug: p.slug || '',
  name: p.name || '',
  nameZh: p.nameZh || '',
  rating: typeof p.rating === 'number' ? p.rating : null,
  position: p.position || '',
  altPos: p.altPos || [],
  category: 'icon',
  version: 'Icon',
  marketUrl: `https://www.futbin.com/27/player/${cardIdOf(p.id)}/${p.slug || ''}`,
  source: 'fc27-icons-playstyles.json',
}));

// ── 2. 英雄卡 ─────────────────────────────────────────────────────────────
const heroesData = readJSON(path.join(ENGINE, 'heroes/data/prices/fc27/base-heroes.json'));
const heroes = (heroesData?.players || heroesData || []);
const heroLedger = heroes.map(p => ({
  cardId: cardIdOf(p.id || p.marketUrl),
  slug: p.slug || '',
  name: p.name || '',
  nameZh: p.nameZh || '',
  rating: typeof p.rating === 'number' ? p.rating : null,
  position: p.position || '',
  altPos: p.altPos || [],
  category: 'hero',
  version: 'Base Heroes',
  marketUrl: p.marketUrl || `https://www.futbin.com/27/player/${cardIdOf(p.id || p.marketUrl)}/${p.slug || ''}`,
  source: 'base-heroes.json',
}));

// ── 3. 83+ 池（金卡 ovr>=83）──────────────────────────────────────────────
const gold = readJSON(path.join(ENGINE, 'gold/data/players/fc27/fc27-gold-playstyles.json')) || [];
const r83 = gold.filter(p => Number(p.ovr) >= 83).map(p => ({
  cardId: cardIdOf(p.url),
  slug: p.slug || '',
  name: p.name || '',
  nameZh: p.nameZh || '',
  rating: Number(p.ovr),
  position: p.position || '',
  altPos: p.altPos || [],
  category: 'rating83plus',
  version: '',
  marketUrl: p.url || '',
  source: 'fc27-gold-playstyles.json',
}));

// ── 4. 周黑 / 活动卡空骨架（仅首次创建，不覆盖已有采集结果）──────────────
const emptyLedger = (category, label) => ({
  schemaVersion: 1,
  game: 'fc27',
  category,
  label,
  generatedAt: new Date().toISOString(),
  players: [],
});

const totwCurrentPath = path.join(ENGINE, 'totw/data/players/fc27/totw-current.json');
const totwHistoryPath = path.join(ENGINE, 'totw/data/players/fc27/totw-history.json');
const activityCurrentPath = path.join(ENGINE, 'promo/data/players/fc27/activity-current.json');
const activityHistoryPath = path.join(ENGINE, 'promo/data/players/fc27/activity-history.json');

// ── 5. 写盘 ───────────────────────────────────────────────────────────────
const iconLedgerPath = path.join(ENGINE, 'icons/data/players/fc27/ledger-icons.json');
const heroLedgerPath = path.join(ENGINE, 'heroes/data/players/fc27/ledger-heroes.json');
const r83LedgerPath = path.join(ENGINE, 'promo/data/players/fc27/rating83plus.json');

const wrap = (category, players) => ({
  schemaVersion: 1,
  game: 'fc27',
  category,
  generatedAt: new Date().toISOString(),
  count: players.length,
  players,
});

atomicWriteJSON(iconLedgerPath, wrap('icon', iconLedger));
atomicWriteJSON(heroLedgerPath, wrap('hero', heroLedger));
atomicWriteJSON(r83LedgerPath, wrap('rating83plus', r83));

if (!fs.existsSync(totwCurrentPath)) writeJSON(totwCurrentPath, emptyLedger('totw', '本周周黑'));
if (!fs.existsSync(totwHistoryPath)) writeJSON(totwHistoryPath, emptyLedger('totw', '周黑历史库'));
if (!fs.existsSync(activityCurrentPath)) writeJSON(activityCurrentPath, emptyLedger('activity', '本周活动卡'));
if (!fs.existsSync(activityHistoryPath)) writeJSON(activityHistoryPath, emptyLedger('activity', '活动卡历史库'));

console.log(JSON.stringify({
  icon: iconLedger.length,
  hero: heroLedger.length,
  rating83plus: r83.length,
  totwCurrent: '骨架已建（空）',
  activityCurrent: '骨架已建（空）',
}, null, 2));
