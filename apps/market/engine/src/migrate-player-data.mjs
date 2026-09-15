#!/usr/bin/env node
// 作用：把旧版球员数据迁移到统一数据库结构，并保留来源字段。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyDir = path.join(PROJECT_DIR, 'output');
const dataDir = path.join(PROJECT_DIR, 'data', 'players');
const force = process.argv.includes('--force');

const mappings = [
  ['player-index.json', 'player-index.json'],
  ['player-links.csv', 'player-links.csv'],
  ['_cache/fc27-forwards.json', '../gold/data/players/fc27/forwards.json'],
  ['_cache/fc27-midfield.json', '../gold/data/players/fc27/midfield.json'],
  ['_cache/fc27-defenders.json', '../gold/data/players/fc27/defenders.json'],
  ['_cache/fc26-forwards.json', '../gold/data/players/fc26/forwards.json'],
  ['_cache/fc26-midfield.json', '../gold/data/players/fc26/midfield.json'],
  ['_cache/fc26-defenders.json', '../gold/data/players/fc26/defenders.json'],
  ['matches-forward.json', 'matches/forward.json'],
  ['matches-midfield.json', 'matches/midfield.json'],
  ['matches-defender.json', 'matches/defender.json'],
  ['duplicates-midfield.json', 'duplicates/midfield.json'],
  ['duplicates-defender.json', 'duplicates/defender.json'],
];

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

let copied = 0;
for (const [legacyRelative, dataRelative] of mappings) {
  const source = path.join(legacyDir, legacyRelative);
  const destination = path.join(dataDir, dataRelative);
  if (!await exists(source)) continue;
  if (!force && await exists(destination)) continue;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  copied += 1;
  console.log(`${legacyRelative} -> data/players/${dataRelative}`);
}

console.log(`球员项目数据迁移完成：${copied} 个文件。`);
