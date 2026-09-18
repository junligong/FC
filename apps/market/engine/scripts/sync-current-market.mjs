#!/usr/bin/env node
// 用途：用本地最新热门榜与传奇详情快照初始化或修复 FC27 唯一当前行情 current.json，不访问浏览器。
// 输入：当日 market.json、data/prices/fc27/popular/latest.json 与 icons/data/prices/fc27/pricerange/latest.json。
// 输出：data/prices/fc27/current.json，并同步 reports/daily/D 与 daily-merged 的网页运行时行情资源。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PROJECT_ROOT,
  cardIdFromUrl,
  mergeCurrentMarket,
  syncCurrentMarketAssets,
} from '../src/current-market.mjs';

const dateStr = process.argv[2] || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const marketPath = path.join(PROJECT_ROOT, 'automation', 'runs', dateStr, 'market', 'market.json');
const popularPath = path.join(PROJECT_ROOT, 'apps', 'market', 'engine', 'data', 'prices', 'fc27', 'popular', 'latest.json');
const iconPath = path.join(PROJECT_ROOT, 'apps', 'market', 'engine', 'icons', 'data', 'prices', 'fc27', 'pricerange', 'latest.json');
const readJSON = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;

let mergedSources = 0;
const market = readJSON(marketPath);
if (Array.isArray(market?.players) && market.players.length) {
  const records = market.players.map(card => ({
    cardId: cardIdFromUrl(card.url),
    slug: String(card.url || '').split('/').filter(Boolean).at(-1) || '',
    url: card.url,
    name: card.name,
    nameZh: card.nameZh,
    rating: card.rating,
    position: card.pos,
    cardType: card.cardType,
    platforms: { console: { price: card.psPrice }, pc: { price: card.pcPrice } },
    popularity: card.popularity,
  })).filter(card => card.cardId);
  await mergeCurrentMarket(records, {
    source: 'daily-market',
    observedAt: market.dataCutoff || market.generatedAt || `${dateStr}T00:00:00+08:00`,
    date: dateStr,
  });
  mergedSources++;
  console.log(`每日市场已合并：${records.length} 张`);
}

const popular = readJSON(popularPath);
if (Array.isArray(popular?.cards) && popular.cards.length) {
  const records = popular.cards.map(card => ({
    cardId: cardIdFromUrl(card.url),
    slug: String(card.url || '').split('/').filter(Boolean).at(-1) || '',
    url: card.url,
    name: card.name,
    rating: card.rating,
    position: card.pos,
    platforms: { console: { price: card.psPrice }, pc: { price: card.pcPrice } },
    popularity: card.popularity,
  })).filter(card => card.cardId);
  await mergeCurrentMarket(records, {
    source: 'futbin-popular',
    observedAt: popular.collectedAt,
    date: popular.date || dateStr,
  });
  mergedSources++;
  console.log(`热门榜已合并：${records.length} 张`);
}

const icons = readJSON(iconPath);
if (Array.isArray(icons?.cards) && icons.cards.length) {
  const records = icons.cards.filter(card => card.id && card.ok).map(card => ({
    cardId: card.id,
    slug: card.slug,
    url: card.marketUrl,
    name: card.name,
    nameZh: card.nameZh,
    rating: card.rating,
    cardType: 'icon',
    platforms: {
      console: { price: card.current?.console },
      pc: { price: card.current?.pc },
    },
    priceRange: card.priceRange,
  }));
  await mergeCurrentMarket(records, {
    source: 'futbin-icon-detail',
    observedAt: icons.collectedAt,
    date: icons.date || dateStr,
  });
  mergedSources++;
  console.log(`传奇详情已合并：${records.length} 张`);
}

if (!mergedSources) throw new Error('没有可合并的本地最新行情快照');
const targets = syncCurrentMarketAssets(dateStr);
console.log(`current.json 已同步：${targets.map(file => path.relative(PROJECT_ROOT, file)).join('、')}`);
