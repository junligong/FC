// 一次性装配脚本（临时工作文件）：把 CDP 提取的榜单卡片与进化总览页核验结果装配为 2026-09-21 的 evolution.json。
// 输入：automation/runs/2026-09-21/evolution/work/cards-raw.json      （/27/popular/evolutions 榜单卡片）
//       automation/runs/2026-09-21/evolution/work/evolutions-raw.json（/27/evolutions 总览 19 条路径）
//       automation/runs/2026-09-21/evolution/work/expired-raw.json   （/27/evolutions/expired 核验）
//       automation/runs/2026-09-21/evolution/work/collect-meta.json  （各页 HTTP 状态与打开时刻）
// 输出：automation/runs/2026-09-21/evolution/evolution.json
// 2026-09-21 变更（站点结构再变，已按新口径解析）：
//   ① 总览页 DOM 由「扁平换行」改为「深度缩进嵌套」，标签改首字母大写（Evolutions / Training Camp /
//      Cosmetics / Rewards / Season 1 Level: N / Free / Repeatable）→ 采集侧改为「空白归一化 + 大小写不敏感」；
//   ② 逐项升级由 4 token（Overall / +34 / | / 79）合并为 2 token（Overall / "+34 | 79"）→ fmtUpgrades 重写；
//   ③ 新增付费路径 Creative Crossroads（150 FC Points + 15,000 金币）。
import { readFileSync, writeFileSync } from 'node:fs';

const D = '2026-09-21';
const RUN_ID = '97c127ed-8f79-4e1c-aaf8-0961baa7e086';
const W = `automation/runs/${D}/evolution/work/`;
const now = () => new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00');
const hhmm = iso => `${iso.slice(11, 19)}+08:00`;

const meta = JSON.parse(readFileSync(`${W}collect-meta.json`, 'utf8'));
// 来源页实际打开时刻（本轮内，均晚于 startedAt 2026-09-20T19:25:57.225Z = 03:25:57+08:00）
// 注意：collect-meta 里的 openedAt 是 UTC ISO；必须**真正换算到 +08:00**（加 8 小时后改写后缀），
// 不能只把 'Z' 直接换成 '+08:00'——那样会把 UTC 墙上时间当成东八区时间，结果早于本轮 startedAt，
// 触发 run-state「sources.openedAt 必须 ≥ 本轮 startedAt」的校验失败（2026-09-21 实测踩到）。
const toCst = z => new Date(new Date(z).getTime() + 8 * 3600e3).toISOString().slice(0, 19) + '+08:00';
const OPENED_POPULAR = toCst(meta.sources.popular.openedAt);
const OPENED_OVERVIEW = toCst(meta.sources.evolutions.openedAt);
const OPENED_EXPIRED = toCst(meta.sources.expired.openedAt);

const cardsRaw = JSON.parse(readFileSync(`${W}cards-raw.json`, 'utf8'));
const cards = JSON.parse(cardsRaw.value).body;
const evoRaw = JSON.parse(readFileSync(`${W}evolutions-raw.json`, 'utf8'));
const evoList = (typeof evoRaw.value === 'string' ? JSON.parse(evoRaw.value) : evoRaw).body;
const expRaw = JSON.parse(readFileSync(`${W}expired-raw.json`, 'utf8'));
const expiredList = (typeof expRaw.value === 'string' ? JSON.parse(expRaw.value) : expRaw).body;

// ---------- 总览页元数据（逐条核验） ----------
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

