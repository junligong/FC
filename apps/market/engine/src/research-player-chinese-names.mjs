#!/usr/bin/env node
// 作用：研究缺失的球员中文译名并生成待审核补丁，不直接猜测写入。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizeName } from './core.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(PROJECT_DIR, 'data', 'players');
const PLAYER_INDEX_FILE = path.join(DATA_DIR, 'player-index.json');
const OUTPUT_JSON_FILE = path.join(DATA_DIR, 'player-name-zh.json');
const OUTPUT_CSV_FILE = path.join(DATA_DIR, 'player-name-zh.csv');
const CHECKPOINT_FILE = path.join(DATA_DIR, '.player-name-zh-research-checkpoint.json');
const API_URL = 'https://www.wikidata.org/w/api.php';
const SPARQL_URL = 'https://query.wikidata.org/sparql';
const RESEARCHED_AT = new Date().toISOString();

const FOOTBALL_DESCRIPTION = /football|soccer|association football/i;
const REJECT_DESCRIPTION = /book|album|song|film|episode|list article|disambiguation|given name|family name/i;
const SIMPLIFIED_CHARACTER_PAIRS = '亞亚倫伦內内凱凯勞劳喬乔圖图奧奥婭娅揚扬書书歐欧歷历湯汤烏乌爾尔瑪玛盧卢約约納纳絲丝維维羅罗茲兹萊莱萬万蓮莲薩萨蘭兰許许諾诺貝贝費费賀贺賴赖達达鄧邓鐵铁長长韋韦顧顾馬马魯鲁麗丽麥麦';
const SIMPLIFIED_CHARACTER_MAP = new Map(Array.from({ length: SIMPLIFIED_CHARACTER_PAIRS.length / 2 }, (_, index) => [
  SIMPLIFIED_CHARACTER_PAIRS[index * 2],
  SIMPLIFIED_CHARACTER_PAIRS[index * 2 + 1],
]));
const CURATED_OVERRIDES = {
  'vinicius-jose-de-oliveira-junior': { nameZh: '维尼修斯·儒尼奥尔', sourceUrl: 'https://zh.wikipedia.org/wiki/维尼修斯·儒尼奥尔', method: 'researched-standard-name', confidence: 'high' },
  'debora-c-de-oliveira': { nameZh: '德比妮亚', sourceUrl: 'https://zh.wikipedia.org/wiki/德比妮亞', method: 'researched-standard-name', confidence: 'high' },
  'marie-katoto': { nameZh: '玛丽-安托瓦内特·卡托托', sourceUrl: 'https://zh.wikipedia.org/wiki/瑪麗-安東妮·卡托托', method: 'researched-standard-name', confidence: 'high' },
  'c-ronaldo-dos-santos-aveiro': { nameZh: '克里斯蒂亚诺·罗纳尔多', sourceUrl: 'https://zh.wikipedia.org/wiki/基斯坦奴·朗拿度', method: 'researched-standard-name', confidence: 'high' },
  'bernardo-mota-carvalho-e-silva': { nameZh: '贝尔纳多·席尔瓦', sourceUrl: 'https://zh.wikipedia.org/wiki/貝納爾多·席爾瓦', method: 'researched-standard-name', confidence: 'high' },
  'bruno-guimaraes-moura': { nameZh: '布鲁诺·吉马良斯', sourceUrl: 'https://zh.wikipedia.org/wiki/布魯諾·吉馬良斯', method: 'researched-standard-name', confidence: 'high' },
  'gabriel-dos-s-magalhaes': { nameZh: '加布里埃尔·马加良斯', sourceUrl: 'https://zh.wikipedia.org/wiki/加比爾·馬加希斯', method: 'researched-standard-name', confidence: 'high' },
};

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function simplifyKnownCharacters(value) {
  return [...value].map((character) => SIMPLIFIED_CHARACTER_MAP.get(character) || character).join('');
}

async function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function request(params, retries = 4) {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries({ ...params, format: 'json', origin: '*' })) {
    url.searchParams.set(key, value);
  }
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'FCMaster-player-name-research/1.0 (local data project)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

