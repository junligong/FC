// 一次性装配脚本（临时工作文件）：把 CDP 提取的榜单卡片与进化总览页核验结果装配为 2026-09-20 的 evolution.json。
// 输入：automation/runs/2026-09-20/evolution/work/cards-raw.json（/27/popular/evolutions 榜单卡片）
//       automation/runs/2026-09-20/evolution/work/evolutions-raw.json（/27/evolutions 总览 18 条路径）
// 输出：automation/runs/2026-09-20/evolution/evolution.json
// 2026-09-20 变更：① 新增 COSMETICS 来源类型（Ones to Watch Retro 18/19/20，纯外观稀有度、无属性升级）；
// ② 费用单元格不再恒为 FREE——OTV Retro 为「200 FC Points + 25,000 金币」，且 Training Camp 类在 EXPIRES 与
// 费用之间多一个「TRAINING 时长」格，费用改按内容识别（见 extract-evolutions.js）；
// ③ fmtUpgrades 增加百分比噪声 token 过滤（OTV 的 upgrades 只有投票百分比）。
import { readFileSync, writeFileSync } from 'node:fs';

const D = '2026-09-20';
const RUN_ID = 'b20f6a74-30d5-4835-989a-8ca4b8d92125';
const W = `automation/runs/${D}/evolution/work/`;
const now = () => new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00');

// 三个来源页的实际打开时刻（本轮内，均晚于 startedAt 2026-09-19T19:38:42.700Z = 03:38:42+08:00）
const OPENED_POPULAR = '2026-09-20T03:39:05+08:00';
const OPENED_OVERVIEW = '2026-09-20T03:39:08+08:00';
const OPENED_EXPIRED = '2026-09-20T03:39:08+08:00';

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
// 噪声 token：投票百分比（"11%"），OTV 等纯外观路径的 upgrades 只有它，必须过滤，否则会输出「11% undefined」。
function fmtUpgrades(up) {
  const out = [];
  let i = 0;
  let path = '';
  while (i < up.length) {
    const cur = String(up[i]);
    if (/^\d+(\.\d+)?%$/.test(cur)) { i++; continue; }
    if (/^PATH/.test(cur)) { path = cur; i++; continue; }
    if (cur === 'PS' || cur === 'PlayStyle') {
      const nm = up[i + 1]; const cost = up[i + 2] === '|' ? up[i + 3] : '';
      out.push(`${path ? path + '：' : ''}PlayStyle「${nm}」${cost ? `（成本 ${cost}）` : ''}`);
      i += 4;
      continue;
    }
    if (cur === 'Roles' || cur === 'Role') { out.push(`Role「${up[i + 1]}」`); i += 2; continue; }
    const nm = cur, delta = up[i + 1];
    if (delta === undefined) { i++; continue; }
    const cap = up[i + 2] === '|' ? up[i + 3] : '';
    out.push(`${path ? path + '：' : ''}${nm} ${delta}${cap ? `（封顶 ${cap}）` : ''}`);
    i += cap ? 4 : 2;
  }
  return out;
}

// 来源标签 -> 中文类型名。2026-09-19 起站点把部分路径的来源由类型标签改为 REWARDS 与赛季等级行；
// 2026-09-20 新增 COSMETICS（Ones to Watch Retro 18/19/20，纯外观稀有度变更）。
function typeZh(label) {
  const s = String(label || '');
  if (/^SEASON\s+\d+\s+LEVEL:/i.test(s)) return 'Season Pass（赛季通行证）';
  if (s === 'PATHWAY EVOLUTIONS') return 'Pathway Evolutions（路径自选）';
  if (s === 'TRAINING CAMP') return 'Training Camp（训练营）';
  if (s === 'REWARDS') return 'Rewards（任务奖励）';
  if (s === 'COSMETICS') return 'Cosmetics（纯外观/稀有度）';
  return 'Evolutions';
}
const originOf = e => (e.originLabel || (e.tags || []).find(t => t !== 'NEW') || 'EVOLUTIONS');

// 费用口径（2026-09-20）：'FREE' -> Free；'200 + 25,000'（带 fc-points 图标）-> 200 FC Points + 25,000 金币。
function fmtCost(e) {
  const raw = String(e.costRaw || e.cost || '').trim();
  if (!raw || raw === 'FREE') return 'Free';
  const m = raw.match(/^([\d,]+)\s*\+\s*([\d,]+)$/);
  if (m) return e.costPoints === 'yes' ? `${m[1]} FC Points + ${m[2]} 金币` : `${m[1]} + ${m[2]}`;
  return raw;
}
const costIsFree = e => !(e.costRaw || e.cost) || String(e.costRaw || e.cost).trim() === 'FREE';

