#!/usr/bin/env node
/**
 * collect-r83-prices.mjs — FC27 83+ 卡池价格补采器
 *
 * 用途：翻 FUTBIN `/27/players` 全量列表，筛出 rating>=83 且属于「普通金卡」的行，
 *       逐卡读取双平台价，merge 进统一行情 current.json（source=futbin-players）。
 *
 * 背景（2026-09-20 重构）：83+ 池 = 评分>=83 的普通金卡（218 张，来自 fc27-gold-playstyles.json）。
 *   现有市场监控只抓 /27/popular 热门榜 250 张，无法覆盖全部 83+ 卡（实测缺 49 张 83-85 分卡）。
 *   本脚本用与 collect-icons-list 相同的「列表页翻页 + 页内 fetch + DOMParser」模式补齐。
 *
 * 关键口径：
 *   - 只保留「普通金卡」：`td.table-name` 无 Icon / Base Heroes / Debut Icon / TOTW 等特殊版本标签，
 *     且 rating >= 83。
 *   - 双平台价：`td.table-price.platform-ps-only`（Console）/ `td.table-price.platform-pc-only`（PC）。
 *   - 价格 < 1000 视为占位值（valid=false）。
 *   - 名单基准：`promo/data/players/fc27/rating83plus.json`（218 张），只采集台账内的 cardId，
 *     台账补全（未采到的以空价保留）。
 *
 * 输入：浏览器 Web Access CDP Proxy；命令行 --date / --max-page / --from-page。
 * 输出：merge 进 data/prices/fc27/current.json（source=futbin-players）+ 同步 assets。
 *
 * 用法：node apps/market/engine/scripts/collect-r83-prices.mjs [--max-page N]
 *       （采集前必须先 `node automation/browser-triage.mjs` 且 exit 0）
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCurrentMarket, syncCurrentMarketAssets } from '../src/current-market.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOST_URL = 'https://www.futbin.com/robots.txt';

const R83_LEDGER = path.join(ROOT, 'apps', 'market', 'engine', 'promo', 'data', 'players', 'fc27', 'rating83plus.json');
const MIN_VALID_PRICE = 1000;
const MIN_RATING = 83;

const PAGES_PER_BATCH = 4;
const HOST_RECYCLE_EVERY = 3;
const BATCH_GAP_MS = 350;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const nowIso = () => new Date().toISOString();
const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const argOf = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(argOf('--date') || '') ? argOf('--date') : shanghaiDate();
const maxPage = Number.parseInt(argOf('--max-page') || '', 10) || 10;
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
  function isSpecial(name){
    return /\\s(Base Heroes|Debut Icon|Icon|TOTW|Hall of FUT|Ones to Watch)$/.test(name.replace(/\\s+/g,' ').trim());
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
      var rating=rat?parseInt(rat.innerText.trim(),10):null;
      var name=raw.replace(/\\s+/g,' ').trim().replace(/^\\d+\\s+/,'');
      var psRaw=ps?ps.innerText.trim():''; var pcRaw=pc?pc.innerText.trim():'';
      // 只保留普通金卡（无特殊版本标签）且 rating>=83
      if(isSpecial(name))continue;
      if(rating===null||rating<83)continue;
      out.push({id:m?m[1]:'',slug:m?m[2]:'',name:name,rating:rating,
        pos:pos?(pos.innerText.trim().split(/\\s+/)[0]||''):'',
        psPrice:parseCoins(psRaw),pcPrice:parseCoins(pcRaw)});
    }
    return out;
  }
  var pages=${JSON.stringify(pages)};
  var res={ok:true,byPage:{},rows:[]};
  for(var i=0;i<pages.length;i++){
    var p=pages[i];
    try{
      var r=await fetch('/27/players?page='+p,{credentials:'include'});
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
  const workDir = path.join(ROOT, 'automation', 'runs', dateStr, 'promo', 'work');
  mkdirSync(workDir, { recursive: true });

  const ledger = (readJSON(R83_LEDGER)?.players) || [];
  const ledgerIds = new Set(ledger.map(p => String(p.cardId)));

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

  // 去重 + 只保留台账内的 cardId
  const seen = new Set();
  const rows = [];
  for (const r of allRows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    if (ledgerIds.has(String(r.id))) rows.push(r);
  }

  // merge 进 current.json
  const records = rows.map(r => ({
    cardId: String(r.id), slug: r.slug,
    url: `https://www.futbin.com/27/player/${r.id}/${r.slug}`,
    name: r.name, rating: r.rating, position: r.pos,
    cardType: 'rating83plus',
    platforms: {
      console: { price: r.psPrice },
      pc: { price: r.pcPrice },
    },
  }));
  const observedAt = nowIso();
  if (records.length) {
    await mergeCurrentMarket(records, { source: 'futbin-players', observedAt, date: dateStr });
    syncCurrentMarketAssets(dateStr);
  }

  // 台账补全统计
  const collectedIds = new Set(rows.map(r => String(r.id)));
  const missing = ledger.filter(p => !collectedIds.has(String(p.cardId)));

  atomicWrite(path.join(workDir, 'r83-prices-raw.json'), JSON.stringify({
    date: dateStr, collectedAt: observedAt, pageStats, errors,
    rows: allRows.length, matched: rows.length, missing: missing.length,
  }, null, 2));

  console.log(JSON.stringify({
    date: dateStr, maxPage, hostBuilds,
    collectedPages: `${Object.values(pageStats).filter(s => s && s.status === 200).length}/${maxPage}`,
    rows: allRows.length, matched: rows.length, missing: missing.length,
    consoleValid: rows.filter(r => r.psPrice >= MIN_VALID_PRICE).length,
    pcValid: rows.filter(r => r.pcPrice >= MIN_VALID_PRICE).length,
    errors: errors.length,
  }, null, 2));
  if (!rows.length) process.exit(2);
}

main().catch(e => { console.error('采集失败:', e); process.exit(1); });
