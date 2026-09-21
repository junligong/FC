#!/usr/bin/env node
/**
 * fetch-fc27-detail.mjs — FC27 球员详情页全字段采集器（via Web Access CDP Proxy :3456）
 *
 * 输入（JSONL，每行 {v,id,href,...}）：
 *   apps/market/engine/gold/data/players/fc27/tmp-fetch/gold-lists.jsonl （金卡 2671）
 *   apps/market/engine/gold/data/players/fc27/tmp-fetch/icons-lists.jsonl（传奇 290）
 * 输出（JSONL 原子追加 + progress 断点）：
 *   tmp-fetch/fc27-detail-v2.jsonl          每条详情记录（全字段）
 *   tmp-fetch/fc27-detail-v2-progress.json  {done:[ids], failed:[{id,err}]}
 *
 * 用法：
 *   node fetch-fc27-detail.mjs              全量
 *   node fetch-fc27-detail.mjs --ids 1,5   只抓指定 id（试跑/补抓）
 *   node fetch-fc27-detail.mjs --workers 3 并发 tab 数（默认 4）
 *   node fetch-fc27-detail.mjs --batch 10  只抓前 N 个未完成（分批）
 *
 * 通道规则：仅用 Web Access CDP Proxy（用户已登录 Chrome），无 extension/IAB/独立 profile。
 * 提取口径已实地核验：PS+ = a.playStyle-table-icon.psplus（/plus/ 图标），
 * 银色 PS = 同容器非 psplus；resourceId 来自 JSON-LD img/players/<rid>.png；
 * 细分属性 .player-stat-row（.player-stat-name + 行尾数值）；副位置 .playercard-27-alt-pos-*。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.resolve(__dirname, "../data/players/fc27/tmp-fetch");
const OUT_JSONL = path.join(TMP, "fc27-detail-v2.jsonl");
const PROG_JSON = path.join(TMP, "fc27-detail-v2-progress.json");

const PROXY = "http://localhost:3456";
const MAX_WORKERS = 4;

const args = process.argv.slice(2);
const flag = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const idsOnly = flag("--ids") ? flag("--ids").split(",").map((s) => s.trim()).filter(Boolean) : null;
const workers = Math.min(MAX_WORKERS, parseInt(flag("--workers") || "4", 10) || 4);
const batch = flag("--batch") ? parseInt(flag("--batch"), 10) || 10 : null;
const LIMIT_SLEEP_MS = 2500; // 每页后随机延迟基线

// ---------- stat 名 → 标准 key ----------
const STAT_MAP = {
  "pace": "pace", "acceleration": "acceleration", "sprint speed": "sprint_speed",
  "shooting": "shooting", "positioning": "positioning",
  "att. position": "positioning", "finishing": "finishing",
  "shot power": "shot_power", "long shots": "long_shots", "volleys": "volleys",
  "penalties": "penalties", "passing": "passing", "vision": "vision",
  "crossing": "crossing", "fk acc.": "free_kick_accuracy",
  "free kick accuracy": "free_kick_accuracy",
  "short pass": "short_passing", "short passing": "short_passing",
  "long pass": "long_passing", "long passing": "long_passing", "curve": "curve",
  "dribbling": "dribbling", "agility": "agility", "balance": "balance",
  "reactions": "reactions", "ball control": "ball_control", "composure": "composure",
  "defending": "defending", "interceptions": "interceptions",
  "heading acc.": "heading_accuracy", "heading accuracy": "heading_accuracy",
  "def. aware": "defensive_awareness", "defensive awareness": "defensive_awareness",
  "stand tackle": "standing_tackle", "standing tackle": "standing_tackle",
  "slide tackle": "sliding_tackle", "sliding tackle": "sliding_tackle",
  "physical": "physical", "jumping": "jumping", "stamina": "stamina",
  "strength": "strength", "aggression": "aggression",
  "diving": "gk_diving", "handling": "gk_handling", "kicking": "gk_kicking",
  "reflexes": "gk_reflexes", "speed": "gk_speed", "positioning(gk)": "gk_positioning",
};

// ---------- 提取 JS（详情页内执行） ----------
const EXTRACT_JS = `(function(){
  var STAT_MAP=${JSON.stringify(STAT_MAP)};
  var out={};
  try{
    // 1. 链接 / 名称（title 截取）
    out.href=location.href.replace(/^https:\\/\\/www\\.futbin\\.com/,"");
    out.name=(document.title.split(" EA FC 27")[0]||"").trim();
    if(!out.name){var og=document.querySelector("meta[property=og:title]");out.name=og?og.content.split(" EA FC 27")[0].trim():null}
    // 2. JSON-LD → resourceId / avatar / ovr
    var rid=null,avatar=null,ovr=null;
    var ss=document.querySelectorAll("script");
    for(var i=0;i<ss.length;i++){
      var t=ss[i].textContent||"";
      if(t.indexOf("schema.org")<0)continue;
      var m=t.match(/img\\/players\\/(\\d+)\\.png/);
      if(m&&!rid){rid=m[1];avatar="https://cdn.futbin.com/content/fifa27/img/players/"+m[1]+".png"}
      var mv=t.match(/(\\d+) rating/i);
      if(mv&&!ovr){ovr=+mv[1]}
    }
    if(!rid){document.querySelectorAll("img").forEach(function(im){var s=im.src||"";var mm=s.match(/img\\/players\\/(\\d+)\\.png/);if(mm&&!rid){rid=mm[1];avatar=s}})}
    out.resourceId=rid;out.avatarUrl=avatar;out.ovr=ovr;
    // 3. 六维（PAC/SHO/... 或 GK 的 DIV/HAN/...，innerText 以换行分隔）
    var six={};
    var bx=document.querySelector(".playercard-27-extended-stats");
    if(bx&&bx.innerText){
      var toks=bx.innerText.split(/[\\n\\t]+/).map(function(x){return x.trim()}).filter(Boolean);
      for(var j=0;j+1<toks.length;j+=2){
        var vv=parseInt(toks[j],10),kk=toks[j+1].toLowerCase();
        if(!isNaN(vv)&&kk&&/^[a-z]{2,6}$/.test(kk))six[kk]=vv;
      }
    }
    out.six=six;
    var gkMode=!!six.div; // GK 卡六维为 DIV/HAN/KIC/REF/SPD/POS
    // 4. 细分属性
    var stats={};
    document.querySelectorAll(".player-stat-row").forEach(function(r){
      var nm=r.querySelector(".player-stat-name");
      if(!nm)return;
      var txt=r.innerText||"";
      var mm=txt.match(/(\\d+)\\s*$/);
      var key=STAT_MAP[(nm.textContent||"").trim().toLowerCase()];
      if(gkMode&&key==="positioning")key="gk_positioning";
      if(mm&&key&&stats[key]===undefined)stats[key]=parseInt(mm[1],10);
    });
    out.stats=stats;
    // 5. 特技
    var psplus=[],ps=[];
    var pbox=document.querySelector(".player-info-box-playerstyles");
    if(pbox){
      pbox.querySelectorAll("a.playStyle-table-icon").forEach(function(a){
        var nmt=(a.querySelector("div")||{}).innerText?(a.querySelector("div").innerText.trim()):"";
        if(!nmt)nmt=(a.getAttribute("title")||"").trim();
        if(a.classList.contains("psplus")){if(psplus.indexOf(nmt)<0)psplus.push(nmt)}
        else if(nmt){if(ps.indexOf(nmt)<0)ps.push(nmt)}
      });
    }
    out.playstyles={plus:psplus,silver:ps};
    // 6. 基本信息原始文本
    var ib=document.querySelector(".player-info-box");
    var rawInfo=ib?ib.innerText.replace(/\\n+/g,"|"):null;
    out.rawInfo=rawInfo;
    // 7. 位置/角色（基于 rawInfo 权威解析，FUTBIN roles 区格式：POS|Role|++|POS|Role|+）
    //    合法位置白名单，杜绝误抓特技名/联赛等
    var POS=["GK","RWB","RB","CB","LB","LWB","CDM","CM","CAM","RM","LM","RW","RF","CF","LW","LF","ST"];
    out.roles=null;
    out.altPos=[];
    if(rawInfo){
      var triples=[],re=/(?:^|\\|)([A-Z]{2,3})\\|([^|]+?)\\|(\\+\\+?)(?=\\||$)/g,m;
      while((m=re.exec(rawInfo))){
        if(POS.indexOf(m[1])>=0)triples.push({position:m[1],role:(m[2]||"").trim(),rating:m[3]});
      }
      if(triples.length){
        out.roles=triples;
        var main=triples[0].position,alt=[];
        for(var q=1;q<triples.length;q++){
          var p=triples[q].position;
          if(p!==main&&alt.indexOf(p)<0)alt.push(p);
        }
        out.altPos=alt;
      }
    }
  }catch(e){out._err=String(e)}
  return JSON.stringify(out);
})()`;

// ---------- 工具 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a));

async function post(api, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(PROXY + api, { method: "POST", body, signal: ctrl.signal });
    const txt = await res.text();
    return txt;
  } catch (e) {
    return JSON.stringify({ error: "req:" + e.message });
  } finally {
    clearTimeout(t);
  }
}

async function evalOn(target, js) {
  const raw = await post("/eval?target=" + target, js);
  try {
    const j = JSON.parse(raw);
    if (j.error) return { err: j.error };
    return { value: j.value };
  } catch {
    return { raw, err: "unparse" };
  }
}

function loadTodo() {
  const todo = [];
  for (const fn of ["gold-lists.jsonl", "icons-lists.jsonl"]) {
    const p = path.join(TMP, fn);
    if (!fs.existsSync(p)) { console.error("MISSING " + p); process.exit(2); }
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        todo.push({ v: o.v || (fn.startsWith ? "gold" : "icons"), id: String(o.id), href: o.href });
      } catch { /* skip */ }
    }
  }
  // 去重保序（id 可能跨文件重复）
  const seen = new Set();
  return todo.filter((t) => !seen.has(t.id) && seen.add(t.id));
}

