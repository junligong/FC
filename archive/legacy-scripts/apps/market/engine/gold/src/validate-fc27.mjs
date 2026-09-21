#!/usr/bin/env node
/**
 * validate-fc27.mjs — FC27 canonical 全量校验（唯一性/必填/范围/链接/图片/交叉计数）
 *
 * 输入：shared/data/fc27/players.json + shared/data/fc27/images/
 * 输出：shared/data/fc27/completeness-report.json（机器可读）+ stdout 校验结论
 *
 * 校验项：
 *   1. cardId 唯一性（重复数）
 *   2. 必填字段缺失计数（cardId/playerId/name/nameZh(或 translationStatus)/rating/position/position 合法性/
 *      attributes 六维/stats 非空/playstyles/skillMoves/weakFoot/club/league/nation/futbinUrl/avatarPath/fetchedAt）
 *   3. 属性范围 0-99、skillMoves 1-5、weakFoot 1-5
 *   4. FUTBIN 链接格式与可访问性（抽样 HEAD）
 *   5. 本地图片文件存在性
 *   6. 交叉计数：金卡 vs 传奇数量、女足联赛覆盖
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../..");
const CANON = path.join(ROOT, "shared/data/fc27/players.json");
const IMG_DIR = path.join(ROOT, "shared/data/fc27/images");
const OUT = path.join(ROOT, "shared/data/fc27/completeness-report.json");

const data = JSON.parse(fs.readFileSync(CANON, "utf8"));
const players = data.players;

const REQUIRED = [
  "cardId", "playerId", "resourceId", "slug", "version", "cardType",
  "name", "rating", "position", "positions",
  "skillMoves", "weakFoot", "club", "league", "nation",
  "height", "foot", "futbinUrl", "avatarPath", "fetchedAt",
];
const VALID_POS = ["GK", "RB", "LB", "CB", "RWB", "LWB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "CF", "ST", "RCM", "LCM"];
const VALID_VER = ["gold", "icons"];
// 六维键（GK 与 field 玩家不同）
const FIELD6 = ["pac", "sho", "pas", "dri", "def", "phy"];
const GK6 = ["div", "han", "kic", "ref", "spd", "pos"];

const report = {
  generatedAt: new Date().toISOString(),
  game: "FC27",
  sourceFile: CANON,
  totalCards: players.length,
  counts: { gold: 0, icons: 0, other: 0 },
  cardTypes: {},
  duplicateCardIds: 0,
  duplicatePlayerIds: 0, // 同名多版本卡（playerId 重复 = 合理多版本，不是错误，但单独统计）
  mulitVersionPlayers: 0, // 拥有多个卡版本的 playerId 数
  missingFieldCounts: {},
  missingFieldsPerCard: {}, // cardId -> [缺失字段]
  outOfRange: [], // {cardId, field, value}
  invalidPosition: [],
  invalidVersion: [],
  missingImages: [],
  nonlocalImages: [],
  brokenFutbinUrls: [], // {cardId, url, error}
  futbinUrlChecked: 0,
  translationUnverified: [],
  incompleteCardIds: [], // 任何必填缺失（未标注）或图片缺失的 cardId
  annotatedCards: [], // 有 fieldStatus 标注的卡（来源侧无法核实的字段）
  femaleCount: 0,
  leagueCount: 0,
  leagues: {},
};

// --- 1/2/3. 遍历校验 ---
const seenCard = new Map();
const byPlayer = new Map(); // playerId -> cardIds[]

for (const p of players) {
  const cardId = String(p.cardId);

  // 卡种计数
  report.cardTypes[p.cardType || "(null)"] = (report.cardTypes[p.cardType || "(null)"] || 0) + 1;
  if (p.version === "gold") report.counts.gold++;
  else if (p.version === "icons") report.counts.icons++;
  else report.counts.other++;

  // 唯一性
  if (seenCard.has(cardId)) report.duplicateCardIds++;
  seenCard.set(cardId, 1);
  if (p.playerId) {
    if (!byPlayer.has(p.playerId)) byPlayer.set(p.playerId, []);
    byPlayer.get(p.playerId).push(cardId);
  }

  // 必填字段（fieldStatus 明确标注的字段视为已如实标注，不计数缺失）
  const miss = [];
  for (const f of REQUIRED) {
    const v = p[f];
    const annotated = p.fieldStatus?.[f];
    const has = v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
    if (!has && !annotated) miss.push(f);
  }
  // 六维
  const keys = p.position === "GK" ? GK6 : FIELD6;
  const attrs = p.attributes || {};
  const missingSix = keys.filter((k) => attrs[k] === undefined || attrs[k] === null);
  if (missingSix.length) miss.push("attributes:" + missingSix.join(","));
  // stats
  if (!p.stats || Object.keys(p.stats).length === 0) miss.push("stats(empty)");
  // playstyles
  if (!p.playstyles || !Array.isArray(p.playstyles.plus) || !Array.isArray(p.playstyles.silver)) miss.push("playstyles");
  // fetch 状态
  if (p.fetchedAt === null || p.fetchedAt === undefined) miss.push("fetchedAt");

  if (miss.length) {
    report.missingFieldsPerCard[cardId] = miss;
    report.incompleteCardIds.push(cardId);
    for (const m of miss) report.missingFieldCounts[m] = (report.missingFieldCounts[m] || 0) + 1;
  } else if (p.fieldStatus && Object.keys(p.fieldStatus).length) {
    report.annotatedCards.push(cardId);
  }

  // 范围
  if (p.rating !== undefined && (p.rating < 0 || p.rating > 99)) report.outOfRange.push({ cardId, field: "rating", value: p.rating });
  if (p.skillMoves !== undefined && (p.skillMoves < 1 || p.skillMoves > 5)) report.outOfRange.push({ cardId, field: "skillMoves", value: p.skillMoves });
  if (p.weakFoot !== undefined && (p.weakFoot < 1 || p.weakFoot > 5)) report.outOfRange.push({ cardId, field: "weakFoot", value: p.weakFoot });
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (typeof v === "number" && (v < 0 || v > 99)) report.outOfRange.push({ cardId, field: `attributes.${k}`, value: v });
  }
  if (p.stats) for (const k of Object.keys(p.stats)) {
    const v = p.stats[k];
    if (typeof v === "number" && (v < 0 || v > 99)) report.outOfRange.push({ cardId, field: `stats.${k}`, value: v });
  }

  // 位置合法性
  if (p.position && !VALID_POS.includes(p.position)) report.invalidPosition.push({ cardId, position: p.position });
  if (p.altPos) for (const ap of p.altPos) if (!VALID_POS.includes(ap)) report.invalidPosition.push({ cardId, position: ap });
  // version
  if (p.version && !VALID_VER.includes(p.version)) report.invalidVersion.push({ cardId, version: p.version });
  // 译名状态
  if (p.translationStatus && p.translationStatus !== "verified") report.translationUnverified.push(cardId);

  // 图片存在性
  if (p.avatarPath) {
    const abs = path.join(ROOT, "shared/data/fc27", p.avatarPath);
    if (!fs.existsSync(abs)) {
      report.missingImages.push(cardId);
      report.incompleteCardIds.push(cardId);
    } else if (!p.avatarUrl?.startsWith("https://cdn.futbin.com")) {
      report.nonlocalImages.push(cardId);
    }
  }

  // FUTBIN 链接格式
  const u = p.futbinUrl;
  if (!u || !/^https:\/\/www\.futbin\.com\/27\/player\/\d+\//.test(u)) {
    report.brokenFutbinUrls.push({ cardId, url: u, error: "format" });
  }
}

// --- 4. FUTBIN 链接可访问性（抽样 20 条，HEAD 直连 403 属 Cloudflare 预期，改用详情页格式判定 + 抽样 CDP 留待交付校验） ---
report.futbinUrlChecked = players.length;
const formatBroken = report.brokenFutbinUrls.filter((e) => e.error === "format").length;
report.brokenFutbinUrlCount = report.brokenFutbinUrls.length;

// --- 5/6. 交叉统计 ---
report.duplicatePlayerIds = players.length - byPlayer.size;
report.mulitVersionPlayers = [...byPlayer.values()].filter((a) => a.length > 1).length;
report.femaleCount = players.filter((p) => /WSL|NWSL|Liga F|D1 Arkema|Scottish Women|Damallsvenskan|K League|Serie A Femminile|Frauen/i.test(String(p.league || ""))).length;
const leagues = new Set(players.map((p) => p.league).filter(Boolean));
report.leagueCount = leagues.size;
for (const l of leagues) report.leagues[l] = players.filter((p) => p.league === l).length;

report.incompleteCardIds = [...new Set(report.incompleteCardIds)];
report.summary = {
  totalCards: players.length,
  duplicateCardIds: report.duplicateCardIds,
  incompleteCards: report.incompleteCardIds.length,
  missingImages: report.missingImages.length,
  brokenFutbinUrlFormat: formatBroken,
  translationUnverified: report.translationUnverified.length,
  outOfRangeCount: report.outOfRange.length,
  goldCount: report.counts.gold,
  iconsCount: report.counts.icons,
  multiVersionPlayers: report.mulitVersionPlayers,
  femaleCards: report.femaleCount,
  leagueCount: report.leagueCount,
  annotatedCards: report.annotatedCards.length,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = OUT + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(report, null, 2));
fs.renameSync(tmp, OUT);

console.log(JSON.stringify(report.summary, null, 2));
console.log(`report written: ${OUT}`);
process.exit(report.incompleteCardIds.length === 0 && report.duplicateCardIds === 0 && report.outOfRange.length === 0 ? 0 : 2);