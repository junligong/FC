#!/usr/bin/env node
/**
 * FC27 基础传奇卡（Base Icon）与英雄卡（Base Heroes）列表页采集器 —— icons-heroes 每日任务的采集入口
 *
 * 用途：一次打开 FUTBIN `/27/players` 列表页并翻页，按行内版本标签（`Icon` / `Base Heroes`）
 *       归类 FC27 基础传奇卡与英雄卡，逐卡读取 Console（platform-ps-only）与 PC（platform-pc-only）
 *       两个平台的价格单元格，落库为当日原始抓取与两份名单文件。
 *
 * 输入：
 *   - 浏览器：Web Access 技能的 CDP Proxy（默认 http://127.0.0.1:3456），复用用户日常已登录 Chrome
 *   - 已有的 base-icons.json / base-heroes.json（用于保留中文译名 nameZh，只增不改）
 *   - 环境变量：FC_PROJECT_ROOT / FC_CDP_PROXY 可覆盖默认路径
 *   - 命令行：--date YYYY-MM-DD / --max-page N（默认 26）/ --from-page N（默认 1）
 *             / --merge（与当天已有的 work/list-raw.json 合并，用于被 403 拦截后的分钟级退避补采）
 *             / --wait-sec N（采集前等待秒数，配合退避重试）
 *
 * 输出：
 *   - automation/runs/<D>/icons-heroes/work/list-raw.json   当日原始抓取（含每页每行分类结果）
 *   - apps/market/engine/icons/data/prices/fc27/base-icons.json    传奇卡名单 + 双平台价（原子写）
 *   - apps/market/engine/heroes/data/prices/fc27/base-heroes.json  英雄卡名单 + 双平台价（原子写）
 *
 * 口径（2026-09-16/17 实机核验，勿凭印象改动）：
 *   - 列表页每行**同时渲染**两个价格单元格：`td.table-price.platform-ps-only`（Console）与
 *     `td.table-price.platform-pc-only`（PC）；页顶平台按钮只是纯前端显隐切换，不刷新、不改 URL、
 *     不重新取数 —— 因此**一次打开即读两个平台价**，不要为切平台重复导航。
 *   - `ps_price=` / `pc_price=` URL 参数在开服初期筛选失效；`?version=base_icon` / `?version=heroes`
 *     直接导航返回 **0 行空表**（依赖站内 JS 状态，2026-09-18 再次实测确认），不得走这条路线。
 *     版本归属只以行内 `td.table-name` 的**尾部版本标签**判定。
 *   - `td.table-item-score` 是估值列（IS），单独记 `isEstimate`，**不是**平台成交价。
 *   - 价格 < 1000 视为占位值（`valid=false`），两平台都如实落库，缺失就留空，不得用一个顶替另一个。
 *   - 开服日 `launchDate=2026-09-18`。**是否可计算日环比不看日期，看当日实测有效价**（价格 < 1000 视为占位值）。
 *   - 采集走**页内同源 fetch + DOMParser**（无状态，只依赖 futbin.com origin），
 *     并在每 3 批后重建宿主页：长驻宿主页在连续批量解析后会累积劣化（表现为连续
 *     `Runtime.evaluate` 超时 + `Unexpected end of JSON input`），重建可截断该累积。
 *
 * 用法：node apps/market/engine/scripts/collect-icons-list.mjs [--date YYYY-MM-DD] [--max-page N]
 *       （采集前必须先 `node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs` 且 exit 0）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');
const PROXY = process.env.FC_CDP_PROXY || 'http://127.0.0.1:3456';
const HOST_URL = 'https://www.futbin.com/robots.txt'; // 只需 futbin.com origin，轻量、不触发反爬

const ICON_OUT = path.join(ROOT, 'apps', 'market', 'engine', 'icons', 'data', 'prices', 'fc27', 'base-icons.json');
const HERO_OUT = path.join(ROOT, 'apps', 'market', 'engine', 'heroes', 'data', 'prices', 'fc27', 'base-heroes.json');
const LEDGER_PATH = path.join(ROOT, 'apps', 'market', 'engine', 'icons', 'data', 'players', 'fc27', 'fc27-icons-playstyles.json');
// FC27 开服日 = **2026-09-18**（用户 2026-09-19 明确、2026-09-20 再次确认；与根 AGENTS.md
// 「FUTBIN 平台口径强制规则」「同时段（开服第 N 天）对比口径」及 build-same-period-advice.mjs 一致）。
// 2026-09-20 定案：本常量曾被一度改回 2026-09-25（FC27 正式全球发售日），但那是**发售日而非开服日**，
// 会与「开服第 N 天」的 1-based 日历（9-18=第1天）以及 FC26（2025-09-18）的同比对齐冲突。
// ⚠️ 不要再按「09-25」改回去。价格是否可作行情信号**不看日期**，看当日实测有效价（见下方 priceBasis）。
const LAUNCH_DATE = '2026-09-18';
const MIN_VALID_PRICE = 1000;

const PAGES_PER_BATCH = 4;   // 单次 eval 抓取的页数，控制在 CDP 约 30 秒的 Runtime.evaluate 超时内
const HOST_RECYCLE_EVERY = 3; // 每 N 批重建宿主页，规避长驻页劣化（勿删）
const BATCH_GAP_MS = 350;

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const nowIso = () => new Date().toISOString();
const shanghaiDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const argOf = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(argOf('--date') || '') ? argOf('--date') : shanghaiDate();
const maxPage = Number.parseInt(argOf('--max-page') || '', 10) || 26;
const fromPage = Math.max(1, Number.parseInt(argOf('--from-page') || '', 10) || 1);
const doMerge = argv.includes('--merge');
const waitSec = Number.parseInt(argOf('--wait-sec') || '', 10) || 0;

function atomicWrite(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

// ---------- CDP Proxy ----------
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

// 页内执行的抽取脚本：无状态（只 fetch + DOMParser），因此宿主页可安全重建。
// 注意：注入代码是独立作用域，辅助函数必须在模板字符串内部重新定义。
function buildBatchScript(pages) {
  return `(async function(){
  function parseCoins(text){
    if(typeof text!=='string')return 0;
    // 2026-09-20 FUTBIN 行结构变化：价格单元格 innerText 变为「币价 \\n 涨跌徽标(如 14.29%)」，
    // 旧的整串锚定匹配会整体失配（实测 300 行只有 50 行解析出价）。价格固定在**首个非空行**，
    // 涨跌徽标行必须丢弃（listing-estimate 口径下不得计算涨跌）。
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
  function classify(text){
    var t=(text||'').replace(/\\s+/g,' ').trim();
    var m=/^(\\d+)\\s+(.*)$/.exec(t);
    var name=m?m[2]:t;
    if(/\\sBase Heroes$/.test(name))return {version:'Hero',name:name.replace(/\\sBase Heroes$/,'')};
    if(/\\sDebut Icon$/.test(name))return {version:'Debut Icon',name:name.replace(/\\sDebut Icon$/,'')};
    if(/\\sIcon$/.test(name))return {version:'Icon',name:name.replace(/\\sIcon$/,'')};
    return {version:'other',name:name};
  }
  function rowsFrom(html){
    var doc=new DOMParser().parseFromString(html,'text/html');
    var rs=doc.querySelectorAll('tr.player-row');
    var out=[];
    for(var i=0;i<rs.length;i++){
      var r=rs[i];
      var nameEl=r.querySelector('td.table-name');
      var a=r.querySelector('td.table-name a');
      var href=a?a.getAttribute('href'):'';
      var ps=r.querySelector('td.table-price.platform-ps-only');
      var pc=r.querySelector('td.table-price.platform-pc-only');
      var rat=r.querySelector('td.table-rating');
      var is=r.querySelector('td.table-item-score');
      var pos=r.querySelector('td.table-pos');
      var raw=nameEl?nameEl.innerText:''; 
      var cls=classify(raw);
      var m=/\\/27\\/player\\/([^\\/]+)\\/([^\\/?#]+)/.exec(href);
      var psRaw=ps?ps.innerText.trim():''; var pcRaw=pc?pc.innerText.trim():'';
      out.push({id:m?m[1]:'',slug:m?m[2]:'',name:cls.name,version:cls.version,
        rating:rat?parseInt(rat.innerText.trim(),10):null,
        isEstimate:is?parseInt(is.innerText.trim().replace(/,/g,''),10):null,
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
  const workDir = path.join(ROOT, 'automation', 'runs', dateStr, 'icons-heroes', 'work');
  mkdirSync(workDir, { recursive: true });

  const prevIcons = (readJSON(ICON_OUT)?.players) || [];
  const prevHeroes = (readJSON(HERO_OUT)?.players) || [];
  const zhOf = (prev, item) => {
    const hit = prev.find(p => String(p.id) === String(item.id)) || prev.find(p => p.slug === item.slug);
    return hit && typeof hit.nameZh === 'string' ? hit.nameZh : '';
  };

  const pages = Array.from({ length: maxPage - fromPage + 1 }, (_, i) => i + fromPage);
  const batches = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) batches.push(pages.slice(i, i + PAGES_PER_BATCH));

  // 退避等待：被来源 403 拦截后按分钟级重试（禁止秒级密集重试）
  if (waitSec > 0) {
    console.log(`退避等待 ${waitSec}s 后开始采集（来源 403 需分钟级退避）...`);
    await new Promise(r => setTimeout(r, waitSec * 1000));
  }

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

  // 去重：同一 cardId 只保留首次出现（列表按评分降序，首次出现即最靠前）
  const seen = new Set();
  const uniq = [];
  for (const r of allRows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    uniq.push(r);
  }

  // --merge：与当天已有的 list-raw.json 合并（补采场景）。按 page 取「成功优先」，
  // 行按 cardId 去重后全量重算，保证不因为补采丢掉首轮已采到的页。
  let mergedPages = { ...pageStats };
  let mergedErrors = [...errors];
  if (doMerge) {
    const prevRaw = readJSON(path.join(workDir, 'list-raw.json'));
    if (prevRaw) {
      let kept = 0;
      for (const [p, s] of Object.entries(prevRaw.pageStats || {})) {
        if (s && s.status === 200 && !(pageStats[p] && pageStats[p].status === 200)) { mergedPages[p] = s; kept++; }
      }
      const have = new Set(uniq.map(r => r.id));
      for (const r of (prevRaw.rows || [])) if (r && r.id && !have.has(r.id)) { have.add(r.id); uniq.push(r); }
      mergedErrors = [...(prevRaw.errors || []), ...errors];
      if (kept) console.log(`已合并首轮采集结果（补回成功页 ${kept} 个）`);
    }
  }
  for (const k of Object.keys(pageStats)) delete pageStats[k];
  Object.assign(pageStats, mergedPages);

  const mk = r => ({
    id: String(r.id),
    slug: r.slug,
    name: r.name,
    rating: r.rating,
    version: '',
    position: r.pos,
    isEstimate: r.isEstimate,
    currentPrice: null,
    prices: {
      console: { price: r.psPrice, valid: r.psPrice >= MIN_VALID_PRICE },
      pc: { price: r.pcPrice, valid: r.pcPrice >= MIN_VALID_PRICE },
    },
    marketUrl: `https://www.futbin.com/27/player/${r.id}/${r.slug}`,
    launchDate: LAUNCH_DATE,
  });

  const iconsRaw = uniq.filter(r => r.version === 'Icon');
  // 归属收敛（2026-09-18 固化）：列表页带 `Icon` 标签的行数多于基础传奇卡台账
  // （实测 10 页 199 行 vs 台账 131 张），其中含非基础卡。按契约「以卡库台账为基准判定归属」，
  // 只保留台账内的 cardId，多出来的如实记入 counts.iconNotInLedger，不写入 base-icons.json。
  const ledgerIds = new Set((readJSON(LEDGER_PATH) || []).map(x => String(x.id)));
  const iconNotInLedger = ledgerIds.size ? iconsRaw.filter(r => !ledgerIds.has(String(r.id))) : [];
  const iconsKept = ledgerIds.size ? iconsRaw.filter(r => ledgerIds.has(String(r.id))) : iconsRaw;
  const heroesRaw = uniq.filter(r => r.version === 'Hero');
  const iconsCollected = iconsKept.map(r => { const o = mk(r); const zh = zhOf(prevIcons, o); if (zh) o.nameZh = zh; return o; });
  const heroes = heroesRaw.map(r => { const o = mk(r); const zh = zhOf(prevHeroes, o) || zhOf(prevIcons, o); if (zh) o.nameZh = zh; return o; });

  // 台账补全（2026-09-19 固化）：当来源被 403 截断、成功页不足时，**未采到的台账卡仍以空价状态保留在名单中**
  // （价格一律 price:0 / valid:false，只带名单与卡值字段），使逐日快照的卡数与台账一致（131 张）。
  // 原因：本脚本此前只写「采到的行」，一次被 403 截断就会把当日台账从 131 静默缩到 102（2026-09-19 实发），
  // 与 09-17/09-18 的 131 张不可比，也让「记录进度」失去意义。名单基准只取卡库台账，**不得**取旧日期文件或 FC26 补价。
  const collectedIconIds = new Set(iconsCollected.map(o => String(o.id)));
  const iconMissingFromLedger = (readJSON(LEDGER_PATH) || [])
    .filter(x => x && x.id && !collectedIconIds.has(String(x.id)))
    .map(x => {
      const o = {
        id: String(x.id), slug: x.slug, rating: x.rating, version: '',
        position: x.position || '', isEstimate: null, currentPrice: null,
        prices: { console: { price: 0, valid: false }, pc: { price: 0, valid: false } },
        marketUrl: `https://www.futbin.com/27/player/${x.id}/${x.slug}`,
        launchDate: LAUNCH_DATE,
      };
      const zh = zhOf(prevIcons, o) || x.nameZh;
      if (zh) o.nameZh = zh;
      return o;
    });
  const icons = [...iconsCollected, ...iconMissingFromLedger];
  const withZh = o => { if (!o.nameZh) delete o.nameZh; return o; };
  const sortDesc = (a, b) => (b.rating - a.rating) || String(a.name).localeCompare(String(b.name));

  const rawDoc = {
    schemaVersion: 1, date: dateStr, game: 'fc27', source: 'https://www.futbin.com/27/players（列表页翻页 + 行内版本标签）',
    collectedAt: nowIso(), proxy: PROXY, pagesRequested: maxPage, hostBuilds,
    pageStats, counts: { rows: allRows.length, unique: uniq.length, icons: iconsKept.length, heroes: heroesRaw.length, iconNotInLedger: iconNotInLedger.length, deletedIcon: uniq.filter(r => r.version === 'Debut Icon').length, other: uniq.filter(r => r.version === 'other').length },
    errors: mergedErrors, rows: uniq,
  };
  atomicWrite(path.join(workDir, 'list-raw.json'), JSON.stringify(rawDoc, null, 2));

  const collected = Object.values(pageStats).filter(s => s && s.status === 200).length;
  // priceBasis **按本轮实测有效价判定**（2026-09-20 用户口径）：不再用「日期 < launchDate」一刀切。
  // 理由：09-18 当天两平台价多为 0/占位值，若按日期判成 market，会让「日环比」把占位价当成基线。
  const iconPriced = iconsCollected.filter(i => i.prices.console.valid || i.prices.pc.valid).length;
  const heroPriced = heroes.filter(h => h.prices.console.valid || h.prices.pc.valid).length;
  const basisOf = n => (n > 0 ? 'partial-live' : 'listing-estimate');
  const basisNoteOf = (n, total) => (n > 0
    ? `本轮 ${total} 张中有 ${n} 张拿到平台级有效价（≥1000 coins），属 FUTBIN 滚动更新的挂单/估价口径，不是成交价。`
    : `本轮 ${total} 张全部无平台级有效价（均 <1000 coins），FUTBIN 仅提供列表页占位/估算值，不是市场成交价，不得据此计算涨跌。`);
  const iconsOut = {
    schemaVersion: 1, generatedAt: nowIso(), game: 'fc27', cardType: 'base-icon',
    source: `https://www.futbin.com/27/players（列表页翻页 1-${maxPage}，行内版本标签 Icon；成功页 ${collected}/${maxPage}；未采到页的 ${iconMissingFromLedger.length} 张台账卡以空价保留，价格未取到）`,
    launchDate: LAUNCH_DATE, priceBasis: basisOf(iconPriced),
    priceBasisNote: basisNoteOf(iconPriced, iconsCollected.length),
    counts: {
      total: icons.length, collected: iconsCollected.length, missingFromSource: iconMissingFromLedger.length,
      withConsolePrice: iconsCollected.filter(i => i.prices.console.valid).length,
      withPcPrice: iconsCollected.filter(i => i.prices.pc.valid).length,
    },
    players: icons.map(withZh).sort(sortDesc),
  };
  const heroesOut = {
    schemaVersion: 1, generatedAt: nowIso(), game: 'fc27', cardType: 'hero',
    source: `https://www.futbin.com/27/players（列表页翻页 1-${maxPage}，行内版本标签 Base Heroes；成功页 ${collected}/${maxPage}）`,
    launchDate: LAUNCH_DATE, priceBasis: basisOf(heroPriced),
    counts: { listed: heroes.length, withConsolePrice: heroes.filter(h => h.prices.console.valid).length, withPcPrice: heroes.filter(h => h.prices.pc.valid).length },
    players: heroes.map(withZh).sort(sortDesc),
  };
  atomicWrite(ICON_OUT, JSON.stringify(iconsOut, null, 2));
  atomicWrite(HERO_OUT, JSON.stringify(heroesOut, null, 2));

  const consoleValid = icons.filter(i => i.prices.console.valid).length + heroes.filter(h => h.prices.console.valid).length;
  const pcValid = icons.filter(i => i.prices.pc.valid).length + heroes.filter(h => h.prices.pc.valid).length;
  console.log(JSON.stringify({
    date: dateStr, maxPage, hostBuilds, collectedPages: `${collected}/${maxPage}`,
    rows: allRows.length, unique: uniq.length,
    icons: icons.length, heroes: heroes.length, iconNotInLedger: iconNotInLedger.length,
    iconMissingFromSource: iconMissingFromLedger.length,
    excludedDebutIcon: rawDoc.counts.deletedIcon, otherVersions: rawDoc.counts.other,
    consoleValid, pcValid, errors: errors.length,
    listRaw: path.relative(ROOT, path.join(workDir, 'list-raw.json')),
  }, null, 2));
  if (!icons.length && !heroes.length) process.exit(2);
}

main().catch(e => { console.error('采集失败:', e); process.exit(1); });
