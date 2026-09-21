// 作用：验证价格序列存储层（series/*.json）的序列化往返、追加语义与旧形状还原。
// 这层是「静态字段只存一次 + 卡下挂 price[] 观测行」重构的地基，任何字段语义变化都要先改这里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SERIES_SCHEMA_VERSION, appendSeries, dailyFrom, latestPoint, pointsOf, readSeries,
  serializeSeries, seriesPathFor, snapshotFrom,
} from '../src/price-series.mjs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'price-series-'));

const mkSeries = () => ({
  schemaVersion: SERIES_SCHEMA_VERSION,
  scope: 'popular',
  game: 'fc27',
  platform: 'console+pc',
  minValidPrice: 1000,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T08:00:00.000Z',
  points: [
    { hour: '2026-09-20T15', date: '2026-09-20', at: '2026-09-20T07:00:00.000Z', priceBasis: 'partial-live', attempts: 1, counts: { total: 2, psValid: 2, pcValid: 1, bothValid: 1, withPopularity: 2 } },
    { hour: '2026-09-20T16', date: '2026-09-20', at: '2026-09-20T08:00:00.000Z', priceBasis: 'partial-live', attempts: 1, counts: { total: 2, psValid: 2, pcValid: 2, bothValid: 2, withPopularity: 2 } },
  ],
  cards: {
    'https://www.futbin.com/27/player/111/rio-ngumoha': {
      url: 'https://www.futbin.com/27/player/111/rio-ngumoha',
      name: 'Ngumoha', rating: 75, pos: 'LM', evoName: null, cardVersion: null, scoreRaw: null,
      stats: { PAC: 90, SHO: 71, PAS: 68, DRI: 79, DEF: 37, PHY: 49 },
      price: [
        { h: '2026-09-20T15', ps: 2700, pc: 0, pop: 450, min: 2700, max: 2700 },
        { h: '2026-09-20T16', ps: 2700, pc: 2500, pop: 457, min: 2500, max: 2700 },
      ],
    },
    'https://www.futbin.com/27/player/21632/nakata': {
      url: 'https://www.futbin.com/27/player/21632/nakata',
      name: 'Nakata', rating: 87, pos: 'CAM', evoName: null, cardVersion: '72_base_hero', scoreRaw: null,
      price: [{ h: '2026-09-20T16', ps: 61000, pc: 58000, pop: 4, min: 58000, max: 61000 }],
    },
  },
});

test('serializeSeries 往返深等（含 stats、多行 price、无 stats 的卡）', () => {
  const s = mkSeries();
  assert.deepEqual(JSON.parse(serializeSeries(s)), s);
});

test('serializeSeries 处理空 cards / 无 price 的卡 / 空 stats', () => {
  for (const cards of [{}, { a: { name: 'A' } }, { a: { name: 'A', price: [] } }, { a: { price: [{ h: 'x' }] } }]) {
    const s = { schemaVersion: 2, scope: 't', points: [], cards };
    assert.deepEqual(JSON.parse(serializeSeries(s)), s);
  }
});

test('serializeSeries 一行一个观测点，且显著小于 pretty-print', () => {
  const s = mkSeries();
  const text = serializeSeries(s);
  // 每个观测点独立成行：可 grep「哪个小时」也可 diff 单次观测
  assert.ok(text.includes('      {"h":"2026-09-20T15"'));
  assert.equal(text.split('\n').filter(l => l.trimStart().startsWith('{"h":')).length, 3);

  // 规模化比较：200 卡 × 24 小时，混合缩进应比 indent=2 的 pretty-print 省 30% 以上
  const big = { schemaVersion: 2, scope: 'popular', points: [], cards: {} };
  for (let i = 0; i < 200; i++) {
    const price = [];
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      price.push({ h: `2026-09-20T${hh}`, ps: 12345 + i, pc: 12000 + i, pop: 400 + i, min: 12000 + i, max: 12345 + i });
    }
    big.cards[`https://www.futbin.com/27/player/${1000 + i}/player-${i}`] = {
      url: `https://www.futbin.com/27/player/${1000 + i}/player-${i}`, name: `Player ${i}`, rating: 80, pos: 'ST',
      evoName: null, cardVersion: null, scoreRaw: null,
      stats: { PAC: 90, SHO: 80, PAS: 70, DRI: 75, DEF: 40, PHY: 60 }, price,
    };
  }
  const hybrid = serializeSeries(big).length;
  const pretty = JSON.stringify(big, null, 2).length;
  assert.ok(hybrid < pretty * 0.7, `混合缩进 ${hybrid} 应显著小于 pretty-print ${pretty}`);
});

test('appendSeries 同小时覆盖、跨小时排序、静态字段 undefined 不覆盖', () => {
  const dir = tmp();
  const file = path.join(dir, 'popular.json');
  appendSeries(file, {
    meta: { scope: 'popular', game: 'fc27', minValidPrice: 1000 },
    point: { hour: '2026-09-20T17', date: '2026-09-20', at: '2026-09-20T09:00:00.000Z', counts: { total: 1 } },
    entries: [{ key: 'k1', static: { name: 'A', rating: 80 }, price: { h: '2026-09-20T17', ps: 100, pc: 0, pop: 1, min: 100, max: 100 } }],
  });
  appendSeries(file, {
    point: { hour: '2026-09-20T16', date: '2026-09-20', at: '2026-09-20T08:00:00.000Z', counts: { total: 1 } },
    entries: [{ key: 'k1', static: { rating: undefined, pos: 'ST' }, price: { h: '2026-09-20T16', ps: 90, pc: 0, pop: 2, min: 90, max: 90 } }],
  });
  appendSeries(file, {
    entries: [{ key: 'k1', static: {}, price: { h: '2026-09-20T17', ps: 110, pc: 0, pop: 3, min: 110, max: 110 } }],
  });
  const s = readSeries(file);
  assert.deepEqual(s.points.map(p => p.hour), ['2026-09-20T16', '2026-09-20T17']);
  // 精确采集时间只在观测点上，不逐行重复
  assert.equal(s.points[1].at, '2026-09-20T09:00:00.000Z');
  assert.equal(s.cards.k1.name, 'A');
  assert.equal(s.cards.k1.rating, 80);          // undefined 回写不得抹掉旧值
  assert.equal(s.cards.k1.pos, 'ST');
  assert.deepEqual(s.cards.k1.price.map(r => r.h), ['2026-09-20T16', '2026-09-20T17']);
  assert.equal(s.cards.k1.price[1].ps, 110);    // 同小时覆盖为最新一次
  assert.equal('at' in s.cards.k1.price[1], false);
});

