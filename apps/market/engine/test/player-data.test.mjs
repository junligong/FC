// 作用：验证统一球员数据库与开服周价格仓库的查询行为。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchWeekPriceRepository, createPlayerRepository } from '../src/player-data.mjs';

const document = {
  players: [
    {
      slug: 'alexia-putellas-segura',
      name: 'Alexia Putellas Segura',
      fc27Url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura',
      fc26Url: 'https://www.futbin.com/26/player/105/alexia-putellas-segura',
      sourceGroups: ['forward', 'midfield'],
      excludedFromGroups: ['midfield'],
    },
    {
      slug: 'willian-pacho',
      name: 'Willian Pacho',
      fc27Url: 'https://www.futbin.com/27/player/25/willian-pacho',
      fc26Url: null,
      sourceGroups: ['defender'],
      excludedFromGroups: [],
    },
  ],
};

test('finds reusable player records by slug or normalized name', () => {
  const players = createPlayerRepository(document);
  assert.equal(players.get('alexia-putellas-segura').name, 'Alexia Putellas Segura');
  assert.equal(players.get('Álexia Putellas Segura').slug, 'alexia-putellas-segura');
  assert.equal(players.has('missing-player'), false);
});

test('lists active group members and supports matched filtering', () => {
  const players = createPlayerRepository(document);
  assert.deepEqual(players.listByGroup('midfield'), []);
  assert.equal(players.listByGroup('midfield', { includeExcluded: true }).length, 1);
  assert.deepEqual(players.listByGroup('defender', { matched: false }).map((player) => player.slug), ['willian-pacho']);
  assert.deepEqual(players.stats(), {
    total: 2,
    withFc26: 1,
    forward: 1,
    midfield: 0,
    defender: 1,
  });
});

test('queries FC26 launch-week prices by player and group', () => {
  const prices = createLaunchWeekPriceRepository({
    game: 'FC26',
    counts: { requested: 1, captured: 1, missing: 0, completeCross: 1, completePc: 1 },
    players: [{
      slug: 'alexia-putellas-segura',
      name: 'Alexia Putellas Segura',
      sourceGroups: ['forward', 'midfield'],
      prices: { cross: { '2025-09-18': 658472 }, pc: { '2025-09-18': 833803 } },
      metrics: { cross: { changePct: -0.1816 }, pc: { changePct: -0.2900 } },
    }],
  });

  assert.equal(prices.get('Álexia Putellas Segura').prices.cross['2025-09-18'], 658472);
  assert.equal(prices.listByGroup('midfield').length, 1);
  assert.equal(prices.has('missing-player'), false);
  assert.deepEqual(prices.stats(), {
    requested: 1,
    captured: 1,
    missing: 0,
    completeCross: 1,
    completePc: 1,
  });
});
