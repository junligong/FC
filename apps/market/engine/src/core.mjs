// 作用：提供市场引擎的参数解析、球员匹配、配置合并和通用文件能力。
import path from 'node:path';
import fs from 'node:fs';
import { createI18n } from './i18n.mjs';

/**
 * Read language setting from config.json (sync, with fallback).
 * @returns {'zh'|'en'|'bilingual'}
 */
export function getConfigLanguage(configPath = 'config.json') {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return config.language || 'zh';
  } catch {
    return 'zh';
  }
}

export const DEFAULT_CONFIG = Object.freeze({
  language: 'zh',
  fc27ListUrl: 'https://www.futbin.com/27/players?pos_type=all&position=ST%2CRW%2CLW&version=gold_rare',
  fc26ForwardListUrl: 'https://www.futbin.com/26/players?pos_type=all&position=ST%2CRW%2CLW&version=gold',
  fc27MidfieldListUrl: 'https://www.futbin.com/27/players?pos_type=all&position=CAM%2CCM%2CCDM%2CLM%2CRM&version=gold_rare',
  fc26MidfieldListUrl: 'https://www.futbin.com/26/players?pos_type=all&position=CAM%2CCM%2CCDM%2CLM%2CRM&version=gold',
  fc27DefenderListUrl: 'https://www.futbin.com/27/players?pos_type=all&position=CB%2CLB%2CRB&version=gold_rare',
  fc26DefenderListUrl: 'https://www.futbin.com/26/players?pos_type=all&position=CB%2CLB%2CRB&version=gold',
  listLimit: 100,
  dataDir: 'data/players',
  outputDir: 'output',
  browserProfileDir: '.futbin-browser-profile',
  headless: false,
  viewport: Object.freeze({ width: 1400, height: 1000 }),
  deviceScaleFactor: 2,
  challengeTimeoutMs: 300_000,
  navigationTimeoutMs: 60_000,
  requestDelayMs: 1_500,
  maxPages: 100,
  pairPanelWidth: 1200,
  captureSelector: '',
  captureClip: null,
  overrides: Object.freeze({
    'alexia-putellas-segura': 'https://www.futbin.com/26/player/105/alexia-putellas-segura',
  }),
});