function loadProgress() {
  if (!fs.existsSync(PROG_JSON)) return { done: [], failed: [] };
  try { return JSON.parse(fs.readFileSync(PROG_JSON, "utf8")); } catch { return { done: [], failed: [] }; }
}

function saveProgress(p) {
  const tmp = PROG_JSON + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(p));
  fs.renameSync(tmp, PROG_JSON);
}

const appendLine = (line) => fs.appendFileSync(OUT_JSONL, line + "\n");

/** 等待页面就绪：title 非空、无 CF 挑战、含 info-box */
async function waitReady(target, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await evalOn(target, `(function(){
      var t=document.title||"";
      var ok=t&&t.indexOf("Just a moment")<0&&t.indexOf("\\u8bf7\\u7a0d\\u5019")<0&&t.indexOf("EA FC 27")>=0;
      var box=document.querySelector(".player-info-box");
      return JSON.stringify({ok:!!(ok&&box),title:t.slice(0,40)});
    })()`);
    if (!r.err && r.value) {
      try {
        const st = JSON.parse(r.value);
        if (st.ok) return true;
      } catch { /* ignore */ }
    }
    await sleep(2000);
  }
  return false;
}

async function openTab(firstUrl) {
  // /new 的 body 必须是纯 URL 字符串（JSON body 会返回空）
  let tid = null;
  let raw = "";
  for (let k = 0; k < 3; k++) {
    raw = await post("/new", firstUrl);
    try {
      const j = JSON.parse(raw);
      tid = (j.targetId || j.target || null);
    } catch { tid = null; }
    if (tid) break;
    await sleep(4000);
  }
  if (!tid) throw new Error("no target from /new: " + raw.slice(0, 120));
  const ok = await waitReady(tid, 90000);
  if (!ok) throw new Error("timed out waiting ready on first page");
  return tid;
}

