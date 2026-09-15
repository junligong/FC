// 作用：验证市场引擎的参数、配置、球员匹配与数据合并核心逻辑。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchPlayers,
  mergePlayerCatalog,
  mergeConfig,
  normalizeSlug,
  parseCliArgs,
  partitionNewPlayers,
  slugFromPlayerUrl,
  uniquePlayers,
} from '../src/core.mjs';

test('normalizes FUTBIN player slugs and URLs', () => {
  assert.equal(normalizeSlug('Álexia Putellas Segura'), 'alexia-putellas-segura');
  assert.equal(
    slugFromPlayerUrl('https://www.futbin.com/26/player/105/alexia-putellas-segura?foo=1'),
    'alexia-putellas-segura',
  );
});

test('deduplicates player cards with the same slug', () => {
  const players = uniquePlayers([
    { url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura', name: 'Alexia Putellas' },
    { url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura', name: 'Duplicate' },
  ]);
  assert.equal(players.length, 1);
  assert.equal(players[0].name, 'Alexia Putellas');
});

test('removes midfield players that already exist in the forward list', () => {
  const forward = [
    { url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura', name: 'Alexia Putellas' },
  ];
  const midfield = [
    { url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura', name: 'Alexia Putellas' },
    { url: 'https://www.futbin.com/27/player/6/aitana-bonmati-conca', name: 'Aitana Bonmati Conca' },
  ];
  const result = partitionNewPlayers(midfield, forward);
  assert.deepEqual(result.included.map((player) => player.slug), ['aitana-bonmati-conca']);
  assert.equal(result.duplicates[0].duplicateOf, 'alexia-putellas-segura');
});

test('removes defenders already present in either forward or midfield lists', () => {
  const previous = [
    { url: 'https://www.futbin.com/27/player/10/wing-back', name: 'Wing Back' },
    { url: 'https://www.futbin.com/27/player/11/holding-midfielder', name: 'Holding Midfielder' },
  ];
  const defenders = [
    { url: 'https://www.futbin.com/27/player/11/holding-midfielder', name: 'Holding Midfielder' },
    { url: 'https://www.futbin.com/27/player/12/centre-back', name: 'Centre Back' },
  ];
  const result = partitionNewPlayers(defenders, previous);
  assert.deepEqual(result.included.map((player) => player.slug), ['centre-back']);
  assert.equal(result.duplicates[0].duplicateOf, 'holding-midfielder');
});

test('merges player links and position ranks into a reusable catalog', () => {
  const players = mergePlayerCatalog([
    {
      slug: 'alexia-putellas-segura',
      name: 'Alexia Putellas',
      fc27Url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura',
      sourceGroups: ['forward'],
      rankByGroup: { forward: 2 },
    },
  ], [
    {
      slug: 'alexia-putellas-segura',
      name: 'Alexia Putellas',
      fc26Url: 'https://www.futbin.com/26/player/105/alexia-putellas-segura',
      sourceGroups: ['midfield'],
      excludedFromGroups: ['midfield'],
      rankByGroup: { midfield: 1 },
    },
  ]);
  assert.equal(players.length, 1);
  assert.deepEqual(players[0].sourceGroups, ['forward', 'midfield']);
  assert.deepEqual(players[0].rankByGroup, { forward: 2, midfield: 1 });
  assert.equal(players[0].fc26Url, 'https://www.futbin.com/26/player/105/alexia-putellas-segura');
});

test('falls back from FC26 forward list to the full gold index', () => {
  const fc27 = [{
    url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura',
    name: 'Alexia Putellas Segura',
  }];
  const fc26All = [{
    url: 'https://www.futbin.com/26/player/105/alexia-putellas-segura',
    name: 'Alexia Putellas Segura',
  }];
  const [match] = matchPlayers(fc27, [], fc26All, {});
  assert.equal(match.matchedBy, 'all-gold-slug');
  assert.equal(match.fc26.url, fc26All[0].url);
});

test('explicit override wins over list matches', () => {
  const fc27 = [{ url: 'https://www.futbin.com/27/player/5/alexia-putellas-segura' }];
  const forward = [{ url: 'https://www.futbin.com/26/player/999/alexia-putellas-segura' }];
  const [match] = matchPlayers(fc27, forward, [], {
    'alexia-putellas-segura': 'https://www.futbin.com/26/player/105/alexia-putellas-segura',
  });
  assert.equal(match.matchedBy, 'override');
  assert.equal(match.fc26.url, 'https://www.futbin.com/26/player/105/alexia-putellas-segura');
});

test('parses filtering and execution flags', () => {
  const parsed = parseCliArgs(['--group', 'defender', '--list-limit', '100', '--only', 'Alexia Putellas Segura,Sam-Kerr', '--limit', '2', '--headless', '--force', '--verify-only', '--background']);
  assert.equal(parsed.group, 'defender');
  assert.equal(parsed.listLimit, 100);
  assert.deepEqual(parsed.only, ['alexia-putellas-segura', 'sam-kerr']);
  assert.equal(parsed.limit, 2);
  assert.equal(parsed.headless, true);
  assert.equal(parsed.force, true);
  assert.equal(parsed.verifyOnly, true);
  assert.equal(parsed.background, true);
});

test('merges nested viewport and overrides', () => {
  const merged = mergeConfig(
    { viewport: { width: 100, height: 200 }, overrides: { a: 'one' } },
    { viewport: { width: 300 }, overrides: { b: 'two' } },
  );
  assert.deepEqual(merged.viewport, { width: 300, height: 200 });
  assert.deepEqual(merged.overrides, { a: 'one', b: 'two' });
});
