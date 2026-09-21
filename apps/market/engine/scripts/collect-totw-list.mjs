#!/usr/bin/env node
/**
 * collect-totw-list.mjs — FC27 周黑（TOTW）名单采集器（周四 03:00 定时任务入口）
 *
 * 用途：打开 FUTBIN `/27/players?version=team_of_the_week` 列表页并翻页，逐卡读取
 *       双平台价格（Console / PC），落库为本周周黑台账 `totw-current.json`。
 *
 * 关键口径（2026-09-20 实机核验，勿凭印象改动）：
 *   - `?version=team_of_the_week` 是**有效**的版本参数（返回 30 行/页 TOTW 名单），
 *     与 `?version=base_icon` / `?version=heroes` 返回空表不同——后者依赖站内 JS 状态，前者可直接导航。
 *   - 版本判定：行内 `td.table-name` 的**尾部标签 `TOTW`**（如 "91 Lamine Yamal ... TOTW"）。
 *   - 双平台价：`td.table-price.platform-ps-only`（Console）与 `td.table-price.platform-pc-only`（PC）。
 *     价格文本形如 "4.85M" / "1.78M 3.73%"（带涨跌徽标），解析只取**首个非空行**的币价，
 *     丢弃涨跌徽标行（与 collect-icons-list 同口径）。
 *   - 同一球员可能有多张 TOTW 卡（如 Lamine Yamal cardId 22758 / 22759），按 cardId 分别记账。
 *   - 价格 < 1000 视为占位值（valid=false）。
 *
 * 输入：浏览器 Web Access CDP Proxy（默认 http://127.0.0.1:3456）；命令行 --date / --max-page / --from-page。
 * 输出：apps/market/engine/totw/data/players/fc27/totw-current.json（原子写）
 *
 * 用法：node apps/market/engine/scripts/collect-totw-list.mjs [--date D] [--max-page N]
 *       （采集前必须先 `node automation/browser-triage.mjs` 且 exit 0）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOST_URL = 'https://www.futbin.com/robots.txt';

const OUT = path.join(ROOT, 'apps', 'market', 'engine', 'totw', 'data', 'players', 'fc27', 'totw-current.json');
const MIN_VALID_PRICE = 1000;
const LAUNCH_DATE = '2026-09-18'; // FC27 开服日（2026-09-20 定案；2026-09-25 是正式发售日，勿改回）

const PAGES_PER_BATCH = 4;
const HOST_RECYCLE_EVERY = 3;
const BATCH_GAP_MS = 350;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const nowIso = () => new Date().toISOString();
const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const argOf = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(argOf('--date') || '') ? argOf('--date') : shanghaiDate();
const maxPage = Number.parseInt(argOf('--max-page') || '', 10) || 6;
const fromPage = Math.max(1, Number.parseInt(argOf('--from-page') || '', 10) || 1);

function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

async function cdp(target, body, isEval = false) {
  const url = isEval ? `${PROXY}/eval?target=${target}` : `${PROXY}/new`;
  const r = await fetch(url, { method: 'POST', body });
  return r.text();
}
async function newHost() {
  const raw = await cdp(null, HOST_URL);
  const id = JSON.parse(raw).targetId || JSON.parse(raw).id;
  await new Promise(r => setTimeout(r, 2500));
  return id;
}
async function closeHost(id) { try { await fetch(`${PROXY}/close?target=${id}`); } catch { /* 忽略 */ } }

function buildBatchScript(pages) {
  return `(async function(){
  function parseCoins(text){
    if(typeof text!=='string')return 0;
    var lines=text.split('\\n').map(function(s){return s.replace(/\\s+/g,' ').trim();}).filter(function(s){return s.length>0;});
    var t=(lines[0]||'').replace(/,/g,'');
    var m=/^([\\d.]+)\\s*([KM]?)$/i.exec(t);
    if(!m)return 0;
    var v=parseFloat(m[1]);
    if(!isFinite(v))return 0;
    var u=m[2].toUpperCase();
    if(u==='K')v*=1000;
    if(u==='M')v*=1000000;
    return Math.round(v);
  }
  function rowsFrom(html){
    var doc=new DOMParser().parseFromString(html,'text/html');
    var rs=doc.querySelectorAll('tr.player-row');
    var out=[];
    for(var i=0;i<rs.length;i++){
      var r=rs[i];
      var nameEl=r.querySelector('td.table-name');
      var a=r.querySelector('td.table-name a')||r.querySelector('td a');
      var href=a?a.getAttribute('href'):'';
      var ps=r.querySelector('td.table-price.platform-ps-only');
      var pc=r.querySelector('td.table-price.platform-pc-only');
      var rat=r.querySelector('td.table-rating');
      var pos=r.querySelector('td.table-pos');
      var raw=nameEl?nameEl.innerText:'';
      var m=/\\/27\\/player\\/([^\\/]+)\\/([^\\/?#]+)/.exec(href);
      var psRaw=ps?ps.innerText.trim():''; var pcRaw=pc?pc.innerText.trim():'';
      // 版本判定：姓名尾部 TOTW 标签
      var isTotw=/\\sTOTW$/.test(raw.replace(/\\s+/g,' ').trim());
      // 去掉 "评分 姓名 TOTW" 前缀，取姓名
      var nm=raw.replace(/\\s+/g,' ').trim().replace(/^\\d+\\s+/,'').replace(/\\sTOTW$/,'');
      out.push({id:m?m[1]:'',slug:m?m[2]:'',name:nm,isTotw:isTotw,
        rating:rat?parseInt(rat.innerText.trim(),10):null,
        pos:pos?(pos.innerText.trim().split(/\\s+/)[0]||''):'',
        psRaw:psRaw,pcRaw:pcRaw,psPrice:parseCoins(psRaw),pcPrice:parseCoins(pcRaw)});
    }
    return out;
  }
  var pages=${JSON.stringify(pages)};
  var res={ok:true,byPage:{},rows:[]};
  for(var i=0;i<pages.length;i++){
    var p=pages[i];
    try{
      var r=await fetch('/27/players?version=team_of_the_week&page='+p,{credentials:'include'});
      var html=await r.text();
      if(r.status!==200){res.byPage[p]={status:r.status,rows:0};res.ok=false;continue;}
      if(/403|does not have permission/i.test(html.slice(0,2000))&&html.length<20000){res.byPage[p]={status:403,rows:0,blocked:true};res.ok=false;continue;}
      var rw=rowsFrom(html);
      res.byPage[p]={status:200,rows:rw.length};
      for(var j=0;j<rw.length;j++){rw[j].page=p;res.rows.push(rw[j]);}
    }catch(e){res.byPage[p]={err:String(e)};res.ok=false;}
  }
  return JSON.stringify(res);
})()`;
}

