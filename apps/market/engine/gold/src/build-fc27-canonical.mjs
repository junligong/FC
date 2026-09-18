#!/usr/bin/env node
/**
 * build-fc27-canonical.mjs — 构建 FC27 权威球员数据库 canonical JSON
 *
 * 输入（全部来自 tmp-fetch 采集层，均为同一赛季 FC27 已核实数据）：
 *   gold-lists.jsonl   （2671 金卡：id/ovr/name/pos/nation/league/club/skills/wf）
 *   icons-lists.jsonl  （290 传奇：同上）
 *   fc27-detail-v2.jsonl（详情：name/ovr/six/stats/playstyles/altPos/roles/rawInfo/resourceId/avatarUrl/href）
 *   apps/market/engine/data/players/database/fc27.json（已有中文名/身高/卡型等权威字段）
 *   apps/market/engine/data/players/chinese-name-supplement.json（slug→中文名 689 条）
 * 输出（canonical，项目唯一权威全量库）：
 *   shared/data/fc27/players.json
 *
 * 关联规则：
 *   cardId   = FUTBIN 列表页卡 id（唯一）
 *   playerId = resourceId（CDN 图片球员 id，同名多版本共用 → 关联同一球员）
 *   中文名：fc27.json.nameZh > chinese-name-supplement > 保留英文名并标 translationStatus
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../.."); // FC 根
const TMP = path.resolve(__dirname, "../data/players/fc27/tmp-fetch");
const OUT = path.join(ROOT, "shared/data/fc27/players.json");

const readLines = (p) =>
  fs.existsSync(p)
    ? fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

// ---------- 1. 加载列表元数据 ----------
const goldList = readLines(path.join(TMP, "gold-lists.jsonl"));
const iconsList = readLines(path.join(TMP, "icons-lists.jsonl"));
const details = readLines(path.join(TMP, "fc27-detail-v2.jsonl"));
console.log(`lists: gold=${goldList.length} icons=${iconsList.length} detail=${details.length}`);

// ---------- 2. 加载已有权威字段（中文名/身高/卡型） ----------
const db = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/market/engine/data/players/database/fc27.json"), "utf8"));
const dbBySlug = new Map();
for (const p of db.players || []) dbBySlug.set(p.slug, p);
const supp = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/market/engine/data/players/chinese-name-supplement.json"), "utf8"));
const suppMap = supp.mappings || {};

const zhOf = (p) => {
  const src = dbBySlug.get(p.slug)?.nameZh || suppMap[p.slug];
  if (src) return { nameZh: src, translationStatus: "verified" };
  return { nameZh: null, translationStatus: "missing" };
};

// ---------- 3. 详情索引（cardId → detail），去重保最新 ----------
const detailById = new Map();
for (const d of details) if (!detailById.has(d.id)) detailById.set(d.id, d);

// ---------- 4. 构建 ----------
const players = [];
const seenCard = new Set();
let dup = 0, noDetail = 0;
for (const item of [...goldList, ...iconsList]) {
  const cardId = String(item.id);
  if (seenCard.has(cardId)) { dup++; continue; }
  seenCard.add(cardId);
  const d = detailById.get(cardId);
  if (!d) { noDetail++; }
  const slug = decodeURIComponent(item.href.split("/").filter(Boolean).pop() || "");
  const { nameZh, translationStatus } = zhOf({ slug });
  const infoRaw = d?.rawInfo || "";
  const infoParts = infoRaw.split("|").map((s) => s.trim()).filter(Boolean);
  const isIcon = item.v === "icons";

  // 六维：详情优先，列表兜底；GK 卡强制用 GK 键，缺失时从 stats 派生
  let six = null;
  if (d?.six && Object.keys(d.six).length) six = d.six;
  else if (item.six) {
    try {
      const arr = JSON.parse(item.six);
      six = { pac: +arr[0], sho: +arr[1], pas: +arr[2], dri: +arr[3], def: +arr[4], phy: +arr[5] };
    } catch { six = null; }
  }
  const isGK = item.pos === "GK";
  const gkCore = ["gk_diving", "gk_handling", "gk_kicking", "gk_reflexes", "gk_speed"];
  // 注：GK 站位键名两种并存——金卡 stats 用 gk_positioning，传奇卡用 positioning
  if (isGK) {
    const gkPos = d?.stats?.gk_positioning ?? d?.stats?.positioning;
    const hasGkStats = gkCore.every((k) => d?.stats?.[k] !== undefined) && gkPos !== undefined;
    if (hasGkStats) {
      six = {
        div: +d.stats.gk_diving, han: +d.stats.gk_handling, kic: +d.stats.gk_kicking,
        ref: +d.stats.gk_reflexes, spd: +d.stats.gk_speed, pos: +gkPos,
      };
    } else if (six && Object.keys(six).length) {
      // 无 GK 细分时把 field 六维去掉，避免误标注
      six = null;
    }
  }

  // 主副位置：主=列表 pos（权威）；副=详情 altPos（白名单已过滤）+ 主位置修正
  const positions = [item.pos, ...(d?.altPos || [])].filter((v, i, a) => v && a.indexOf(v) === i);

  // rawInfo 内字段（Height/Foot/B.TYPE/Age）
  const findKv = (k) => {
    const i = infoParts.indexOf(k);
    return i >= 0 && infoParts[i + 1] ? infoParts[i + 1] : null;
  };
  const height = findKv("HEIGHT") || dbBySlug.get(slug)?.height || null;
  const foot = findKv("FOOT");
  const bodyType = findKv("B.TYPE");
  const ageRaw = findKv("AGE");

  // 卡种：rawInfo 前部含卡种（Gold / Icon），fallback
  let cardType = null;
  if (isIcon) cardType = "Icon";
  else {
    const gIdx = infoParts.indexOf("Gold");
    cardType = gIdx >= 0 ? "Gold" : "Gold";
  }

  // FUTBIN 链接（规范化为绝对路径）
  const futbinUrl = item.href;

  players.push({
    cardId,
    playerId: d?.resourceId ? String(d.resourceId) : null,
    resourceId: d?.resourceId ? String(d.resourceId) : null,
    slug,
    version: item.v, // gold | icons
    cardType,
    name: (d?.name || item.name || "").replace(/\s*Icon$/, "").trim(),
    nameZh,
    translationStatus,
    rating: d?.ovr ?? +item.ovr,
    position: item.pos,
    altPos: (d?.altPos || []).filter((p) => p !== item.pos),
    positions,
    attributes: six, // 六维 {pac,sho,pas,dri,def,phy}（GK 为 div/han/kic/ref/spd/pos）
    stats: d?.stats || {}, // 细分属性 34~40 项
    playstyles: {
      plus: d?.playstyles?.plus || [],
      silver: d?.playstyles?.silver || [],
    },
    skillMoves: +item.skills,
    weakFoot: +item.wf,
    club: item.club || null,
    league: item.league || null,
    nation: item.nation || null,
    height,
    foot,
    bodyType,
    age: ageRaw,
    roles: d?.roles || null,
    avatarUrl: d?.avatarUrl || null,
    avatarPath: d?.resourceId ? `images/${d.resourceId}.png` : null, // 相对 shared/data/fc27/
    // 来源侧无头像（FUTBIN 返回 notfound_1.png）时，如实标注无法核实原因，不伪造本地文件
    fieldStatus: d?.resourceId
      ? {}
      : { playerId: "not-available-on-source", resourceId: "not-available-on-source", avatarPath: "not-available-on-source" },
    futbinUrl,
    fetchedAt: d?.fetchedAt || null,
    sources: ["fc27-gold-lists", "fc27-detail-v2"].filter((s) => (!isIcon ? true : true)),
  });
}

// ---------- 5. 输出 ----------
const out = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  game: "FC27",
  description: "FC27 全量球员卡权威数据库（金卡 含男女 + 传奇 Icon），来自 FUTBIN 列表页与详情页实测",
  agentNote: "本文件由 build-fc27-canonical.mjs 生成，勿手改；图片存放于 shared/data/fc27/images/",
  count: players.length,
  counts: { gold: goldList.length, icons: iconsList.length },
  players,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = OUT + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
fs.renameSync(tmp, OUT);
console.log(`canonical written: ${OUT} (${players.length} cards, dup-skip=${dup}, noDetail=${noDetail})`);