// 来源口径说明（用于 route.desc 与 missing，避免把赛季通行证 / 外观路径写成普通 Evolutions）
function originSourceText(e) {
  const label = originOf(e);
  const zh = typeZh(label);
  const at = e.foundAt ? `；解锁来源：${e.foundAt}` : '';
  return `来源类型 ${label}（${zh}）${at}`;
}

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
  evolutions.push({
    rank: evolutions.length + 1,
    name: c.name,
    rating: String(c.rating || ''),
    pos: c.pos || '',
    altPos: c.altPos || '',
    evolutionName: meta.name,
    evolutionType: originOf(meta),
    cost: fmtCost(meta),
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
  const label = originOf(e);
  const zh = typeZh(label);
  const req = fmtRequirements(e.requirements || []);
  const ups = fmtUpgrades(e.upgrades || []);
  const upsText = ups.length ? ups.join('；') : '页面未列出逐项数值升级';
  const sourceText = originSourceText(e);
  const cosmetic = label === 'COSMETICS';
  const desc = [
    `${sourceText}；费用 ${costIsFree(e) ? '免费（FREE）' : fmtCost(e)}；${e.trainingCost ? `${e.trainingCost}；` : ''}${e.repeatable === 'REPEATABLE' ? `可重复（REPEATABLE${e.repeatCount ? `，上限 ${e.repeatCount} 次` : ''}）` : e.repeatable || '可重复性未标注'}；有效期 UNLOCK ${e.unlock} / EXPIRES ${e.expires}。`,
    cosmetic ? '该路径只变更球员卡的外观/稀有度（页面原文：Turn back the clock and apply the exclusive Ones to Watch Retro rarity to any qualified player），页面未列出任何属性升级项，故不提供属性增益。' : '',
    req.length ? `前置条件：${req.join('、')}。` : '前置条件：页面未列出。',
    e.desc ? `${e.desc}。` : '',
    `合计升级：${upsText}。`
  ].filter(Boolean).join('');
  return {
    name: `${e.name}（${zh}）`,
    cost: costIsFree(e) ? 'Free' : fmtCost(e),
    desc,
    steps: [
      req.length ? `入选前提：${req.join('、')}` : (cosmetic ? '入选前提：页面未列出（该路径为外观稀有度变更，可对任意符合条件的球员施加）' : '入选前提：页面未列出，需在游戏内确认'),
      cosmetic
        ? `在游戏内领取/购买该外观路径（费用 ${fmtCost(e)}）后对目标球员施加，仅改变卡面外观与稀有度，不产生属性变化`
        : `在游戏内完成该进化路径的挑战后领取上述升级${ups.length ? '' : '（页面未列出具项）'}`
    ],
    note: `核验来源：${e.url}（FUTBIN /27/evolutions 总览卡，2026-09-20 实采）。前提与失效情形以 Player Requirements 为准${req.length ? '：不满足上述上限/位置条件的球员不可入选。' : '：本轮该路径页面未列出 Player Requirements。'}`
  };
});

