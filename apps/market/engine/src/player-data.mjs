// 作用：封装球员、开服价和进化数据仓库，供市场脚本统一读取。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeName, normalizeSlug } from './core.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PLAYER_DATA_FILE = path.join(PROJECT_DIR, 'data', 'players', 'player-index.json');
export const DEFAULT_FC26_LAUNCH_WEEK_PRICE_FILE = path.join(
  PROJECT_DIR,
  'gold',
  'data',
  'prices',
  'fc26',
  'fc26-launch-week.json',
);
export const DEFAULT_FC26_FIRST_THREE_WEEKS_PRICE_FILE = path.join(
  PROJECT_DIR,
  'gold',
  'data',
  'prices',
  'fc26',
  'fc26-first-three-weeks.json',
);
export const DEFAULT_FC26_FIRST_MONTH_PRICE_FILE = path.join(
  PROJECT_DIR,
  'gold',
  'data',
  'prices',
  'fc26',
  'fc26-first-month.json',
);
export const DEFAULT_FC26_EVOLUTION_FILE = path.join(
  PROJECT_DIR,
  'evolution',
  'data',
  'fc26',
  'ranges',
  '2025-09-18_2026-08-24',
  'tasks.json',
);

export async function loadPlayerData(file = DEFAULT_PLAYER_DATA_FILE) {
  const document = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!document || !Array.isArray(document.players)) {
    throw new Error(`球员数据格式错误：${file}`);
  }
  return document;
}

export function createPlayerRepository(document) {
  if (!document || !Array.isArray(document.players)) {
    throw new TypeError('createPlayerRepository 需要包含 players 数组的球员数据文档');
  }

  const players = document.players;
  const bySlug = new Map();
  const byName = new Map();
  for (const player of players) {
    const slug = normalizeSlug(player.slug);
    const name = normalizeName(player.name);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, player);
    if (name && !byName.has(name)) byName.set(name, player);
  }

  const get = (query) => {
    const slug = normalizeSlug(query);
    return bySlug.get(slug) || byName.get(normalizeName(query)) || null;
  };

  const listByGroup = (group, options = {}) => {
    const { includeExcluded = false, matched } = options;
    return players.filter((player) => {
      if (!(player.sourceGroups || []).includes(group)) return false;
      if (!includeExcluded && (player.excludedFromGroups || []).includes(group)) return false;
      if (matched === true && !player.fc26Url) return false;
      if (matched === false && player.fc26Url) return false;
      return true;
    });
  };

  return Object.freeze({
    document,
    players,
    get,
    has: (query) => Boolean(get(query)),
    listByGroup,
    stats: () => ({
      total: players.length,
      withFc26: players.filter((player) => player.fc26Url).length,
      forward: listByGroup('forward').length,
      midfield: listByGroup('midfield').length,
      defender: listByGroup('defender').length,
    }),
  });
}

export async function openPlayerRepository(file = DEFAULT_PLAYER_DATA_FILE) {
  return createPlayerRepository(await loadPlayerData(file));
}

export async function loadFc26LaunchWeekPrices(file = DEFAULT_FC26_LAUNCH_WEEK_PRICE_FILE) {
  const document = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!document || !Array.isArray(document.players) || document.game !== 'FC26') {
    throw new Error(`FC26 开服首周价格数据格式错误：${file}`);
  }
  return document;
}

export function createLaunchWeekPriceRepository(document) {
  if (!document || !Array.isArray(document.players)) {
    throw new TypeError('createLaunchWeekPriceRepository 需要包含 players 数组的价格文档');
  }

  const bySlug = new Map();
  const byName = new Map();
  for (const player of document.players) {
    const slug = normalizeSlug(player.slug);
    const name = normalizeName(player.name);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, player);
    if (name && !byName.has(name)) byName.set(name, player);
  }

  const get = (query) => bySlug.get(normalizeSlug(query)) || byName.get(normalizeName(query)) || null;
  const listByGroup = (group) => document.players.filter((player) => (player.sourceGroups || []).includes(group));

  return Object.freeze({
    document,
    players: document.players,
    get,
    has: (query) => Boolean(get(query)),
    listByGroup,
    stats: () => ({ ...document.counts }),
  });
}

export async function openLaunchWeekPriceRepository(file = DEFAULT_FC26_LAUNCH_WEEK_PRICE_FILE) {
  return createLaunchWeekPriceRepository(await loadFc26LaunchWeekPrices(file));
}

export async function loadFc26FirstThreeWeeksPrices(file = DEFAULT_FC26_FIRST_THREE_WEEKS_PRICE_FILE) {
  const document = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!document || !Array.isArray(document.players) || document.game !== 'FC26' || document.window?.days?.length !== 21) {
    throw new Error(`FC26 开服前三周价格数据格式错误：${file}`);
  }
  return document;
}

export async function openThreeWeekPriceRepository(file = DEFAULT_FC26_FIRST_THREE_WEEKS_PRICE_FILE) {
  return createLaunchWeekPriceRepository(await loadFc26FirstThreeWeeksPrices(file));
}

export async function loadFc26FirstMonthPrices(file = DEFAULT_FC26_FIRST_MONTH_PRICE_FILE) {
  const document = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!document || !Array.isArray(document.players) || document.game !== 'FC26' || document.window?.days?.length !== 30) {
    throw new Error(`FC26 开服首月价格数据格式错误：${file}`);
  }
  return document;
}

export async function openFirstMonthPriceRepository(file = DEFAULT_FC26_FIRST_MONTH_PRICE_FILE) {
  return createLaunchWeekPriceRepository(await loadFc26FirstMonthPrices(file));
}

export async function loadFc26Evolutions(file = DEFAULT_FC26_EVOLUTION_FILE) {
  const document = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!document || !Array.isArray(document.tasks) || document.game !== 'FC26') {
    throw new Error(`FC26 进化任务数据格式错误：${file}`);
  }
  return document;
}

export function createEvolutionRepository(document) {
  if (!document || !Array.isArray(document.tasks)) {
    throw new TypeError('createEvolutionRepository 需要包含 tasks 数组的进化数据文档');
  }
  const byId = new Map(document.tasks.map((task) => [Number(task.id), task]));
  const bySlug = new Map(document.tasks.map((task) => [normalizeSlug(task.slug), task]));
  const byName = new Map(document.tasks.map((task) => [normalizeName(task.name), task]));
  const get = (query) => byId.get(Number(query)) || bySlug.get(normalizeSlug(query)) || byName.get(normalizeName(query)) || null;
  const listByCategory = (category) => {
    const normalized = normalizeSlug(category);
    return document.tasks.filter((task) => (task.categories || []).some((value) => normalizeSlug(value) === normalized));
  };
  const listByDate = (date) => document.tasks.filter((task) => task.releaseDate === date);
  return Object.freeze({
    document,
    tasks: document.tasks,
    get,
    has: (query) => Boolean(get(query)),
    listByCategory,
    listByDate,
    listWithPopularPlayers: () => document.tasks.filter((task) => (task.popularPlayers || []).length > 0),
    stats: () => ({ ...document.counts }),
  });
}

export async function openEvolutionRepository(file = DEFAULT_FC26_EVOLUTION_FILE) {
  return createEvolutionRepository(await loadFc26Evolutions(file));
}
