#!/usr/bin/env node
/**
 * render-fc27-index.mjs — 生成 FC27 球员数据库中文 HTML 总表
 *
 * 输入：shared/data/fc27/players.json + shared/data/fc27/images/
 * 输出：shared/data/fc27/index.html（与 images/ 同级，头像用相对路径可本地浏览）
 *
 * 功能：按金卡/传奇、位置、总评、俱乐部、联赛、国籍、金银特技筛选；
 *       每行打开本地头像与 FUTBIN 详情链接；数据内嵌（单文件自包含，图片用相对路径）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../..");
const CANON = path.join(ROOT, "shared/data/fc27/players.json");
const OUT1 = path.join(ROOT, "shared/data/fc27/index.html");

const data = JSON.parse(fs.readFileSync(CANON, "utf8"));
const players = data.players || [];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const zhOrEn = (p) => p.nameZh || p.name || "(待补)";

// 球队/联赛/国籍 唯一列表
const clubs = [...new Set(players.map((p) => p.club).filter(Boolean))].sort();
const leagues = [...new Set(players.map((p) => p.league).filter(Boolean))].sort();
const nations = [...new Set(players.map((p) => p.nation).filter(Boolean))].sort();
const posAll = [...new Set(players.flatMap((p) => p.positions || [p.position]).filter(Boolean))].sort();
const versions = ["gold", "icons"];

// 属性范围类型（GK 卡六维不同）
const sixType = (p) => (p.position === "GK" ? ["div", "han", "kic", "ref", "spd", "pos"] : ["pac", "sho", "pas", "dri", "def", "phy"]);
const SIX_CN = { pac: "速度", sho: "射门", pas: "传球", dri: "盘带", def: "防守", phy: "身体",
  div: "扑救", han: "手控", kic: "开球", ref: "反应", spd: "速度", pos: "站位" };

const rows = [];
for (const p of players) {
  const keys = sixType(p);
  const attrs = p.attributes || {};
  const sixStr = keys.map((k) => `${SIX_CN[k]}${attrs[k] ?? "-"}`).join(" / ");
  const psPlus = (p.playstyles?.plus || []).join("、");
  const psSilver = (p.playstyles?.silver || []).join("、");
  const verLabel = p.version === "icons" ? "传奇" : p.version === "gold" ? "金卡" : esc(p.version);
  rows.push(`<tr class="row v-${esc(p.version)}" data-version="${esc(p.version)}" data-name="${esc(zhOrEn(p))}" data-pos="${esc((p.positions || []).join(","))}" data-rating="${p.rating}" data-club="${esc(p.club || "")}" data-league="${esc(p.league || "")}" data-nation="${esc(p.nation || "")}" data-psplus="${esc(psPlus)}" data-pssilver="${esc(psSilver)}">
    <td><img class="ava" src="${esc(p.avatarPath || "")}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></td>
    <td><strong>${esc(zhOrEn(p))}</strong><div class="sub">${esc(p.name || "")}</div></td>
    <td>${verLabel}${p.cardType ? "<div class=sub>" + esc(p.cardType) + "</div>" : ""}</td>
    <td class="c">${p.rating ?? "-"}</td>
    <td>${esc(p.position || "-")}${(p.positions || []).length > 1 ? `<div class="sub">${esc((p.positions || []).join(","))}</div>` : ""}</td>
    <td class="c">${p.skillMoves ?? "-"}<span class="dim">★</span>/${p.weakFoot ?? "-"}<span class="dim">★</span></td>
    <td class="six">${sixStr}</td>
    <td>${psPlus ? `<div class="psp">${esc(psPlus)}</div>` : ""}${psSilver ? `<div class="pss">${esc(psSilver)}</div>` : ""}</td>
    <td class="sub">${esc(p.club || "-")}<br>${esc(p.league || "-")}<br>${esc(p.nation || "-")}</td>
    <td class="sub">${esc(p.height || "-")}${p.foot ? `/${esc(p.foot)}` : ""}${p.bodyType ? `<br>${esc(p.bodyType)}` : ""}${p.age ? `<br>${esc(p.age)}岁` : ""}</td>
    <td><a href="${esc(p.futbinUrl)}" target="_blank" rel="noreferrer">FUTBIN</a></td>
  </tr>`);
}

const options = (arr, attr) => arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FC27 球员数据库总表</title>
<style>
:root{--bd:#e5e7eb;--bg:#f8fafc;--t:#0f172a;--acc:#2563eb}
*{box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--t);margin:0;padding:16px}
h1{font-size:20px;margin:0 0 4px}
.meta{color:#64748b;font-size:12px;margin-bottom:12px}
.card{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:14px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.filters label{font-size:13px;color:#334155}
.filters select,.filters input{border:1px solid var(--bd);border-radius:6px;padding:5px 8px;font-size:13px;background:#fff}
.stat{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:#334155}
.stat b{color:var(--acc)}
.tbl-wrap{overflow-x:auto;background:#fff;border:1px solid var(--bd);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:12.5px;min-width:1100px}
th{background:#f1f5f9;position:sticky;top:0;text-align:left;padding:7px 8px;border-bottom:2px solid var(--bd);white-space:nowrap}
td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
tr:hover{background:#eff6ff}
.ava{width:44px;height:44px;border-radius:6px;object-fit:contain;background:#0b1220}
.sub{color:#94a3b8;font-size:11px}
.dim{opacity:.5;font-size:10px}
.six{white-space:nowrap;color:#334155;font-size:11.5px}
.psp{color:#b45309;font-size:11px;white-space:normal}
.pss{color:#2563eb;font-size:11px;white-space:normal}
.c{text-align:center}
.hidden{display:none}
.empty{padding:30px;text-align:center;color:#94a3b8}
a{color:var(--acc);text-decoration:none}
a:hover{text-decoration:underline}
.reset{background:var(--acc);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}
</style>
</head>
<body>
<h1>🎮 FC27 球员数据库总表 <span style="font-size:13px;color:#64748b">(FUTBIN 已核实 · ${players.length} 张卡)</span></h1>
<div class="meta">数据源：FUTBIN FC27 列表页 + 详情页实测 ｜ 生成时间：${esc(data.generatedAt)} ｜ schemaVersion ${data.schemaVersion} ｜ 图片本地化于 shared/data/fc27/images/</div>

<div class="card">
  <div class="filters">
    <label>卡种 <select id="f-ver"><option value="">全部</option><option value="gold">金卡</option><option value="icons">传奇</option></select></label>
    <label>主位置 <select id="f-pos"><option value="">全部</option>${options(posAll, "pos")}</select></label>
    <label>总评 ≥ <input id="f-rating" type="number" min="0" max="99" style="width:58px" placeholder="60"></label>
    <label>俱乐部 <select id="f-club"><option value="">全部</option>${options(clubs, "club")}</select></label>
    <label>联赛 <select id="f-league"><option value="">全部</option>${options(leagues, "league")}</select></label>
    <label>国籍 <select id="f-nation"><option value="">全部</option>${options(nations, "nation")}</select></label>
    <label>金特技 <input id="f-psplus" list="psplus-list" placeholder="如: Rapid" style="width:120px"></label>
    <label>银特技 <input id="f-pssilver" list="pssilver-list" placeholder="如: First Touch" style="width:120px"></label>
    <label>搜索 <input id="f-name" placeholder="中文/英文名" style="width:140px"></label>
    <button class="reset" id="reset">重置</button>
  </div>
  <datalist id="psplus-list">${[...new Set(players.flatMap((p) => p.playstyles?.plus || []))].map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
  <datalist id="pssilver-list">${[...new Set(players.flatMap((p) => p.playstyles?.silver || []))].map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
  <div class="stat" style="margin-top:10px">
    <span>总计 <b id="st-total">${players.length}</b></span>
    <span>金卡 <b>${data.counts.gold ?? 0}</b> ｜ 传奇 <b>${data.counts.icons ?? 0}</b></span>
    <span>显示 <b id="st-show">${players.length}</b></span>
  </div>
</div>

<div class="tbl-wrap">
<table id="tbl">
<thead><tr>
<th>卡面</th><th>球员</th><th>版本</th><th>总评</th><th>位置</th><th>花式/逆足</th><th>六维</th><th>特技(金/银)</th><th>俱乐部/联赛/国籍</th><th>身高/体型</th><th>FUTBIN</th>
</tr></thead>
<tbody id="tbody">
${rows.join("\n")}
</tbody>
</table>
<div id="empty" class="empty hidden">没有匹配的卡片</div>
</div>

<script>
const tbody=document.getElementById('tbody'),empty=document.getElementById('empty'),rows=[...tbody.querySelectorAll('tr')];
const ids=['f-ver','f-pos','f-rating','f-club','f-league','f-nation','f-psplus','f-pssilver','f-name'];
const get=v=>document.getElementById(v).value.trim().toLowerCase();
function apply(){
  let show=0;
  const ver=get('f-ver'),pos=get('f-pos'),rat=get('f-rating'),club=get('f-club'),lea=get('f-league'),nat=get('f-nation'),pp=(get('f-psplus')),ps=(get('f-pssilver')),name=get('f-name');
  const low = (s) => (s || "").toLowerCase();
  for(const r of rows){
    const d=r.dataset;
    let ok=true;
    if(ver&&d.version!==ver)ok=false;
    if(ok&&pos&&!low(d.pos).split(',').includes(pos))ok=false;
    if(ok&&rat&&+(d.rating||0)< +rat)ok=false;
    if(ok&&club&&low(d.club)!==club)ok=false;
    if(ok&&lea&&low(d.league)!==lea)ok=false;
    if(ok&&nat&&low(d.nation)!==nat)ok=false;
    if(ok&&pp&&!low(d.psplus).includes(pp))ok=false;
    if(ok&&ps&&!low(d.pssilver).includes(ps))ok=false;
    if(ok&&name&&!low(d.name).includes(name))ok=false;
    r.classList.toggle('hidden',!ok);
    if(ok)show++;
  }
  document.getElementById('st-show').textContent=show;
  empty.classList.toggle('hidden',show>0);
}
ids.forEach(id=>document.getElementById(id).addEventListener('input',apply));
document.getElementById('reset').addEventListener('click',()=>{ids.forEach(id=>document.getElementById(id).value='');apply();});
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT1), { recursive: true });
const tmp = OUT1 + ".tmp";
fs.writeFileSync(tmp, html);
fs.renameSync(tmp, OUT1);
console.log(`index written: ${OUT1} (${players.length} rows)`);