test('appendSeries 首次创建时给出 schemaVersion 与 createdAt', () => {
  const dir = tmp();
  const file = seriesPathFor(dir, 'popular');
  const s = appendSeries(file, { meta: { scope: 'popular' }, point: { hour: '2026-09-20T16', date: '2026-09-20' }, entries: [] });
  assert.equal(s.schemaVersion, SERIES_SCHEMA_VERSION);
  assert.ok(typeof s.createdAt === 'string');
  assert.ok(statSync(file).size > 0);
});

test('appendSeries 单卡行数上限只从最旧一端裁剪', () => {
  const dir = tmp();
  const file = path.join(dir, 'p.json');
  for (const hh of ['14', '15', '16']) {
    appendSeries(file, {
      point: { hour: `2026-09-20T${hh}`, date: '2026-09-20' },
      entries: [{ key: 'k', static: {}, price: { h: `2026-09-20T${hh}`, ps: 1, pc: 0, pop: 1, min: 1, max: 1 } }],
      maxRowsPerCard: 2,
    });
  }
  assert.deepEqual(readSeries(file).cards.k.price.map(r => r.h), ['2026-09-20T15', '2026-09-20T16']);
});

test('latestPoint / pointsOf 按日期切片', () => {
  const s = mkSeries();
  assert.equal(latestPoint(s).hour, '2026-09-20T16');
  assert.equal(latestPoint(s, '2026-09-19'), null);
  assert.equal(pointsOf(s, '2026-09-20').length, 2);
});

test('snapshotFrom 还原采集器快照形状（含计数与卡字段名）', () => {
  const s = mkSeries();
  const snap = snapshotFrom(s, { date: '2026-09-20' });
  assert.equal(snap.hour, '2026-09-20T16');
  assert.equal(snap.collectedAt, '2026-09-20T08:00:00.000Z');
  assert.equal(snap.priceBasis, 'partial-live');
  assert.equal(snap.counts.total, 2);
  const first = snap.cards.find(c => c.name === 'Ngumoha');
  assert.equal(first.psPrice, 2700);
  assert.equal(first.pcPrice, 2500);
  assert.equal(first.popularity, 457);
  assert.deepEqual(first.stats, { PAC: 90, SHO: 71, PAS: 68, DRI: 79, DEF: 37, PHY: 49 });
  assert.equal(first.scoreRaw, null);
  assert.equal('price' in first, false);
  // 只有该小时有观测的卡才出现在快照里
  assert.equal(snapshotFrom(s, { date: '2026-09-19' }), null);
});

test('snapshotFrom 支持进化榜形状（无价格，只有热度）', () => {
  const s = mkSeries();
  const snap = snapshotFrom(s, { date: '2026-09-20', withPrice: false, shape: 'evolution' });
  const c = snap.cards.find(x => x.name === 'Nakata');
  assert.equal(c.popularity, 4);
  assert.equal('psPrice' in c, false);
});

test('dailyFrom 还原旧 popular/daily/<D>.json 形状（ps/pc/pop 三序列，h 为两位小时）', () => {
  const s = mkSeries();
  const d = dailyFrom(s, '2026-09-20');
  assert.equal(d.points.length, 2);
  // 旧契约的 hour/h 只有两位小时（消费方把它当 fromHour 展示），适配器负责从 series 的 YYYY-MM-DDTHH 截断
  assert.deepEqual(d.points.map(p => p.hour), ['15', '16']);
  assert.equal(d.points[1].collectedAt, '2026-09-20T08:00:00.000Z');
  const e = d.cards['https://www.futbin.com/27/player/111/rio-ngumoha'];
  assert.equal(e.name, 'Ngumoha');
  assert.equal(e.rating, 75);
  // pc 在 15 点无有效价（0）→ 0 是合法观测值，必须保留为一行，交由消费方按 >=1000 判有效
  assert.deepEqual(e.ps, [{ h: '15', v: 2700 }, { h: '16', v: 2700 }]);
  assert.deepEqual(e.pc, [{ h: '15', v: 0 }, { h: '16', v: 2500 }]);
  assert.deepEqual(e.pop, [{ h: '15', v: 450 }, { h: '16', v: 457 }]);
  assert.equal(dailyFrom(s, '2026-09-19'), null);
});

test('序列文件落盘后可被 readSeries 读回，且行数 = 观测点行数', () => {
  const dir = tmp();
  const file = path.join(dir, 'popular.json');
  const s = mkSeries();
  writeFileSync(file, serializeSeries(s));
  const back = readSeries(file);
  assert.deepEqual(back, s);
  const lines = readFileSync(file, 'utf8').split('\n');
  assert.equal(lines.filter(l => l.trimStart().startsWith('{"h":')).length, 3);
});
