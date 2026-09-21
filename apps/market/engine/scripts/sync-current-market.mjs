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
// 五类台账（2026-09-20 重构新增）：周黑 / 活动卡 / 英雄卡 / 83+ 池
const totwPath = path.join(PROJECT_ROOT, 'apps', 'market', 'engine', 'totw', 'data', 'players', 'fc27', 'totw-current.json');
const activityPath = path.join(PROJECT_ROOT, 'apps', 'market', 'engine', 'promo', 'data', 'players', 'fc27', 'activity-current.json');
const heroesPath = path.join(PROJECT_ROOT, 'apps', 'market', 'engine', 'heroes', 'data', 'prices', 'fc27', 'base-heroes.json');
const r83Path = path.join(PROJECT_ROOT, 'apps', 'market', 'engine', 'promo', 'data', 'players', 'fc27', 'rating83plus.json');
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

// 五类台账价格合并（2026-09-20 重构新增）：周黑 / 活动卡 / 英雄卡 都逐卡 merge 进统一行情。
// 83+ 池是名单分组（价格复用市场监控/热门榜已采集的价），不单独开采集源，避免重复抓取。
const mergeLedger = async (doc, source, cardType, observedAtField = 'generatedAt') => {
  const players = Array.isArray(doc) ? doc : (doc?.players || []);
  if (!players.length) return 0;
  const records = players.filter(p => p && (p.id || p.cardId)).map(p => ({
    cardId: String(p.cardId ?? p.id),
    slug: p.slug,
    url: p.marketUrl || p.url || `https://www.futbin.com/27/player/${p.cardId ?? p.id}/${p.slug || ''}`,
    name: p.name,
    nameZh: p.nameZh,
    rating: p.rating,
    cardType: cardType || p.version || '',
    platforms: {
      console: { price: p.prices?.console?.price },
      pc: { price: p.prices?.pc?.price },
    },
  }));
  await mergeCurrentMarket(records, {
    source,
    observedAt: doc?.[observedAtField] || doc?.collectedAt || new Date().toISOString(),
    date: dateStr,
  });
  return records.length;
};

const totw = readJSON(totwPath);
if (totw) {
  const n = await mergeLedger(totw, 'futbin-totw', 'totw');
  if (n) { mergedSources++; console.log(`周黑已合并：${n} 张`); }
}

const activity = readJSON(activityPath);
if (activity) {
  const n = await mergeLedger(activity, 'futbin-latest', 'activity');
  if (n) { mergedSources++; console.log(`活动卡已合并：${n} 张`); }
}

const heroes = readJSON(heroesPath);
if (heroes) {
  const n = await mergeLedger(heroes, 'futbin-heroes', 'hero');
  if (n) { mergedSources++; console.log(`英雄卡已合并：${n} 张`); }
}

if (!mergedSources) throw new Error('没有可合并的本地最新行情快照');
const targets = syncCurrentMarketAssets(dateStr);
console.log(`current.json 已同步：${targets.map(file => path.relative(PROJECT_ROOT, file)).join('、')}`);
