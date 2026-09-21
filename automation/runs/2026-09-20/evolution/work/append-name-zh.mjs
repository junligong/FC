// 一次性工作脚本：把 2026-09-20 进化专栏的未命中译名追加到 FC27 持久译名词库。
// 只增不改：任何与既有键冲突的条目都会被拒绝并报错，绝不覆盖、绝不写入空字符串。
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const F = 'apps/market/engine/data/players/name-zh-supplement-fc27.json';

// 键 = FUTBIN 球员 URL 的全名 slug（进化榜 URL 带版本后缀，词库按 slug 匹配）。
// 依据：官方中文名或公开资料；缺公开汉字依据者按通行音译，绝不留空、绝不猜测生造。
const ADD = {
  'skelly-alvero': '斯凯利·阿尔韦罗',
  'arnau-martinez-lopez': '阿尔瑙·马丁内斯',
  'leonardo-balerdi': '莱昂纳多·巴莱尔迪',
  'angela-baron': '安赫拉·巴龙',
  'fabricio-bustos': '法布里西奥·布斯托斯',
  'sebastian-cordova': '塞巴斯蒂安·科尔多瓦',
  'nelson-deossa': '内尔松·德奥萨',
  'henrik-falchener': '亨里克·法尔切纳',
  'iwan-henstra': '伊万·亨斯特拉',
  'trai-hume': '特雷·休姆',
  'kilyan-jusseron-veniere': '基利安·朱瑟龙-韦尼耶尔',
  'thomas-jorgensen': '托马斯·约根森',
  'wiebe-kooistra': '维贝·科伊斯特拉',
  'kacper-kozowski': '卡茨佩尔·科兹沃夫斯基',
  'arda-okan-kurtulan': '阿尔达·奥坎·库尔图兰',
  'fabian-kvam': '法比安·克瓦姆',
  'arthur-masuaku': '阿图尔·马苏阿库',
  'tadjidine-mmadi': '塔吉丁·姆马迪',
  'maxi-oyedele': '马克西·奥耶德莱',
  'pablo-martinez-andres': '巴勃罗·马丁内斯',
  'kilian-sauck': '基利安·绍克',
  'sydney-schertenleib': '西德妮·舍尔滕莱布',
  'kento-shiogai': '盐贝健人',
  'oscar-sjostrand': '奥斯卡·舍斯特兰德',
  'sean-steur': '肖恩·斯图尔',
  'haofeng-xu': '徐浩峰',
  'mohamed-ali-zoma': '穆罕默德-阿里·佐马',
  'hidde-ter-avest': '希德·特尔·阿弗斯特',
  'alvaro-nunez-cobo': '阿尔瓦罗·努涅斯'
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
