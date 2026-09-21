#!/usr/bin/env node
// 用途：合并 4 个采集子代理的 JSON 为 build-football.mjs 所需的 work/data.json。
// 输入：work/data.json（意德法底稿）+ agent-epl-laliga.json + agent-ucl-mls-saudi.json + agent-news.json。
// 输出：work/data.json（覆盖，含 standingsData/scorersData/assistsData/news/metaNotes/cutoffText）。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const base = JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'));
const el = JSON.parse(readFileSync(join(dir, 'agent-epl-laliga.json'), 'utf8'));
const us = JSON.parse(readFileSync(join(dir, 'agent-ucl-mls-saudi.json'), 'utf8'));
const nw = JSON.parse(readFileSync(join(dir, 'agent-news.json'), 'utf8'));

// 站列：净胜球列（第9列）转带符号字符串，便于展示
const fmtStandings = rows => rows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], (r[8] > 0 ? '+' + r[8] : String(r[8])), r[9]]);
// 射助榜：统一 4 列 [排名, 球员, 球队, 数值]（末列取最后一列，兼容含出场列的 5 列行）
const zh = {
  'Lionel Messi':'梅西','Harry Kane':'凯恩','Erling Haaland':'哈兰德','Lamine Yamal':'亚马尔','Ousmane Dembélé':'登贝莱','Serhou Guirassy':'吉拉西','Michael Olise':'奥利塞','Raphinha':'拉菲尼亚','Son Heung-Min':'孙兴慜','Sadio Mané':'马内','Ruben Neves':'鲁本·内维斯','Ivan Toney':'托尼','Alexandre Lacazette':'拉卡泽特','Steven Bergwijn':'贝尔温','Youssef En-Nesyri':'恩内斯里','Sergej Milinkovic-Savic':'米林科维奇-萨维奇','Rodrigo De Paul':'德保罗','João Félix':'菲利克斯','Petar Musa':'穆萨','Denis Bouanga':'布安加','Crysencio Summerville':'萨默维尔','Mateo Retegui':'雷特吉','Ferran Torres':'费兰·托雷斯','Ermedin Demirovic':'德米罗维奇','Danijel Sturm':'什图尔姆','Marc Bartra':'巴尔特拉','Deniz Undav':'温达夫','Nico Paz':'尼科·帕斯','Pau Torres':'保·托雷斯','Joaquín Pereyra':'佩雷拉','Anders Dreyer':'德雷尔','Evander':'埃万德尔','Georges Mikautadze':'米考塔泽','Maghnes Akliouche':'阿克利乌什','João Gomes':'若昂·戈麦斯','Angelo Stiller':'斯蒂勒','Brian White':'怀特','Sam Surridge':'瑟里奇','Tai Baribo':'巴里博','Guilherme Augusto':'吉列尔梅','Prince Owusu':'奥乌苏','Kévin Denkey':'登凯','Nicolás Fernández':'费尔南德斯','Joaquín Valiente':'瓦连特','Cristian Espinoza':'埃斯皮诺萨','Niko Tsakiris':'察基里斯','Justin Ellis':'埃利斯','George Ilenikhena':'伊莱尼赫纳','Iker Kortajarena':'科塔哈雷纳','Amadou Kone':'科内','Sultan Mandash':'曼达什','Haroune Camara':'卡马拉','Angelo Gabriel':'安杰洛·加布里埃尔','Josh Brownhill':'布朗希尔','Mohammed Abu Alshamat':'阿布·沙马特','Oscar':'奥斯卡'
};
const board = rows => rows.map(r => {
  const en = r[1];
  const name = zh[en] ? zh[en] + ' ' + en : en;
  return [Number(r[0]), name, r[2], Number(r[r.length - 1])];
});

const sd = {
  epl: fmtStandings(el.epl.standings.rows),
  laliga: fmtStandings(el.laliga.standings.rows),
  seriea: base.standingsData.seriea, bundesliga: base.standingsData.bundesliga, ligue1: base.standingsData.ligue1,
  mls_east: fmtStandings(us.mls_east.standings.rows),
  mls_west: fmtStandings(us.mls_west.standings.rows),
  saudi: fmtStandings(us.saudi.standings.rows),
  ucl: fmtStandings(us.ucl.standings.rows),
};
const sc = {
  epl: board(el.epl.scorers.rows), laliga: board(el.laliga.scorers.rows),
  seriea: base.scorersData.seriea, bundesliga: base.scorersData.bundesliga, ligue1: base.scorersData.ligue1,
  mls: board(us.mls_west.scorers.rows), saudi: board(us.saudi.scorers.rows), ucl: board(us.ucl.scorers.rows),
};
const as = {
  epl: board(el.epl.assists.rows), laliga: board(el.laliga.assists.rows),
  seriea: base.assistsData.seriea, bundesliga: base.assistsData.bundesliga, ligue1: base.assistsData.ligue1,
  mls: board(us.mls_west.assists.rows), saudi: board(us.saudi.assists.rows), ucl: board(us.ucl.assists.rows),
};

const news = [];
const push = (league, team, t) => news.push({
  league, team, title: t.title_zh,
  summary: (t.summary_zh || '').replace(/『|』/g, '「'),
  source: t.url, sourceName: t.source, time: (t.publishedAt || '').slice(5, 10).replace('-', '/'),
});
for (const t of nw.toutiao) push('toutiao', t.title_zh.split('：')[0].slice(0, 12), t);
push('epl', '曼联', nw.transfers[0]); push('epl', '转会风向', nw.transfers[1]); push('mls', '辛辛那提FC', nw.transfers[2]);
push('epl', '伯恩茅斯', nw.matchReports[0]); push('ucl', '凯尔特人', nw.matchReports[1]);
push('epl', '利兹联', nw.injuries[0]);
for (const t of us.leagueNews.ucl) push('ucl', '欧冠', t);
push('mls', '迈阿密国际', us.leagueNews.mls[0]); push('mls', '纳什维尔SC', us.leagueNews.mls[1]);
push('saudi', '利雅得胜利', us.leagueNews.saudi[0]); push('saudi', '利雅得胜利', us.leagueNews.saudi[1]);

const out = {
  cutoffText: '数据截止时间：2026年9月19日 04:10（北京时间）',
  metaNotes: {
    epl: '英超第5轮进行中（worldfootball.net，逐表核验）',
    laliga: '西甲第6轮（worldfootball.net，逐表核验）',
    seriea: base.metaNotes.seriea, bundesliga: base.metaNotes.bundesliga, ligue1: base.metaNotes.ligue1,
    mls: '美职联常规赛约第25轮后（ESPN；射手/助攻为联盟总榜，无东西分区拆分）',
    saudi: '沙特联第7轮后（海湾杯休赛期，第8轮 10/9 重启；FoxSports/Tribuna/statarea 三源一致）',
    ucl: '欧冠联赛阶段第1轮后，第2轮 2026-10-13/14（ESPN）',
  },
  standingsData: sd, scorersData: sc, assistsData: as, news,
};
writeFileSync(join(dir, 'data.json'), JSON.stringify(out, null, 1));
console.log('merged: news=' + news.length + ' eplRows=' + sd.epl.length + ' uclRows=' + sd.ucl.length);
