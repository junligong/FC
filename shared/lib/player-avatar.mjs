// 作用：把 FC27 球员头像（shared/data/fc27/images/<resourceId>.png，用户已补全的 160×160 原图）
//       解析并落盘为报告内的相对资源 assets/players/<resourceId>.png，供各渲染器在球员名旁展示头像。
//
// 关键事实（2026-09-17 实机核验，改本文件前务必先读）：
//   1) 头像文件名 = canonical 的 resourceId，**不是** FUTBIN 球员 URL 里的 cardId
//      （2697 张图片与 canonical resourceId 交集 2697/2697；与 cardId 交集仅 15/2697）。
//      因此「URL 里的数字」必须先经 cardId → resourceId 映射才能找到头像。
//   2) 本地不存在全量 cardId → resourceId 映射：canonical 只覆盖 gold 榜 + icons 榜
//      （2961 张卡），市场热门榜 / 进化榜里的大量「同人不同版本卡」不在其中。
//      本模块因此按「精确优先、歧义即放弃」的顺序做多源解析，并在 resolve 结果里
//      回带命中方式，便于渲染器如实统计覆盖率。
//   3) 头像一律落盘到报告目录下的 assets/players/，合并日报时由
//      shared/lib/report-assets.mjs#rewriteLocalReportAssets 改写为指向 daily-merged/assets/ 的相对路径。
//      **不要**把头像写成 shared/ 或绝对路径——合并后会断链。
//   4) 缩放只用系统自带 sips（本机没有 pngquant / cwebp / sharp）。48×48 约 3.9KB，
//      160×160 原图约 10.8KB。头像按 resourceId 命名（内容寻址），同名必同图，
//      因此 800+ 张头像在站点里只存一份、被所有页面共用。
//
// 用法（渲染器内）：
//   const index = loadAvatarIndex();
//   const pick = item => { const r = index.resolve(item); return r ? r.resourceId : null; };
//   materializeAvatars(reportDir, list.map(pick).filter(Boolean));
//   ...<img class="pimg" src="${avatarSrc(pick(it))}">...
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = process.env.FC_PROJECT_ROOT || path.resolve(HERE, '../..');

export const AVATAR_SOURCE_DIR = path.join(PROJECT_ROOT, 'shared', 'data', 'fc27', 'images');
export const AVATAR_SUBDIR = 'players'; // <reportDir>/assets/players/<resourceId>.png
export const AVATAR_SIZE = 48;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const list = v => (Array.isArray(v) ? v : (Array.isArray(v?.players) ? v.players : (Array.isArray(v?.items) ? v.items : [])));