async function fetchOne(target, item) {
  // 导航
  const nav = await evalOn(target, `(function(){location.href=${JSON.stringify(item.href)};return "go";})()`);
  if (nav.err) return { err: "nav:" + nav.err };
  const ok = await waitReady(target, 60000);
  if (!ok) return { err: "ready-timeout" };
  await sleep(rand(LIMIT_SLEEP_MS, LIMIT_SLEEP_MS + 2500));
  // 提取（最多 2 次）
  let last = null;
  for (let k = 0; k < 2; k++) {
    const r = await evalOn(target, EXTRACT_JS);
    if (!r.err && r.value) {
      try {
        const o = JSON.parse(r.value);
        if (!o._err) return { value: o };
        last = "extract-inner:" + o._err;
      } catch { last = "parse-fail"; }
    } else {
      last = r.err || "extract-fail";
    }
    await sleep(3000);
  }
  return { err: last };
}

async function worker(items, state, log) {
  let target = null;
  try {
    target = await openTab(items[0].href);
  } catch (e) {
    log(`worker init fail (${e.message.slice(0,60)})`);
    // 再试一次首开
    try {
      await sleep(15000);
      target = await openTab(items[0].href);
    } catch (e2) {
      return { fatal: true, msg: String(e2.message).slice(0, 120) };
    }
  }
  if (!target) return { fatal: true, msg: "no target" };
  log("worker tab ready " + target.slice(0, 8));
  // 第一张直接是当前页（首 URL 已加载）
  let first = true;
  for (const item of items) {
    if (state.doneSet.has(item.id)) continue;
    let res;
    if (first) {
      const r = await evalOn(target, EXTRACT_JS);
      res = r.err ? { err: r.err } : { value: JSON.parse(r.value) };
      first = false;
      // 若第一张因挑战未过 → 走正常流程
      if (res.value && res.value._err) res = await fetchOne(target, item);
      if (res.err) {
        await sleep(5000);
        res = await fetchOne(target, item);
      }
    } else {
      res = await fetchOne(target, item);
    }
    if (res.value && !res.err) {
      state.doneSet.add(item.id);
      state.done.push(item.id);
      appendLine(JSON.stringify({ ...item, ...res.value, fetchedAt: new Date().toISOString() }));
      if (state.done.length % 20 === 0) saveProgress(state);
      log(`OK ${item.id} ${res.value.name || ""} ${res.value.ovr || ""} ${res.value.playstyles.plus.length}S+`);
    } else {
      state.failed.push({ id: item.id, v: item.v, href: item.href, err: res.err || "unknown" });
      saveProgress(state);
      log(`FAIL ${item.id} ${res.err || ""}`);
    }
    await sleep(rand(1500, 3500));
  }
  return {};
}

