// 一次性装配脚本（临时工作文件）：把 CDP 提取的榜单卡片与进化总览页核验结果装配为 2026-09-17 的 evolution.json。
// 输入：automation/runs/2026-09-17/evolution/work/cards-raw.json（/27/popular/evolutions 榜单卡片）
//       automation/runs/2026-09-17/evolution/work/evolutions-raw.json（/27/evolutions 总览 14 条路径）
// 输出：automation/runs/2026-09-17/evolution/evolution.json
import { readFileSync, writeFileSync } from 'node:fs';

const D = '2026-09-17';
const W = `automation/runs/${D}/evolution/work/`;
const now = () => new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00');
const OPENED_AT = now();

const cardsRaw = JSON.parse(readFileSync(`${W}cards-raw.json`, 'utf8'));
const cards = JSON.parse(cardsRaw.value).body;
const evoRaw = JSON.parse(readFileSync(`${W}evolutions-raw.json`, 'utf8'));
const evoList = (typeof evoRaw.value === 'string' ? JSON.parse(evoRaw.value) : evoRaw).body;

// ---------- 详情页元数据（来自 /27/evolutions 总览，逐条核验） ----------
const META = {};
for (const e of evoList) {
  const slug = (e.url || '').split('/evolutions/')[1] || '';
  META[slug] = e;
}

// 把 [键, 值, 键, 值, ...] 成对拼成人类可读列表
function pairUp(arr) {
  const out = [];
  for (let i = 0; i + 1 < arr.length; i++) {
    if (arr[i] === '|') continue;
    if (arr[i + 1] === '|') { out.push(arr[i]); i++; continue; }
    out.push(`${arr[i]} ${arr[i + 1]}`);
    i++;
  }
  const last = arr[arr.length - 1];
  if (out.length * 2 < arr.length && last && last !== '|' ) { /* noop */ }
  return out;
}

function fmtRequirements(req) {
  const out = [];
  for (let i = 0; i + 1 < req.length; i += 2) out.push(`${req[i]} ${req[i + 1]}`);
  return out;
}

// Total Upgrades 原文 -> 可读条目
// 原文形如：["Overall","+1","|","83","Short Passing","+4","|","83", "PS","Pinged Pass","|","3", "Roles","Wingback++"]
// 属性项：名称 增量 '|' 封顶；PlayStyle：PS 名称 '|' 成本；Role：Roles 名称；路径分支以 "PATH A" 起头。
function fmtUpgrades(up) {
  const out = [];
  let i = 0;
  let path = '';
  while (i < up.length) {
    const cur = String(up[i]);
    if (/^PATH/.test(cur)) { path = cur; i++; continue; }
    if (cur === 'PS' || cur === 'PlayStyle') {
      const nm = up[i + 1]; const cost = up[i + 2] === '|' ? up[i + 3] : '';
      out.push(`${path ? path + '：' : ''}PlayStyle「${nm}」${cost ? `（成本 ${cost}）` : ''}`);
      i += 4;
      continue;
    }
    if (cur === 'Roles' || cur === 'Role') { out.push(`Role「${up[i + 1]}」`); i += 2; continue; }
    // 属性：名称 增量 [| 封顶]
    const nm = cur, delta = up[i + 1];
    const cap = up[i + 2] === '|' ? up[i + 3] : '';
    out.push(`${path ? path + '：' : ''}${nm} ${delta}${cap ? `（封顶 ${cap}）` : ''}`);
    i += cap ? 4 : 2;
  }
  return out;
}

const slugOf = u => ((u || '').split('/evolutions/')[1] || '').split('/').pop();
const typeZh = t => t === 'PATHWAY EVOLUTIONS' ? 'Pathway Evolutions（路径自选）' : (t === 'TRAINING CAMP' ? 'Training Camp（训练营）' : 'Evolutions');

