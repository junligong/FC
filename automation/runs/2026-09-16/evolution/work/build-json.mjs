// 一次性装配脚本（临时工作文件）：把 CDP 提取的榜单卡片与进化总览页核验结果装配为 evolution.json。
// 输入：automation/runs/2026-09-16/evolution/work/cards-raw.json（榜单卡片）
// 输出：automation/runs/2026-09-16/evolution/evolution.json
import { readFileSync, writeFileSync } from 'node:fs';

const W = 'automation/runs/2026-09-16/evolution/work/cards-raw.json';
const raw = JSON.parse(readFileSync(W, 'utf8'));
const cards = JSON.parse(raw.value).body;

// 来自 https://www.futbin.com/27/evolutions 与 /27/evolutions/5/intro-to-evolutions 的核验结果
const EVO = {
  'intro-to-repeatable-evolutions': {
    id: 6, name: 'Intro to Repeatable Evolutions', cost: 'Free', expires: '解锁后 12 个月（页面 EXPIRES 12 MONTHS）',
    requirements: ['Overall Max 79', 'Pace Max 81', 'Position ST']
  },
  'intro-to-evolutions': {
    id: 5, name: 'Intro to Evolutions', cost: 'Free', expires: '解锁后 12 个月（页面 EXPIRES 12 MONTHS）',
    requirements: ['Overall Max 75', 'Pace Max 80', 'Total Positions Max 2', 'PlayStyle Max 7', 'Position RB', 'Not Position CB']
  },
  'intro-to-training-camp-evos': {
    id: 4, name: 'Intro to Training Camp EVOs', cost: 'Free', expires: '解锁后 12 个月（页面 EXPIRES 12 MONTHS）',
    requirements: ['Overall Max 80', 'Position RB']
  },
  'repeat-delivery': {
    id: 3, name: 'Repeat Delivery', cost: 'Free', expires: '解锁后 1 个月（页面 EXPIRES 1 MONTHS）',
    requirements: ['Overall Max 74', 'Pace Max 83', 'PlayStyle Max 7', 'Position LM or RM', 'Not Position LB, RB']
  },
  'intro-to-pathway-evolutions': {
    id: 2, name: 'Intro to Pathway Evolutions', cost: 'Free', expires: '解锁后 12 个月（页面 EXPIRES 12 MONTHS）',
    requirements: ['Overall Max 80', 'PlayStyle Max 3']
  }
};

const slug = u => ((u || '').split('/evolutions/')[1] || '').split('/').pop();
const seen = new Set();
const evolutions = [];
for (const c of cards) {
  const s = slug(c.evoUrl);
  const meta = EVO[s];
  if (!meta) continue;
  const key = [c.name, c.rating, c.pos, meta.name].join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  evolutions.push({
    rank: evolutions.length + 1,
    name: c.name,
    rating: String(c.rating || ''),
    pos: c.pos || '',
    altPos: c.altPos || '',
    evolutionName: meta.name,
    cost: meta.cost,
    expires: meta.expires,
    requirements: meta.requirements,
    popularityCount: c.popularityCount || '',
    futbinListValue: c.futbinListValue || '',
    stats: c.stats || {},
    url: c.url,
    evoUrl: c.evoUrl
  });
}

const byEvo = {};
for (const e of evolutions) byEvo[e.evolutionName] = (byEvo[e.evolutionName] || 0) + 1;

