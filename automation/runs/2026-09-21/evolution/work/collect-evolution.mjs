#!/usr/bin/env node
/**
 * FC27 进化专栏采集器（本轮工作脚本，2026-09-21）
 *
 * 用途：按根 AGENTS.md「FUTBIN 平台口径强制规则 → 采集规则 第 6 条」采集进化专栏三个来源页：
 *   - https://www.futbin.com/27/popular/evolutions  （热门进化卡榜单）
 *   - https://www.futbin.com/27/evolutions          （进化总览：费用/条件/升级）
 *   - https://www.futbin.com/27/evolutions/expired  （过期路径核验）
 *
 * 取数方式：宿主标签页只停在 https://www.futbin.com/robots.txt（轻量、不触发 Cloudflare 挑战），
 *          榜单内容用页内 `fetch(path,{credentials:'include'})` + DOMParser 取，
 *          **不导航到榜单页**（导航打法会被挑战页打死，2026-09-20 已连败两轮）。
 *
 * 输出（与历史工作脚本产物同构，供 build-json.mjs 直接消费）：
 *   work/cards-raw.json      {"value":"<JSON 字符串>"}  榜单卡片
 *   work/evolutions-raw.json {"value":"<JSON 字符串>"}  进化总览
 *   work/expired-raw.json    {"value":"<JSON 字符串>"}  过期页（期望 count=0）
 *   work/collect-meta.json   各页 HTTP 状态、打开时刻、节点计数（用于 evidence.json 的 openedAt/note）
 *
 * 前置：node automation/browser-triage.mjs 必须 exit 0（唯一判据）。
 * 用法：node automation/runs/2026-09-21/evolution/work/collect-evolution.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const W = here;
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOST_URL = 'https://www.futbin.com/robots.txt';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const j = async (url, body, timeoutMs = 90000) => {
  const res = await fetch(url, {
    method: body === null ? 'GET' : 'POST',
    body: body === null ? undefined : body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.json();
};

// CDP Proxy 已知坑：较长 eval 偶发返回 {"value":{}}，重试即可
const ev = async (id, script, timeoutMs = 90000) => {
  let last = '';
  for (let i = 0; i < 3; i++) {
    const raw = await j(`${PROXY}/eval?target=${encodeURIComponent(id)}`, script, timeoutMs);
    if (raw && typeof raw.value === 'string') return raw.value;
    if (raw && raw.error) last = String(raw.error);
    await sleep(2500);
  }
  throw new Error(`proxy eval 连续返回空对象${last ? `（error: ${last.slice(0, 160)}）` : ''}`);
};

// ---------- 宿主页：停在 robots.txt 的轻量同源页 ----------
let host = process.env.FC_HOST_TAB || '';
let ownHost = false;
if (!host) {
  const r = await j(`${PROXY}/new`, HOST_URL, 40000);
  host = r.targetId;
  ownHost = true;
  await sleep(2500);
}
process.stdout.write(`host=${host} own=${ownHost}\n`);

// ---------- 页内解析函数（直接定义在外层，不要包 IIFE：外层 async IIFE 需要直接调用） ----------
const HELPERS = String.raw`
  // ---- 进化榜卡片解析（口径同 work/extract-cards.js，2026-09-18 版） ----
  function parseEvoCards(doc) {
    var KEYS = ['PAC','SHO','PAS','DRI','DEF','PHY'];
    var KEYS_GK = ['DIV','HAN','KIC','REF','SPD','POS'];
    var KEYS_ALL = KEYS.concat(KEYS_GK);
    var POS = {GK:1,RB:1,LB:1,CB:1,CDM:1,CM:1,CAM:1,RM:1,LM:1,RW:1,LW:1,CF:1,ST:1};
    var cards = doc.querySelectorAll('div.popular-cards-wrapper > div.column');
    var out = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var anchors = c.querySelectorAll('a');
      var playerUrl = '', evoUrl = '';
      for (var a = 0; a < anchors.length; a++) {
        var h = anchors[a].getAttribute('href') || '';
        if (h.indexOf('/player/') > -1) playerUrl = h;
        else if (h.indexOf('/evolutions') > -1) evoUrl = h;
      }
      if (!playerUrl) continue;
      var lines = (c.innerText || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
      if (lines.length < 4) continue;
      var rating = lines[0], pos = lines[1], i2 = 2;
      if (lines[i2] === '++') i2++;
      var alt = [];
      while (i2 < lines.length && POS[lines[i2]]) { alt.push(lines[i2]); i2++; }
      var foot = lines[i2], skill = lines[i2 + 1], weak = lines[i2 + 2];
      var head = lines.slice(i2 + 3);
      var statStart = -1;
      for (var jj = 0; jj < head.length - 1; jj++) {
        if (KEYS_ALL.indexOf(String(head[jj + 1]).toUpperCase()) > -1 && /^\d+$/.test(String(head[jj]))) { statStart = jj; break; }
      }
      var stats = {}, evol = '', pop = '', name = '', price = '';
      var pre = statStart > -1 ? head.slice(0, statStart) : head;
      if (statStart > -1) {
        for (var k = 0; k < 6 && statStart + 2 * k + 1 < head.length; k++) {
          var key = String(head[statStart + 2 * k + 1]).toUpperCase();
          if (KEYS_ALL.indexOf(key) > -1) stats[key] = String(head[statStart + 2 * k]);
        }
        var rest = head.slice(statStart + 12);
        evol = rest[0] || '';
        pop = rest[1] || '';
      } else {
        // 无六维块的少数卡片：尾部 [FUTBIN Rating?, 姓名, 进化名称, 热度]
        var tail = pre.slice();
        if (tail.length && /^\d+$/.test(String(tail[tail.length - 1]))) pop = String(tail.pop());
        evol = tail.length ? String(tail.pop()) : '';
        name = tail.length ? String(tail.pop()) : '';
        for (var t = 0; t < tail.length; t++) {
          if (/^[\d.,]+[KMkm]?$/.test(String(tail[t]))) price = String(tail[t]);
        }
        pre = [];
      }
      for (var p = 0; p < pre.length; p++) {
        if (/^[\d.,]+[KMkm]?$/.test(pre[p])) price = pre[p];
        else name = pre[p];
      }
      out.push({
        rank: 0, name: name, rating: rating, pos: pos, altPos: alt.join(' / '),
        foot: foot, skill: skill, weak: weak, futbinListValue: price,
        evolutionName: evol, popularityCount: pop, stats: stats,
        url: 'https://www.futbin.com' + playerUrl,
        evoUrl: evoUrl ? 'https://www.futbin.com' + evoUrl : ''
      });
    }
    // 逐卡复核 FUTBIN Rating 元素命中数（DOM 实测，用于如实标注缺失）
    var ratingEls = doc.querySelectorAll('div.popular-cards-wrapper > div.column div.playercard-27-futbin-rating').length;
    var priceEls = doc.querySelectorAll('div.popular-cards-wrapper > div.column .popular-price-wrapper, div.popular-cards-wrapper > div.column .platform-price-wrapper-ps, div.popular-cards-wrapper > div.column .price-segment, div.popular-cards-wrapper > div.column .item-score-segment').length;
    return { body: out, nodes: cards.length, ratingEls: ratingEls, priceEls: priceEls, title: doc.title };
  }

  // ---- 进化总览页解析（2026-09-21 重写：站点 DOM 由「扁平换行」改为「深度缩进嵌套 + 首字母大写标签」） ----
  // 变更点（本轮实测）：① 每条概览卡 innerText 变为逐元素独立缩进行，旧的「\nTotal Upgrades」「\nFREE」
  // 「^(EVOLUTIONS|…)$」等空白/大小写敏感正则会**静默失配**（实测 requirements 全空、upgrades 吞掉投票块、
  // 类型标签全空、FREE 读不到）；② 标签改首字母大写：Evolutions / Training Camp / Cosmetics / Rewards /
  // Season 1 Level: N / Free / Repeatable；③ 逐项升级由 4 token（Overall,+34,|,79）合并为 2 token（Overall, "+34 | 79"）。
  // 处置：先做 **空白归一化**（逐行 trim 后去空行再用 \n 连接），再一律用大小写不敏感匹配。
  function normText(t) {
    return String(t || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; }).join('\n');
  }
  function parseEvolutions(doc) {
    var cards = doc.querySelectorAll('div.evolutions-overview-wrapper');
    var out = [];
    var TYPE_RE = /^(evolutions|training camp|pathway evolutions|rewards|cosmetics|new)$/i;
    var SEASON_RE = /^season\s+\d+\s+level:\s*\d+$/i;
    function grab(txt, label) {
      var m = txt.match(new RegExp(label + '\\n([^\\n]+)', 'i'));
      return m ? m[1].trim() : '';
    }
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var txt = normText(c.innerText || '');
      var href = '';
      var as = c.querySelectorAll('a');
      for (var a2 = 0; a2 < as.length; a2++) {
        var h = as[a2].getAttribute('href') || '';
        if (/^\/27\/evolutions\/\d+\//.test(h)) { href = h; break; }
      }
      var lines = txt.split('\n');
      var name = lines[0] || '';
      var tags = [];
      for (var k = 1; k < Math.min(lines.length, 6); k++) {
        if (TYPE_RE.test(lines[k])) tags.push(lines[k]);
      }
      var seasonName = '', seasonLevel = '';
      for (var sl = 1; sl < Math.min(lines.length, 6); sl++) {
        var sm = lines[sl].match(/^season\s+(\d+)\s+level:\s*(\d+)$/i);
        if (sm) { seasonName = 'Season ' + sm[1]; seasonLevel = sm[2]; break; }
      }
      var foundAt = (txt.match(/found at level[^\n]*/i) || [''])[0];
      if (!foundAt) foundAt = (txt.match(/found in the [^\n]*/i) || [''])[0];
      var originLabel = '';
      for (var ol = 1; ol < Math.min(lines.length, 6); ol++) {
        if (TYPE_RE.test(lines[ol])) {
          if (lines[ol].toUpperCase() !== 'NEW') { originLabel = lines[ol]; break; }
        } else if (SEASON_RE.test(lines[ol])) { originLabel = lines[ol]; break; }
      }
      // 费用格按内容识别（Free / 纯数字 / 多行数字；TRAINING 另记）。cell 文本先归一化，避免缩进被当作内容。
      var costRaw = '', costPoints = '', trainingCost = '', repeatCount = '';
      var ups = c.querySelectorAll('div.evolution-upgrade');
      for (var cu = 0; cu < ups.length; cu++) {
        var ut = normText(ups[cu].innerText || '');
        var one = ut.replace(/\n/g, ' + ');
        if (/^training(\s|\+|$)/i.test(ut)) { trainingCost = one; continue; }
        if (/^free$/i.test(ut)) { if (!costRaw) costRaw = 'FREE'; continue; }
        if (/^repeatable$/i.test(ut) || /^repeatable\s*\|/i.test(ut.replace(/\n/g, '|'))) {
          var rp = ut.replace(/\n/g, '|').split('|');
          if (rp.length > 1 && /^\d+$/.test(rp[1])) repeatCount = rp[1];
          continue;
        }
        if (/^[\d,]+\s*(\+\s*[\d,]+)?$/.test(one)) {
          if (!costRaw) {
            costRaw = one;
            var imgs = ups[cu].querySelectorAll('img');
            for (var im = 0; im < imgs.length; im++) {
              if ((imgs[im].getAttribute('src') || '').indexOf('fc-points') > -1) costPoints = 'yes';
            }
          }
          continue;
        }
      }
      var unlock = grab(txt, 'UNLOCK');
      var expires = grab(txt, 'EXPIRES');
      var repeatable = /(^|\n)repeatable(\n|$)/i.test(txt) ? 'REPEATABLE' : (/(single use|not repeatable)/i.test(txt) ? 'SINGLE USE' : '');
      // 描述句：UNLOCK 前一行且含空格的长句（站点把 Group Reward for 换成了各路径自述文案）
      var descM = txt.match(/([^\n]{25,})\nUNLOCK\n/i);
      var desc = descM ? descM[1].trim() : '';
      var reqM = txt.match(/player requirements\n([\s\S]*?)\ntotal upgrades/i);
      var reqBlock = reqM ? reqM[1] : '';
      var requirements = reqBlock ? reqBlock.split('\n') : [];
      // 升级块：从 Total Upgrades 到第一个「纯百分比行」为止（投票块以 85% 之类开头，升级项不会是纯百分比）
      var upIdx = txt.search(/\ntotal upgrades\n/i);
      var upgrades = [];
      if (upIdx > -1) {
        var tIdx = txt.toLowerCase().indexOf('total upgrades', upIdx);
        var rest = txt.slice(tIdx + 'total upgrades'.length).replace(/^\n/, '');
        var rl2 = rest.split('\n');
        var keep = [];
        for (var q = 0; q < rl2.length; q++) {
          if (/^\d+(\.\d+)?%$/.test(rl2[q])) break;
          keep.push(rl2[q]);
        }
        while (keep.length && /^\d+$/.test(keep[keep.length - 1])) keep.pop(); // 去掉末尾投票计数
        upgrades = keep;
      }
      out.push({
        name: name, url: href ? 'https://www.futbin.com' + href : '', tags: tags, originLabel: originLabel,
        seasonName: seasonName, seasonLevel: seasonLevel, foundAt: foundAt, desc: desc,
        unlock: unlock, expires: expires, cost: costRaw ? costRaw : cost, costPoints: costPoints,
        costRaw: costRaw, trainingCost: trainingCost, repeatCount: repeatCount, repeatable: repeatable,
        requirements: requirements, upgrades: upgrades, rawText: txt
      });
    }
    return { body: out, nodes: cards.length, title: doc.title };
  }