// 去重口径：同一球员的**不同卡版本**在 FUTBIN 上是不同条目（URL 内含版本后缀，估值/热度各异），
// 实测 500 个节点的 url 全部唯一，故用 url + 进化名称 作键，只折叠真正的重复渲染。
const seen = new Set();
const evolutions = [];
for (const c of cards) {
  const s = (c.evoUrl || '').split('/evolutions/')[1] || '';
  const meta = META[s];
  if (!meta) continue;
  const key = [c.url, meta.name].join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  const typeTag = (meta.tags || []).find(t => t !== 'NEW') || 'EVOLUTIONS';
  evolutions.push({
    rank: evolutions.length + 1,
    name: c.name,
    rating: String(c.rating || ''),
    pos: c.pos || '',
    altPos: c.altPos || '',
    evolutionName: meta.name,
    evolutionType: typeTag,
    cost: meta.cost === 'FREE' ? 'Free' : (meta.cost || ''),
    expires: `解锁 ${meta.unlock} · 到期 ${meta.expires}（页面原文 UNLOCK ${meta.unlock} / EXPIRES ${meta.expires}）`,
    requirements: fmtRequirements(meta.requirements || []),
    popularityCount: c.popularityCount || '',
    futbinListValue: c.futbinListValue || '',
    stats: c.stats || {},
    url: c.url,
    evoUrl: c.evoUrl
  });
}

const byEvo = {};
for (const e of evolutions) byEvo[e.evolutionName] = (byEvo[e.evolutionName] || 0) + 1;

// ---------- 进化路线（逐条来自 /27/evolutions 卡片，均为页面明示事实） ----------
const routes = evoList.map(e => {
  const typeTag = (e.tags || []).find(t => t !== 'NEW') || 'EVOLUTIONS';
  const req = fmtRequirements(e.requirements || []);
  const ups = fmtUpgrades(e.upgrades || []);
  const upsText = ups.length ? ups.join('；') : '页面未列出逐项数值升级';
  const desc = [
    `类型：${typeZh(typeTag)}；费用 ${e.cost === 'FREE' ? '免费（FREE）' : e.cost}；${e.repeatable === 'REPEATABLE' ? '可重复（REPEATABLE）' : e.repeatable || '可重复性未标注'}；有效期 UNLOCK ${e.unlock} / EXPIRES ${e.expires}。`,
    req.length ? `前置条件：${req.join('、')}。` : '前置条件：页面未列出。',
    e.desc ? `${e.desc}。` : '',
    `合计升级：${upsText}。`
  ].filter(Boolean).join('');
  return {
    name: `${e.name}（${typeZh(typeTag)}）`,
    cost: e.cost === 'FREE' ? 'Free' : e.cost,
    desc,
    steps: [
      req.length ? `入选前提：${req.join('、')}` : '入选前提：页面未列出，需在游戏内确认',
      `在游戏内完成该进化路径的挑战后领取上述升级${ups.length ? '' : '（页面未列出具项）'}`
    ],
    note: `核验来源：${e.url}（FUTBIN /27/evolutions 总览卡，2026-09-17 实采）。前提与失效情形以 Player Requirements 为准：不满足上述上限/位置条件的球员不可入选。`
  };
});