export function normalizeSlug(value = '') {
  return decodeURIComponent(String(value))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugFromPlayerUrl(value = '') {
  try {
    const url = new URL(value, 'https://www.futbin.com');
    const match = url.pathname.match(/^\/(?:26|27)\/player\/\d+\/([^/?#]+)/i);
    return match ? normalizeSlug(match[1]) : '';
  } catch {
    return '';
  }
}

export function displayNameFromSlug(slug = '') {
  return normalizeSlug(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeName(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function uniquePlayers(players = []) {
  const seen = new Map();
  for (const player of players) {
    const slug = normalizeSlug(player.slug || slugFromPlayerUrl(player.url));
    if (!slug || !player.url) continue;
    const normalized = {
      ...player,
      slug,
      name: String(player.name || displayNameFromSlug(slug)).trim(),
    };
    if (!seen.has(slug)) seen.set(slug, normalized);
  }
  return [...seen.values()];
}

export function partitionNewPlayers(players = [], excludedPlayers = []) {
  const excludedBySlug = new Map();
  const excludedByName = new Map();
  for (const player of uniquePlayers(excludedPlayers)) {
    excludedBySlug.set(player.slug, player);
    const nameKey = normalizeName(player.name);
    if (nameKey && !excludedByName.has(nameKey)) excludedByName.set(nameKey, player);
  }

  const included = [];
  const duplicates = [];
  for (const player of uniquePlayers(players)) {
    const duplicateOf = excludedBySlug.get(player.slug) || excludedByName.get(normalizeName(player.name));
    if (duplicateOf) duplicates.push({ ...player, duplicateOf: duplicateOf.slug });
    else included.push(player);
  }
  return { included, duplicates };
}

export function mergePlayerCatalog(existingPlayers = [], updates = []) {
  const catalog = [];
  const bySlug = new Map();
  const byName = new Map();

  const mergeRecord = (record) => {
    const slug = normalizeSlug(record.slug || slugFromPlayerUrl(record.fc27Url || record.url));
    if (!slug) return;
    const name = String(record.name || displayNameFromSlug(slug)).trim();
    const nameKey = normalizeName(name);
    const current = bySlug.get(slug) || (nameKey ? byName.get(nameKey) : null);
    const normalized = {
      ...record,
      slug,
      name,
      fc27Url: record.fc27Url || record.url || null,
      fc26Url: record.fc26Url || null,
      sourceGroups: [...new Set(record.sourceGroups || [])],
      excludedFromGroups: [...new Set(record.excludedFromGroups || [])],
      rankByGroup: { ...(record.rankByGroup || {}) },
    };

    if (!current) {
      catalog.push(normalized);
      bySlug.set(slug, normalized);
      if (nameKey) byName.set(nameKey, normalized);
      return;
    }

    Object.assign(current, {
      ...current,
      ...normalized,
      fc27Url: normalized.fc27Url || current.fc27Url,
      fc26Url: normalized.fc26Url || current.fc26Url,
      matchedBy: normalized.matchedBy || current.matchedBy || null,
      sourceGroups: [...new Set([...(current.sourceGroups || []), ...normalized.sourceGroups])],
      excludedFromGroups: [...new Set([...(current.excludedFromGroups || []), ...normalized.excludedFromGroups])],
      rankByGroup: { ...(current.rankByGroup || {}), ...normalized.rankByGroup },
    });
    bySlug.set(current.slug, current);
    if (nameKey) byName.set(nameKey, current);
  };

  for (const record of existingPlayers) mergeRecord(record);
  for (const record of updates) mergeRecord(record);
  return catalog;
}

function playerIndexes(players = []) {
  const bySlug = new Map();
  const byName = new Map();
  for (const player of uniquePlayers(players)) {
    bySlug.set(player.slug, player);
    const nameKey = normalizeName(player.name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, player);
  }
  return { bySlug, byName };
}

export function matchPlayers(
  fc27Players,
  fc26PositionPlayers,
  fc26FallbackPlayers,
  overrides = {},
  labels = { primary: 'forward', fallback: 'all-gold' },
) {
  const primary = playerIndexes(fc26PositionPlayers);
  const fallback = playerIndexes(fc26FallbackPlayers);

  return uniquePlayers(fc27Players).map((fc27) => {
    const override = overrides[fc27.slug];
    if (override) {
      const value = typeof override === 'string' ? { url: override } : override;
      return {
        fc27,
        fc26: {
          name: value.name || fc27.name,
          slug: slugFromPlayerUrl(value.url) || fc27.slug,
          url: value.url,
        },
        matchedBy: 'override',
      };
    }

    const primarySlug = primary.bySlug.get(fc27.slug);
    if (primarySlug) return { fc27, fc26: primarySlug, matchedBy: `${labels.primary}-slug` };

    const nameKey = normalizeName(fc27.name);
    const primaryName = primary.byName.get(nameKey);
    if (primaryName) return { fc27, fc26: primaryName, matchedBy: `${labels.primary}-name` };

    const fallbackSlug = fallback.bySlug.get(fc27.slug);
    if (fallbackSlug) return { fc27, fc26: fallbackSlug, matchedBy: `${labels.fallback}-slug` };

    const fallbackName = fallback.byName.get(nameKey);
    if (fallbackName) return { fc27, fc26: fallbackName, matchedBy: `${labels.fallback}-name` };

    return { fc27, fc26: null, matchedBy: 'unmatched' };
  });
}

export function safeFilename(value = '') {
  const cleaned = normalizeSlug(value) || 'player';
  return cleaned.slice(0, 120);
}

export function resolveFrom(baseDir, value) {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

export function parseCliArgs(argv = [], lang = 'zh') {
  const i18n = createI18n(lang);
  const result = {
    config: 'config.json',
    group: 'forward',
    listLimit: undefined,
    limit: 0,
    only: [],
    headless: undefined,
    force: false,
    refreshIndex: false,
    dryRun: false,
    verifyOnly: false,
    background: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} ${i18n.t('cli_missingArg')}`);
      return argv[index];
    };
    if (arg === '--config') result.config = next();
    else if (arg === '--output') result.outputDir = next();
    else if (arg === '--group') {
      const value = next().toLowerCase();
      if (!['forward', 'midfield', 'defender'].includes(value)) {
        throw new Error(`${i18n.t('cli_invalidGroup')}: ${value}`);
      }
      result.group = value;
    }
    else if (arg === '--list-limit') result.listLimit = Math.max(1, Number(next()) || 100);
    else if (arg === '--limit') result.limit = Math.max(0, Number(next()) || 0);
    else if (arg === '--only') result.only.push(...next().split(',').map(normalizeSlug).filter(Boolean));
    else if (arg === '--headless') result.headless = true;
    else if (arg === '--headed') result.headless = false;
    else if (arg === '--force') result.force = true;
    else if (arg === '--refresh-index') result.refreshIndex = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--verify-only') result.verifyOnly = true;
    else if (arg === '--background') result.background = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else throw new Error(`${i18n.t('cli_unknownArg')}: ${arg}`);
  }
  return result;
}

export function mergeConfig(base, override = {}) {
  return {
    ...base,
    ...override,
    viewport: { ...base.viewport, ...(override.viewport || {}) },
    overrides: { ...base.overrides, ...(override.overrides || {}) },
  };
}