export function slugOfUrl(value) {
  const m = String(value || '').match(/\/player\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  // 进化榜的球员 URL 带版本后缀（/player/1272_8/…），id 段取 _ 前的裸 cardId
  return { cardId: m[1].split('_')[0], slug: m[2].toLowerCase() };
}

export function slugOfName(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * 构建头像索引。所有数据源都只读、只增补不覆盖（先到先得），并统一用
 * 「本地是否真的有这张图」做最后一道过滤，保证 resolve 绝不会返回没有图片的 id。
 */
export function loadAvatarIndex({ root = PROJECT_ROOT, verbose = false } = {}) {
  const sourceDir = path.join(root, 'shared', 'data', 'fc27', 'images');
  const available = new Set();
  if (existsSync(sourceDir)) {
    for (const f of readdirSync(sourceDir)) {
      if (/\.png$/i.test(f)) available.add(f.replace(/\.png$/i, ''));
    }
  }
  const has = rid => rid !== null && rid !== undefined && available.has(String(rid));

  const byCard = new Map();
  const bySlug = new Map();
  const byName = new Map();
  const byNameZh = new Map();
  const byToken = new Map();
  // rid -> 该球员在索引里登记过的全部姓名词元（英文/拼音，长度 > 2）。
  // 用途：兜底匹配（token / token+rating）落地前做「是不是同一个人」的一致性校验。
  // 2026-09-17 新增：曾出现「Ledley King→Joshua King」「Micah Richards→Chris Richards」
  // 「Sylvester Stallone 式同姓不同人」的错配，根源是只按「姓」这一个词元兜底，
  // 同姓的另一名球员会被误配。渲染侧宁可缺图也绝不能配错人。
  const ridProfiles = new Map();
  const used = {};

  const put = (map, key, rid) => {
    if (key === null || key === undefined) return;
    const k = String(key).toLowerCase().trim();
    if (!k || map.has(k)) return;
    map.set(k, String(rid));
  };
  const putToken = (token, rid, rating, label) => {
    if (!token) return;
    const arr = byToken.get(token) || [];
    if (!arr.some(x => x.resourceId === String(rid) && x.rating === rating)) {
      arr.push({ resourceId: String(rid), rating: rating ?? null, label });
    }
    byToken.set(token, arr);
  };

  // 统一的入库入口：一条记录可以只带其中几个键
  const ingest = ({ cardId, slug, name, nameZh, resourceId, rating, source }) => {
    if (!has(resourceId)) return false;
    const before = byCard.size + bySlug.size;
    put(byCard, cardId, resourceId);
    put(bySlug, slug, resourceId);
    put(byName, name, resourceId);
    put(byNameZh, nameZh, resourceId);
    const tokenSource = slug || slugOfName(name);
    if (tokenSource) {
      const parts = String(tokenSource).split('-').filter(t => t.length > 2);
      const last = parts[parts.length - 1];
      // 姓名/卡名里最后一个长词元当「姓」用；这是 token 兜底匹配的键
      putToken(last, resourceId, rating ?? null, name);
    }
    // 登记该 rid 的全部姓名词元，供一致性校验使用（不设 key 冲突问题）
    const profile = ridProfiles.get(String(resourceId)) || new Set();
    for (const text of [slug, name, nameZh].filter(Boolean)) {
      for (const word of String(text).toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/)) if (word.length > 2) profile.add(word);
    }
    ridProfiles.set(String(resourceId), profile);
    if (byCard.size + bySlug.size > before) used[source] = (used[source] || 0) + 1;
    return true;
  };

  // ── 源 1：canonical（gold 榜 + icons 榜，2961 卡，唯一带 cardId 的权威库）
  const canon = readJSON(path.join(root, 'shared/data/fc27/players.json'));
  for (const c of list(canon)) {
    ingest({ cardId: c.cardId, slug: c.slug, name: c.name, nameZh: c.nameZh, resourceId: c.resourceId, rating: c.rating, source: 'canonical' });
  }

  // ── 源 2：detail-v2 原始抓取（含 cardId + resourceId + slug，2965 行）
  const jsonl = path.join(root, 'apps/market/engine/gold/data/players/fc27/tmp-fetch/fc27-detail-v2.jsonl');
  if (existsSync(jsonl)) {
    for (const line of readFileSync(jsonl, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        const u = slugOfUrl(d.href);
        ingest({ cardId: d.id, slug: u?.slug, name: d.name, resourceId: d.resourceId, rating: d.ovr != null ? Number(d.ovr) : null, source: 'detail-v2' });
      } catch { /* 单行损坏忽略 */ }
    }
  }

  // ── 源 3：EasySBC 导出（2330 人，含 name / cardName / rating，可补 canonical 之外的球员）
  const le83 = readJSON(path.join(root, 'apps/market/engine/gold/data/players/fc27/fc27-gold-le83.json'));
  for (const p of list(le83)) {
    ingest({ slug: slugOfName(p.name), name: p.name, resourceId: p.resourceId, rating: p.rating, source: 'easysbc-le83' });
    ingest({ slug: slugOfName(p.cardName), name: p.cardName, resourceId: p.resourceId, rating: p.rating, source: 'easysbc-le83' });
  }

  // ── 源 4：球员数据库（2530 人，slug + name + nameZh + playerUrl 里的 cardId）
  const db = readJSON(path.join(root, 'apps/market/engine/data/players/database/fc27.json'));
  for (const p of list(db)) {
    const u = slugOfUrl(p.playerUrl);
    ingest({ cardId: u?.cardId, slug: p.slug, name: p.name, nameZh: p.nameZh, resourceId: p.resourceId, rating: p.rating, source: 'player-database' });
  }

  // ── 源 5：EasySBC 金卡价格表（227 人，slug + name + cardId）
  const goldPrices = readJSON(path.join(root, 'apps/market/engine/gold/data/prices/easysbc/fc27-gold-prices.json'));
  for (const p of list(goldPrices)) {
    ingest({ cardId: p.id || p.cardId, slug: p.slug, name: p.name, resourceId: p.resourceId, rating: p.ovr, source: 'easysbc-prices' });
  }

  // ── 源 6：player-index（227 人，slug + nameZh + fc27Url 里的 cardId）
  const pidx = readJSON(path.join(root, 'apps/market/engine/data/players/player-index.json'));
  for (const p of list(pidx)) {
    const u = slugOfUrl(p.fc27Url);
    ingest({ cardId: u?.cardId, slug: p.slug, name: p.name, nameZh: p.nameZh, resourceId: p.resourceId, rating: p.rating, source: 'player-index' });
  }

  // ── 源 7：增量补全索引（backfill-avatar-keys.mjs 维护；只填前六个源都没覆盖到的缺口）
  // 该文件的键是头像键（EA resourceId 或 FUTBIN 自绘 p<id>），先到先得，不会覆盖已有映射。
  const extra = readJSON(path.join(root, 'shared/data/fc27/avatar-index.json'));
  if (extra) {
    // 只采纳本地确实有图的键：索引可能先于图片下载写入（或下载失败），不能让渲染侧凭它输出断链
    for (const [cid, key] of Object.entries(extra.cardIds || {})) if (has(key)) put(byCard, cid, key);
    for (const [slug, key] of Object.entries(extra.slugs || {})) if (has(key)) put(bySlug, slug, key);
  }

  /**
   * 解析一条球员记录到头像 resourceId。
   * 顺序：cardId → slug → 姓名 → 中文名 → 「姓」词元（唯一或 rating 能唯一确定才采纳）。
   * 任何一步出现多义（多个不同 resourceId）都立即返回 null —— 宁可缺图，不可配错人。
   */
  function resolve(item) {
    if (!item) return null;
    let cardId = item.cardId ? String(item.cardId) : null;
    if (!cardId) {
      for (const src of [item.url, item.marketUrl, item.rel, item.href, item.playerUrl]) {
        const u = slugOfUrl(src);
        if (u) { cardId = u.cardId; break; }
      }
    }
    if (!cardId && /^\d+$/.test(String(item.id ?? ''))) cardId = String(item.id);
    if (cardId && byCard.has(cardId)) return { resourceId: byCard.get(cardId), how: 'cardId' };

    const slugs = [];
    if (item.slug) slugs.push(String(item.slug).toLowerCase());
    for (const src of [item.url, item.marketUrl, item.rel, item.href, item.playerUrl]) {
      const u = slugOfUrl(src);
      if (u) slugs.push(u.slug);
    }
    if (item.name) slugs.push(slugOfName(item.name));
    for (const s of slugs) if (s && bySlug.has(s)) return { resourceId: bySlug.get(s), how: 'slug' };

    if (item.name && byName.has(String(item.name).toLowerCase())) return { resourceId: byName.get(String(item.name).toLowerCase()), how: 'name' };
    if (item.nameZh && byNameZh.has(String(item.nameZh))) return { resourceId: byNameZh.get(String(item.nameZh)), how: 'nameZh' };

    const rating = typeof item.rating === 'number' ? item.rating : (item.ovr != null ? Number(item.ovr) : null);
    const tokens = new Set();
    const itemTokens = new Set();
    for (const s of [...slugs, item.name, item.nameZh].filter(Boolean)) {
      for (const w of String(s).toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/)) if (w.length > 2) itemTokens.add(w);
    }
    for (const s of slugs) {
      const parts = String(s).split('-').filter(t => t.length > 2);
      if (parts.length) tokens.add(parts[parts.length - 1]);
    }
    // 兜底匹配前的一致性校验（双向包含任一成立即可）：
    //   · 条目的全部词元都出现在该 rid 登记过的姓名里（缩略名场景，如 "Antonio Fernández Casino" vs "Antonio Fernández"）
    //   · 或该 rid 登记过的词元都出现在条目里（条目带全名场景）
    // 两个方向都不成立 = 同姓不同人，直接放弃。
    const agrees = rid => {
      const profile = ridProfiles.get(String(rid));
      if (!profile || !profile.size || !itemTokens.size) return true;
      const itemInProfile = [...itemTokens].every(t => profile.has(t));
      const profileInItem = [...profile].every(t => itemTokens.has(t));
      return itemInProfile || profileInItem;
    };
    for (const token of tokens) {
      const cands = byToken.get(token);
      if (!cands || !cands.length) continue;
      const distinct = [...new Set(cands.map(c => c.resourceId))];
      if (distinct.length === 1) return agrees(distinct[0]) ? { resourceId: distinct[0], how: 'token' } : null;
      if (rating !== null) {
        const exact = [...new Set(cands.filter(c => c.rating === rating).map(c => c.resourceId))];
        if (exact.length === 1 && agrees(exact[0])) return { resourceId: exact[0], how: 'token+rating' };
      }
      return null; // 歧义：放弃
    }
    return null;
  }

  if (verbose) {
    console.error(`[avatar] 可用头像 ${available.size} 张 · 索引 cardId ${byCard.size} / slug ${bySlug.size} / 姓名 ${byName.size} / 词元 ${byToken.size}`);
    console.error(`[avatar] 各源有效贡献 ${JSON.stringify(used)}`);
  }
  return { available, has, resolve, byCard, bySlug, byToken, stats: { available: available.size, used } };
}

