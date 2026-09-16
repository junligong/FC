#!/usr/bin/env node
/**
 * 用途：本轮（2026-09-16 同日重跑）经 web-access CDP Proxy(:3456) 实测打开 FUTBIN FC27 页面，
 *       从 DOM 提取原始数据落盘，供 build.mjs 生成 market.json 与传奇卡原始台账。
 * 输入：CDP Proxy http://localhost:3456（直连用户日常 Chrome）
 * 输出：/tmp/fc27r/<name>.json（含 url / openedAt / rows|cards）
 * 口径：FUTBIN 拒绝 curl/WebFetch（403），全部数据必须来自浏览器实测；开服前价格为列表页占位/估算价。
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const PROXY = 'http://localhost:3456';
const OUT = '/tmp/fc27r';
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(pathname, body, method = 'POST') {
  const res = await fetch(PROXY + pathname, method === 'POST'
    ? { method: 'POST', body: typeof body === 'string' ? body : String(body) }
    : { method: 'GET' });
  return await res.text();
}

async function openTab(url) {
  const t = await api('/new', url);
  const m = /"targetId":"([^"]+)"/.exec(t);
  if (!m) throw new Error(`打开失败 ${url}: ${t.slice(0, 200)}`);
  return m[1];
}

async function evalJs(target, js, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const raw = await api(`/eval?target=${target}`, js);
    const m = /"value":"([\s\S]*)"\}/.exec(raw);
    if (m) {
      try { return JSON.parse(JSON.parse(`"${m[1]}"`)); } catch { /* 继续重试 */ }
    }
    await sleep(1200);
  }
  return null;
}

const closeTab = t => api(`/close?target=${t}`, '');

// 表格页提取器：按列 class 取值，避免列顺序漂移
const TABLE_JS = `(()=>{
const t=document.querySelector("table");
if(!t) return JSON.stringify({url:location.href,at:new Date().toISOString(),n:0,rows:[],noTable:true,body:document.body.innerText.slice(0,200)});
const rows=[...t.querySelectorAll("tbody tr")].map(tr=>{
  const a=tr.querySelector("a[href*='/player/']");
  const g=s=>{const e=tr.querySelector(s);return e?e.innerText.trim().replace(/\\s+/g," "):"";};
  return {href:a?a.getAttribute("href"):"",name:g(".table-name"),rat:g(".table-rating"),is:g(".table-item-score"),
    pos:g(".table-pos"),pop:g(".table-popularity"),ps:g(".platform-ps-only"),pc:g(".platform-pc-only")};
}).filter(r=>r.name);
return JSON.stringify({url:location.href,at:new Date().toISOString(),n:rows.length,rows});
})()`;

// 热门页提取器：卡片容器整段文本 + 首个球员链接
const CARD_JS = `(()=>{
const w=document.querySelector(".popular-cards-wrapper")||document.body;
const cards=[...w.children].map(el=>{
  const a=el.querySelector("a[href*='/player/']");
  return {href:a?a.getAttribute("href"):"",t:(el.innerText||"").trim().replace(/\\s+/g," ")};
}).filter(c=>c.t);
return JSON.stringify({url:location.href,at:new Date().toISOString(),n:cards.length,cards});
})()`;

async function scrapeTable(name, url, js = TABLE_JS) {
  const tab = await openTab(url);
  const data = await evalJs(tab, js);
  await closeTab(tab);
  if (!data) { console.error(`  ✗ ${name} 读取失败 ${url}`); return { url, openedAt: new Date().toISOString(), error: '读取超时', rows: [] }; }
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 1));
  console.log(`  ✓ ${name} n=${data.n} ${url}`);
  return data;
}

const results = {};
for (let p = 1; p <= 5; p++) {
  results[`icons_p${p}`] = await scrapeTable(`icons_p${p}`, `https://www.futbin.com/27/players?version=icons&page=${p}`);
}
for (let p = 1; p <= 4; p++) {
  results[`players_p${p}`] = await scrapeTable(`players_p${p}`, `https://www.futbin.com/27/players?page=${p}`);
}
results.popular = await scrapeTable('popular', 'https://www.futbin.com/27/popular', CARD_JS);
results.evo = await scrapeTable('evo', 'https://www.futbin.com/27/popular/evolutions', CARD_JS);
results.tier_1m = await scrapeTable('tier_1m', 'https://www.futbin.com/27/players?pc_price=1000000%2B');
results.tier_300k = await scrapeTable('tier_300k', 'https://www.futbin.com/27/players?pc_price=300000-1000000');
results.tier_100k = await scrapeTable('tier_100k', 'https://www.futbin.com/27/players?pc_price=100000-300000');
results.tier_10k = await scrapeTable('tier_10k', 'https://www.futbin.com/27/players?pc_price=10000-100000');

writeFileSync(`${OUT}/_index.json`, JSON.stringify(results, null, 1));
const iconsRows = new Set();
for (let p = 1; p <= 5; p++) for (const r of results[`icons_p${p}`].rows || []) iconsRows.add(r.href);
console.log(`\n传奇卡去重 ${iconsRows.size} 张 · 热门 ${results.popular.n} · 进化 ${results.evo.n}`);
console.log(`筛选页行数：1m=${results.tier_1m.n} 300k=${results.tier_300k.n} 100k=${results.tier_100k.n} 10k=${results.tier_10k.n}`);