`;

const nowIso = () => new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00');

const fetchAndParse = async (pathname, fnName, label) => {
  const script = `(async () => {
    ${HELPERS}
    var res = await fetch(${JSON.stringify(`https://www.futbin.com${pathname}`)}, { credentials: 'include' });
    var html = await res.text();
    var head = html.slice(0, 2500);
    var blocked = (res.status !== 200) || (/does not have permission|Just a moment|cf-challenge|Enable JavaScript and cookies/i.test(head) && html.length < 200000);
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var parsed = blocked ? { body: [], nodes: 0, ratingEls: 0, priceEls: 0, title: doc.title } : ${fnName}(doc);
    return JSON.stringify({ status: res.status, blocked: blocked, bytes: html.length, url: res.url, pathname: ${JSON.stringify(pathname)}, openedAt: new Date().toISOString(), parsed: parsed });
  })()`;
  let out = null;
  for (let attempt = 1; attempt <= 3 && !out; attempt++) {
    try {
      const parsed = JSON.parse(await ev(host, script, 90000));
      if (parsed.blocked) {
        process.stdout.write(`${label} attempt ${attempt}: BLOCKED http=${parsed.status} bytes=${parsed.bytes}\n`);
        if (attempt < 3) await sleep(20000);
        continue;
      }
      out = parsed;
    } catch (e) {
      process.stdout.write(`${label} attempt ${attempt}: ERROR ${String(e.message).slice(0, 160)}\n`);
      if (attempt < 3) await sleep(5000);
    }
  }
  if (!out) throw new Error(`${label} 采集失败（3 次尝试均未取得内容）`);
  process.stdout.write(`${label}: http=${out.status} bytes=${out.bytes} nodes=${out.parsed.nodes} items=${out.parsed.body.length}\n`);
  return out;
};

const meta = { collectedAt: nowIso(), host, ownHost, sources: {} };

const cards = await fetchAndParse('/27/popular/evolutions', 'parseEvoCards', 'popular/evolutions');
meta.sources.popular = { pathname: cards.pathname, status: cards.status, bytes: cards.bytes, nodes: cards.parsed.nodes, items: cards.parsed.body.length, ratingEls: cards.parsed.ratingEls, priceEls: cards.parsed.priceEls, title: cards.parsed.title, openedAt: cards.openedAt };
writeFileSync(path.join(W, 'cards-raw.json'), JSON.stringify({ value: JSON.stringify({ title: cards.parsed.title, url: 'https://www.futbin.com/27/popular/evolutions', count: cards.parsed.body.length, body: cards.parsed.body }) }), 'utf8');

await sleep(1500);
const evo = await fetchAndParse('/27/evolutions', 'parseEvolutions', 'evolutions');
meta.sources.evolutions = { pathname: evo.pathname, status: evo.status, bytes: evo.bytes, nodes: evo.parsed.nodes, items: evo.parsed.body.length, title: evo.parsed.title, openedAt: evo.openedAt };
writeFileSync(path.join(W, 'evolutions-raw.json'), JSON.stringify({ value: JSON.stringify({ title: evo.parsed.title, url: 'https://www.futbin.com/27/evolutions', count: evo.parsed.body.length, body: evo.parsed.body }) }), 'utf8');

await sleep(1500);
const exp = await fetchAndParse('/27/evolutions/expired', 'parseEvolutions', 'evolutions/expired');
meta.sources.expired = { pathname: exp.pathname, status: exp.status, bytes: exp.bytes, nodes: exp.parsed.nodes, items: exp.parsed.body.length, title: exp.parsed.title, openedAt: exp.openedAt };
writeFileSync(path.join(W, 'expired-raw.json'), JSON.stringify({ value: JSON.stringify({ title: exp.parsed.title, url: 'https://www.futbin.com/27/evolutions/expired', count: exp.parsed.body.length, body: exp.parsed.body }) }), 'utf8');

mkdirSync(W, { recursive: true });
writeFileSync(path.join(W, 'collect-meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

console.log(`\ncards=${cards.parsed.body.length} nodes=${cards.parsed.nodes} ratingEls=${cards.parsed.ratingEls} priceEls=${cards.parsed.priceEls}`);
console.log(`routes=${evo.parsed.body.length} nodes=${evo.parsed.nodes}`);
console.log(`expired items=${exp.parsed.body.length} nodes=${exp.parsed.nodes}`);
if (ownHost) { try { await fetch(`${PROXY}/close?target=${encodeURIComponent(host)}`); } catch { /* 关闭失败不影响结果 */ } }
