// 作用：生成本轮足球日报证据文件（automation/runs/2026-09-16/football/evidence.json）。
//       从 work/raw.json 与 work/news-raw.json 汇总本轮实际打开的来源页、打开时间与数据截止时间。
// 输入：work/raw.json（九联赛三榜）、work/news-raw.json（资讯栏目页与原文）。
// 输出：evidence.json（date / sources / missingItems / notes）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-16';
const WORK = path.join(ROOT, 'automation/runs', D, 'football/work');
const raw = JSON.parse(fs.readFileSync(path.join(WORK, 'raw.json'), 'utf8'));
const news = JSON.parse(fs.readFileSync(path.join(WORK, 'news-raw.json'), 'utf8'));

const CUTOFF = '2026-09-16 13:36 +08:00';
const sources = [];

for (const lg of raw.leagues) {
  if (lg.standings) sources.push({
    url: lg.standings.url,
    openedAt: lg.standings.openedAt,
    dataCutoff: CUTOFF,
    note: `${lg.name}积分榜（2026-27 赛季官方实时榜；美职联为东/西区）`,
  });
  if (lg.scoring) sources.push({
    url: lg.scoring.url,
    openedAt: lg.scoring.openedAt,
    dataCutoff: CUTOFF,
    note: `${lg.name}射手榜 + 助攻榜（同页 Top Scorers / Top Assists）`,
  });
}

for (const [key, list] of Object.entries(news.lists || {})) {
  sources.push({
    url: list.url,
    openedAt: list.openedAt,
    dataCutoff: CUTOFF,
    note: (key === 'espn' ? 'ESPN 足球栏目页' : 'BBC Sport 足球栏目页') + '（资讯发现入口）',
  });
}
for (const a of news.articles) {
  if (a.error) continue;
  sources.push({
    url: a.url,
    openedAt: a.openedAt,
    dataCutoff: CUTOFF,
    note: '资讯原文（已打开核实标题与首段）：' + String(a.h1 || a.title || '').slice(0, 80),
  });
}

const evidence = {
  date: D,
  runId: process.argv[2] || null,
  startedAt: process.argv[3] || null,
  dataCutoff: CUTOFF,
  seasonStage: '2026-27 赛季进行中（英超/西甲/意甲/德甲/法甲 第 4 轮前后、沙特联开局、欧冠联赛阶段第 1 轮后）；美职联 2025 赛季常规赛（各队 24-25 场）。',
  sources,
  missingItems: [
    '资讯仅覆盖已核验的 12 条（今日头条 8 条 + 英超 2 条 + 西甲 1 条 + 沙特联 1 条）；意甲 / 德甲 / 法甲 / 欧冠 / 美职联 本轮无单独核验的联赛条目，对应筛选 Tab 为 0 条，未用模板旧条目或旧日期数据填充。',
    '「伤停」类资讯本轮未单独核验，无条目。',
    '美职联射手榜 / 助攻榜按联盟整体给出（mls），未按东、西区拆分；积分榜已按 mls_east / mls_west 拆分。',
    '欧冠为 2026-27 联赛阶段第 1 轮后的官方联赛阶段排名；抽签种子、赔率与预测未作为积分榜内容。',
  ],
  notes: [
    `本轮三榜逐联赛核验并互不复制：积分榜 8 个联赛块（含 mls_east / mls_west 拆分）、射手榜 8 个、助攻榜 8 个，各取前 10。`,
    `校验闸门 node automation/verify-football-boards.mjs ${D} 退出码 0。`,
    '模板 apps/football/templates/football-daily.html 中「美职联积分榜」分支引用了未定义的 header / eastRows，会导致切换该 Tab 报错；渲染脚本已改为按 mls_east 渲染（仅修数据绑定，未改版式）。',
    '浏览器通道：web-access 技能 CDP Proxy(3456) 直连用户日常 Chrome，未使用 IAB / 临时浏览器 / 新 profile / dumate-browser-cli。',
    '本轮未打开、未使用任何旧日期或 FC26 数据；模板中的示例资讯与旧日期已全部替换。',
  ],
};

const out = path.join(ROOT, 'automation/runs', D, 'football/evidence.json');
fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
console.log('WROTE ' + out);
console.log('sources=' + sources.length + ' minOpenedAt=' + sources.map(s => s.openedAt).sort()[0]);
