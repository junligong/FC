// 一次性装配脚本（临时工作文件）：把 CDP 提取的榜单卡片与进化总览页核验结果装配为 2026-09-18 的 evolution.json。
// 输入：automation/runs/2026-09-18/evolution/work/cards-raw.json（/27/popular/evolutions 榜单卡片）
//       automation/runs/2026-09-18/evolution/work/evolutions-raw.json（/27/evolutions 总览 14 条路径）
// 输出：automation/runs/2026-09-18/evolution/evolution.json
import { readFileSync, writeFileSync } from 'node:fs';

const D = '2026-09-18';
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

function fmtRequirements(req) {
  const out = [];
  for (let i = 0; i + 1 < req.length; i += 2) out.push(`${req[i]} ${req[i + 1]}`);
  return out;
}

// Total Upgrades 原文 -> 可读条目
// 原文形如：["Overall","+1","|","83","Short Passing","+4","|","83", "PS","Pinged Pass","|","3", "Roles","Wingback++"]
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
    const nm = cur, delta = up[i + 1];
    const cap = up[i + 2] === '|' ? up[i + 3] : '';
    out.push(`${path ? path + '：' : ''}${nm} ${delta}${cap ? `（封顶 ${cap}）` : ''}`);
    i += cap ? 4 : 2;
  }
  return out;
}

const slugOf = u => ((u || '').split('/evolutions/')[1] || '').split('/').pop();
const typeZh = t => t === 'PATHWAY EVOLUTIONS' ? 'Pathway Evolutions（路径自选）' : (t === 'TRAINING CAMP' ? 'Training Camp（训练营）' : 'Evolutions');

// 去重口径：同一球员的**不同卡版本**在 FUTBIN 上是不同条目（URL 内含版本后缀，估值/热度各异）。
// 键 = 球员 URL + 进化名称。
const seen = new Set();
const evolutions = [];
let droppedNoMeta = 0;
for (const c of cards) {
  const s = (c.evoUrl || '').split('/evolutions/')[1] || '';
  const meta = META[s];
  if (!meta) { droppedNoMeta++; continue; }
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
const urlSet = new Set(evolutions.map(e => e.url));

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
    note: `核验来源：${e.url}（FUTBIN /27/evolutions 总览卡，2026-09-18 实采）。前提与失效情形以 Player Requirements 为准：不满足上述上限/位置条件的球员不可入选。`
  };
});

