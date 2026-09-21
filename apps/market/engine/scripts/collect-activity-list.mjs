#!/usr/bin/env node
/**
 * collect-activity-list.mjs — FC27 本周活动卡采集器（周六 03:00 定时任务入口）
 *
 * 用途：打开 FUTBIN `/27/latest`（最新球员列表）并翻页，按最后一列 `Added on` 日期
 *       精确匹配「更新日当天」的卡，排除 SBC（不可交易）卡，落库为本周活动卡台账。
 *
 * 关键口径（2026-09-20 实机核验，勿凭印象改动）：
 *   - 来源页 `/27/latest`，表头 NAME|RATING|POSITION|CROSS PRICE|CROSS RANGE|PC PRICE|PC RANGE|ADDED ON，
 *     有 `?page=` 分页（每页约 100 行）。
 *   - **日期过滤**：只看 `td.table-added-on` == 更新日当天（如周六）的卡；不做「上次~本次」区间。
 *   - **SBC 过滤红线**：SBC/不可交易卡在列表页双平台价恒为 0（`table-cross-price` 与 `table-pc-price` 均为 0），
 *     一律忽略；价格 >0 的才是市场流通卡。例：Bouaddi 22923 / Mora 22926（OTW SBC）cross=0/pc=0。
 *   - **版本识别**：列表页无文字版本标签，靠卡面图 URL 文件名（`img/cards/tiny/<n>_<version>.png`，
 *     如 150_ones_to_watch / 9_hall_of_fut）。
 *   - 价格 < 1000 视为占位值（valid=false）。
 *
 * 输入：浏览器 Web Access CDP Proxy（默认 http://127.0.0.1:3456）；命令行 --date（新增日期）/ --max-page / --from-page。
 * 输出：apps/market/engine/promo/data/players/fc27/activity-current.json（原子写）
 *
 * 用法：node apps/market/engine/scripts/collect-activity-list.mjs [--date YYYY-MM-DD] [--max-page N]
 *       （采集前必须先 `node automation/browser-triage.mjs` 且 exit 0）
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOST_URL = 'https://www.futbin.com/robots.txt';

const OUT = path.join(ROOT, 'apps', 'market', 'engine', 'promo', 'data', 'players', 'fc27', 'activity-current.json');
const MIN_VALID_PRICE = 1000;
const LAUNCH_DATE = '2026-09-18'; // FC27 开服日（2026-09-20 定案；09-25 是正式发售日，勿改回）

const PAGES_PER_BATCH = 3;
const HOST_RECYCLE_EVERY = 3;
const BATCH_GAP_MS = 350;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const nowIso = () => new Date().toISOString();
const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const argOf = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
// 默认「更新日」= 今天（周六定时任务时即周六当天）
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

function buildBatchScript(pages, targetDate) {
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
  function cardVersion(img){
    var s=img?(img.getAttribute('src')||img.getAttribute('data-src')||''):'';
    var m=/img\\/cards\\/tiny\\/([^?"']+?)\\.png/.exec(s);
    return m?m[1]:null;
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
      var cross=r.querySelector('td.table-cross-price');
      var pc=r.querySelector('td.table-pc-price');
      var rat=r.querySelector('td.table-rating');
      var pos=r.querySelector('td.table-pos');
      var addedOn=r.querySelector('td.table-added-on');
      var img=r.querySelector('img');
      var raw=nameEl?nameEl.innerText:'';
      var m=/\\/27\\/player\\/([^\\/]+)\\/([^\\/?#]+)/.exec(href);
      var crossRaw=cross?cross.innerText.trim():''; var pcRaw=pc?pc.innerText.trim():'';
      var name=raw.replace(/\\s+/g,' ').trim().replace(/^\\d+\\s+/,'');
      out.push({id:m?m[1]:'',slug:m?m[2]:'',name:name,
        rating:rat?parseInt(rat.innerText.trim(),10):null,
        pos:pos?(pos.innerText.trim().split(/\\s+/)[0]||''):'',
        crossRaw:crossRaw,pcRaw:pcRaw,crossPrice:parseCoins(crossRaw),pcPrice:parseCoins(pcRaw),
        addedOn:addedOn?addedOn.innerText.trim():'',
        version:cardVersion(img)});
    }
    return out;
  }
  var pages=${JSON.stringify(pages)};
  var targetDate=${JSON.stringify(targetDate)};
  var res={ok:true,byPage:{},rows:[]};
  for(var i=0;i<pages.length;i++){
    var p=pages[i];
    try{
      var r=await fetch('/27/latest?page='+p,{credentials:'include'});
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
        const raw = await cdp(host, buildBatchScript(batches[b], dateStr), true);
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

  // 去重
  const seen = new Set();
  const uniq = [];
  for (const r of allRows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    uniq.push(r);
  }

  // 日期精确匹配 + SBC 过滤（双平台价均为 0 → 排除）
  const sbcExcluded = uniq.filter(r => r.addedOn === dateStr && r.crossPrice === 0 && r.pcPrice === 0);
  const kept = uniq.filter(r => r.addedOn === dateStr && !(r.crossPrice === 0 && r.pcPrice === 0));

  const players = kept.map(r => {
    const o = {
      id: String(r.id), slug: r.slug, name: r.name, rating: r.rating,
      version: r.version || '', position: r.pos,
      prices: {
        console: { price: r.crossPrice, valid: r.crossPrice >= MIN_VALID_PRICE },
        pc: { price: r.pcPrice, valid: r.pcPrice >= MIN_VALID_PRICE },
      },
      marketUrl: `https://www.futbin.com/27/player/${r.id}/${r.slug}`,
      launchDate: LAUNCH_DATE,
      addedOn: r.addedOn,
    };
    const zh = zhOf(o);
    if (zh) o.nameZh = zh;
    return o;
  }).sort((a, b) => (b.rating - a.rating) || String(a.name).localeCompare(String(b.name)));

  const collected = Object.values(pageStats).filter(s => s && s.status === 200).length;
  const out = {
    schemaVersion: 1, generatedAt: nowIso(), game: 'fc27', cardType: 'activity',
    source: `https://www.futbin.com/27/latest（翻页 1-${maxPage}；Added on=${dateStr}；成功页 ${collected}/${maxPage}）`,
    launchDate: LAUNCH_DATE,
    counts: {
      listed: players.length,
      sbcExcluded: sbcExcluded.length,
      withConsolePrice: players.filter(p => p.prices.console.valid).length,
      withPcPrice: players.filter(p => p.prices.pc.valid).length,
    },
    players,
  };
  atomicWrite(OUT, JSON.stringify(out, null, 2));

  atomicWrite(path.join(workDir, 'activity-raw.json'), JSON.stringify({
    date: dateStr, collectedAt: nowIso(), pageStats, errors,
    rows: allRows.length, unique: uniq.length, kept: players.length, sbcExcluded: sbcExcluded.length,
  }, null, 2));

  console.log(JSON.stringify({
    date: dateStr, maxPage, hostBuilds, collectedPages: `${collected}/${maxPage}`,
    rows: allRows.length, unique: uniq.length,
    kept: players.length, sbcExcluded: sbcExcluded.length,
    consoleValid: players.filter(p => p.prices.console.valid).length,
    pcValid: players.filter(p => p.prices.pc.valid).length,
    errors: errors.length,
    out: path.relative(ROOT, OUT),
  }, null, 2));
  if (!players.length) process.exit(2);
}

main().catch(e => { console.error('采集失败:', e); process.exit(1); });