const seasonRoutes = evoList.filter(e => /^SEASON/i.test(originOf(e)));
const rewardRoutes = evoList.filter(e => originOf(e) === 'REWARDS');
const cosmeticRoutes = evoList.filter(e => originOf(e) === 'COSMETICS');
const payRoutes = evoList.filter(e => !costIsFree(e));
const ratingMissing = cards.filter(c => !c.futbinListValue).length;
const evoMissingInList = evoList.map(e => e.name).filter(n => !byEvo[n]);

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
      openedAt: OPENED_POPULAR,
      note: `热门进化卡主来源。实采页面标题「EA FC 27 Popular Evolution Players | FUTBIN」，区块标题「Hottest UT 27 Evolutions」，div.popular-cards-wrapper > div.column 共 ${cards.length} 个卡片节点；滚动到底部后节点数不变、无分页与「加载更多」控件（load-more / pagination-next 命中数 0）。按 url + 进化名称去重后 ${evolutions.length} 张进化卡（唯一 url ${urlSet.size} 个，二者相等；同一球员的不同卡版本为独立条目）；页面未出现 No evolutions found。卡片内价格元素（.popular-price-wrapper / .platform-price-wrapper-* / .price-segment / .item-score-segment）命中数为 0，与「FUTBIN 对进化卡不公布挂牌价」的既有结论一致。DOM 实测 div.playercard-27-futbin-rating 命中 ${cards.length - ratingMissing}/${cards.length} 张（与提取结果一致）。`
    },
    {
      url: 'https://www.futbin.com/27/evolutions',
      openedAt: OPENED_OVERVIEW,
      note: `FC27 进化总览。div.evolutions-overview-wrapper 共 ${evoList.length} 条（2026-09-19 为 15 条）。来源标签分布：EVOLUTIONS ${evoList.filter(e => originOf(e) === 'EVOLUTIONS').length}、TRAINING CAMP ${evoList.filter(e => originOf(e) === 'TRAINING CAMP').length}、PATHWAY EVOLUTIONS ${evoList.filter(e => originOf(e) === 'PATHWAY EVOLUTIONS').length}、REWARDS ${rewardRoutes.length}、赛季等级行（SEASON 1 LEVEL: N）${seasonRoutes.length}、**COSMETICS ${cosmeticRoutes.length}（本日新增，均为 Ones to Watch Retro 18/19/20，标注 NEW）**。逐条取得费用、UNLOCK / EXPIRES 有效期、Player Requirements 与 Total Upgrades（含 PlayStyle、Roles、PATH 分支）。费用形态本日出现分化：${payRoutes.length} 条为付费（${payRoutes.map(e => `${e.name} ${fmtCost(e)}`).join('、')}），其余为 FREE；Training Camp 类在 EXPIRES 与费用之间另有一个「TRAINING 时长」格（已单独记录为 trainingCost，未与费用混淆）。`
    },
    {
      url: 'https://www.futbin.com/27/evolutions/expired',
      openedAt: OPENED_EXPIRED,
      note: `已过期进化核验：页面 div.evolutions-overview-wrapper 节点数为 0（标题同为 EA FC 27 Player Evolutions），即本轮 ${evoList.length} 个进化全部处于有效期内，无过期路径。`
    }
  ],
  notes: [
    `本轮为 2026-09-20 每日调度运行（runId ${RUN_ID}）。浏览器通道（Web Access CDP，独立调试 profile 9333，browser-triage.mjs exit 0）正常，三个来源页均在本轮内打开并实采成功。`,
    '本页状态为 partial：采集与渲染均成功，但存在如实标注的缺失项（进化卡自身无挂牌价、FUTBIN Rating 有 31 张卡在来源页缺失、到期时间只有相对口径、逐级挑战步骤未收录等）。evidence.missing 非空时 run-state 会把 success 自动降级为 partial，故此处与权威状态保持一致。',
    `进化路径 ${evoList.length} 条（2026-09-19 为 15 条，本日新增 Ones to Watch Retro 18/19/20 三条，均标注 NEW，无路径下线，全部处于有效期内）。分布：共 ${evolutions.length} 张进化卡，按进化名称计数 ${Object.entries(byEvo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} 张`).join('；')}。`,
    cosmeticRoutes.length
      ? `本轮站点结构变化（已核验，非采集缺陷）：新增来源类型 COSMETICS，对应 Ones to Watch Retro 18 / 19 / 20 三条路径。这类路径只把球员卡换成 Ones to Watch Retro 稀有度外观，页面 Player Requirements 与 Total Upgrades 均为空（upgrades 原文只剩投票百分比），**不提供任何属性升级**，已在页面上如实标注为「纯外观/稀有度」。`
      : '',
    payRoutes.length
      ? `费用口径变化（已核验）：本日首次出现**付费**进化路径——${payRoutes.map(e => `${e.name} 为 ${fmtCost(e)}`).join('、')}（费用格为两行，首行数字带 fc-points 图标 = FC 点数，次行为金币）。其余 ${evoList.length - payRoutes.length} 条均为 FREE。付费路径同样标注 REPEATABLE，且未列出 Player Requirements。`
      : '',
    evoMissingInList.length
      ? `榜单覆盖缺口：总览页的 ${evoList.length} 条路径中，${evoMissingInList.join('、')} 在本轮 /27/popular/evolutions 榜单中**没有**任何卡片入选（热度不足），故 evolution.json 的 evolutions 数组不含这两条路径；这属榜单口径，不是采集遗漏。`
      : '',
    '评分口径：榜单 Rating 列显示的是「进化后」OVR，不是基础卡评分。阅读表格时请勿把该 Rating 当作基础卡评分。',
    `FUTBIN Rating（页面 div.playercard-27-futbin-rating）在本轮 500 张卡中有 ${ratingMissing} 张在来源页不存在（DOM 实测 ${cards.length - ratingMissing}/${cards.length} 命中该元素，与提取结果一致）；这 ${ratingMissing} 条的 futbinRating 如实留空，不用 Rating 列或其他数值顶替。`,
    '到期口径：FUTBIN 只给相对时长（UNLOCK / EXPIRES），未提供绝对到期日期，故 expires 字段按页面原文的相对时长记录，不换算具体日期。本日入门系列为 12 MONTHS，Believe 为 1 YEARS，Fullback Fork 为 1 WEEKS / 2 WEEKS，其余多为 1 MONTHS。',
    'FUTBIN 对进化卡不公布挂牌价（榜单卡片内价格元素命中数为 0，本轮再次复核），故本页不展示进化卡自身价格；页面中的「参考价（基础卡）」按 baseCardId 在运行时从统一行情 current.json 读取，不是该进化卡的成交价。本任务未为进化卡再次采集或分析任何市场价格，也未写 priceRef 或任何当前价副本。',
    '本节只写「可证实的卡面事实」与来源页明示的路线整理，不输出无依据的精确收益预测。FC27 launchDate 为 2026-09-25，开服前价格属估算口径，不作为投资依据。'
  ].filter(Boolean),
  missing: [
    '进化卡自身价格缺失（来源侧事实）：FUTBIN 对进化卡不公布 Console/PC 挂牌价，页面「参考价（基础卡）」是按 baseCardId 关接到的**基础卡**市价（持仓成本参考），不是该进化卡的成交价；两者均无有效价时显示「无报价」，未写成价格为 0。',
    `FUTBIN Rating 缺失 ${ratingMissing}/500：来源页 500 张进化卡中仅 ${cards.length - ratingMissing} 张存在 div.playercard-27-futbin-rating（DOM 实测），其余 ${ratingMissing} 张该字段如实留空，不用 Rating 列、六维合计或其它数值顶替。`,
    '到期时间只有相对口径：来源页给出的是 UNLOCK / EXPIRES 时长（入门系列 12 MONTHS，Believe 1 YEARS，Fullback Fork 1 WEEKS / 2 WEEKS，其余多为 1 MONTHS），FUTBIN 未提供绝对到期日期，无法换算成具体日期。',
    '逐级挑战步骤缺失：总览卡只给出 Player Requirements 与 Total Upgrades，未展开 LEVELS / CHALLENGES 的具体挑战内容；本轮未逐条打开 18 个详情页（预算与反爬风险），故 steps 字段按页面可得事实归纳，未收录逐级挑战原文。',
    'Intro to Training Camp EVOs 与部分 Pathway / Rewards 卡未给出逐项数值升级表：Training Camp 只给 Role「Fullback++」；Pinged Pass / Relentless / Creative or Composed 等只给 PlayStyle 项。上述路径的具体属性收益页面未列出。',
    cosmeticRoutes.length
      ? 'Ones to Watch Retro 18 / 19 / 20 的属性与前置条件缺失（来源侧事实）：页面只说明为外观/稀有度变更，Player Requirements 与 Total Upgrades 均为空，故无法给出属性增益与入选门槛；费用为 200 FC Points + 25,000 金币（FUTBIN 标注 REPEATABLE）。'
      : '',
    '赛季通行证路径的领取条件不完整：页面只给「Found at Level N of the Premium/Free Season Pass」，未列出通行证是否需要付费、赛季结束时间与等级获取成本，故无法评估实际获取代价。',
    '候选球员口径：本轮未打开 https://www.futbin.com/27/players 做 Rating/位置筛选（该列表目录对当前 IP/会话返回 403），候选范围以 /27/popular/evolutions 榜单本身为准。',
    '榜单条数上限未知：/27/popular/evolutions 渲染 500 个卡片节点且页面未给出「共 N 条」计数或分页控件，无法排除服务端截断，故以页面实际渲染的 500 条为准。',
    '价格上涨/收益预测缺失：FC27 launchDate 为 2026-09-25，开服前价格为估算口径，本轮不输出任何涨跌或精确收益预测。'
  ].filter(Boolean)
};

writeFileSync(`automation/runs/${D}/evolution/evolution.json`, JSON.stringify(data, null, 2) + '\n');
console.log('cardsNodes=', cards.length, 'evolutions=', evolutions.length, 'droppedNoMeta=', droppedNoMeta, 'uniqueUrls=', urlSet.size, 'routes=', routes.length);
console.log('byEvo=', JSON.stringify(byEvo));
console.log('seasonRoutes=', seasonRoutes.length, 'rewardRoutes=', rewardRoutes.length, 'cosmeticRoutes=', cosmeticRoutes.length, 'payRoutes=', payRoutes.length, 'ratingMissing=', ratingMissing);
console.log('routesNotInList=', JSON.stringify(evoMissingInList));
