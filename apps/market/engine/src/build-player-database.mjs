#!/usr/bin/env node
// 作用：合并FC26与FC27球员数据，构建项目统一的本地球员数据库。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const write = (relative, value) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
};
const asArray = value => Array.isArray(value) ? value : value?.players || [];
const slugFromURL = value => String(value || '').match(/\/player\/\d+\/([^/?#]+)/)?.[1];
const idFromURL = value => String(value || '').match(/\/player\/(\d+)/)?.[1];
const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const index = asArray(read('data/players/player-index.json'));
const names = new Map(index.map(player => [player.slug, player]));
const fc27Cards = asArray(read('gold/data/players/fc27/fc27-gold-le83.json'));
const fc27Styles = asArray(read('gold/data/players/fc27/fc27-gold-playstyles.json'));
const fc27Prices = asArray(read('gold/data/prices/easysbc/fc27-gold-prices.json'));
const fc26Prices = asArray(read('gold/data/prices/fc26/fc26-first-month.json'));
const fc26Styles = asArray(read('gold/data/players/fc26/fc26-top200-playstyles.json'));

function createStore(game) {
  const records = new Map();
  return {
    merge(source, record) {
      const slug = record.slug || slugFromURL(record.url) || slugFromURL(record.playerUrl) || slugify(record.name);
      if (!slug) return;
      const previous = records.get(slug) || { game, slug, sources: [] };
      const clean = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ''));
      const sources = [...new Set([...(previous.sources || []), source])];
      records.set(slug, { ...previous, ...clean, game, slug, sources });
    },
    values() {
      return [...records.values()].sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.name).localeCompare(String(b.name), 'en'));
    },
  };
}

const fc27 = createStore('FC27');
for (const card of fc27Cards) {
  const slug = slugFromURL(card.playerUrl) || card.slug || slugify(card.name);
  const indexed = names.get(slug) || {};
  fc27.merge('fc27-card-database', {
    slug, resourceId: String(card.resourceId || ''), assetId: String(card.assetId || ''),
    name: card.name, nameZh: indexed.nameZh, rating: card.rating,
    positions: card.possiblePositions || card.positions || [card.preferredPosition].filter(Boolean),
    preferredPosition: card.preferredPosition, versionId: card.versionId,
    cardType: card.cardType || 'gold', tradeable: !card.untradeable,
    price: Number(card.price) || null, attributes: card.attributes,
    skillMoves: card.skillMoves, weakFoot: card.weakFoot, playerUrl: card.playerUrl,
  });
}
for (const card of fc27Styles) {
  const indexed = names.get(card.slug) || {};
  fc27.merge('fc27-playstyles', {
    slug: card.slug, name: card.name, nameZh: card.nameZh || indexed.nameZh,
    rating: card.ovr, positions: [card.position, ...(card.altPos || [])].filter(Boolean),
    attributes: card.six, playstyles: card.playstyles, skillMoves: card.skills,
    weakFoot: card.weakFoot, height: card.height, playerUrl: card.url,
    resourceId: idFromURL(card.url),
  });
}
for (const card of fc27Prices) {
  const indexed = names.get(card.slug) || {};
  fc27.merge('fc27-price-reference', {
    slug: card.slug, name: card.name, nameZh: indexed.nameZh, rating: card.ovr,
    positions: card.positions, resourceId: String(card.resourceId || ''),
    referencePrice: Number(card.price) || null, launchReferencePrice: Number(card.launchPrice) || null,
    priceSource: card.priceSource,
  });
}

const fc26 = createStore('FC26');
for (const player of index) {
  fc26.merge('cross-year-index', {
    slug: player.slug, name: player.name, nameZh: player.nameZh,
    resourceId: idFromURL(player.fc26Url), playerUrl: player.fc26Url,
  });
}
for (const card of fc26Styles) {
  const indexed = names.get(card.slug) || {};
  fc26.merge('fc26-playstyles', {
    slug: card.slug, name: card.name, nameZh: card.nameZh || indexed.nameZh,
    rating: card.ovr, positions: [card.position, ...(card.altPos || [])].filter(Boolean),
    attributes: card.six, playstyles: card.playstyles, skillMoves: card.skills,
    weakFoot: card.weakFoot, height: card.height, playerUrl: card.url,
    resourceId: idFromURL(card.url),
  });
}
for (const player of fc26Prices) {
  const cross = player.prices?.cross || {};
  const dates = Object.keys(cross).sort();
  fc26.merge('fc26-first-month-prices', {
    slug: player.slug, name: player.name, nameZh: player.nameZh,
    playerUrl: player.fc26Url, resourceId: idFromURL(player.fc26Url),
    positions: [player.fc27Position].filter(Boolean),
    priceHistory: { platform: 'cross', from: dates[0], to: dates.at(-1), samples: dates.length,
      first: cross[dates[0]] ?? null, last: cross[dates.at(-1)] ?? null },
  });
}

const generatedAt = new Date().toISOString();
const fc26Records = fc26.values();
const fc27Records = fc27.values();
write('data/players/database/fc26.json', { schemaVersion: 1, generatedAt, game: 'FC26', count: fc26Records.length, players: fc26Records });
write('data/players/database/fc27.json', { schemaVersion: 1, generatedAt, game: 'FC27', count: fc27Records.length, players: fc27Records });
write('data/players/database/manifest.json', {
  schemaVersion: 1, generatedAt,
  counts: { fc26: fc26Records.length, fc27: fc27Records.length },
  uniqueness: 'game + slug',
  sort: 'rating desc, name asc',
  authoritativeSources: [
    'data/players/player-index.json',
    'gold/data/players/fc26',
    'gold/data/players/fc27',
    'gold/data/prices/fc26',
    'gold/data/prices/easysbc/fc27-gold-prices.json'
  ]
});
console.log(JSON.stringify({ generatedAt, fc26: fc26Records.length, fc27: fc27Records.length }));
