// 作用：回归验证日期校验、新闻同日重跑保护、去重库保护和缺失板块合并行为。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, reportDate } from '../shared/lib/runtime.mjs';
import { rewriteLocalReportAssets, originalXImageUrl, reportImageAssetName } from '../shared/lib/report-assets.mjs';
import { pruneReportAssets } from '../shared/lib/prune-report-assets.mjs';
import { themeReport } from '../shared/presentation/report-theme.mjs';
import { appendSeries, seriesPathFor } from '../apps/market/engine/src/price-series.mjs';

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

test('X 图片按尺寸归一化并以内容寻址方式命名', () => {
  const remote = 'https://pbs.twimg.com/media/example?format=jpg&name=small';
  assert.ok(originalXImageUrl(remote).endsWith('format=jpg&name=orig'));
  assert.ok(originalXImageUrl(remote, 'medium').endsWith('format=jpg&name=medium'));
  assert.match(reportImageAssetName(remote), /^[0-9a-f]{20}\.jpg$/);
  // 非 twimg 主机不改写
  assert.equal(originalXImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});

test('日报本地图片改写为共享资源目录路径，不再按文档重复内联', () => {
  // 同一张图在 index / archive / summary 三份文档里各内联一次 base64，是此前体积膨胀的根因
  // （实测 daily-merged 191 MB / 9,336 处 data:image）。改为统一指向 daily-merged/assets/。
  const archiveCase = rewriteLocalReportAssets('<img src="assets/news/a.jpg"><img src="./assets/players/1.png">', '../');
  assert.ok(archiveCase.includes('src="../assets/news/a.jpg"'), 'archive 页应加 ../ 前缀');
  assert.ok(archiveCase.includes('src="../assets/players/1.png"'), '应同时去掉 ./ 并加前缀');
  assert.ok(!archiveCase.includes('data:image'), '不应再产生内联 data URL');

  // index / archive 页在 daily-merged 根目录时前缀为空
  assert.ok(rewriteLocalReportAssets('<img src="assets/news/a.jpg">', '').includes('src="assets/news/a.jpg"'));

  // 市场扫描页把头像路径放在 db-data JSON 数据块里（由前端 JS 拼成 <img>），必须一并改写
  const dbData = rewriteLocalReportAssets('<script id="db-data">{"img":"assets/players/2.png"}</script>', '../');
  assert.ok(dbData.includes('"../assets/players/2.png"'));
  assert.equal((dbData.match(/\.\.\/assets\//g) || []).length, 1, '两遍改写不得对同一路径重复加前缀');

  // 远程图与非 assets 引用保持原样
  const remote = '<img src="https://example.com/a.jpg">';
  assert.equal(rewriteLocalReportAssets(remote, '../'), remote);
});

test('归并后清理报告目录里的资源副本，但保留唯一副本与 data/', () => {
  // 报告目录 assets/ 与 daily-merged/assets/ 各存一份是 100 MB 重复的根因；归并完成后只留共享目录一份。
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-prune-assets-'));
  try {
    const day = '2026-09-11';
    const dayPlayers = path.join(dir, 'reports/daily', day, 'assets/players');
    const dayNews = path.join(dir, 'reports/daily', day, 'assets/news');
    const dayData = path.join(dir, 'reports/daily', day, 'assets/data');
    const shared = path.join(dir, 'daily-merged/assets');
    for (const p of [dayPlayers, dayNews, dayData, path.join(shared, 'players'), path.join(shared, 'news')]) mkdirSync(p, { recursive: true });

    // ① 已归并（同名同大小）→ 应删
    writeFileSync(path.join(dayPlayers, '100.png'), 'png-bytes');
    writeFileSync(path.join(shared, 'players/100.png'), 'png-bytes');
    // ② 共享目录没有 → 是唯一副本，必须保留
    writeFileSync(path.join(dayNews, 'only-here.jpg'), 'unique');
    // ③ 同名但大小不同 → 字节不同，必须保留（不得误删）
    writeFileSync(path.join(dayNews, 'differs.jpg'), 'short');
    writeFileSync(path.join(shared, 'news/differs.jpg'), 'much-longer-content');
    // ④ data/ 永不清理，即使共享目录有同名同大小文件
    writeFileSync(path.join(dayData, 'current.json'), '{"a":1}');
    mkdirSync(path.join(shared, 'data'), { recursive: true });
    writeFileSync(path.join(shared, 'data/current.json'), '{"a":1}');

    const reportRoot = path.join(dir, 'reports/daily');
    const result = pruneReportAssets({ reportRoot, assetsDir: shared });

    assert.equal(result.pruned, 1, '只应清理已归并的 1 个文件');
    assert.equal(result.days, 1);
    assert.ok(!existsSync(path.join(dayPlayers, '100.png')), '已归并的头像应从报告目录删除');
    assert.ok(existsSync(path.join(shared, 'players/100.png')), '共享目录必须不受影响');
    assert.ok(existsSync(path.join(dayNews, 'only-here.jpg')), '共享目录没有的文件不得删除');
    assert.ok(existsSync(path.join(dayNews, 'differs.jpg')), '同名但大小不同不得删除');
    assert.ok(existsSync(path.join(dayData, 'current.json')), 'data/ 下的运行时资源永不清理');
    // 清空后的子目录应被回收，避免留下空壳
    assert.ok(!existsSync(dayPlayers), '清空后的 players 目录应被移除');

    // 幂等：再跑一次不再有可清理项
    assert.equal(pruneReportAssets({ reportRoot, assetsDir: shared }).pruned, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test('传奇监控逐日快照同日幂等，priceBasis 按实测有效价判定（不按日期）', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-icons-record-'));
  const date = '2026-09-16';
  const iconsRoot = path.join(dir, 'apps', 'market', 'engine', 'icons');
  const dailyDir = path.join(iconsRoot, 'data', 'prices', 'fc27', 'daily');
  mkdirSync(path.join(iconsRoot, 'data', 'prices', 'fc27'), { recursive: true });
  mkdirSync(path.join(iconsRoot, 'data', 'prices', 'fc27', 'pricerange'), { recursive: true });
  mkdirSync(path.join(iconsRoot, 'data', 'players', 'fc27'), { recursive: true });
  // 原始抓取：一张有有效价、一张只有占位值、一张完全无价
  writeFileSync(path.join(iconsRoot, 'data', 'prices', 'fc27', 'base-icons.json'), JSON.stringify({
    generatedAt: '2026-09-16T02:59:17.669Z', source: 'futbin', launchDate: '2026-09-18',
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
  writeFileSync(path.join(iconsRoot, 'data', 'prices', 'fc27', 'pricerange', 'latest.json'), JSON.stringify({
    date, collectedAt: '2026-09-16T10:00:00.000Z', cards: [
      { id: '1', current: { console: 71000, pc: 72000 }, priceRange: { min: 10000, max: 100000 }, ok: true },
      { id: '2', current: { console: 0, pc: 1500 }, priceRange: { min: 1000, max: 10000 }, ok: true },
      { id: '3', current: { console: 0, pc: 0 }, priceRange: { min: 1000, max: 20000 }, ok: true },
    ],
  }));
  const env = { ...process.env, FC_PROJECT_ROOT: dir };
  const run = script => spawnSync(process.execPath, [path.join(here, '..', script), date], { env, encoding: 'utf8', timeout: 30000 });
  try {
    let r = run('apps/market/engine/scripts/record-icons-daily.mjs');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const snapPath = path.join(dailyDir, `${date}.json`);
    const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
    assert.equal(snap.counts.total, 3);
    assert.equal(snap.counts.valid, 2, '逐小时详情里的 PC 有效价必须传播进当日快照');
    // priceBasis 按**本轮实测有效价**判定（2026-09-20 用户口径），不再按「日期 < launchDate」比较：
    // 本 fixture 有 71000 / 72000 / 1500 三处 ≥1000 的平台有效价，故应判 partial-live（旧口径会误判成 listing-estimate）
    assert.equal(snap.priceBasis, 'partial-live');
    assert.equal(snap.launchDate, '2026-09-18', '开服日应为 2026-09-18（2026-09-25 是正式发售日）');
    assert.equal(snap.players.find(p => p.id === '1').pos, 'CAM', '位置应来自卡库台账');
    assert.equal(snap.players.find(p => p.id === '1').platforms.console.price, 71000, '传奇 Console 实时价必须覆盖旧 base-icons 值');
    assert.equal(snap.players.find(p => p.id === '1').platforms.pc.price, 72000, '传奇 PC 实时价必须传播');
    assert.equal(snap.players.find(p => p.id === '2').platforms.pc.price, 1500, '单边有效价不得丢失');

    // 同日重跑：只覆盖当天文件，不新增、不清空
    r = run('apps/market/engine/scripts/record-icons-daily.mjs');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(readdirSync(dailyDir).filter(f => f.endsWith('.json')).length, 1, '同日重跑不得新增快照文件');

    r = run('apps/market/engine/scripts/render-market-icons.mjs');
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(path.join(dir, 'reports', 'daily', date, 'market-icons.html'), 'utf8');
    assert.ok(html.includes(date), '渲染结果必须带当日日期');
    for (const n of ['甲', '乙', '丙']) assert.ok(html.includes(n), `台账应含 ${n}`);
    assert.ok(html.includes('D-2'), '开服前应显示距开服倒计时（09-16 距 09-18 为 D-2）');
    assert.ok(html.includes('距 FC27 开服（2026-09-18）'), '开服前应显示开服日锚点');
    assert.ok(html.includes('93/94/91/94/58/74'), '台账应展示六维');
    assert.ok(html.includes('class="up"') || html.includes('class="dn"'), '已有平台有效价时应计算涨跌列');

    // 分支：全部卡无平台有效价（FUTBIN 只返回占位值）→ 必须记 listing-estimate，且不得计算涨跌
    writeFileSync(path.join(iconsRoot, 'data', 'prices', 'fc27', 'pricerange', 'latest.json'), JSON.stringify({
      date: '2026-09-15', collectedAt: '2026-09-15T10:00:00.000Z', cards: [
        { id: '1', current: { console: 0, pc: 0 }, priceRange: { min: 1000, max: 100000 }, ok: true },
        { id: '2', current: { console: 88, pc: 95 }, priceRange: { min: 1000, max: 10000 }, ok: true },
        { id: '3', current: { console: 0, pc: 0 }, priceRange: { min: 1000, max: 20000 }, ok: true },
      ],
    }));
    writeFileSync(path.join(iconsRoot, 'data', 'prices', 'fc27', 'base-icons.json'), JSON.stringify({
      generatedAt: '2026-09-15T02:59:17.669Z', source: 'futbin', launchDate: '2026-09-18',
      players: [
        { id: '1', slug: 'jia', name: 'jia', nameZh: '甲', rating: 95, currentPrice: null, marketUrl: 'https://example.com/1' },
        { id: '2', slug: 'yi', name: 'yi', nameZh: '乙', rating: 88, currentPrice: 88, marketUrl: 'https://example.com/2' },
        { id: '3', slug: 'bing', name: 'bing', nameZh: '丙', rating: 89, currentPrice: null, marketUrl: 'https://example.com/3' },
      ],
    }));
    r = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/record-icons-daily.mjs'), '2026-09-15'], { env, encoding: 'utf8', timeout: 30000 });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const snap0 = JSON.parse(readFileSync(path.join(dailyDir, '2026-09-15.json'), 'utf8'));
    assert.equal(snap0.priceBasis, 'listing-estimate', '全部卡无 ≥1000 平台价时必须记 listing-estimate');
    const r0 = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/render-market-icons.mjs'), '2026-09-15'], { env, encoding: 'utf8', timeout: 30000 });
    assert.equal(r0.status, 0, r0.stderr);
    const html0 = readFileSync(path.join(dir, 'reports', 'daily', '2026-09-15', 'market-icons.html'), 'utf8');
    assert.ok(html0.includes('PRE-LAUNCH'), '全占位价时应标 PRE-LAUNCH');
    assert.ok(!html0.includes('class="up"') && !html0.includes('class="dn"'), '占位价口径下不得计算日环比与累计涨跌');

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
    platform: 'cross', launchDate: '2026-09-18', capturedAt: `${date}T03:00:00+08:00`,
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

test('统一 current.json 按 cardId 合并多来源且旧观测不能覆盖新价', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-current-market-'));
  const date = '2026-09-17';
  const marketDir = path.join(dir, 'automation', 'runs', date, 'market');
  const popularDir = path.join(dir, 'apps', 'market', 'engine', 'data', 'prices', 'fc27', 'popular');
  const iconDir = path.join(dir, 'apps', 'market', 'engine', 'icons', 'data', 'prices', 'fc27', 'pricerange');
  mkdirSync(marketDir, { recursive: true });
  mkdirSync(popularDir, { recursive: true });
  mkdirSync(iconDir, { recursive: true });
  writeFileSync(path.join(marketDir, 'market.json'), JSON.stringify({
    date, dataCutoff: '2026-09-17T03:00:00+08:00',
    players: [{ name: '甲', url: 'https://www.futbin.com/27/player/1/jia', psPrice: 1000, pcPrice: 1100 }],
  }));
  writeFileSync(path.join(popularDir, 'latest.json'), JSON.stringify({
    date, collectedAt: '2026-09-17T04:00:00+08:00',
    cards: [
      { name: '甲', url: 'https://www.futbin.com/27/player/1/jia', psPrice: 2000, pcPrice: 2100, popularity: 9 },
      { name: '乙', url: 'https://www.futbin.com/27/player/2/yi', psPrice: 3000, pcPrice: 3100, popularity: 8 },
    ],
  }));
  writeFileSync(path.join(iconDir, 'latest.json'), JSON.stringify({
    date, collectedAt: '2026-09-17T05:00:00+08:00',
    cards: [{ id: '3', slug: 'bing', name: '丙', ok: true, current: { console: 4000, pc: 4100 }, priceRange: { min: 1000, max: 5000 } }],
  }));
  const env = { ...process.env, FC_PROJECT_ROOT: dir };
  const run = () => spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/sync-current-market.mjs'), date], { env, encoding: 'utf8', timeout: 30000 });
  try {
    let r = run();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const currentPath = path.join(dir, 'apps', 'market', 'engine', 'data', 'prices', 'fc27', 'current.json');
    let current = JSON.parse(readFileSync(currentPath, 'utf8'));
    assert.equal(Object.keys(current.cards).length, 3);
    assert.equal(current.cards['1'].platforms.console.price, 2000, '较新的每小时观测应覆盖日更价格');
    assert.equal(current.cards['3'].priceRange.max, 5000, '传奇卡级区间应进入同一行情源');
    assert.ok(existsSync(path.join(dir, 'reports', 'daily', date, 'assets', 'data', 'current.json')));
    assert.ok(existsSync(path.join(dir, 'daily-merged', 'assets', 'data', 'current.json')));

    const popular = JSON.parse(readFileSync(path.join(popularDir, 'latest.json'), 'utf8'));
    popular.collectedAt = '2026-09-17T02:00:00+08:00';
    popular.cards[0].psPrice = 900;
    writeFileSync(path.join(popularDir, 'latest.json'), JSON.stringify(popular));
    r = run();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    current = JSON.parse(readFileSync(currentPath, 'utf8'));
    assert.equal(current.cards['1'].platforms.console.price, 2000, '旧观测不得回退已写入的新价格');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('关注列表只用 current.json 作为当前值，观测序列只提供历史比较点', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-watch-current-'));
  const date = '2026-09-17';
  const runDir = path.join(dir, 'automation', 'runs', date, 'market');
  const priceRoot = path.join(dir, 'apps', 'market', 'engine', 'data', 'prices', 'fc27');
  mkdirSync(runDir, { recursive: true });
  mkdirSync(path.join(priceRoot, 'evolutions'), { recursive: true });
  const url = 'https://www.futbin.com/27/player/1/jia';
  writeFileSync(path.join(runDir, 'market.json'), JSON.stringify({
    date, players: [{ url, name: '甲', nameZh: '甲', rating: 80, pos: 'ST', psPrice: 99999, pcPrice: 99999 }],
  }));
  // 价格观测序列夹具：用真实写入器落 series/popular.json，避免夹具与序列 schema 漂移
  const seriesFile = seriesPathFor(priceRoot, 'popular');
  const entries = (h, ps, pc, pop) => [{
    key: url,
    static: { url, name: '甲', rating: 80, pos: 'ST' },
    price: { h: `${date}T${h}`, ps, pc, pop, min: Math.min(ps, pc), max: Math.max(ps, pc) },
  }];
  appendSeries(seriesFile, {
    meta: { scope: 'popular', game: 'fc27', platform: 'console+pc', minValidPrice: 1000 },
    point: { hour: `${date}T18`, date, at: `${date}T10:00:00.000Z`, counts: { total: 1 } },
    entries: entries('18', 2000, 3000, 5),
  });
  appendSeries(seriesFile, {
    point: { hour: `${date}T19`, date, at: `${date}T11:00:00.000Z`, counts: { total: 1 } },
    entries: entries('19', 1000, 1000, 6),
  });
  writeFileSync(path.join(priceRoot, 'current.json'), JSON.stringify({
    schemaVersion: 1, game: 'fc27', generatedAt: '2026-09-17T11:00:00Z', cards: {
      '1': { cardId: '1', popularity: 9, popularityObservedAt: '2026-09-17T11:00:00Z', platforms: {
        console: { price: 5000, valid: true, observedAt: '2026-09-17T11:00:00Z' },
        pc: { price: 6000, valid: true, observedAt: '2026-09-17T11:00:00Z' },
      } },
    },
  }));
  try {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'apps/market/engine/scripts/build-market-watchlist.mjs'), date], {
      env: { ...process.env, FC_PROJECT_ROOT: dir }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const watch = JSON.parse(readFileSync(path.join(runDir, 'watchlist.json'), 'utf8'));
    assert.equal(watch.universe.psValid, 1);
    assert.equal(watch.universe.pcValid, 1);
    assert.equal(watch.source.currentMarket, 'apps/market/engine/data/prices/fc27/current.json');
    const row = watch.lists.watch[0];
    assert.equal(row.popularity, 9, '当前热度必须来自 current.json，而不是逐小时末值');
    assert.ok(row.intradayChange.some(move => move.platform === 'console' && move.now === 5000), '变化的当前端必须来自 current.json');
    assert.ok(!Object.hasOwn(row, 'psPrice') && !Object.hasOwn(row, 'pcPrice') && !Object.hasOwn(row, 'refPrice'), 'watchlist 不得保存当前价格副本');
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

test('市场概览不再固化平台价，页面运行时读取统一 current.json', async () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const date = '2026-09-12';
  const cases = [
    { name: 'both-ready', ps: 500000, pc: 480000 },
    { name: 'one-sided', ps: 500000, pc: 0 },
    { name: 'all-zero', ps: 0, pc: 0 },
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
      assert.match(html, /正在读取统一行情 current\.json/, `${c.name}：必须明确运行时行情源`);
      assert.ok(html.includes("fetch(currentUrl(),{cache:'no-store'})"), `${c.name}：页面必须禁用缓存读取 current.json`);
      assert.ok(!html.includes('<b class="plat-warn">'), `${c.name}：不得按生成时的价格副本固化平台告警`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('市场扫描页只嵌入静态球员字段，双平台价按 cardId 读取 current.json', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-market-scan-'));
  const date = '2026-09-12';
  const runDir = path.join(dir, 'automation', 'runs', date, 'market');
  mkdirSync(runDir, { recursive: true });
  // 只给 market.json（无独立 players.json），验证球员库回退不再为空表
  const data = {
    date, status: 'partial', priceBasis: 'listing-estimate',
    players: [
      { name: '测试球员', nameZh: '测试', rating: 88, pos: 'ST', price: 60000, priceValid: true, psPrice: 75000, pcPrice: 68000, popularity: 5, evo: '非进化池', url: 'https://www.futbin.com/27/player/123/test' },
      { name: '无平台价球员', rating: 85, pos: 'GK', price: 900, priceValid: false, psPrice: 0, pcPrice: 0, url: 'https://www.futbin.com/27/player/456/empty' },
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
    assert.equal(db.length, 2, '球员静态名单应从 market.json 加载，不得为空');
    assert.equal(db[0].cardId, '123', '页面关联键必须是稳定 cardId');
    assert.equal(db[0].cPrice, 0, '不得把 market.json 的 Console 价格副本嵌入页面');
    assert.equal(db[0].pPrice, 0, '不得把 market.json 的 PC 价格副本嵌入页面');
    assert.ok(html.includes("fetch(currentUrl(), {cache:'no-store'})"), '页面必须运行时读取 current.json');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('市场扫描排除英雄/传奇/活动卡，价格分 6 档且无价卡按最高价（2026-09-20 用户口径）', () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const dir = mkdtempSync(path.join(tmpdir(), 'fc-market-scan-exclusions-'));
  const date = '2026-09-12';
  const runDir = path.join(dir, 'automation', 'runs', date, 'market');
  const exclusionDir = path.join(dir, 'apps', 'market', 'engine', 'data', 'players', 'fc27');
  mkdirSync(runDir, { recursive: true });
  mkdirSync(exclusionDir, { recursive: true });
  // 清单判据：隔离目录里的 scan-exclusions.json 必须被读到
  writeFileSync(path.join(exclusionDir, 'scan-exclusions.json'), JSON.stringify({
    schemaVersion: 1,
    excludedVersionPatterns: ['base_hero', 'hall_of_fut'],
    cards: [{ cardId: '789', name: 'Hall of FUT 卡', rating: 85, series: 'Hall of FUT' }],
  }));
  const data = {
    date, status: 'partial', priceBasis: 'partial-live',
    players: [
      { name: '普通卡', rating: 88, pos: 'ST', price: 60000, priceValid: true, psPrice: 75000, pcPrice: 68000, popularity: 5, evo: '非进化池', url: 'https://www.futbin.com/27/player/123/plain' },
      { name: '英雄卡', rating: 87, pos: 'CAM', price: 0, priceValid: false, psPrice: 0, pcPrice: 0, popularity: 4, evo: '非进化池', cardVersion: '72_base_hero', url: 'https://www.futbin.com/27/player/21632/nakata' },
      { name: '清单里的活动卡', rating: 85, pos: 'CB', price: 0, priceValid: false, psPrice: 0, pcPrice: 0, popularity: 3, evo: '非进化池', url: 'https://www.futbin.com/27/player/789/legacy' },
      { name: '无价普通卡', rating: 80, pos: 'GK', price: 0, priceValid: false, psPrice: 0, pcPrice: 0, popularity: 2, evo: '非进化池', url: 'https://www.futbin.com/27/player/456/noquote' },
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
    const db = JSON.parse(html.match(/id="db-data">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
    // ① 排除：版本判据（base_hero）与清单判据（cardId 789）都必须生效，普通卡不受牵连
    assert.equal(db.length, 2, '英雄卡与清单内活动卡都必须被排除，只留两张普通卡');
    assert.deepEqual(db.map(x => x.cardId).sort(), ['123', '456'], '排除后应只剩普通卡 123 与 456');
    assert.ok(html.includes('已排除英雄/传奇/活动卡 2 张'), '页头必须如实标出排除张数');
    // ② 六档：档位名齐备且旧档位名不得残留
    for (const label of ['1 万以下', '1 ~ 5 万', '5 ~ 10 万', '10 ~ 50 万', '50 ~ 100 万', '100 万以上']) {
      assert.ok(html.includes(label), `缺少价格档位「${label}」`);
    }
    for (const stale of ['1万以上', '5000-1万', '5000以下']) {
      assert.ok(!html.includes(stale), `不得残留旧价格档位名「${stale}」`);
    }
    assert.ok(html.includes('data-set-price="100w+"'), '索引 chip 必须以档位 id 为键');
    assert.ok(html.includes('<option value="100w+">'), '价格筛选下拉必须以档位 id 为键');
    // ③ 无价卡按最高价：价格列以「≥」呈现并带「无价」标注，数值为标注过的占位值
    assert.ok(db.every(x => x.cPrice === 0 && x.pPrice === 0), '不得把 market.json 的价格副本嵌入页面');
    assert.ok(html.includes('无价·按最高价'), '无价卡必须有明确标注');
    assert.ok(html.includes("PRICE_CEIL_FLOOR = 1000000"), '前端必须持有最高价兜底下限常量');
    // ④ 价格索引首屏留空，由页面运行时重算
    assert.ok(html.includes('<b class="pv pv-console">—</b>'), '首屏价格计数必须留空，不得用估值兜底');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
