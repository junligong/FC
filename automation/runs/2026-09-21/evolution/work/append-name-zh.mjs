// 一次性工作脚本：把 2026-09-21 进化专栏的未命中译名追加到 FC27 持久译名词库。
// 只增不改：任何与既有键冲突的条目都会被拒绝并报错，绝不覆盖、绝不写入空字符串。
// 键 = FUTBIN 球员 URL 的全名 slug（词库按 slug 匹配，进化榜 URL 的 id 段带版本后缀不影响）。
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const F = 'apps/market/engine/data/players/name-zh-supplement-fc27.json';

// 依据：官方中文名或公开资料；缺公开汉字依据者按通行音译，绝不留空、绝不猜测生造。
const ADD = {
  'ariadna-mingueza-garcia': '阿里亚德娜·明格萨·加西亚',
  'tai-baribo': '泰·巴里博',
  'calvin-bassey': '卡尔文·巴塞',
  'giannis-bokos': '扬尼斯·博科斯',
  'ignacio-campo': '伊格纳西奥·坎波',
  'michael-cuisance': '米卡埃尔·屈桑斯',
  'pape-gueye': '帕普·盖耶',
  'fotis-ioannidis': '福蒂斯·约安尼迪斯',
  'juan-iribarren': '胡安·伊里瓦伦',
  'jakub-kaminski': '雅库布·卡明斯基',
  'don-angelo-konadu': '唐-安杰洛·科纳杜',
  'georgios-kyriopoulos': '乔治奥斯·基里奥普洛斯',
  'ryan-lee': '瑞安·李',
  'alan-lescano': '阿兰·莱斯卡诺',
  'robin-lod': '罗宾·洛德',
  'klaidi-lolos': '克莱迪·洛洛斯',
  'can-moustfa': '詹·穆斯塔法',
  'lubambo-musonda': '卢班博·穆松达',
  'ernest-muci': '埃内斯特·穆奇',
  'nikolay-obolskii': '尼古拉·奥博尔斯基',
  'aiham-ousou': '艾哈姆·欧苏',
  'tim-payne': '蒂姆·佩恩',
  'sophie-proost': '索菲·普罗斯特',
  'niklas-pyyhtia': '尼克拉斯·皮赫蒂亚',
  'otto-ruoppi': '奥托·鲁奥皮',
  'noah-shamoun': '诺亚·沙蒙',
  'emilia-szymczak': '埃米莉亚·希姆恰克',
  'casper-terho': '卡斯佩尔·特尔霍',
  'pawe-wszoek': '帕维乌·弗绍韦克',
  'christos-zafeiris': '赫里斯托斯·扎费里斯',
  'sepp-van-den-berg': '塞普·范登贝赫',
  'jakub-zewakow': '雅库布·热夫瓦科夫'
};

const f = JSON.parse(readFileSync(F, 'utf8'));
const before = Object.keys(f.mappings).length;

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
