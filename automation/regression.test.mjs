// 作用：回归验证日期校验、新闻同日重跑保护、去重库保护和缺失板块合并行为。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, reportDate } from '../shared/lib/runtime.mjs';
import { inlineLocalReportImages, originalXImageUrl, reportImageAssetName } from '../shared/lib/report-assets.mjs';
import { themeReport } from '../shared/presentation/report-theme.mjs';

test('拒绝不存在的日历日期', () => {
  assert.throws(() => reportDate('2026-02-30'));
  assert.throws(() => reportDate('yesterday'));
  assert.equal(reportDate('2026-09-07'), '2026-09-07');
});

test('统一深色主题不生成白底浅色字', () => {
  const input = '<html><head></head><body><section class="standings-section"><div id="table-content"></div></section><section class="news-section"><article class="news-card"></article></section></body></html>';
  const themed = themeReport(input);
  assert.ok(themed.includes('background:#161e18!important'));
  assert.ok(themed.includes('.fc-leagues button{background:#1d271b'));
  assert.ok(themed.includes('.fc-search{width:100%;padding:15px 18px;margin:20px 0 8px;background:#161e18'));
  assert.ok(!themed.includes('background:#ffffff'));
});

test('X 原图保存为稳定资产并可内嵌到单文件报告', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-image-'));
  const assets = path.join(dir, 'assets/news');
  mkdirSync(assets, { recursive: true });
  const remote = 'https://pbs.twimg.com/media/example?format=jpg&name=small';
  const name = reportImageAssetName(remote);
  writeFileSync(path.join(assets, name), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.ok(originalXImageUrl(remote).endsWith('format=jpg&name=orig'));
  const html = inlineLocalReportImages(`<img src="assets/news/${name}">`, dir);
  assert.ok(html.includes('src="data:image/jpeg;base64,/9j/2Q=="'));
  rmSync(dir, { recursive: true, force: true });
});

