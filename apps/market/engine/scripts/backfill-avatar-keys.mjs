#!/usr/bin/env node
/**
 * backfill-avatar-keys.mjs — 为「球员头像」补全 cardId → 头像键（avatarKey）映射并落地图片
 *
 * 背景（为什么需要它）：
 *   头像文件名 = EA resourceId（`shared/data/fc27/images/<resourceId>.png`），而站点各榜单里
 *   只有 FUTBIN 卡页 URL 里的 **cardId**。本地只有 gold 榜 + icons 榜（canonical）的
 *   cardId→resourceId 映射，市场热门榜与进化榜里的低评分／特殊版本卡不在其中，
 *   导致市场扫描约 36%、进化专栏约 53% 的球员没有头像。
 *
 * 做法（2026-09-17 实测可行，且已用 canonical 交叉校验 100% 一致）：
 *   在用户日常浏览器里打开任一 FUTBIN 页面建立同源会话，然后对每个待补 cardId
 *   同源 `fetch('/27/playerhover/<cardId>')` —— 该接口返回该卡的悬浮卡 HTML，
 *   其中含头像图 `img/players/<key>.png` 与球员页链接 `/27/player/<cardId>/<slug>`。
 *   一次会话即可批量补齐，无需逐页打开详情页（实测 303/303 与 canonical 一致，0 冲突）。
 *   头像键既可能是 EA resourceId（纯数字），也可能是 FUTBIN 自绘人像（`p<数字>`），
 *   两者都按「文件名 = 头像键」落到同一个图片目录，解析侧无需区分。
 *
 * 输出：
 *   - shared/data/fc27/avatar-index.json      cardId / slug → avatarKey（原子写，只增不改）
 *   - shared/data/fc27/images/<key>.png       缺失头像从 CDN 下载（幂等，已存在跳过）
 *   - shared/data/fc27/images/.failed-backfill.json  下载失败清单，可重跑
 *
 * 前置：`node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` 必须 exit 0
 *      （CDP Proxy :3456 直连用户日常 Chrome，本项目唯一允许的浏览器通道）。
 *
 * 用法：node apps/market/engine/scripts/backfill-avatar-keys.mjs [YYYY-MM-DD] [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://localhost:3456';

export const IMAGES_DIR = path.join(ROOT, 'shared', 'data', 'fc27', 'images');
export const AVATAR_INDEX_PATH = path.join(ROOT, 'shared', 'data', 'fc27', 'avatar-index.json');
const SEED_PAGE = 'https://www.futbin.com/27/popular';
const CONCURRENCY = 6;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dateStr = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a))
  || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const asList = v => (Array.isArray(v) ? v
  : Array.isArray(v?.players) ? v.players
    : Array.isArray(v?.cards) ? v.cards
      : Array.isArray(v?.items) ? v.items : []);
const cardIdOf = u => { const m = String(u || '').match(/\/player\/([^/?#]+)\//); return m ? m[1] : null; };

function readdirJSON(dir, out = [], skip = null) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (skip && skip(full)) continue;
    if (e.isDirectory()) { readdirJSON(full, out, skip); continue; }
    if (!/\.json$/i.test(e.name)) continue;
    const d = readJSON(full);
    if (d) out.push(...asList(d));
  }
  return out;
}

// ── 1. 汇总本站榜单里出现过的全部球员条目（以 cardId 为准去重） ────────────────
function collectTargets() {
  const byId = new Map();
  const push = (item, src) => {
    let cid = item.cardId ? String(item.cardId) : cardIdOf(item.url || item.marketUrl || item.rel || item.href || item.playerUrl);
    if (cid) cid = cid.split('_')[0];
    if (!cid) return;
    const prev = byId.get(cid);
    if (prev) { if (!prev.slug && item.slug) prev.slug = item.slug; return; }
    byId.set(cid, { cardId: cid, slug: item.slug || null, name: item.name || item.nameZh || null, rating: item.rating ?? null, src });
  };
  const market = readJSON(path.join(ROOT, 'automation/runs', dateStr, 'market', 'market.json'));
  if (market) {
    (market.players || []).forEach(i => push(i, 'market.players'));
    ((market.overview || {}).evolutions || []).forEach(i => push(i, 'market.overview.evolutions'));
    ((market.overview || {}).priceTiers || []).forEach(t => (t.items || []).forEach(i => push(i, 'market.priceTiers')));
    const w = (market.overview || {}).weekly || {};
    (w.promo || []).forEach(i => push(i, 'market.weekly.promo'));
    (w.totw || []).forEach(i => push(i, 'market.weekly.totw'));
  }
  const evo = readJSON(path.join(ROOT, 'automation/runs', dateStr, 'evolution', 'evolution.json'));
  if (evo) (evo.evolutions || []).forEach(i => push(i, 'evolution.evolutions'));

  const led = readJSON(path.join(ROOT, 'apps/market/engine/icons/data/players/fc27/fc27-icons-playstyles.json'));
  asList(led).forEach(i => push(i, 'icons.ledger'));
  const snap = readJSON(path.join(ROOT, 'apps/market/engine/icons/data/prices/fc27/daily', `${dateStr}.json`));
  if (snap) (snap.players || []).forEach(i => push(i, 'icons.snapshot'));
  // 只聚合 FC27 代际的英雄数据：FC26 的卡 ID 与 FC27 不同源，混进来会污染
  // cardId→头像键 映射（2026-09-17 实测：82 张里至少 6 张配错人）。
  readdirJSON(path.join(ROOT, 'apps/market/engine/heroes/data'), [], full => /\/fc26(\/|$)/.test(full))
    .forEach(i => push(i, 'heroes'));
  return [...byId.values()];
}

// ── 2. CDP Proxy ─────────────────────────────────────────────────────────────
async function proxy(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${PROXY}${pathname}`, { method, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`CDP proxy ${pathname} HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
}
async function proxyEval(target, expr) {
  const text = await proxy(`/eval?target=${encodeURIComponent(target)}`, { method: 'POST', body: expr });
  let parsed; try { parsed = JSON.parse(text); } catch { throw new Error(`eval 返回非 JSON: ${text.slice(0, 200)}`); }
  return parsed.value;
}

// 在页面上下文里并发抓 /27/playerhover/<cid>，抽出头像键与球员页 slug。
// 实测该接口有速率限制（并发 6 时大量 HTTP 429），因此默认单并发 + 请求间隔，
// 并对 429 做一次退避重试；宁可慢，也不要被风控盯上。
function hoverBatchExpr(ids, concurrency, delayMs) {
  return `(async function(){
  var ids = ${JSON.stringify(ids)};
  var CONC = ${concurrency};
  var DELAY = ${delayMs};
  var out = {}; var fail = []; var idx = 0;
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  async function one(cid){
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var r = await fetch('/27/playerhover/' + cid, { credentials: 'same-origin' });
        if (r.status === 429) { await sleep(1200 * (attempt + 1)); continue; }
        if (!r.ok) return cid + ':http' + r.status;
        var t = await r.text();
        var m = t.match(/img\\/players\\/([a-z]?\\d+)\\.png/);
        var s = t.match(/\\/player\\/[^"'\\s]+\\/([^"'\\/?#\\s]+)"/);
        if (m) { out[cid] = { key: m[1], slug: s ? s[1] : null }; return null; }
        return cid + ':noface';
      } catch (e) { await sleep(400); }
    }
    return cid + ':429';
  }
  async function worker(){
    while (idx < ids.length) {
      var cid = ids[idx++];
      var err = await one(cid);
      if (err) fail.push(err);
      if (DELAY > 0) await sleep(DELAY);
    }
  }
  var ws = []; for (var w = 0; w < CONC; w++) ws.push(worker());
  await Promise.all(ws);
  return JSON.stringify({ total: ids.length, hit: Object.keys(out).length, fail: fail.slice(0, 12), map: out });
})()`;
}

// ── 3. 主流程 ────────────────────────────────────────────────────────────────
(async () => {
  const imagesDir = IMAGES_DIR;
  mkdirSync(imagesDir, { recursive: true });
  const localFiles = new Set(readdirSync(imagesDir).filter(f => /\.png$/i.test(f)).map(f => f.replace(/\.png$/i, '')));

  // 已有映射：canonical 等内置源由 player-avatar.mjs 负责；这里只看本脚本维护的增量索引
  const idx = readJSON(AVATAR_INDEX_PATH) || { schemaVersion: 1, cardIds: {}, slugs: {}, updatedAt: null, sources: {} };
  idx.cardIds = idx.cardIds || {};
  idx.slugs = idx.slugs || {};

  // 用渲染侧同一套解析器判断「是否已经能解析出头像」，避免重复抓取
  const { loadAvatarIndex } = await import('../../../../shared/lib/player-avatar.mjs');
  const probe = loadAvatarIndex({ root: ROOT });

  const targets = collectTargets();
  const pending = targets.filter(t => !probe.resolve({ cardId: t.cardId, slug: t.slug, name: t.name, rating: t.rating }));
  console.log(`[backfill] 榜单球员 ${targets.length} 个 cardId，其中头像仍不可解析 ${pending.length} 个`);
  if (!pending.length) {
    console.log('[backfill] 无需补全，退出。');
    return;
  }

  let map = {};
  if (DRY_RUN) {
    console.log('[backfill] --dry-run：仅展示待补清单，不访问浏览器。样例：', pending.slice(0, 10).map(p => p.cardId + '/' + (p.slug || p.name)).join(', '));
    return;
  }

  // 建立同源会话
  let targetId = null;
  try {
    const created = JSON.parse(await proxy('/new', { method: 'POST', body: SEED_PAGE }));
    targetId = created.targetId;
  } catch (e) {
    console.error(`[backfill] 无法通过 CDP Proxy 建立会话（${e.message}）。请先运行 node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs 确认 exit 0。`);
    process.exitCode = 1;
    return;
  }
  console.log(`[backfill] 已打开 FUTBIN 会话 ${targetId}，开始批量抓取 playerhover …`);
  await new Promise(r => setTimeout(r, 5000));

  try {
  const ids = pending.map(p => p.cardId);
  // 每批必须明显短于 CDP Proxy 的 Runtime.evaluate 超时（约 30s），否则整批作废。
  // 单并发 + 450ms 间隔时，15 条约 11–15s，安全。
  const BATCH = Number(process.env.FC_AVATAR_BACKFILL_BATCH || 15);
  const CONC = Number(process.env.FC_AVATAR_BACKFILL_CONC || 1);
  const DELAY = Number(process.env.FC_AVATAR_BACKFILL_DELAY_MS || 450);
  let consecutiveFailures = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    let raw = null;
    try {
      raw = await proxyEval(targetId, hoverBatchExpr(slice, CONC, DELAY));
      if (!raw || typeof raw !== 'string') {
        // CDP 代理偶发返回空对象，重试一次
        await new Promise(r => setTimeout(r, 1500));
        raw = await proxyEval(targetId, hoverBatchExpr(slice, CONC, DELAY));
      }
    } catch (e) {
      consecutiveFailures++;
      console.error(`[backfill] 第 ${i} 批调用失败（第 ${consecutiveFailures} 次连续失败）：${e.message.slice(0, 120)}`);
      // 长会话下页面/标签页会失效（症状：HTTP 500 超时，随后 eval 返回空串响应）。
      // 连续 3 批失败即重建会话；索引是增量写的，重跑本脚本可自动续做。
      if (consecutiveFailures >= 3) {
        try { await proxy(`/close?target=${encodeURIComponent(targetId)}`); } catch {}
        const created = JSON.parse(await proxy('/new', { method: 'POST', body: SEED_PAGE }));
        targetId = created.targetId;
        consecutiveFailures = 0;
        console.error(`[backfill] 会话已重建（${targetId}），继续 …`);
        await new Promise(r => setTimeout(r, 6000));
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }
      i -= BATCH; // 本批未完成，重来（重建会话后立刻重试）
      continue;
    }
    consecutiveFailures = 0;
    try {
      const d = JSON.parse(raw);
      Object.assign(map, d.map || {});
      console.log(`[backfill] ${i + slice.length}/${ids.length} 命中 ${d.hit}/${d.total}${d.fail && d.fail.length ? ` · 异常样例 ${d.fail.slice(0, 3).join(',')}` : ''}`);
    } catch (e) {
      console.error(`[backfill] 第 ${i} 批解析失败：${String(raw).slice(0, 120)}`);
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  let added = 0;
  for (const [cid, v] of Object.entries(map)) {
    if (!v || !v.key) continue;
    if (idx.cardIds[cid] !== v.key) { idx.cardIds[cid] = v.key; added++; }
    if (v.slug && idx.slugs[v.slug] !== v.key) idx.slugs[v.slug] = v.key;
  }
  console.log(`[backfill] 新增 cardId→头像键 ${added} 条（索引累计 ${Object.keys(idx.cardIds).length} 条）`);

  // 下载本地缺失的头像
  const need = [...new Set(Object.values(idx.cardIds))].filter(k => !localFiles.has(k));
  console.log(`[backfill] 需下载头像 ${need.length} 张`);
  const failed = [];
  for (let i = 0; i < need.length; i += CONCURRENCY) {
    const slice = need.slice(i, i + CONCURRENCY);
    for (const key of slice) {
      const dest = path.join(imagesDir, `${key}.png`);
      // cdn3 只带查询参数签名才可用，curl 直取返回 403；cdn 主机对纯数字键与 FUTBIN
      // 自绘的 p<数字> 键都返回 200（2026-09-17 实测），因此统一走 cdn。
      const url = `https://cdn.futbin.com/content/fifa27/img/players/${key}.png`;
      const tmp = `${dest}.tmp`;
      try {
        execFileSync('curl', ['-sL', '--max-time', '20', '-A', UA, '-H', 'Referer: https://www.futbin.com/', '-o', tmp, url]);
        if (existsSync(tmp) && statSync(tmp).size > 500) { renameSync(tmp, dest); localFiles.add(key); }
        else { failed.push(key); try { execFileSync('rm', ['-f', tmp]); } catch {} }
      } catch { failed.push(key); }
    }
  }
  console.log(`[backfill] 头像下载完成：成功 ${need.length - failed.length}/${need.length}`);
  writeFileSync(path.join(imagesDir, '.failed-backfill.json'), JSON.stringify(failed, null, 1));

  idx.updatedAt = new Date().toISOString();
  idx.sources = Object.assign(idx.sources || {}, { 'futbin-playerhover': (idx.sources?.['futbin-playerhover'] || 0) + added });
  idx.note = '本文件由 backfill-avatar-keys.mjs 维护：cardIds/slugs → 头像键（EA resourceId 或 FUTBIN 自绘 p<id>），头像图为 shared/data/fc27/images/<键>.png。只增不改，可安全重跑。';
  const tmpIdx = `${AVATAR_INDEX_PATH}.tmp`;
  writeFileSync(tmpIdx, JSON.stringify(idx, null, 1));
  renameSync(tmpIdx, AVATAR_INDEX_PATH);
  console.log(`[backfill] 索引已写入 ${path.relative(ROOT, AVATAR_INDEX_PATH)}`);
  } finally {
    // 无论成功与否都关掉自建 tab，不打扰用户已有标签页
    try { await proxy(`/close?target=${encodeURIComponent(targetId)}`); } catch { /* tab 已关无妨 */ }
  }
})().catch(e => { console.error(`[backfill] 失败：${e.stack || e.message}`); process.exitCode = 1; });
