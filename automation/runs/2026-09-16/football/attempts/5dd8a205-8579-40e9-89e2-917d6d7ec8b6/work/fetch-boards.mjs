// 作用：本轮足球日报采集驱动。通过 web-access 的 CDP Proxy(3456) 直连用户日常 Chrome，
//       逐联赛打开 ESPN 积分榜页与统计页，抽取积分榜/射手榜/助攻榜原始数据。
// 输入：无（联赛列表与 URL 内置于脚本）。
// 输出：automation/runs/2026-09-16/football/work/raw.json（原始抓取结果 + 每页打开时间）。
import fs from 'node:fs';
import path from 'node:path';

const PROXY = 'http://localhost:3456';
const OUT = '/Users/wuyanzu/Desktop/FC/automation/runs/2026-09-16/football/work/raw.json';

const LEAGUES = [
  {key: 'epl', code: 'eng.1', name: '英超'},
  {key: 'laliga', code: 'esp.1', name: '西甲'},
  {key: 'seriea', code: 'ita.1', name: '意甲'},
  {key: 'bundesliga', code: 'ger.1', name: '德甲'},
  {key: 'ligue1', code: 'fra.1', name: '法甲'},
  {key: 'mls', code: 'usa.1', name: '美职联'},
  {key: 'saudi', code: 'ksa.1', name: '沙特联'},
  {key: 'ucl', code: 'uefa.champions', name: '欧冠'},
];

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
async function closeTab(target) {
  try { await fetch(`${PROXY}/close?target=${target}`); } catch {}
}

const EXTRACT_STANDINGS = `(()=>{
  const out=[];
  const nodes=[...document.querySelectorAll('.Table__Title, table')];
  let title=null;
  for(const n of nodes){
    if(n.classList.contains('Table__Title')){ title=n.innerText.trim(); continue; }
    const rows=[...n.querySelectorAll('tr')].map(r=>[...r.querySelectorAll('th,td')].map(c=>c.innerText.trim()));
    if(!rows.length) continue;
    out.push({title, rows});
  }
  return JSON.stringify({url:location.href, title:document.title, tables:out});
})()`;

const EXTRACT_SCORING = `(()=>{
  const out=[];
  const nodes=[...document.querySelectorAll('.Table__Title, table')];
  let title=null;
  for(const n of nodes){
    if(n.classList.contains('Table__Title')){ title=n.innerText.trim(); continue; }
    const rows=[...n.querySelectorAll('tr')].map(r=>[...r.querySelectorAll('th,td')].map(c=>c.innerText.trim()));
    if(!rows.length) continue;
    out.push({title, header:rows[0], rows:rows.slice(1).filter(r=>r.length>1)});
  }
  return JSON.stringify({url:location.href, title:document.title, tables:out});
})()`;

async function capture(league) {
  const result = {key: league.key, name: league.name, code: league.code, standings: null, scoring: null, errors: []};
  let target;
  try {
    target = await newTab(`https://www.espn.com/soccer/standings/_/league/${league.code}`);
    let data = null;
    for (let i = 0; i < 12; i++) {
      await sleep(1500);
      try {
        const raw = await evalJs(target, EXTRACT_STANDINGS);
        const parsed = JSON.parse(raw);
        if (parsed.tables && parsed.tables.some(t => t.rows.length >= 5)) { data = parsed; break; }
      } catch (e) { /* 页面未就绪，重试 */ }
    }
    if (data) { data.openedAt = new Date().toISOString(); result.standings = data; }
    else result.errors.push('standings 未取到数据');
    await fetch(`${PROXY}/navigate?target=${target}`, {method: 'POST', body: `https://www.espn.com/soccer/stats/_/league/${league.code}/view/scoring`});
    let sdata = null;
    for (let i = 0; i < 12; i++) {
      await sleep(1500);
      try {
        const raw = await evalJs(target, EXTRACT_SCORING);
        const parsed = JSON.parse(raw);
        if (parsed.tables && parsed.tables.some(t => t.rows.length >= 5)) { sdata = parsed; break; }
      } catch (e) { /* 页面未就绪，重试 */ }
    }
    if (sdata) { sdata.openedAt = new Date().toISOString(); result.scoring = sdata; }
    else result.errors.push('scoring 未取到数据');
  } catch (e) {
    result.errors.push(String(e && e.message || e));
  } finally {
    if (target) await closeTab(target);
  }
  return result;
}

const out = [];
for (const lg of LEAGUES) {
  const r = await capture(lg);
  out.push(r);
  console.error(`[done] ${lg.key} errs=${r.errors.length}`);
  try { fs.writeFileSync(OUT, JSON.stringify({fetchedAt: new Date().toISOString(), leagues: out}, null, 1)); } catch {}
}
fs.writeFileSync(OUT, JSON.stringify({fetchedAt: new Date().toISOString(), leagues: out}, null, 1));
console.log('WROTE ' + OUT);