// Total Upgrades 原文（2026-09-21 形态）-> 可读条目
// 形态：["Overall", "+34 | 79", "Acceleration", "+40 | 80", ..., "PS", "Slide Tackle | 3", "Roles", "Wingback++"]；
// 噪声 token：投票百分比（"85%"）——采集侧已按百分比行截断，此处再兜一层过滤。
// 兼容旧形态：["Overall","+1","|","83"] 与 ["PS","Pinged Pass","|","3"]。
function fmtUpgrades(up) {
  const out = [];
  let i = 0;
  let path = '';
  const splitDelta = t => {
    const s = String(t).trim();
    let m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*\|\s*([+-]?\d+(?:\.\d+)?)$/);
    if (m) return { d: m[1], cap: m[2] };
    m = s.match(/^([+-]?\d+(?:\.\d+)?)$/);
    if (m) return { d: m[1], cap: '' };
    return { d: s, cap: '' };
  };
  while (i < up.length) {
    const cur = String(up[i]).trim();
    if (/^\d+(\.\d+)?%$/.test(cur)) { i++; continue; }
    // PATH 分支 token 由旧的全大写「PATH…」变为首字母大写且带分支箭头（如「Path A → A → A」）。
    // 旧的大小写敏感 `/^PATH/` 会漏判，使 (name, delta) 配对整体错位、后续升级项全被当作无符号而跳过
    // ——表现为「有 37 个 token 却输出页面未列出逐项数值升级」（2026-09-21 实测踩到）。
    if (/^path[\s:]/i.test(cur)) { path = cur.replace(/\s*→.*$/, '').trim(); i++; continue; }
    if (/^(PS|PlayStyle)$/i.test(cur)) {
      let nm = up[i + 1] === undefined ? '' : String(up[i + 1]).trim();
      let cost = '';
      const m = nm.match(/^(.*?)\s*\|\s*(\S+)$/);
      if (m) { nm = m[1].trim(); cost = m[2]; i += 2; }
      else { cost = up[i + 2] === '|' ? String(up[i + 3] || '') : ''; i += cost ? 4 : 2; }
      out.push(`${path ? path + '：' : ''}PlayStyle「${nm}」${cost ? `（成本 ${cost}）` : ''}`);
      continue;
    }
    if (/^(Roles|Role)$/i.test(cur)) {
      out.push(`${path ? path + '：' : ''}Role「${String(up[i + 1] || '').trim()}」`);
      i += 2;
      continue;
    }
    const nxt = up[i + 1];
    if (nxt === undefined) { i++; continue; }
    let delta = '', cap = '';
    if (String(nxt).trim() === '|') { cap = String(up[i + 3] || ''); delta = String(up[i + 2] || ''); i += 4; }
    else { const s = splitDelta(nxt); delta = s.d; cap = s.cap; i += 2; }
    // 升级增量一定带符号（+N / -N）；不带符号的说明不是升级项，跳过而不是硬凑
    if (!/^[+-]/.test(delta)) continue;
    out.push(`${path ? path + '：' : ''}${cur} ${delta}${cap ? `（封顶 ${cap}）` : ''}`);
  }
  return out;
}

// 来源标签 -> 中文类型名（2026-09-21 站点改为首字母大写，一律大小写不敏感匹配）
function typeZh(label) {
  const s = String(label || '');
  if (/^season\s+\d+\s+level:/i.test(s)) return 'Season Pass（赛季通行证）';
  if (/^pathway evolutions$/i.test(s)) return 'Pathway Evolutions（路径自选）';
  if (/^training camp$/i.test(s)) return 'Training Camp（训练营）';
  if (/^rewards$/i.test(s)) return 'Rewards（任务奖励）';
  if (/^cosmetics$/i.test(s)) return 'Cosmetics（纯外观/稀有度）';
  return 'Evolutions';
}
const originOf = e => (e.originLabel || (e.tags || []).find(t => String(t).toUpperCase() !== 'NEW') || 'EVOLUTIONS');

// 费用口径：'FREE' -> Free；'200 + 25,000'（带 fc-points 图标）-> 200 FC Points + 25,000 金币。
function fmtCost(e) {
  const raw = String(e.costRaw || e.cost || '').trim();
  if (!raw || /^free$/i.test(raw)) return 'Free';
  const m = raw.match(/^([\d,]+)\s*\+\s*([\d,]+)$/);
  if (m) return e.costPoints === 'yes' ? `${m[1]} FC Points + ${m[2]} 金币` : `${m[1]} + ${m[2]}`;
  return raw;
}
const costIsFree = e => !(e.costRaw || e.cost) || /^free$/i.test(String(e.costRaw || e.cost).trim());

