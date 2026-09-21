#!/usr/bin/env node
// 用途：合并 4 个采集子代理的 JSON 为 build-football.mjs 所需的 work/data.json（2026-09-20）。
// 输入：work/agent-epl-laliga.json + work/agent-ita-ger-fra.json + work/agent-ucl-mls-saudi.json + work/agent-news.json。
// 输出：work/data.json（覆盖，含 standingsData/scorersData/assistsData/news/metaNotes/cutoffText）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = f => existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null;
const el = read('agent-epl-laliga.json');
const igf = read('agent-ita-ger-fra.json');
const us = read('agent-ucl-mls-saudi.json');
const nw = read('agent-news.json');

// 站列：净胜球列（第9列）转带符号字符串，便于展示
const fmtStandings = rows => rows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], (Number(r[8]) > 0 ? '+' + r[8] : String(r[8])), r[9]]);
// 射助榜：统一 4 列 [排名, 球员, 球队, 数值]（末列取最后一列，兼容含出场列的 5 列行），末列转 number
const board = rows => rows.map(r => [Number(r[0]), r[1], r[2], Number(r[r.length - 1])]);

const emptyBlock = () => ({ standings: { rows: [] }, scorers: { rows: [] }, assists: { rows: [] }, missing: ['本轮未采集到该联赛数据'] });
const lg = (src, key) => src && src[key] ? src[key] : emptyBlock();

const sd = {};
const sc = {};
const as = {};
const metaNotes = {};
const boardMissing = [];
for (const [key, src] of [['epl', el], ['laliga', el], ['seriea', igf], ['bundesliga', igf], ['ligue1', igf], ['saudi', us], ['ucl', us]]) {
  const b = lg(src, key);
  sd[key] = b.standings && Array.isArray(b.standings.rows) ? fmtStandings(b.standings.rows) : [];
  sc[key] = b.scorers && Array.isArray(b.scorers.rows) ? board(b.scorers.rows) : [];
  as[key] = b.assists && Array.isArray(b.assists.rows) ? board(b.assists.rows) : [];
  if (b.note) metaNotes[key] = b.note;
  if (b.missing && b.missing.length) boardMissing.push(key + ': ' + b.missing.join('；'));
  if (!sd[key].length) metaNotes[key] = (metaNotes[key] ? metaNotes[key] + '；' : '') + '积分榜本轮未采集到';
  if (!sc[key].length) metaNotes[key] = (metaNotes[key] ? metaNotes[key] + '；' : '') + '射手榜本轮未采集到';
  if (!as[key].length) metaNotes[key] = (metaNotes[key] ? metaNotes[key] + '；' : '') + '助攻榜本轮未采集到';
}
// 美职联：东西区积分榜独立，射助榜为联盟总榜（无分区拆分时如实标注）
const me = lg(us, 'mls_east'), mw = lg(us, 'mls_west');
sd.mls_east = me.standings && Array.isArray(me.standings.rows) ? fmtStandings(me.standings.rows) : [];
sd.mls_west = mw.standings && Array.isArray(mw.standings.rows) ? fmtStandings(mw.standings.rows) : [];
sc.mls = us && Array.isArray(us.mls_scorers && us.mls_scorers.rows) ? board(us.mls_scorers.rows)
  : (mw.scorers && Array.isArray(mw.scorers.rows) ? board(mw.scorers.rows) : []);
as.mls = us && Array.isArray(us.mls_assists && us.mls_assists.rows) ? board(us.mls_assists.rows)
  : (mw.assists && Array.isArray(mw.assists.rows) ? board(mw.assists.rows) : []);
metaNotes.mls = (me.note || '') + (mw.note && mw.note !== me.note ? '；' + mw.note : '');
if (sd.mls_east.length || sd.mls_west.length) {
  metaNotes.mls += (metaNotes.mls ? '；' : '') + (sc.mls.length ? '射助榜为联盟总榜' : '射手/助攻榜本轮未采集到');
} else {
  metaNotes.mls += (metaNotes.mls ? '；' : '') + '东西区积分榜本轮未采集到';
}
if (!sc.mls.length) metaNotes.mls += '；射手榜本轮未采集到';
if (!as.mls.length) metaNotes.mls += '；助攻榜本轮未采集到';

// 新闻：头条 + 分栏目全部平铺，映射为 newsCard 所需字段
const news = [];
const pushItems = (arr, defLeague) => {
  for (const it of (arr || [])) {
    if (!it || !it.url) continue;
    let time = it.publishedAt || '';
    const m = typeof time === 'string' ? time.match(/(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/) : null;
    if (m) time = `${m[1]}-${m[2]} ${m[3]}:${m[4]}`;
    news.push({
      league: it.league || defLeague || 'epl',
      team: it.team || '',
      title: it.title_zh || it.title_en || '',
      summary: it.summary_zh || '',
      source: it.url,
      sourceName: it.source || '原文',
      time: time || '时间待核',
      extra: undefined,
    });
  }
};
pushItems(nw && nw.toutiao, 'toutiao');
pushItems(nw && nw.transfers);
pushItems(nw && nw.matchReports);
pushItems(nw && nw.injuries);
pushItems(nw && nw.misc);

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const cutoffText = `数据截止时间：2026年9月20日 ${pad(now.getHours())}:${pad(now.getMinutes())}（北京时间）`;

const data = { cutoffText, metaNotes, standingsData: sd, scorersData: sc, assistsData: as, news, boardMissing };
const tmp = join(dir, 'data.json.tmp');
writeFileSync(tmp, JSON.stringify(data, null, 1));
const { renameSync } = await import('node:fs');
renameSync(tmp, join(dir, 'data.json'));
console.log('merged: news=' + news.length +
  ' standings=' + Object.entries(sd).map(([k, v]) => k + ':' + v.length).join(',') +
  ' scorers=' + Object.entries(sc).map(([k, v]) => k + ':' + v.length).join(',') +
  ' assists=' + Object.entries(as).map(([k, v]) => k + ':' + v.length).join(','));
if (boardMissing.length) console.log('missing: ' + boardMissing.join(' | '));
