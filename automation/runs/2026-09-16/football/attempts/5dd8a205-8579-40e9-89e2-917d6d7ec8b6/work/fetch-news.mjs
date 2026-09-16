// 作用：本轮足球日报资讯采集。通过 CDP Proxy(3456) 打开 ESPN / BBC 足球栏目页，
//       提取文章链接后逐条打开原文，抽取标题、发布时间与首段，作为可核验证据。
// 输入：无。
// 输出：automation/runs/2026-09-16/football/work/news-raw.json。
import fs from 'node:fs';

const PROXY = 'http://localhost:3456';
const OUT = '/Users/wuyanzu/Desktop/FC/automation/runs/2026-09-16/football/work/news-raw.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newTab(url) {
  const res = await fetch(`${PROXY}/new`, {method: 'POST', body: url});
  const j = await res.json();
  return j.targetId || j.id;
}
async function evalJs(target, code) {
  const res = await fetch(`${PROXY}/eval?target=${target}`, {method: 'POST', body: code});
  const j = await res.json();
  return j.value;
}
async function closeTab(t) { try { await fetch(`${PROXY}/close?target=${t}`); } catch {} }

const LIST_JS = `(()=>{const seen=new Set();const out=[];document.querySelectorAll('a[href]').forEach(a=>{const h=a.href;if(!/\\/soccer\\/story\\/_\\/id\\/|\\/sport\\/football\\/articles\\//.test(h))return;if(seen.has(h))return;seen.add(h);const t=(a.innerText||'').trim();if(t.length<25)return;out.push({h,t:t.slice(0,220)});});return JSON.stringify(out.slice(0,60));})()`;

const ARTICLE_JS = `(()=>{
 const meta=n=>{const m=document.querySelector('meta[property="'+n+'"]')||document.querySelector('meta[name="'+n+'"]');return m?m.content:null;};
 const paras=[...document.querySelectorAll('article p, .story-body p, [data-component="text-block"] p, main p')].map(p=>p.innerText.trim()).filter(x=>x.length>40);
 return JSON.stringify({url:location.href,title:document.title,h1:(document.querySelector('h1')||{}).innerText||null,published:meta('article:published_time')||meta('datePublished')||meta('date'),desc:meta('og:description')||meta('description'),lead:paras.slice(0,3)});
})()`;

const result = {fetchedAt: new Date().toISOString(), lists: {}, articles: []};

for (const src of [
  {key: 'espn', url: 'https://www.espn.com/soccer/'},
  {key: 'bbc', url: 'https://www.bbc.com/sport/football'},
]) {
  let t;
  try {
    t = await newTab(src.url);
    let data = null;
    for (let i = 0; i < 8; i++) {
      await sleep(2000);
      try { const raw = await evalJs(t, LIST_JS); const p = JSON.parse(raw || '[]'); if (p.length >= 5) { data = p; break; } } catch {}
    }
    result.lists[src.key] = {url: src.url, openedAt: new Date().toISOString(), items: data || []};
    console.error(`[list] ${src.key} items=${(data || []).length}`);
  } catch (e) { result.lists[src.key] = {url: src.url, error: String(e && e.message || e), items: []}; }
  finally { if (t) await closeTab(t); }
}

const picks = [];
for (const key of ['espn', 'bbc']) {
  const items = (result.lists[key] && result.lists[key].items) || [];
  for (const it of items.slice(0, 7)) picks.push({src: key, ...it});
}

for (const p of picks.slice(0, 12)) {
  let t;
  try {
    t = await newTab(p.h);
    await sleep(2500);
    const raw = await evalJs(t, ARTICLE_JS);
    const a = JSON.parse(raw);
    a.src = p.src;
    a.openedAt = new Date().toISOString();
    result.articles.push(a);
    console.error(`[art] ${p.src} ${(a.h1 || a.title || '').slice(0, 60)}`);
  } catch (e) {
    result.articles.push({src: p.src, url: p.h, error: String(e && e.message || e), openedAt: new Date().toISOString()});
  } finally { if (t) await closeTab(t); }
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('WROTE ' + OUT + ' articles=' + result.articles.length);