const data = {
  date: '2026-09-16',
  status: 'success',
  generatedAt: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
  dataCutoff: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' +08:00',
  evolutions,
  routes: [
    {
      name: 'Intro to Evolutions（入门进化，RB 专项）',
      cost: 'Free',
      desc: '页面标注 LEVELS 3 / CHALLENGES 3，可重复（REPEATABLE）。前置：Overall ≤75、Pace ≤80、总位置数 ≤2、PlayStyle ≤7、位置必须是 RB 且不可为 CB。合计升级：Overall +34（封顶 79）；Acceleration / Agility / Balance / Ball control / Crossing / Curve / Dribbling / Interceptions / Def. Aware / Short Passing / Slide Tackle / Sprint Speed / Stand Tackle / Stamina / Vision 各 +40；解锁 PlayStyle「Slide Tackle」与 Role「Wingback++」。',
      steps: [
        'Level 1 挑战：Play 3 matches in any mode using your active EVO player in game.',
        'Level 2 挑战：Play 2 matches（同上口径）',
        'Level 3 挑战：Play 2 matches，完成后解锁 Role Wingback++'
      ],
      note: '核验：/27/evolutions/5/intro-to-evolutions 详情页确认 UNLOCK 12 Months / EXPIRES 12 Months / REPEATABLE，Requirements 与总升级表一致。前提：球员必须是 RB 且基础 Overall ≤75；失效情形：基础 OVR >75、Pace >80、已占 2 个以上位置或位置为 CB 时不可入选。'
    },
    {
      name: 'Intro to Repeatable Evolutions（可重复入门进化，ST 专项）',
      cost: 'Free',
      desc: '页面标注 REPEATABLE，UNLOCK / EXPIRES 均为 12 MONTHS。前置：Overall ≤79、Pace ≤81、Position ST。合计升级：Overall +1（封顶 80）、Dribbling +4（封顶 80）、Long Passing +4（77）、Long Shots +4（77）、Reactions +4（80）、Short Passing +3（78）、Free Kick +4（80）、Shot Power +3（78）、Vision +3（79）、Volleys +3（78）。',
      steps: [
        '满足 Overall ≤79、Pace ≤81、位置 ST 的球员入选',
        '完成进化挑战后领取属性升级；该路径可重复投入多名球员'
      ],
      note: '核验来源：/27/evolutions 总览页 Intro to Repeatable Evolutions 卡（示例球员 Ivanović 74 → 76 OVR）。前提：位置必须为 ST；失效情形：Overall >79 或 Pace >81 的 ST 不可入选。'
    },
    {
      name: 'Repeat Delivery（重复供给，边路传球型）',
      cost: 'Free',
      desc: '页面标注类型 TRAINING CAMP、TRAINING 1 DAYS，UNLOCK / EXPIRES 均为 1 MONTHS。前置：Overall ≤74、Pace ≤83、PlayStyle ≤7、位置 LM 或 RM、不可为 LB / RB。合计升级：Overall +8（封顶 78）、Short Passing / Stamina / Vision 各 +15、Balance / Curve / Long Passing / Reactions 各 +12、Crossing +10、Composure +10、Agility +8、Ball control +8、Dribbling +8、Acceleration +5、Sprint Speed +5、Free Kick +4、Weak Foot +2、Skills +2，并解锁 PlayStyle「Pinged Pass」「First Touch」。',
      steps: [
        '满足 Overall ≤74、Pace ≤83、PlayStyle ≤7 的 LM / RM 球员入选',
        '投入 1 天训练时长，训练结束后领取升级；路径可重复'
      ],
      note: '核验来源：/27/evolutions 总览页 Repeat Delivery 卡（示例球员 Spiten-Nysæter 65 → 73 OVR）。有效期仅为 1 个月，是本日 5 个进化中最短的一条。前提：位置为 LM/RM 且总评低；失效情形：Overall >74、Pace >83、位置为 LB/RB 或纯 CM 的球员不可入选。'
    },
    {
      name: 'Intro to Training Camp EVOs（训练营进化，RB 角色型）',
      cost: 'Free',
      desc: '页面标注 TRAINING CAMP、TRAINING 1 HOUR，可重复，UNLOCK / EXPIRES 均为 12 MONTHS。前置：Overall ≤80、Position RB。Total Upgrades 区只给出 Role「Fullback++」，未列出逐项数值升级。',
      steps: [
        '满足 Overall ≤80 的 RB 球员入选',
        '投入 1 小时训练时长，训练结束后领取升级（页面未列出具体数值项）'
      ],
      note: '核验来源：/27/evolutions 总览页该卡（示例球员 Araujo 前后卡面完全一致，均 80 OVR / 81.1 估值），说明数值产出依赖训练结果，页面未给出逐项升级表。失效情形：Overall >80 或非 RB 不可入选。'
    },
    {
      name: 'Intro to Pathway Evolutions（路径自选进化）',
      cost: 'Free',
      desc: '页面标注 PATHWAY EVOLUTIONS，可重复，UNLOCK / EXPIRES 均为 12 MONTHS。前置：Overall ≤80、PlayStyle ≤3。Total Upgrades 区仅展示「PATH A」分支下的可选项（PlayStyle「Gamechanger」，成本 4），其余路径分支页面未展开。',
      steps: [
        '满足 Overall ≤80、PlayStyle ≤3 的球员入选',
        '在 PATH 分支中选择一项升级（页面当前可见 PATH A → PlayStyle Gamechanger）'
      ],
      note: '核验来源：/27/evolutions 总览页该卡（示例球员 Minteh 前后卡面一致，均 80 OVR）。失效情形：Overall >80 或 PlayStyle >3 不可入选；本路径的数值收益页面未给出，不做推断。'
    }
  ],
  sources: [
    {
      url: 'https://www.futbin.com/27/popular/evolutions',
      openedAt: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
      note: `热门进化卡主来源；本轮为同日重跑，实际打开并提取 .popular-cards-wrapper 下 ${cards.length} 个有效卡片节点，去重后 ${evolutions.length} 张进化卡。页面标题「EA FC 27 Popular Evolution Players | FUTBIN」，未出现 No evolutions found。`
    },
    {
      url: 'https://www.futbin.com/27/evolutions',
      openedAt: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
      note: 'FC27 进化总览（All 5：Pathway Evolutions 2 / Training Camp 1；Active 2 / Expired 0）；逐条取得本日 5 个进化的费用（均为 FREE）、UNLOCK / EXPIRES 有效期、Player Requirements 与 Total Upgrades。'
    },
    {
      url: 'https://www.futbin.com/27/evolutions/5/intro-to-evolutions',
      openedAt: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
      note: 'Intro to Evolutions 详情页核验：LEVELS 3 / CHALLENGES 3、UNLOCK 12 Months / EXPIRES 12 Months、REPEATABLE，Requirements 与总升级表与总览页一致；三级挑战为 Play 3 / Play 2 / Play 2 matches。'
    }
  ],
  notes: [
    `本轮为 2026-09-16 当日重跑（上一轮 attempt 已归档为 attempts/7c887658-d1d7-41f8-93fb-59fe396754af）。浏览器通道（Web Access CDP，用户日常 Chrome）正常，FUTBIN 页面实采成功。`,
    `分布：共 ${evolutions.length} 张进化卡，按进化名称计数 ${Object.entries(byEvo).map(([k, v]) => `${k} ${v} 张`).join('；')}。`,
    '评分口径：榜单 Rating 列显示的是「进化后」OVR，不是基础卡评分。例如 Intro to Evolutions 要求基础 Overall ≤75，榜单显示 79（= 75 + 34 封顶 79）。阅读表格时请勿把该 Rating 当作基础卡评分。',
    '费用口径：本日 5 个进化在 FUTBIN 上均标注 FREE（免费），费用列即来源于此。榜单卡片上的数字（如 Malić 477）是热度/使用计数，已单独记为 popularityCount，不参与费用判断。',
    '到期口径：FUTBIN 只给相对时长（UNLOCK / EXPIRES），未提供绝对到期日期，故 expires 字段按页面原文的相对月数记录，不换算具体日期。',
    '本节只写「可证实的卡面事实」与来源页明示的路线整理，不输出无依据的精确收益预测。FC27 launchDate 为 2026-09-25，开服前价格属估算口径，不作为投资依据。'
  ],
  missing: [
    '到期时间只有相对口径：来源页给出的是 UNLOCK / EXPIRES 时长（多数进化 12 MONTHS，Repeat Delivery 为 1 MONTHS），FUTBIN 未提供绝对到期日期，故无法换算成具体日期。',
    'Intro to Training Camp EVOs 与 Intro to Pathway Evolutions 未给出逐项数值升级表（Training Camp 示例球员进化前后卡面完全一致；Pathway 页面仅展示 PATH A 的 PlayStyle 选项），两者的具体属性收益缺失。',
    '中文译名缺失：来源页只有英文球员名与俱乐部信息，本轮未找到权威中文译名来源，故未擅自翻译。',
    '候选球员口径：本轮未打开 https://www.futbin.com/27/players 做 Rating/位置筛选，候选范围以 /27/popular/evolutions 榜单本身为准。',
    '价格上涨/收益预测缺失：FC27 launchDate 为 2026-09-25，开服前价格为 listing-estimate 口径，本轮不输出任何涨跌或精确收益预测。'
  ]
};

writeFileSync('automation/runs/2026-09-16/evolution/evolution.json', JSON.stringify(data, null, 2) + '\n');
console.log('evolutions=', evolutions.length, 'routes=', data.routes.length, 'byEvo=', JSON.stringify(byEvo));