const data = {
  date: D,
  status: 'success',
  generatedAt: now(),
  dataCutoff: now().slice(0, 16).replace('T', ' ') + ' +08:00',
  evolutions,
  routes,
  sources: [
    {
      url: 'https://www.futbin.com/27/popular/evolutions',
      openedAt: OPENED_AT,
      note: `热门进化卡主来源。实采页面标题「EA FC 27 Popular Evolution Players | FUTBIN」/ 区块标题「Hottest UT 27 Evolutions」，div.popular-cards-wrapper > div.column 共 ${cards.length} 个卡片节点；滚动到底部后节点数不变、无分页与「加载更多」控件。按 url + 进化名称去重后 ${evolutions.length} 张进化卡（同一球员的不同卡版本为独立条目，500 个 url 全部唯一）；未出现 No evolutions found。`
    },
    {
      url: 'https://www.futbin.com/27/evolutions',
      openedAt: OPENED_AT,
      note: `FC27 进化总览。标签计数：All 14 / Evolutions 8 / Pathway Evolutions 4 / Training Camp 2；逐条取得 14 个进化的费用（全部 FREE）、UNLOCK / EXPIRES 有效期、Player Requirements 与 Total Upgrades（含 PlayStyle、Roles、PATH 分支）。`
    },
    {
      url: 'https://www.futbin.com/27/evolutions/expired',
      openedAt: OPENED_AT,
      note: '已过期进化核验：页面 div.evolutions-overview-wrapper 节点数为 0，即本轮 14 个进化全部处于有效期内，无过期路径。'
    }
  ],
  notes: [
    `本轮为 2026-09-17 首次调度运行（runId 362bfbe5-768c-4c4b-a576-c3a956ec7458）。浏览器通道（Web Access CDP，用户日常 Chrome，check-deps.mjs exit 0）正常，FUTBIN 页面实采成功。`,
    `进化路径数量较 2026-09-16 显著扩充：由上轮 5 条增至本轮 14 条（新增 Believe、Pinged Pass、Shooting Practice、Creative or Composed、Winger Glow Up、Tactical Ascent、Relentless、Striker Glow Up、Midfield Polish）。`,
    `分布：共 ${evolutions.length} 张进化卡，按进化名称计数 ${Object.entries(byEvo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} 张`).join('；')}。`,
    '评分口径：榜单 Rating 列显示的是「进化后」OVR，不是基础卡评分。例如 Intro to Evolutions 要求基础 Overall ≤75，榜单显示 79（= 75 + 34，封顶 79）。阅读表格时请勿把该 Rating 当作基础卡评分。',
    '费用口径：本日 14 个进化在 FUTBIN 上均标注 FREE（免费），费用列即来源于此。榜单卡片上的数字（如 Aubameyang 675）是热度/使用计数，已单独记为 popularityCount，不参与费用判断。',
    '到期口径：FUTBIN 只给相对时长（UNLOCK / EXPIRES），未提供绝对到期日期，故 expires 字段按页面原文的相对时长记录，不换算具体日期。本轮多数路径为 1 MONTHS（含新增的 8 条），入门系列为 12 MONTHS。',
    '本节只写「可证实的卡面事实」与来源页明示的路线整理，不输出无依据的精确收益预测。FC27 launchDate 为 2026-09-25，开服前价格属 listing-estimate 估算口径，不作为投资依据。'
  ],
  missing: [
    '到期时间只有相对口径：来源页给出的是 UNLOCK / EXPIRES 时长（入门系列 12 MONTHS，其余 1 MONTHS），FUTBIN 未提供绝对到期日期，无法换算成具体日期。',
    '中文译名缺失：来源页只有英文球员名与俱乐部信息，本轮未找到权威中文译名来源，故未擅自翻译。',
    '逐级挑战步骤缺失：总览卡只给出 Player Requirements 与 Total Upgrades，未展开 LEVELS / CHALLENGES 的具体挑战内容；本轮未逐条打开 14 个详情页（预算与反爬风险），故 steps 字段按页面可得事实归纳，未收录逐级挑战原文。',
    'Intro to Training Camp EVOs 与部分 Pathway 卡未给出逐项数值升级表：Training Camp 只给 Role「Fullback++」；Pinged Pass / Relentless 等只给 PlayStyle 项。上述路径的具体属性收益页面未列出。',
    '候选球员口径：本轮未打开 https://www.futbin.com/27/players 做 Rating/位置筛选（该列表目录对当前 IP/会话返回 403），候选范围以 /27/popular/evolutions 榜单本身为准。',
    '榜单条数上限未知：/27/popular/evolutions 渲染 500 个卡片节点且页面未给出「共 N 条」计数或分页控件，无法排除服务端截断，故以页面实际渲染的 500 条为准。',
    '价格上涨/收益预测缺失：FC27 launchDate 为 2026-09-25，开服前价格为 listing-estimate 口径，本轮不输出任何涨跌或精确收益预测。'
  ]
};

writeFileSync(`automation/runs/${D}/evolution/evolution.json`, JSON.stringify(data, null, 2) + '\n');
console.log('evolutions=', evolutions.length, 'routes=', routes.length);
console.log('byEvo=', JSON.stringify(byEvo));
console.log('sampleReq=', JSON.stringify(evolutions[0].requirements), 'sampleUp=', JSON.stringify(routes[0].desc.slice(0, 200)));