// 进程级单例：一次渲染里只建一次索引
let cachedIndex = null;
export function avatarIndex() {
  if (!cachedIndex) cachedIndex = loadAvatarIndex();
  return cachedIndex;
}

/** 报告内的相对路径；resourceId 为空时返回空串（渲染器据此不输出 <img>） */
export function avatarSrc(resourceId) {
  return resourceId ? `assets/${AVATAR_SUBDIR}/${resourceId}.png` : '';
}

export function avatarDir(reportDir) {
  return path.join(reportDir, 'assets', AVATAR_SUBDIR);
}

/**
 * 把指定 resourceId 的头像缩放后落盘到 <reportDir>/assets/players/。
 * 已存在且比源图新的直接跳过（同日重跑不重复缩放）；sips 不可用时退化为原图复制。
 * 返回实际可用的 resourceId 集合。
 */
export function materializeAvatars(reportDir, resourceIds, { size = AVATAR_SIZE, log = console.error } = {}) {
  const outDir = avatarDir(reportDir);
  const wanted = [...new Set((resourceIds || []).filter(Boolean).map(String))];
  const ready = new Set();
  const todo = [];
  for (const rid of wanted) {
    const from = path.join(AVATAR_SOURCE_DIR, `${rid}.png`);
    if (!existsSync(from)) continue;
    const to = path.join(outDir, `${rid}.png`);
    if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs && statSync(to).size > 200) { ready.add(rid); continue; }
    todo.push({ rid, from, to });
  }
  if (todo.length) {
    mkdirSync(outDir, { recursive: true });
    let canScale = true;
    try { execFileSync('sips', ['--version'], { stdio: 'ignore' }); } catch { canScale = false; }
    const CHUNK = 200;
    for (let i = 0; i < todo.length; i += CHUNK) {
      const slice = todo.slice(i, i + CHUNK);
      if (canScale) {
        try {
          execFileSync('sips', ['-z', String(size), String(size), ...slice.map(s => s.from), '--out', outDir], { stdio: 'ignore' });
        } catch { /* 单批失败则该批回退到直接复制原图 */ }
      }
      for (const s of slice) {
        if (existsSync(s.to) && statSync(s.to).size > 200) { ready.add(s.rid); continue; }
        try { copyFileSync(s.from, s.to); ready.add(s.rid); } catch { /* 源图缺失，跳过 */ }
      }
    }
    log(`[avatar] 头像落盘 ${ready.size} 张（本轮新处理 ${todo.length} 张，${size}×${size}）→ ${path.relative(PROJECT_ROOT, outDir)}`);
  }
  return ready;
}

/** 统计一组条目的头像覆盖情况，供渲染器在页头如实标注 */
export function avatarCoverage(index, items) {
  const arr = Array.isArray(items) ? items : [];
  let hit = 0;
  for (const it of arr) if (index.resolve(it)) hit++;
  return { hit, total: arr.length };
}