async function sparqlRequest(query, retries = 4) {
  const url = new URL(SPARQL_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'FCMaster-player-name-research/1.0 (local data project)' },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`SPARQL HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}

async function convertToSimplified(names) {
  const converted = new Map();
  for (let index = 0; index < names.length; index += 25) {
    const url = new URL('https://zh.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', names.slice(index, index + 25).join('|'));
    url.searchParams.set('redirects', '1');
    url.searchParams.set('converttitles', '1');
    url.searchParams.set('variant', 'zh-cn');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    let result;
    let lastError;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': 'FCMaster-player-name-research/1.0 (local data project)' },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`中文维基简繁转换 HTTP ${response.status}`);
        result = await response.json();
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
    if (!result) throw lastError;
    for (const item of result.query?.converted || []) converted.set(item.from, item.to);
  }
  return names.map((name) => converted.get(name) || name);
}

function sparqlString(value) {
  return JSON.stringify(String(value));
}

async function searchPlayersBatch(players) {
  const values = players.map((player) => sparqlString(player.name)).join(' ');
  const query = `
SELECT ?search ?item ?itemLabel ?description ?num WHERE {
  VALUES ?search { ${values} }
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch" .
    bd:serviceParam wikibase:endpoint "www.wikidata.org" .
    bd:serviceParam mwapi:search ?search .
    bd:serviceParam mwapi:language "en" .
    bd:serviceParam mwapi:limit "5" .
    ?item wikibase:apiOutputItem mwapi:item .
    ?num wikibase:apiOrdinal true .
  }
  OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh-hans,zh-cn,zh,en" . }
}
ORDER BY ?search ?num`;
  const result = await sparqlRequest(query);
  const candidatesByName = new Map();
  for (const binding of result.results?.bindings || []) {
    const name = binding.search?.value;
    if (!name) continue;
    const rows = candidatesByName.get(name) || [];
    rows.push({
      entityId: binding.item?.value?.split('/').at(-1) || null,
      description: binding.description?.value || null,
      ordinal: Number(binding.num?.value || 999),
      label: binding.itemLabel?.value || null,
      labelLanguage: binding.itemLabel?.['xml:lang'] || null,
    });
    candidatesByName.set(name, rows);
  }
  return players.map((player) => {
    const candidates = candidatesByName.get(player.name) || [];
    const candidate = candidates.find((item) => FOOTBALL_DESCRIPTION.test(item.description || ''))
      || candidates.find((item) => !REJECT_DESCRIPTION.test(item.description || ''))
      || null;
    return [player, candidate];
  });
}

function candidateScore(player, candidate) {
  const label = normalizeName(candidate.label || '');
  const name = normalizeName(player.name);
  const description = candidate.description || '';
  let score = 0;
  if (label === name) score += 100;
  else if (label && (name.includes(label) || label.includes(name))) score += 35;
  if (FOOTBALL_DESCRIPTION.test(description)) score += 70;
  if (REJECT_DESCRIPTION.test(description)) score -= 120;
  return score;
}

async function searchPlayer(player) {
  const searches = [player.name];
  const words = player.name.split(/\s+/).filter(Boolean);
  if (words.length > 2) searches.push(`${words[0]} ${words.at(-1)}`);
  let best = null;
  for (const search of searches) {
    const result = await request({
      action: 'wbsearchentities',
      search,
      language: 'en',
      uselang: 'en',
      type: 'item',
      limit: '10',
    });
    for (const candidate of result.search || []) {
      const score = candidateScore(player, candidate);
      if (!best || score > best.score) best = { ...candidate, score, search };
    }
    if (best?.score >= 170) break;
  }
  return best?.score >= 70 ? best : null;
}

async function fetchEntityDetails(ids) {
  const details = new Map();
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const result = await request({
      action: 'wbgetentities',
      ids: batch.join('|'),
      props: 'labels|sitelinks',
      languages: 'zh-hans|zh-cn|zh|en',
      sitefilter: 'zhwiki|enwiki',
    });
    for (const [id, entity] of Object.entries(result.entities || {})) details.set(id, entity);
  }
  return details;
}

function translatedName(entity) {
  return entity?.labels?.['zh-hans']?.value
    || entity?.labels?.['zh-cn']?.value
    || entity?.labels?.zh?.value
    || entity?.sitelinks?.zhwiki?.title
    || null;
}

async function main() {
  const playerIndex = JSON.parse(await fs.readFile(PLAYER_INDEX_FILE, 'utf8'));
  const checkpoint = await readJson(CHECKPOINT_FILE, { records: {} });
  const records = Object.keys(checkpoint.records || {}).length === playerIndex.players.length
    ? { ...checkpoint.records }
    : {};

  for (let index = Object.keys(records).length ? playerIndex.players.length : 0; index < playerIndex.players.length; index += 25) {
    const batch = playerIndex.players.slice(index, index + 25);
    const results = await searchPlayersBatch(batch);
    for (const [player, candidate] of results) {
      records[player.slug] = candidate ? {
        entityId: candidate.entityId,
        nameZh: candidate.labelLanguage?.startsWith('zh') ? candidate.label : null,
        matchedLabel: candidate.label || null,
        matchedDescription: candidate.description || null,
        search: player.name,
        score: candidate.ordinal === 0 && FOOTBALL_DESCRIPTION.test(candidate.description || '') ? 170 : 100,
      } : { entityId: null, nameZh: null, matchedLabel: null, matchedDescription: null, search: player.name, score: null };
    }
    await writeJson(CHECKPOINT_FILE, { researchedAt: RESEARCHED_AT, records });
    console.log(`Wikidata 检索进度：${Object.keys(records).length}/${playerIndex.players.length}`);
  }

  const wikidataPlayers = playerIndex.players.map((player) => {
    const match = records[player.slug] || {};
    const nameZh = match.nameZh || null;
    const sourceUrl = match.entityId ? `https://www.wikidata.org/wiki/${match.entityId}` : null;
    return {
      slug: player.slug,
      name: player.name,
      nameZh,
      sourceUrl,
      entityId: match.entityId || null,
      method: nameZh ? 'wikidata-zh-label' : 'unresolved',
      confidence: nameZh && match.score >= 170 ? 'high' : nameZh ? 'review' : 'unresolved',
      matchedLabel: match.matchedLabel || null,
      matchedDescription: match.matchedDescription || null,
    };
  });
  const originalNames = wikidataPlayers.filter((player) => player.nameZh).map((player) => player.nameZh);
  let convertedNames = originalNames;
  try {
    convertedNames = await convertToSimplified(originalNames);
  } catch (error) {
    console.warn(`中文维基简繁转换暂不可用，改用项目内简体字映射：${error.message}`);
  }
  let convertedIndex = 0;
  const players = wikidataPlayers.map((player) => {
    const simplified = player.nameZh ? simplifyKnownCharacters(convertedNames[convertedIndex++]) : null;
    return { ...player, nameZh: simplified, ...(CURATED_OVERRIDES[player.slug] || {}) };
  });
  const document = {
    schemaVersion: 1,
    generatedAt: RESEARCHED_AT,
    source: 'Wikidata official API',
    sourceBaseUrl: 'https://www.wikidata.org/',
    languagePreference: ['zh-hans', 'zh-cn', 'zh', 'zhwiki'],
    counts: {
      total: players.length,
      resolved: players.filter((player) => player.nameZh).length,
      highConfidence: players.filter((player) => player.confidence === 'high').length,
      needsReview: players.filter((player) => player.confidence === 'review').length,
      generated: players.filter((player) => player.confidence === 'generated').length,
      unresolved: players.filter((player) => !player.nameZh).length,
    },
    players,
  };
  await writeJson(OUTPUT_JSON_FILE, document);
  const rows = [
    ['slug', 'name', 'name_zh', 'source_url', 'entity_id', 'method', 'confidence', 'matched_label', 'matched_description'],
    ...players.map((player) => [
      player.slug, player.name, player.nameZh, player.sourceUrl, player.entityId,
      player.method, player.confidence, player.matchedLabel, player.matchedDescription,
    ]),
  ];
  await fs.writeFile(OUTPUT_CSV_FILE, `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  console.log(JSON.stringify(document.counts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