async function main() {
  const workDir = path.join(ROOT, 'automation', 'runs', dateStr, 'totw', 'work');
  mkdirSync(workDir, { recursive: true });

  const prev = (readJSON(OUT)?.players) || [];
  const zhOf = item => {
    const hit = prev.find(p => String(p.id) === String(item.id)) || prev.find(p => p.slug === item.slug);
    return hit && typeof hit.nameZh === 'string' ? hit.nameZh : '';
  };

  const pages = Array.from({ length: maxPage - fromPage + 1 }, (_, i) => i + fromPage);
  const batches = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) batches.push(pages.slice(i, i + PAGES_PER_BATCH));

  let host = await newHost();
  const pageStats = {};
  const allRows = [];
  const errors = [];
  let hostBuilds = 1;

  for (let b = 0; b < batches.length; b++) {
    if (b > 0 && b % HOST_RECYCLE_EVERY === 0) { await closeHost(host); host = await newHost(); hostBuilds++; }
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await cdp(host, buildBatchScript(batches[b]), true);
        const outer = JSON.parse(raw);
        const inner = typeof outer.value === 'string' ? JSON.parse(outer.value) : outer.value;
        if (inner && inner.byPage) parsed = inner;
      } catch (e) { errors.push({ batch: batches[b], attempt, err: String(e).slice(0, 200) }); }
    }
    if (!parsed) { await closeHost(host); host = await newHost(); hostBuilds++; continue; }
    if (!parsed.ok) errors.push({ batch: batches[b], note: '页面返回非 200 或疑似拦截' });
    Object.assign(pageStats, parsed.byPage);
    for (const r of parsed.rows) allRows.push(r);
    await new Promise(r => setTimeout(r, BATCH_GAP_MS));
  }
  await closeHost(host);

  // 去重 + 只保留 TOTW
  const seen = new Set();
  const totwRows = [];
  for (const r of allRows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.isTotw) totwRows.push(r);
  }

  const players = totwRows.map(r => {
    const o = {
      id: String(r.id), slug: r.slug, name: r.name, rating: r.rating,
      version: 'TOTW', position: r.pos,
      prices: {
        console: { price: r.psPrice, valid: r.psPrice >= MIN_VALID_PRICE },
        pc: { price: r.pcPrice, valid: r.pcPrice >= MIN_VALID_PRICE },
      },
      marketUrl: `https://www.futbin.com/27/player/${r.id}/${r.slug}`,
      launchDate: LAUNCH_DATE,
    };
    const zh = zhOf(o);
    if (zh) o.nameZh = zh;
    return o;
  }).sort((a, b) => (b.rating - a.rating) || String(a.name).localeCompare(String(b.name)));

  const collected = Object.values(pageStats).filter(s => s && s.status === 200).length;
  const out = {
    schemaVersion: 1, generatedAt: nowIso(), game: 'fc27', cardType: 'totw',
    source: `https://www.futbin.com/27/players?version=team_of_the_week（翻页 1-${maxPage}；成功页 ${collected}/${maxPage}）`,
    launchDate: LAUNCH_DATE,
    counts: {
      listed: players.length,
      withConsolePrice: players.filter(p => p.prices.console.valid).length,
      withPcPrice: players.filter(p => p.prices.pc.valid).length,
    },
    players,
  };
  atomicWrite(OUT, JSON.stringify(out, null, 2));

  // 原始抓取留证
  atomicWrite(path.join(workDir, 'totw-raw.json'), JSON.stringify({
    date: dateStr, collectedAt: nowIso(), pageStats, errors,
    rows: allRows.length, totwRows: totwRows.length,
  }, null, 2));

  console.log(JSON.stringify({
    date: dateStr, maxPage, hostBuilds, collectedPages: `${collected}/${maxPage}`,
    rows: allRows.length, totw: players.length,
    consoleValid: players.filter(p => p.prices.console.valid).length,
    pcValid: players.filter(p => p.prices.pc.valid).length,
    errors: errors.length,
    out: path.relative(ROOT, OUT),
  }, null, 2));
  if (!players.length) process.exit(2);
}

main().catch(e => { console.error('采集失败:', e); process.exit(1); });
