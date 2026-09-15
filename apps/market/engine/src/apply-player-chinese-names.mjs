#!/usr/bin/env node
// 作用：按标准姓名索引为指定球员数据补充中文名称。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizeName } from './core.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(PROJECT_DIR, 'data', 'players');
const DATA_ROOTS = [
  DATA_DIR,
  path.join(PROJECT_DIR, 'gold', 'data', 'prices', 'fc26'),
  path.join(PROJECT_DIR, 'gold', 'data', 'players', 'fc26'),
  path.join(PROJECT_DIR, 'gold', 'data', 'players', 'fc27'),
  path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'ranges'),
  path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'by-date'),
  path.join(PROJECT_DIR, 'evolution', 'players', 'fc26'),
  path.join(PROJECT_DIR, 'evolution', 'players', 'fc27'),
];
const MAPPING_JSON_FILE = path.join(DATA_DIR, 'player-name-zh.json');
const MAPPING_CSV_FILE = path.join(DATA_DIR, 'player-name-zh.csv');
const CHECKPOINT_FILE = path.join(DATA_DIR, '.player-name-zh-research-checkpoint.json');
const PLAYER_INDEX_FILE = path.join(DATA_DIR, 'player-index.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function stringifyCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

async function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

async function writeText(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, value, 'utf8');
  await fs.rename(temporary, file);
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(file));
    else files.push(file);
  }
  return files;
}

function enrichJson(value, lookup) {
  if (Array.isArray(value)) return value.map((item) => enrichJson(item, lookup));
  if (!value || typeof value !== 'object') return value;
  const match = lookup.bySlug.get(value.slug) || lookup.byName.get(normalizeName(value.name));
  const result = {};
  let inserted = false;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'nameZh' && typeof child !== 'object') continue;
    result[key] = enrichJson(child, lookup);
    if (key === 'name' && match) {
      result.nameZh = match.nameZh;
      inserted = true;
    }
  }
  if (match && !inserted && !Object.hasOwn(result, 'nameZh')) result.nameZh = match.nameZh;
  return result;
}

function enrichCsv(rows, lookup, includeMetadata = false) {
  if (!rows.length) return rows;
  const headers = rows[0];
  const nameIndex = headers.indexOf('name');
  const slugIndex = headers.indexOf('slug');
  if (nameIndex < 0 && slugIndex < 0) return rows;
  const extraHeaders = includeMetadata
    ? ['name_zh', 'name_zh_source_url', 'name_zh_method', 'name_zh_confidence']
    : ['name_zh'];
  if (headers.includes('name_zh')) {
    return rows.map((row, rowIndex) => {
      if (rowIndex === 0) return row;
      const match = lookup.bySlug.get(row[slugIndex]) || lookup.byName.get(normalizeName(row[nameIndex]));
      const result = [...row];
      const values = includeMetadata
        ? [match?.nameZh || '', match?.sourceUrl || '', match?.method || '', match?.confidence || '']
        : [match?.nameZh || ''];
      for (let index = 0; index < extraHeaders.length; index += 1) {
        const column = headers.indexOf(extraHeaders[index]);
        if (column >= 0) result[column] = values[index];
      }
      return result;
    });
  }
  const insertAt = nameIndex >= 0 ? nameIndex + 1 : slugIndex + 1;
  return rows.map((row, rowIndex) => {
    if (rowIndex === 0) return [...row.slice(0, insertAt), ...extraHeaders, ...row.slice(insertAt)];
    const match = lookup.bySlug.get(row[slugIndex]) || lookup.byName.get(normalizeName(row[nameIndex]));
    const values = includeMetadata
      ? [match?.nameZh || '', match?.sourceUrl || '', match?.method || '', match?.confidence || '']
      : [match?.nameZh || ''];
    return [...row.slice(0, insertAt), ...values, ...row.slice(insertAt)];
  });
}

async function main() {
  const mapping = JSON.parse(await fs.readFile(MAPPING_JSON_FILE, 'utf8'));
  const resolvedPlayers = mapping.players.filter((player) => player.nameZh);
  const bySlug = new Map(resolvedPlayers.map((player) => [player.slug, player]));
  const byName = new Map(resolvedPlayers.map((player) => [normalizeName(player.name), player]));
  const lookup = { bySlug, byName };
  const nestedFiles = await Promise.all(DATA_ROOTS.map((directory) => listFiles(directory).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })));
  const files = nestedFiles.flat().filter((file) => (
    ![MAPPING_JSON_FILE, MAPPING_CSV_FILE, CHECKPOINT_FILE].includes(file)
    && !path.basename(file).startsWith('.')
    && !file.endsWith('-raw.json')
  ));
  let jsonFiles = 0;
  let csvFiles = 0;
  for (const file of files) {
    if (file.endsWith('.json')) {
      const document = JSON.parse(await fs.readFile(file, 'utf8'));
      const enriched = enrichJson(document, lookup);
      if (file === PLAYER_INDEX_FILE) {
        enriched.nameZh = {
          mappingFile: 'data/players/player-name-zh.json',
          source: mapping.source,
          generatedAt: mapping.generatedAt,
          resolved: mapping.counts.resolved,
          total: mapping.counts.total,
        };
        enriched.players = enriched.players.map((player) => {
          const match = bySlug.get(player.slug);
          return {
            ...player,
            nameZhSourceUrl: match?.sourceUrl || null,
            nameZhMethod: match?.method || null,
            nameZhConfidence: match?.confidence || null,
          };
        });
      }
      await writeJson(file, enriched);
      jsonFiles += 1;
    } else if (file.endsWith('.csv')) {
      const rows = parseCsv(await fs.readFile(file, 'utf8'));
      const enriched = enrichCsv(rows, lookup, path.basename(file) === 'player-links.csv');
      await writeText(file, stringifyCsv(enriched));
      csvFiles += 1;
    }
  }
  console.log(JSON.stringify({ players: mapping.players.length, resolvedPlayers: resolvedPlayers.length, jsonFiles, csvFiles }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