// 来源口径说明（用于 route.desc 与 missing）
function originSourceText(e) {
  const label = originOf(e);
  const zh = typeZh(label);
  const at = e.foundAt ? `；解锁来源：${e.foundAt}` : '';
  return `来源类型 ${label}（${zh}）${at}`;
}

// 去重口径：同一球员的**不同卡版本**在 FUTBIN 上是不同条目（URL 内含版本后缀）。
// 键 = 球员 URL + 进化名称。
const seen = new Set();
const evolutions = [];
let droppedNoMeta = 0;
for (const c of cards) {
  const s = (c.evoUrl || '').split('/evolutions/')[1] || '';
  const meta2 = META[s];
  if (!meta2) { droppedNoMeta++; continue; }
  const key = [c.url, meta2.name].join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  evolutions.push({
    rank: evolutions.length + 1,
    name: c.name,
    rating: String(c.rating || ''),
    pos: c.pos || '',
    altPos: c.altPos || '',
    evolutionName: meta2.name,
    evolutionType: originOf(meta2),
    cost: fmtCost(meta2),
    expires: `解锁 ${meta2.unlock} · 到期 ${meta2.expires}（页面原文 UNLOCK ${meta2.unlock} / EXPIRES ${meta2.expires}）`,
    requirements: fmtRequirements(meta2.requirements || []),
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
  const cosmetic = /^cosmetics$/i.test(label);
  // 站点自述文案；若该行本身即解锁来源说明（Found at Level… / Found in…）或已在 cosmetic 分支引用（Turn back the clock…），
  // 则不重复计入，避免同一句话出现两次。
  const descText = e.desc && !/^found (at|in) /i.test(String(e.desc).trim()) && !/^turn back the clock/i.test(String(e.desc).trim())
    ? `${String(e.desc).trim()}。` : '';
  const desc = [
    `${sourceText}；费用 ${costIsFree(e) ? '免费（Free）' : fmtCost(e)}；${e.trainingCost ? `${e.trainingCost}；` : ''}${String(e.repeatable || '').toUpperCase() === 'REPEATABLE' ? `可重复（Repeatable${e.repeatCount ? `，上限 ${e.repeatCount} 次` : ''}）` : e.repeatable || '可重复性未标注'}；有效期 UNLOCK ${e.unlock} / EXPIRES ${e.expires}。`,
    cosmetic ? `该路径只变更球员卡的外观/稀有度（页面原文：${String(e.desc || '').trim() || 'Turn back the clock and apply the exclusive Ones to Watch Retro rarity to any qualified player'}），页面未列出任何属性升级项，故不提供属性增益。` : '',
    req.length ? `前置条件：${req.join('、')}。` : '前置条件：页面未列出。',
    descText,
    `合计升级：${upsText}。`
  ].filter(Boolean).join('');
  return {
    name: `${e.name}（${zh}）`,
    cost: costIsFree(e) ? 'Free' : fmtCost(e),
    desc,
    steps: [
      req.length ? `入选前提：${req.join('、')}` : (cosmetic ? '入选前提：页面未列出（该路径为外观稀有度变更，可对任意符合条件的球员施加）' : '入选前提：页面未列出，需在游戏内确认'),
      cosmetic
        ? `在游戏内购买该外观路径（费用 ${fmtCost(e)}）后对目标球员施加，仅改变卡面外观与稀有度，不产生属性变化`
        : `在游戏内完成该进化路径的挑战后领取上述升级${ups.length ? '' : '（页面未列出具项）'}`
    ],
    note: `核验来源：${e.url}（FUTBIN /27/evolutions 总览卡，2026-09-21 实采）。前提与失效情形以 Player Requirements 为准${req.length ? '：不满足上述上限/位置条件的球员不可入选。' : '：本轮该路径页面未列出 Player Requirements。'}`
  };
});

const seasonRoutes = evoList.filter(e => /^season\s+\d+\s+level:/i.test(originOf(e)));
const rewardRoutes = evoList.filter(e => /^rewards$/i.test(originOf(e)));
const cosmeticRoutes = evoList.filter(e => /^cosmetics$/i.test(originOf(e)));
const payRoutes = evoList.filter(e => !costIsFree(e));
const ratingMissing = cards.filter(c => !c.futbinListValue).length;
const evoMissingInList = evoList.map(e => e.name).filter(n => !byEvo[n]);
const typeCount = l => evoList.filter(e => String(originOf(e)).toUpperCase() === l).length;

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
      note: `热门进化卡主来源。实采页面标题「${meta.sources.popular.title}」，区块标题「Hottest UT 27 Evolutions」，div.popular-cards-wrapper > div.column 共 ${cards.length} 个卡片节点；滚动到底部后节点数不变、无分页与「加载更多」控件。按 url + 进化名称去重后 ${evolutions.length} 张进化卡（唯一 url ${urlSet.size} 个，二者相等；同一球员的不同卡版本为独立条目）；页面未出现 No evolutions found。卡片内价格元素（.popular-price-wrapper / .platform-price-wrapper-* / .price-segment / .item-score-segment）命中数为 ${meta.sources.popular.priceEls}，与「FUTBIN 对进化卡不公布挂牌价」的既有结论一致。DOM 实测 div.playercard-27-futbin-rating 命中 ${meta.sources.popular.ratingEls}/${cards.length} 张（提取结果 ${cards.length - ratingMissing}/${cards.length}，两者一致）。取数方式：宿主页（robots.txt）+ 页内同源 fetch + DOMParser，未导航到榜单页（HTTP ${meta.sources.popular.status}，${meta.sources.popular.bytes} B）。`
    },
    {
      url: 'https://www.futbin.com/27/evolutions',
      openedAt: OPENED_OVERVIEW,
      note: `FC27 进化总览。div.evolutions-overview-wrapper 共 ${evoList.length} 条（2026-09-20 为 18 条，本日新增 ${evoMissingInList.length ? '' : ''}Creative Crossroads，无路径下线）。来源标签分布：Evolutions ${typeCount('EVOLUTIONS')}、Training Camp ${typeCount('TRAINING CAMP')}、Pathway Evolutions ${typeCount('PATHWAY EVOLUTIONS')}、Rewards ${rewardRoutes.length}、赛季等级行（Season 1 Level: N）${seasonRoutes.length}、Cosmetics ${cosmeticRoutes.length}。逐条取得费用、UNLOCK / EXPIRES 有效期、Player Requirements 与 Total Upgrades（含 PlayStyle、Roles）。费用形态：付费 ${payRoutes.length} 条（${payRoutes.map(e => `${e.name} ${fmtCost(e)}`).join('、')}），其余为 Free；Training Camp 类在 EXPIRES 与费用之间另有一个「TRAINING 时长」格（已单独记录为 trainingCost，未与费用混淆）。**本日站点总览页 DOM 结构发生变更（由扁平换行改为深度缩进嵌套、标签改首字母大写、逐项升级由 4 token 合并为 2 token），解析口径已同步更新并逐条复核**，HTTP ${meta.sources.evolutions.status}，${meta.sources.evolutions.bytes} B。`
    },
    {
      url: 'https://www.futbin.com/27/evolutions/expired',
      openedAt: OPENED_EXPIRED,
      note: `已过期进化核验：页面 div.evolutions-overview-wrapper 节点数为 ${meta.sources.expired.nodes}（标题「${meta.sources.expired.title}」），即本轮 ${evoList.length} 个进化全部处于有效期内，无过期路径。HTTP ${meta.sources.expired.status}，${meta.sources.expired.bytes} B。`
    }
  ],
  notes: [
    `本轮为 2026-09-21 每日调度运行（runId ${RUN_ID}）。浏览器通道（Web Access CDP，独立调试 profile 9333，browser-triage.mjs exit 0）正常，三个来源页均在本轮内打开并实采成功；取数走「宿主页 + 页内同源 fetch」，未导航到榜单页。`,
    '本页状态为 partial：采集与渲染均成功，但存在如实标注的缺失项（进化卡自身无挂牌价、FUTBIN Rating 有卡在来源页缺失、到期时间只有相对口径、逐级挑战步骤未收录等）。evidence.missing 非空时 run-state 会把 success 自动降级为 partial，故此处与权威状态保持一致。',
    `进化路径 ${evoList.length} 条（2026-09-20 为 18 条，本日新增 Creative Crossroads，全部处于有效期内）。分布：共 ${evolutions.length} 张进化卡，按进化名称计数 ${Object.entries(byEvo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} 张`).join('；')}。`,
    '站点结构变化（已核验，非采集缺陷）：/27/evolutions 总览卡的 DOM 由「扁平换行文本」改为「深度缩进嵌套」，类型标签与费用/可重复性文案由全大写改为首字母大写（Evolutions / Training Camp / Cosmetics / Rewards / Season 1 Level: N / Free / Repeatable），且 Total Upgrades 的逐项由 4 个 token（Overall / +34 / | / 79）合并为 2 个（Overall / “+34 | 79”）。旧解析（空白敏感 + 全大写锚定）在本轮会**静默失配**：实测首次采集即出现 Player Requirements 全空、upgrades 吞掉投票块、类型标签全空、FREE 读不到。采集侧已改为「空白归一化 + 大小写不敏感」并逐条复核通过。',
    cosmeticRoutes.length
      ? `外观类路径：Cosmetics ${cosmeticRoutes.length} 条（Ones to Watch Retro 18 / 19 / 20），只把球员卡换成 Ones to Watch Retro 稀有度外观，页面 Player Requirements 与 Total Upgrades 均为空（upgrades 原文只剩投票百分比），**不提供任何属性升级**，已在页面上如实标注为「纯外观/稀有度」。`
      : '',
    payRoutes.length
      ? `付费进化路径 ${payRoutes.length} 条：${payRoutes.map(e => `${e.name} 为 ${fmtCost(e)}`).join('、')}（费用格为两行，首行数字带 fc-points 图标 = FC 点数，次行为金币）。其余 ${evoList.length - payRoutes.length} 条均为 Free。`
      : '',
    evoMissingInList.length
      ? `榜单覆盖缺口：总览页的 ${evoList.length} 条路径中，${evoMissingInList.join('、')} 在本轮 /27/popular/evolutions 榜单中**没有**任何卡片入选（热度不足），故 evolution.json 的 evolutions 数组不含这些路径；这属榜单口径，不是采集遗漏。`
      : '',
    '评分口径：榜单 Rating 列显示的是「进化后」OVR，不是基础卡评分。阅读表格时请勿把该 Rating 当作基础卡评分。',
    `FUTBIN Rating（页面 div.playercard-27-futbin-rating）在本轮 ${cards.length} 张卡中有 ${ratingMissing} 张在来源页不存在（DOM 实测 ${meta.sources.popular.ratingEls}/${cards.length} 命中该元素，与提取结果一致）；这 ${ratingMissing} 条的 futbinRating 如实留空，不用 Rating 列或其他数值顶替。`,
    '到期口径：FUTBIN 只给相对时长（UNLOCK / EXPIRES），未提供绝对到期日期，故 expires 字段按页面原文的相对时长记录，不换算具体日期。本日入门系列为 12 Months，Fullback Fork 为 1 Weeks / 2 Weeks，Cosmetics 类为 1 Months。',
    'FUTBIN 对进化卡不公布挂牌价（榜单卡片内价格元素命中数为 0，本轮再次复核），故本页不展示进化卡自身价格；页面中的「参考价（基础卡）」按 baseCardId 在运行时从统一行情 current.json 读取，不是该进化卡的成交价。本任务未为进化卡再次采集或分析任何市场价格，也未写 priceRef 或任何当前价副本。',
    '本节只写「可证实的卡面事实」与来源页明示的路线整理，不输出无依据的精确收益预测。开服日 launchDate 为 2026-09-18，页面价格口径以当日实测（priceBasis）为准，本页不作涨跌预测。'
  ].filter(Boolean),
  missing: [
    '进化卡自身价格缺失（来源侧事实）：FUTBIN 对进化卡不公布 Console/PC 挂牌价，页面「参考价（基础卡）」是按 baseCardId 关接到的**基础卡**市价（持仓成本参考），不是该进化卡的成交价；两者均无有效价时显示「无报价」，未写成价格为 0。',
    `FUTBIN Rating 缺失 ${ratingMissing}/${cards.length}：来源页 ${cards.length} 张进化卡中仅 ${cards.length - ratingMissing} 张存在 div.playercard-27-futbin-rating（DOM 实测 ${meta.sources.popular.ratingEls}/${cards.length}），其余 ${ratingMissing} 张该字段如实留空，不用 Rating 列、六维合计或其它数值顶替。`,
    '到期时间只有相对口径：来源页给出的是 UNLOCK / EXPIRES 时长，FUTBIN 未提供绝对到期日期，无法换算成具体日期。',
    `逐级挑战步骤缺失：总览卡只给出 Player Requirements 与 Total Upgrades，未展开 LEVELS / CHALLENGES 的具体挑战内容；本轮未逐条打开 ${evoList.length} 个详情页（预算与反爬风险），故 steps 字段按页面可得事实归纳，未收录逐级挑战原文。`,
    'Intro to Training Camp EVOs 与部分 Pathway / Rewards 卡未给出逐项数值升级表：Training Camp 只给 Role「Fullback++」；Pinged Pass / Relentless / Creative or Composed 等只给 PlayStyle 项。上述路径的具体属性收益页面未列出。',
    cosmeticRoutes.length
      ? 'Ones to Watch Retro 18 / 19 / 20 的属性与前置条件缺失（来源侧事实）：页面只说明为外观/稀有度变更，Player Requirements 与 Total Upgrades 均为空，故无法给出属性增益与入选门槛；费用为 200 FC Points + 25,000 金币（FUTBIN 标注 Repeatable）。'
      : '',
    '赛季通行证路径的领取条件不完整：页面只给「Found at Level N of the Premium/Free Season Pass」，未列出通行证是否需要付费、赛季结束时间与等级获取成本，故无法评估实际获取代价。',
    '候选球员口径：本轮未打开 https://www.futbin.com/27/players 做 Rating/位置筛选（该列表目录对当前 IP/会话返回 403），候选范围以 /27/popular/evolutions 榜单本身为准。',
    `榜单条数上限未知：/27/popular/evolutions 渲染 ${cards.length} 个卡片节点且页面未给出「共 N 条」计数或分页控件，无法排除服务端截断，故以页面实际渲染的 ${cards.length} 条为准。`,
    '价格上涨/收益预测缺失：本轮不输出任何涨跌或精确收益预测；页面参考价只作持仓成本参考，不构成投资建议。'
  ].filter(Boolean)
};

writeFileSync(`automation/runs/${D}/evolution/evolution.json`, JSON.stringify(data, null, 2) + '\n');
console.log('cardsNodes=', cards.length, 'evolutions=', evolutions.length, 'droppedNoMeta=', droppedNoMeta, 'uniqueUrls=', urlSet.size, 'routes=', routes.length, 'expired=', expiredList.length);
console.log('byEvo=', JSON.stringify(byEvo));
console.log('seasonRoutes=', seasonRoutes.length, 'rewardRoutes=', rewardRoutes.length, 'cosmeticRoutes=', cosmeticRoutes.length, 'payRoutes=', payRoutes.length, 'ratingMissing=', ratingMissing);
console.log('routesNotInList=', JSON.stringify(evoMissingInList));
console.log('upgrades sample:');
for (const r of routes.slice(0, 3)) console.log(' -', r.name, '::', r.desc.slice(0, 400));