test('新闻重跑保留当天卡片，损坏去重文件不被重置；合并正确区分缺失板块', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-regression-'));
  const data = path.join(dir, 'apps/news/data');
  const reports = path.join(dir, `reports/daily/${reportDate()}`);
  mkdirSync(data, { recursive: true });
  mkdirSync(reports, { recursive: true });
  const date = reportDate();
  const env = { ...process.env, FC_PROJECT_ROOT: dir, FC_REPORT_DATE: date, DUMATE_QIANFAN_PROXY: '' };
  const run = script => spawnSync(process.execPath, [path.join(root, script), date], {env, encoding: 'utf8'});
  const tweet = { id: '123456789', text: 'EA SPORTS FC™ 27 launch confirmed', translation: 'FC27 发售消息已确认',
    images: [], author: 'EA', handle: 'easportsfc', url: 'https://x.com/easportsfc/status/123456789', timestamp: new Date().toISOString() };
  writeFileSync(path.join(data, 'raw_tweets_latest.json'), '### Result\n' + JSON.stringify(JSON.stringify({tweets: [tweet]})));
  try {
    let result = run('apps/news/generate_report.mjs');
    assert.equal(result.status, 0, result.stderr);
    result = run('apps/news/generate_report.mjs');
    assert.equal(result.status, 0, result.stderr);
    const content = readFileSync(path.join(reports, 'news.html'), 'utf8');
    assert.equal((content.match(/<article /g) || []).length, 1);
    assert.ok(content.includes('发售消息已确认'));
    assert.ok(existsSync(path.join(data, 'seen_tweets.json.bak')));
    const backupSeen = JSON.parse(readFileSync(path.join(data, 'seen_tweets.json.bak'), 'utf8'));
    const currentSeen = JSON.parse(readFileSync(path.join(data, 'seen_tweets.json'), 'utf8'));
    assert.deepEqual(backupSeen.tweets.map(item => item.id), currentSeen.tweets.map(item => item.id));
    assert.ok(!existsSync(path.join(data, 'raw_tweets_latest.json.bak')));
    writeFileSync(path.join(data, 'seen_tweets.json'), '{broken');
    result = run('apps/news/generate_report.mjs');
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(path.join(data, 'seen_tweets.json'), 'utf8'), '{broken');
    assert.equal(readFileSync(path.join(reports, 'news.html'), 'utf8'), content);
    mkdirSync(path.join(dir, `reports/daily/${date}`), {recursive: true});
    writeFileSync(path.join(dir, `reports/daily/${date}/football.html`), `<html>${date}<script>const unfinished = []`);
    result = run('apps/portal/merge_daily_report.mjs');
    assert.equal(result.status, 0, result.stderr);
    const merged = readFileSync(path.join(dir, `reports/daily/${date}/summary.html`), 'utf8');
    assert.equal((merged.match(/<iframe /g) || []).length, 1);
    assert.ok(!merged.includes('任务已暂停'));
    assert.ok(!merged.includes('href="file:'));
    const index = readFileSync(path.join(dir, 'daily-merged/index.html'), 'utf8');
    assert.ok(!index.includes('⚽ 足球</span>'));
    assert.ok(!index.includes('archive-viewer'), '历史日报不再 base64 内嵌，改用独立文件链接');
    assert.ok(index.includes(`archive/${date}.html`), 'index 历史日报应为独立文件链接');
    assert.ok(!index.includes(`href="daily-report-${date}.html"`));
    // 历史日报独立归档文件应生成
    assert.ok(existsSync(path.join(dir, `daily-merged/archive/${date}.html`)), 'archive 目录应生成当日历史日报文件');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('足球三榜校验闸门拦截“射手榜被整段填成积分榜”的历史故障', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-boards-'));
  const date = '2026-09-11';
  const target = path.join(dir, 'football.html');
  const env = { ...process.env, FC_PROJECT_ROOT: dir, FC_FOOTBALL_HTML: target };
  const rows = "epl: [[1,'曼城 Manchester City',4,4,0,0,8,2,'+6',12],[2,'阿森纳 Arsenal',4,4,0,0,8,1,'+7',12]],";
  const good = `const standingsData = {${rows}};
const scorersData = {epl: [[1,'哈兰德 Erling Haaland','曼城 Man City',5]]};
const assistsData = {epl: [[1,'加克波 Cody Gakpo','利物浦 Liverpool',4]]};`;
  const bad = `const standingsData = {${rows}};
const scorersData = {${rows}};
const assistsData = {${rows}};`;
  const write = body => writeFileSync(target, `<html><body>${date}<script>${body}</script></body></html>`);
  const runCheck = () => spawnSync(process.execPath, [path.join(here, 'verify-football-boards.mjs'), date], { env, encoding: 'utf8' });
  try {
    write(bad);
    const failed = runCheck();
    assert.notEqual(failed.status, 0, '射手榜=积分榜 时必须判失败');
    assert.match(failed.stdout, /R4/, '应指出与积分榜重复');
    write(good);
    const passed = runCheck();
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FC27 市场保留原版布局，并以子标签并入市场扫描', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-market-tabs-'));
  const date = '2026-09-12';
  const day = path.join(dir, 'reports', 'daily', date);
  mkdirSync(day, { recursive: true });
  const page = (title, marker) => `<html><head><title>${title}</title></head><body><h2>${marker}</h2>${date}</body></html>`;
  writeFileSync(path.join(day, 'market.html'), page('原版市场概览', '热门金卡榜'));
  writeFileSync(path.join(day, 'market-scan.html'), page('市场扫描', '维度二 · 热门球员维度'));
  try {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/portal/merge_daily_report.mjs'), date], {
      env: { ...process.env, FC_PROJECT_ROOT: dir }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr);
    const index = readFileSync(path.join(dir, 'daily-merged/index.html'), 'utf8');
    assert.ok(index.includes('data-subid="overview"'), '应生成「市场概览」子标签');
    assert.ok(index.includes('data-subid="scan"'), '应生成「市场扫描」子标签');
    assert.ok(index.includes('热门金卡榜'), '原版布局内容必须保留');
    assert.ok(index.includes('维度二 · 热门球员维度'), '扫描内容必须并入');
    assert.ok(index.includes('class="subpanel active"'), '默认应有激活的子面板');
    // 2026-09-16 起传奇/英雄内容已迁出市场栏目，市场只保留两个子标签
    const subs = index.match(/data-subid="(\w+)" aria-selected/g) || [];
    assert.equal(subs.length, 2, '市场栏目应恰好有两个子标签（概览 / 扫描）');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('传奇/英雄专栏承载监控子标签，市场栏目不再含传奇/英雄内容', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-icons-heroes-tab-'));
  const date = '2026-09-12';
  const day = path.join(dir, 'reports', 'daily', date);
  mkdirSync(day, { recursive: true });
  const page = (title, marker) => `<html><head><title>${title}</title></head><body><h2>${marker}</h2>${date}</body></html>`;
  writeFileSync(path.join(day, 'market.html'), page('原版市场概览', '热门金卡榜'));
  writeFileSync(path.join(day, 'market-scan.html'), page('市场扫描', '维度二 · 热门球员维度'));
  // 传奇/英雄监控改为独立任务产物；旧的市场内 market-icons.html 不应再被收录
  writeFileSync(path.join(day, 'icons-heroes.html'), page('传奇/英雄监控', '传奇卡（Icon）台账'));
  writeFileSync(path.join(day, 'market-icons.html'), page('旧传奇监控', '这份旧产物不应再出现'));
  try {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/portal/merge_daily_report.mjs'), date], {
      env: { ...process.env, FC_PROJECT_ROOT: dir }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr);
    const index = readFileSync(path.join(dir, 'daily-merged/index.html'), 'utf8');
    assert.ok(index.includes('data-subid="monitor"'), '传奇/英雄专栏应生成「传奇/英雄监控」子标签');
    assert.ok(index.includes('传奇/英雄专栏'), '应出现「传奇/英雄专栏」栏目名');
    assert.ok(index.includes('传奇卡（Icon）台账'), '监控内容必须并入传奇/英雄专栏');
    assert.ok(!index.includes('这份旧产物不应再出现'), '市场内旧 market-icons.html 不得再被收录');
    assert.ok(!index.includes('data-subid="icons"'), '不应再生成旧的「传奇监控」子标签');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('传奇卡研究常驻底稿跨日期并入传奇/英雄专栏', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-icons-research-'));
  const date = '2026-09-12';
  const day = path.join(dir, 'reports', 'daily', date);
  mkdirSync(day, { recursive: true });
  const page = (title, marker) => `<html><head><title>${title}</title></head><body><h2>${marker}</h2>${date}</body></html>`;
  writeFileSync(path.join(day, 'market.html'), page('市场概览', '热门金卡榜'));
  // 常驻研究底稿内容自带成稿日期（2026-09-16），与本次合并日期不同，仍必须被采纳；
  // 若沿用当日日期校验，这份研究就会在次日合并时静默消失。
  const researchDir = path.join(dir, 'apps', 'market', 'engine', 'icons', 'reports');
  mkdirSync(researchDir, { recursive: true });
  writeFileSync(path.join(researchDir, 'fc27-icon-analysis.html'),
    '<html><head><title>FC27 vs FC26 传奇卡对比</title></head><body><h1>FC27 vs FC26 传奇卡对比 · FC27 价格预测与投资建议</h1><p>2026-09-16</p></body></html>');
  try {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/portal/merge_daily_report.mjs'), date], {
      env: { ...process.env, FC_PROJECT_ROOT: dir }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr);
    const index = readFileSync(path.join(dir, 'daily-merged/index.html'), 'utf8');
    assert.ok(index.includes('data-subid="research"'), '应生成「传奇卡研究」子标签');
    assert.ok(index.includes('传奇卡研究'), '应出现子标签文案');
    assert.ok(index.includes('FC27 vs FC26 传奇卡对比'), '常驻研究底稿内容必须内嵌');
    assert.ok(index.includes('四、FC27 全量 131 张价格预测') || index.includes('价格预测与投资建议'), '研究正文必须完整进入');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('传奇监控逐日快照同日幂等，未开服只做台账不计算涨跌', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-icons-record-'));
  const date = '2026-09-16';
  const iconsRoot = path.join(dir, 'apps', 'market', 'engine', 'icons');
  const dailyDir = path.join(iconsRoot, 'data', 'prices', 'fc27', 'daily');
  mkdirSync(path.join(iconsRoot, 'data', 'prices', 'fc27'), { recursive: true });
  mkdirSync(path.join(iconsRoot, 'data', 'players', 'fc27'), { recursive: true });
  // 原始抓取：一张有有效价、一张只有占位值、一张完全无价
  writeFileSync(path.join(iconsRoot, 'data', 'prices', 'fc27', 'base-icons.json'), JSON.stringify({
    generatedAt: '2026-09-16T02:59:17.669Z', source: 'futbin', launchDate: '2026-09-25',
    players: [
      { id: '1', slug: 'jia', name: 'jia', nameZh: '甲', rating: 95, currentPrice: 60000, marketUrl: 'https://example.com/1' },
      { id: '2', slug: 'yi', name: 'yi', nameZh: '乙', rating: 88, currentPrice: 88, marketUrl: 'https://example.com/2' },
      { id: '3', slug: 'bing', name: 'bing', nameZh: '丙', rating: 89, currentPrice: null, marketUrl: 'https://example.com/3' },
    ],
  }));
  writeFileSync(path.join(iconsRoot, 'data', 'players', 'fc27', 'fc27-icons-playstyles.json'), JSON.stringify([
    { id: '1', nameZh: '甲', rating: 95, position: 'CAM', six: { PAC: 93, SHO: 94, PAS: 91, DRI: 94, DEF: 58, PHY: 74 }, playstyles: [{ name: 'Finesse Shot', gold: true }], skills: 5, weakFoot: 4 },
    { id: '2', nameZh: '乙', rating: 88, position: 'ST', six: { PAC: 80, SHO: 85, PAS: 70, DRI: 78, DEF: 40, PHY: 80 }, playstyles: [], skills: 3, weakFoot: 3 },
    { id: '3', nameZh: '丙', rating: 89, position: 'CB', six: { PAC: 70, SHO: 40, PAS: 60, DRI: 62, DEF: 88, PHY: 86 }, playstyles: [{ name: 'Block', gold: true }], skills: 2, weakFoot: 3 },
  ]));
  const env = { ...process.env, FC_PROJECT_ROOT: dir };
  const run = script => spawnSync(process.execPath, [path.join(here, '..', script), date], { env, encoding: 'utf8', timeout: 30000 });
  try {
    let r = run('apps/market/engine/scripts/record-icons-daily.mjs');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const snapPath = path.join(dailyDir, `${date}.json`);
    const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
    assert.equal(snap.counts.total, 3);
    assert.equal(snap.counts.valid, 1, '88 与 null 都应被判为无效价');
    assert.equal(snap.priceBasis, 'listing-estimate');
    assert.equal(snap.players.find(p => p.id === '1').pos, 'CAM', '位置应来自卡库台账');

    // 同日重跑：只覆盖当天文件，不新增、不清空
    r = run('apps/market/engine/scripts/record-icons-daily.mjs');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(readdirSync(dailyDir).filter(f => f.endsWith('.json')).length, 1, '同日重跑不得新增快照文件');

    r = run('apps/market/engine/scripts/render-market-icons.mjs');
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(path.join(dir, 'reports', 'daily', date, 'market-icons.html'), 'utf8');
    assert.ok(html.includes(date), '渲染结果必须带当日日期');
    for (const n of ['甲', '乙', '丙']) assert.ok(html.includes(n), `台账应含 ${n}`);
    assert.ok(html.includes('D-9'), '应显示距开服的倒计时');
    assert.ok(html.includes('未开服'), '开服前应如实说明口径');
    assert.ok(html.includes('93/94/91/94/58/74'), '台账应展示六维');
    assert.ok(!html.includes('class="up"') && !html.includes('class="dn"'), '占位价口径下不得计算日环比与累计涨跌');

    // 抓取结果缺失时不得写入快照
    writeFileSync(path.join(iconsRoot, 'data', 'prices', 'fc27', 'base-icons.json'), '{broken');
    r = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/record-icons-daily.mjs'), '2026-09-17'], { env, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(r.status, 0, '抓取结果不可用时必须失败退出');
    assert.ok(!existsSync(path.join(dailyDir, '2026-09-17.json')), '不得写入伪造快照');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('传奇监控开服后逐日计算日环比、累计涨跌与走势', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-icons-market-'));
  const iconsRoot = path.join(dir, 'apps', 'market', 'engine', 'icons');
  const dailyDir = path.join(iconsRoot, 'data', 'prices', 'fc27', 'daily');
  mkdirSync(dailyDir, { recursive: true });
  const stub = (date, prices) => ({
    schemaVersion: 1, date, game: 'fc27', cardType: 'icon', cardLabel: '基础传奇',
    platform: 'cross', launchDate: '2026-09-25', capturedAt: `${date}T03:00:00+08:00`,
    priceBasis: 'market', counts: { total: prices.length, valid: prices.length, missing: 0 },
    source: { name: 'FUTBIN', listUrl: 'https://www.futbin.com/27/players', rawFile: 'x.json' },
    players: prices.map(([id, nameZh, price]) => ({ id, slug: id, nameZh, name: id, rating: 90, pos: 'ST', price, priceValid: true })),
  });
  writeFileSync(path.join(dailyDir, '2026-09-25.json'), JSON.stringify(stub('2026-09-25', [['1', '甲', 1000], ['2', '乙', 2000]])));
  writeFileSync(path.join(dailyDir, '2026-09-26.json'), JSON.stringify(stub('2026-09-26', [['1', '甲', 1100], ['2', '乙', 1900]])));
  const env = { ...process.env, FC_PROJECT_ROOT: dir };
  try {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/render-market-icons.mjs'), '2026-09-26'], { env, encoding: 'utf8', timeout: 30000 });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(path.join(dir, 'reports', 'daily', '2026-09-26', 'market-icons.html'), 'utf8');
    assert.ok(html.includes('class="up"'), '涨价应用红色 up 样式');
    assert.ok(html.includes('class="dn"'), '跌价应用绿色 dn 样式');
    assert.ok(html.includes('+10.0%'), '甲 日环比应为 +10.0%');
    assert.ok(html.includes('-5.0%'), '乙 日环比应为 -5.0%');
    assert.ok(html.includes('<polyline points='), '不足与足够天数都应能画出行情折线');
    assert.ok(html.includes('1,050'), '逐日快照记录应列出当期中位价 1050');
    assert.ok(html.includes('LIVE MARKET'), '开服后状态徽章应为 LIVE MARKET');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('市场概览固定三段式、价格分层四档 Top50 且含 Console/PC 平台切换', async () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-market-overview-'));
  const date = '2026-09-12';
  const runDir = path.join(dir, 'automation', 'runs', date, 'market');
  mkdirSync(runDir, { recursive: true });
  const data = {
    date, status: 'partial', platform: 'console+pc',
    overview: {
      weekly: { promo: [{ name: '测试活动卡', rating: 90, pos: 'ST', cardType: 'Promo', price: 1200000, url: 'https://example.com/a' }], totw: [] },
      priceTiers: [
        { id: 'tier-1m', name: '≥ 100 万', items: Array.from({ length: 60 }, (_, i) => ({ name: `P${i}`, rating: 99 - i, pos: 'ST', price: 2000000 })) },
        { id: 'tier-300k', name: '30 - 100 万', items: [] },
        { id: 'tier-100k', name: '10 - 30 万', items: [] },
        { id: 'tier-10k', name: '1 - 10 万', items: [] },
      ],
      evolutions: [],
    },
    sources: [{ url: 'https://www.futbin.com/27/players', openedAt: '2026-09-12T10:00:00+08:00' }],
    missing: [],
  };
  writeFileSync(path.join(runDir, 'market.json'), JSON.stringify(data, null, 2));
  try {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/render-market-overview.mjs'), date], {
      env: { ...process.env, FC_PROJECT_ROOT: dir }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(path.join(dir, 'reports', 'daily', date, 'market.html'), 'utf8');
    const h2 = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    // 2026-09-16 起传奇卡与英雄卡迁出市场概览，固定为三段式
    assert.deepEqual(h2.slice(0, 3), ['一、本周活动卡与本周周黑', '二、价格分层（每档 Top 50，按 Rating）', '三、热门进化卡']);
    assert.ok(!html.includes('三、传奇卡与英雄卡'), '传奇卡与英雄卡不得再出现在市场概览');
    for (const t of ['≥ 100 万', '30 - 100 万', '10 - 30 万', '1 - 10 万']) assert.ok(html.includes(t), `缺少价格档 ${t}`);
    // 每档最多 50 行（数据里给了 60 条，应被截断到 50）
    assert.ok(html.includes('50 张'), '应截断到 Top 50');
    assert.equal((html.match(/<tbody>/g) || []).length >= 1, true);
    // 平台切换：Console（PS/Xbox）与 PC 两个按钮 + body 平台属性
    assert.ok(/class="plat-btn[^"]*" data-platform="console"/.test(html), '应有 Console 平台按钮');
    assert.ok(/class="plat-btn[^"]*" data-platform="pc"/.test(html), '应有 PC 平台按钮');
    assert.ok(/<body data-platform="console"/.test(html), '默认平台应为 console');
    assert.ok(html.includes('pv-console') && html.includes('pv-pc'), '两种平台价格单元格都要渲染');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('市场概览平台提示三态：双平台齐备 / 单边缺失告警 / 全空不误报', async () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const date = '2026-09-12';
  // 两平台价全为 0 时 pricedPlatforms 也是空集，不能据此声称「两平台均已采集」——本次回归即针对该误述。
  const cases = [
    { name: 'both-ready', ps: 500000, pc: 480000, expect: /本页两种平台价均已采集/, warn: false },
    { name: 'one-sided', ps: 500000, pc: 0, expect: /平台数据不完整/, warn: true },
    { name: 'all-zero', ps: 0, pc: 0, expect: /两个平台价当前均为 0/, warn: false },
  ];
  for (const c of cases) {
    const dir = mkdtempSync(path.join(tmpdir(), `fc-market-hint-${c.name}-`));
    const runDir = path.join(dir, 'automation', 'runs', date, 'market');
    mkdirSync(runDir, { recursive: true });
    const data = {
      date, status: 'partial', platform: 'console+pc',
      overview: {
        weekly: {
          promo: [{ name: '测试活动卡', rating: 90, pos: 'ST', cardType: 'Promo', price: 60000, psPrice: c.ps, pcPrice: c.pc, url: 'https://example.com/a' }],
          totw: [],
        },
        priceTiers: [], evolutions: [],
      },
      sources: [], missing: [],
    };
    writeFileSync(path.join(runDir, 'market.json'), JSON.stringify(data, null, 2));
    try {
      const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/render-market-overview.mjs'), date], {
        env: { ...process.env, FC_PROJECT_ROOT: dir }, encoding: 'utf8', timeout: 30000,
      });
      assert.equal(r.status, 0, r.stderr);
      const html = readFileSync(path.join(dir, 'reports', 'daily', date, 'market.html'), 'utf8');
      assert.match(html, c.expect, `${c.name}：平台提示文案不符`);
      assert.equal(html.includes('<b class="plat-warn">'), c.warn, `${c.name}：平台告警状态不符`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('市场扫描页加载球员库并渲染双平台价格列', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-market-scan-'));
  const date = '2026-09-12';
  const runDir = path.join(dir, 'automation', 'runs', date, 'market');
  mkdirSync(runDir, { recursive: true });
  // 只给 market.json（无独立 players.json），验证球员库回退不再为空表
  const data = {
    date, status: 'partial', priceBasis: 'listing-estimate',
    players: [
      { name: '测试球员', nameZh: '测试', rating: 88, pos: 'ST', price: 60000, priceValid: true, psPrice: 75000, pcPrice: 68000, popularity: 5, evo: '非进化池' },
      { name: '无平台价球员', rating: 85, pos: 'GK', price: 900, priceValid: false, psPrice: 0, pcPrice: 0 },
    ],
    sources: [{ url: 'https://www.futbin.com/27/popular', openedAt: '2026-09-12T10:00:00+08:00' }],
    missing: [],
  };
  writeFileSync(path.join(runDir, 'market.json'), JSON.stringify(data, null, 2));
  try {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/render-market-report.mjs'), date], {
      env: { ...process.env, FC_PROJECT_ROOT: dir }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(path.join(dir, 'reports', 'daily', date, 'market-scan.html'), 'utf8');
    assert.ok(/class="plat-btn[^"]*" data-platform="pc"/.test(html), '扫描页应有 PC 平台按钮');
    assert.ok(/<body data-platform="console"/.test(html), '默认平台应为 console');
    const db = JSON.parse(html.match(/id="db-data">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
    assert.equal(db.length, 2, '球员库应从 market.json 回退加载，不得为空');
    assert.equal(db[0].cPrice, 75000, 'Console 平台价应独立落库');
    assert.equal(db[0].pPrice, 68000, 'PC 平台价应独立落库');
    assert.equal(db[1].cPrice, 0, '无平台价的卡应如实写 0，不用另一平台顶替');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
