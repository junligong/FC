// 一次性工作脚本：把 2026-09-19 进化专栏的未命中译名追加到 FC27 持久译名词库。
// 只增不改：任何与既有键冲突的条目都会被拒绝并报错，绝不覆盖、绝不写入空字符串。
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const F = 'apps/market/engine/data/players/name-zh-supplement-fc27.json';

// 键 = FUTBIN 球员 URL 的全名 slug（进化榜 URL 带版本后缀，词库按 slug 匹配）。
// 依据：官方中文名或公开资料；无公开汉字依据者一律不写入。
const ADD = {
  'mohammed-abdulrahman': '穆罕默德·阿卜杜勒拉赫曼',
  'matthis-abline': '马蒂斯·阿布利内',
  'abner-vinicius-da-silva-santos': '阿布内尔·维尼修斯',
  'rafa-adamski': '拉法乌·亚当斯基',
  'sultan-al-ghannam': '苏丹·阿尔-甘纳姆',
  'tadeo-allende': '塔德奥·阿连德',
  'ane-azkona-fuente': '阿内·阿兹科纳',
  'jose-angel-esmoris-tasende': '安赫利尼奥',
  'gerardo-arteaga': '赫拉尔多·阿特亚加',
  'arthur-largura-chaves': '阿图尔·沙维斯',
  'harrison-ashby': '哈里森·阿什比',
  'ridle-baku': '里德勒·巴库',
  'vitalie-becker': '维塔利耶·贝克尔',
  'sebastian-bergier': '塞巴斯蒂安·贝尔吉耶',
  'jayden-bogle': '杰登·博格尔',
  'borja-galan-gonzalez': '博尔哈·加兰',
  'ilias-bronkhorst': '伊利亚斯·布龙克霍斯特',
  'dawid-bugaj': '达维德·布加伊',
  'anthony-caci': '安东尼·卡西',
  'carla-julia-martinez': '卡拉·胡利娅',
  'gabrielle-carle': '加布里埃尔·卡尔',
  'carlos-isaac-munoz-obejero': '卡洛斯·伊萨克',
  'leonie-carpay': '莱奥妮·卡尔派',
  'renaldo-cephas': '雷纳尔多·塞法斯',
  'tomas-chory': '托马什·霍里',
  'denzel-de-roeve': '登泽尔·德·鲁弗',
  'sergino-dest': '塞尔希尼奥·德斯特',
  'lautaro-di-lollo': '劳塔罗·迪·洛略',
  'douglas-do-e-santos-torres': '道格拉斯·博雷尔',
  'eguinaldo-de-sousa-lemos': '埃吉纳尔多',
  'kelvin-ehibhatiomhan': '凯尔文·埃希巴蒂奥姆汉',
  'souffian-el-karouani': '苏菲安·埃尔·卡鲁阿尼',
  'julio-cesar-enciso': '胡利奥·塞萨尔·恩西索',
  'esther-sullastres-ayuso': '埃斯特·苏利亚斯特雷斯',
  'ilay-feingold': '伊莱·法因戈尔德',
  'robin-gosens': '罗宾·戈森斯',
  'aleksandr-guboglo': '亚历山大·古巴格洛',
  'rafik-guitane': '拉菲克·吉坦',
  'gustavo-h-ferrareis': '古斯塔沃·费拉雷斯',
  'christian-gunter': '克里斯蒂安·金特尔',
  'quilindschy-hartman': '奎林奇·哈特曼',
  'honoka-hayashi': '林穗乃香',
  'zeidane-inoussa': '泽丹·伊努萨',
  'juan-iturbe': '胡安·伊图尔贝',
  'juan-antonio-iglesias-sanchez': '胡安·伊格莱西亚斯',
  'hector-junior-firpo-adames': '朱尼奥尔·菲尔波',
  'ferdi-kadoglu': '费尔迪·卡德奥卢',
  'ville-koski': '维莱·科斯基',
  'tariq-lamptey': '塔里克·兰普蒂',
  'alexsandra-lobanova': '亚历山德拉·洛巴诺娃',
  'zixiang-luo': '罗子祥',
  'maite-oroz-areta': '迈特·奥罗斯',
  'jordy-makengo': '乔迪·马肯戈',
  'darian-males': '达里安·马莱斯',
  'ryan-manning': '瑞安·曼宁',
  'marc-navarro-ceciliano': '马克·纳瓦罗',
  'mario-garcia-alvear': '马里奥·加西亚',
  'jahkeele-marshall-rutty': '贾基尔·马歇尔-拉蒂',
  'diego-mastrangelo': '迭戈·马斯特兰赫洛',
  'james-maxwell': '詹姆斯·麦克斯韦尔',
  'thomas-meunier': '托马·默尼耶',
  'tyrick-mitchell': '泰里克·米切尔',
  'phillipp-mwene': '菲利普·姆韦内',
  'corey-okeeffe': '科里·奥基夫',
  'raphael-obermair': '拉斐尔·奥伯迈尔',
  'wilson-odobert': '威尔逊·奥多贝尔',
  'orhan-ovackl': '奥尔汗·奥瓦吉克利',
  'paulo-victor-de-almeida-barbosa': '保罗·维克托',
  'finn-porath': '芬恩·波拉特',
  'omar-richards': '奥马尔·理查兹',
  'jayde-riviere': '杰德·里维埃尔',
  'joe-rodon': '乔·罗顿',
  'luke-shaw': '卢克·肖',
  'joao-victor-de-souza-menezes': '索萨',
  'eduard-spertsyan': '爱德华·斯佩尔强',
  'gabriel-suazo': '加布里埃尔·苏亚索',
  'ylinn-tennebo': '于林·滕内伯',
  'jose-antonio-morente-oliva': '特特·莫伦特',
  'mahmoud-hassan': '特雷泽盖',
  'jaden-umeh': '杰登·乌梅',
  'wojciech-urbanski': '沃伊切赫·乌尔班斯基',
  'georgios-vagiannidis': '乔治奥斯·瓦扬尼迪斯',
  'antonio-verinac': '安东尼奥·韦里纳茨',
  'anna-wei': '安娜·魏斯',
  'kyle-wootton': '凯尔·伍顿',
  'nesta-zahui': '内斯塔·扎胡伊',
  'joshua-zirkzee': '约书亚·齐尔克泽',
  'budu-zivzivadze': '布杜·齐夫齐瓦泽',
  'fratcan-uzum': '弗拉特詹·于聚姆'
};

const f = JSON.parse(readFileSync(F, 'utf8'));
const before = Object.keys(f.mappings).length;

// 红线校验：只增不改 + 禁止空字符串
const conflicts = [];
const empties = [];
for (const [k, v] of Object.entries(ADD)) {
  if (!v || !String(v).trim()) empties.push(k);
  const cur = f.mappings[k];
  if (cur !== undefined && cur !== v) conflicts.push(`${k}: 既有「${cur}」 vs 新增「${v}」`);
}
if (empties.length) { console.error('拒绝写入：存在空字符串占位 ->', empties); process.exit(1); }
if (conflicts.length) { console.error('拒绝写入：与既有译名冲突（只增不改）->\n' + conflicts.join('\n')); process.exit(1); }

let added = 0;
for (const [k, v] of Object.entries(ADD)) {
  if (f.mappings[k] === undefined) { f.mappings[k] = v; added++; }
}
f.updatedAt = new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00');

const tmp = F + '.tmp-work';
writeFileSync(tmp, JSON.stringify(f, null, 2) + '\n', 'utf8');
renameSync(tmp, F);
console.log('词库', before, '->', Object.keys(f.mappings).length, '新增', added, '（冲突 0、空值 0）');