// ---------- main ----------
const todo = loadTodo();
const prog = loadProgress();
prog.doneSet = new Set(prog.done);
const queue = idsOnly
  ? todo.filter((t) => idsOnly.includes(t.id))
  : todo;
const pending = queue.filter((t) => !prog.doneSet.has(t.id));
let targets = batch ? pending.slice(0, batch) : pending;

if (targets.length === 0) {
  console.log("nothing to do (done=" + prog.done.length + ", total=" + todo.length + ")");
  process.exit(0);
}

console.log(`total=${todo.length} done=${prog.done.length} toFetch=${targets.length} workers=${workers}`);

const chunks = [];
for (let i = 0; i < targets.length; i += Math.ceil(targets.length / workers)) {
  chunks.push(targets.slice(i, i + Math.ceil(targets.length / workers)));
}
// 平衡：把大块再摊平
const balanced = Array.from({ length: workers }, () => []);
targets.forEach((t, i) => balanced[i % workers].push(t));

let logLock = Promise.resolve();
function log(msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  logLock = logLock.then(() => {
    console.log(`[${ts}] ${msg}`);
  });
}

const tStart = Date.now();
(async () => {
  const results = await Promise.all(
    balanced.filter((c) => c.length).map((c, i) => worker(c, prog, (m) => log(`W${i} ${m}`)))
  );
  saveProgress(prog);
  const mins = ((Date.now() - tStart) / 60000).toFixed(1);
  const fatal = results.filter((r) => r.fatal);
  console.log(`\nDONE in ${mins}min | ok=${prog.done.length} failed=${prog.failed.length}`);
  if (fatal.length) console.log("FATAL workders:", JSON.stringify(fatal));
  if (prog.failed.length) console.log("failed samples:", JSON.stringify(prog.failed.slice(0, 5)));
})();