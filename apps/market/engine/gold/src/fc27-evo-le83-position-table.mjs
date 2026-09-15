// 作用：生成FC27评分83及以下球员的分位置进化候选表。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..', '..');
const D = (p) => path.join(PROJECT, p);

const le83 = JSON.parse(fs.readFileSync(D('gold/data/players/fc27/fc27-gold-le83.json'), 'utf8'));
const popular = JSON.parse(fs.readFileSync(D('gold/data/popular/fc27-popular-le83.json'), 'utf8'));
const hotPlayers = JSON.parse(fs.readFileSync('/tmp/fc26_hot_players.json', 'utf8'));
const openingTasks = JSON.parse(fs.readFileSync('/tmp/fc26_opening_tasks.json', 'utf8'));
const psMap = JSON.parse(fs.readFileSync(D('gold/data/prices/easysbc/play-styles.json'), 'utf8'));

const norm = (v='') => String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const normNS = (v='') => norm(v).replace(/\s+/g,'');

// popular 精确索引: slugNS 与 fullnameNS -> hot
const popBySlug = new Map();
const popByName = new Map();
for (const p of popular) {
  popBySlug.set(normNS(p.slug.replace(/-/g,' ')), p);
  popByName.set(normNS(p.name), p);
}

const hotBySurname = new Map(); // 姓 -> max count
const hotSurnames = new Set();
for (const h of hotPlayers) {
  hotBySurname.set(normNS(h.name).replace(/\s+/g,''), Math.max(hotBySurname.get(normNS(h.name).replace(/\s+/g,''))||0, h.count));
  hotSurnames.add(normNS(h.name).replace(/\s+/g,''));
}

const posRestrict = new Map();
for (const t of openingTasks) {
  const r = { positions: [], notPositions: [], overallMax: null, paceMax: null, psMax: null, psPlusMax: null, totalPosMax: null };
  for (const q of t.reqs) {
    const v = (q.value||'').replace(/^Max\s*/i,'');
    if (q.label === 'Overall') r.overallMax = parseInt(v)||null;
    if (q.label === 'Pace') r.paceMax = parseInt(v)||null;
    if (q.label === 'PlayStyle') r.psMax = parseInt(v)||null;
    if (q.label === 'PlayStyle+') r.psPlusMax = parseInt(v)||null;
    if (q.label === 'Total Positions') r.totalPosMax = parseInt(v)||null;
    if (q.label === 'Position') r.positions.push(q.value);
    if (q.label === 'Not Position') r.notPositions.push(q.value);
  }
  posRestrict.set(t.name, r);
}

const SIX = ['PAC','SHO','PAS','DRI','DEF','PHY'];
const GROUP_MAP = {
  'LB':'LB','RB':'RB','CB':'CB','CDM':'CDM','CM':'CM','CAM':'CAM',
  'LW':'LW/LM','LM':'LW/LM','ST':'ST','RM':'RM/RW','RW':'RM/RW',
};

const validateTask = (p, evoName) => {
  const r = posRestrict.get(evoName);
  if (!r) return null;
  if (r.overallMax != null && p.rating > r.overallMax) return null;
  if (r.positions.length && !r.positions.some(pos => p.positions.includes(pos))) return null;
  if (r.notPositions.length && r.notPositions.some(pos => p.positions.includes(pos))) return null;
  if (r.paceMax != null && (p.attributes[0]||0) > r.paceMax) return null;
  if (r.psMax != null && (p.playStyles?.length||0) > r.psMax) return null;
  if (r.psPlusMax != null && (p.playStylesPlus?.length||0) > r.psPlusMax) return null;
  if (r.totalPosMax != null && (p.positions?.length||0) > r.totalPosMax) return null;
  return true;
};

const rows = [];
const seen = new Set();
for (const p of le83) {
  if (seen.has(p.resourceId)) continue;
  seen.add(p.resourceId);
  const main = p.preferredPosition || p.positions?.[0] || '';
  const group = GROUP_MAP[main] || '其他';
  const attrs = p.attributes || [];
  const six = {};
  SIX.forEach((k,i)=> six[k] = attrs[i]);

  // popular: 全名 或 slug 精确匹配
  let pop = null;
  const fullNS = normNS(p.name);
  const cardNS = normNS(p.cardName||'');
  pop = popByName.get(fullNS) || popBySlug.get(fullNS) || popBySlug.get(cardNS);
  const popularHot = pop ? pop.hot : null;

  // FC26 热门: 姓匹配 cardName
  let fc26HotCount = 0;
  let fc26HotSurname = null;
  if (hotSurnames.has(cardNS)) { fc26HotCount = hotBySurname.get(cardNS)||0; fc26HotSurname = cardNS; }

  const fitEvos = [];
  for (const [ename] of posRestrict) if (validateTask(p, ename)) fitEvos.push(ename);

  const psNames = (p.playStyles||[]).map(id => psMap[String(id)]?.name || `#${id}`);
  const psPlusNames = (p.playStylesPlus||[]).map(id => psMap[String(id)]?.name || `#${id}`);

  rows.push({
    resourceId: p.resourceId, name: p.name, cardName: p.cardName||p.name, rating: p.rating,
    mainPos: main, positions: p.positions||[], group,
    club: p.clubName, league: p.leagueName,
    isBigClub: !!p.isBigClub, isTopLeague: !!p.isTopLeague,
    price: p.price, launchPrice: p.priceInfo?.launchPrice ?? null,
    six, skills: p.skillMoves, weakFoot: p.weakFoot, foot: p.preferredFoot,
    playStylesCount: (p.playStyles||[]).length, playStyles: psNames, playStylesPlus: psPlusNames,
    popularHot, fc26HotCount, fc26HotSurname, fitFC26Evos: fitEvos,
  });
}

const out = {
  meta: {
    generated: '2026-09-14',
    fc27GoldTotal: rows.length,
    popularLe83: popular.length,
    fc26HotUnique: hotPlayers.length,
    fc26OpeningTasks: openingTasks.length,
    note: 'FC26热门球员按姓氏(cardName)匹配；FUTBIN popular 按全名/slug 精确匹配',
  },
  rows,
};
fs.writeFileSync(D('gold/data/players/fc27/fc27-evo-le83-position-table.json'), JSON.stringify(out, null, 1));
const groups = {};
for (const r of rows) groups[r.group] = (groups[r.group]||0)+1;
console.log('rows:', rows.length);
console.log('groups:', JSON.stringify(groups));
console.log('popular marked:', rows.filter(r=>r.popularHot!=null).length);
console.log('fc26Hot matched:', rows.filter(r=>r.fc26HotCount>0).length);