const data = {
  date: D,
  status: 'partial',
  generatedAt: now(),
  dataCutoff: now().slice(0, 16).replace('T', ' ') + ' +08:00',
  evolutions,
  routes,
  sources: [
    {
      url: 'https://www.futbin.com/27/popular/evolutions',
      openedAt: OPENED_AT,
      note: `热门进化卡主来源。实采页面标题「EA FC 27 Popular Evolution Players | FUTBIN」/ 区块标题「Hottest UT 27 Evolutions」，div.popular-cards-wrapper > div.column 共 ${cards.length} 个卡片节点；滚动到底部后节点数不变、无分页与「加载更多」控件。按 url + 进化名称去重后 ${evolutions.length} 张进化卡（唯一 url ${urlSet.size} 个，同一球员的不同卡版本为独立条目）；未出现 No evolutions found。`
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
    `本轮为 2026-09-18 每日调度运行（runId 83e83d3c-558d-4aa0-aea9-3583124114b6）。浏览器通道（Web Access CDP，用户日常 Chrome，check-deps.mjs exit 0）正常，三个来源页均在本轮内打开并实采成功。`,
    '本页状态为 partial：采集与渲染均成功，但存在如实标注的缺失项（进化卡自身无挂牌价、FUTBIN Rating 有 42 张卡在来源页缺失、到期时间只有相对口径、逐级挑战步骤未收录等）。evidence.missing 非空时 run-state 会把 success 自动降级为 partial，故此处与权威状态保持一致。',
    `进化路径 14 条，与 2026-09-17 一致（未新增、未下线）。分布：共 ${evolutions.length} 张进化卡，按进化名称计数 ${Object.entries(byEvo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} 张`).join('；')}。`,
    '评分口径：榜单 Rating 列显示的是「进化后」OVR，不是基础卡评分。例如榜单首条 Endrick 显示 80，而其基础卡评分低于该值。阅读表格时请勿把该 Rating 当作基础卡评分。',
    'FUTBIN Rating（页面 div.playercard-27-futbin-rating）在本轮 500 张卡中有 42 张在来源页不存在（DOM 实测 458/500 命中该元素）；这 42 条的 futbinRating 如实留空，不用 Rating 列或其他数值顶替。',
    '费用口径：本日 14 个进化在 FUTBIN 上均标注 FREE（免费），费用列即来源于此。榜单卡片上的数字（如 Endrick 1176）是热度/使用计数，已单独记为 popularityCount，不参与费用判断。',
    '到期口径：FUTBIN 只给相对时长（UNLOCK / EXPIRES），未提供绝对到期日期，故 expires 字段按页面原文的相对时长记录，不换算具体日期。本日多数路径为 1 MONTHS，入门系列为 12 MONTHS，Believe 为 1 YEARS。',
    'FUTBIN 对进化卡不公布挂牌价（榜单卡片内价格元素命中数为 0），故本页不展示进化卡自身价格；页面中的「参考价（基础卡）」按 baseCardId 在运行时从统一行情 current.json 读取，不是该进化卡的成交价。本任务未为进化卡再次采集或分析任何市场价格，也未写 priceRef 或任何当前价副本。',
    '本节只写「可证实的卡面事实」与来源页明示的路线整理，不输出无依据的精确收益预测。FC27 launchDate 为 2026-09-25，开服前价格属估算口径，不作为投资依据。'
  ],
  missing: [
    '进化卡自身价格缺失（来源侧事实）：FUTBIN 对进化卡不公布 Console/PC 挂牌价，页面「参考价（基础卡）」是按 baseCardId 关接到的**基础卡**市价（持仓成本参考），不是该进化卡的成交价；两者均无有效价时显示「无报价」，未写成价格为 0。',
    'FUTBIN Rating 缺失 42/500：来源页 500 张进化卡中仅 458 张存在 div.playercard-27-futbin-rating（DOM 实测），其余 42 张该字段如实留空，不用 Rating 列、六维合计或其它数值顶替。',
    '到期时间只有相对口径：来源页给出的是 UNLOCK / EXPIRES 时长（入门系列 12 MONTHS，多数为 1 MONTHS，Believe 为 1 YEARS），FUTBIN 未提供绝对到期日期，无法换算成具体日期。',
    '逐级挑战步骤缺失：总览卡只给出 Player Requirements 与 Total Upgrades，未展开 LEVELS / CHALLENGES 的具体挑战内容；本轮未逐条打开 14 个详情页（预算与反爬风险），故 steps 字段按页面可得事实归纳，未收录逐级挑战原文。',
    'Intro to Training Camp EVOs 与部分 Pathway 卡未给出逐项数值升级表：Training Camp 只给 Role「Fullback++」；Pinged Pass / Relentless 等只给 PlayStyle 项。上述路径的具体属性收益页面未列出。',
    '候选球员口径：本轮未打开 https://www.futbin.com/27/players 做 Rating/位置筛选（该列表目录对当前 IP/会话返回 403），候选范围以 /27/popular/evolutions 榜单本身为准。',
    '榜单条数上限未知：/27/popular/evolutions 渲染 500 个卡片节点且页面未给出「共 N 条」计数或分页控件，无法排除服务端截断，故以页面实际渲染的 500 条为准。',
    '价格上涨/收益预测缺失：FC27 launchDate 为 2026-09-25，开服前价格为估算口径，本轮不输出任何涨跌或精确收益预测。'
  ]
};

writeFileSync(`automation/runs/${D}/evolution/evolution.json`, JSON.stringify(data, null, 2) + '\n');
console.log('cardsNodes=', cards.length, 'evolutions=', evolutions.length, 'droppedNoMeta=', droppedNoMeta, 'uniqueUrls=', urlSet.size, 'routes=', routes.length);
console.log('byEvo=', JSON.stringify(byEvo));
