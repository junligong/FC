#!/usr/bin/env node
// 作用：汇总FC26进化发布时间、门槛和强度变化，生成周期分析数据与报告。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(engineRoot, '../../..');
const outputDir = path.join(projectRoot, 'reports', 'research', 'evolution');

const files = {
  timeline: path.join(engineRoot, 'evolution/data/fc26/ranges/2025-09-18_2026-08-24/tasks-chronological.json'),
  firstMonthPopular: path.join(engineRoot, 'evolution/players/fc26/first-month-evo-players.json'),
  firstMonthPrices: path.join(engineRoot, 'gold/data/prices/fc26/fc26-first-month.json'),
  fc27Candidates: path.join(engineRoot, 'gold/data/players/fc27/fc27-evo-le83-position-table.json'),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, value, 'utf8');
  fs.renameSync(temporary, file);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, columns) {
  const lines = [columns.join(','), ...rows.map(row => columns.map(key => csvCell(row[key])).join(','))];
  atomicWrite(file, `${lines.join('\n')}\n`);
}

function dateAdd(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function numberFrom(value) {
  const matches = String(value ?? '').match(/\b\d{2}\b/g);
  return matches?.length ? Number(matches.at(-1)) : null;
}

function requirement(task, label) {
  return (task.requirements || []).find(item => item.label === label);
}

function requirementMax(task, label) {
  const item = requirement(task, label);
  return item ? numberFrom([item.value, ...(item.raw || [])].join(' ')) : null;
}

function outputOverall(task) {
  const item = (task.upgrades || []).find(upgrade => upgrade.label === 'Overall');
  if (!item) return null;
  return numberFrom(item.cap) ?? numberFrom([item.value, ...(item.raw || [])].join(' '));
}

function positionRequirement(task) {
  return (task.requirements || [])
    .filter(item => item.label === 'Position')
    .map(item => item.value)
    .filter(Boolean)
    .join(' | ');
}

function rarityRequirement(task) {
  return (task.requirements || [])
    .filter(item => item.label === 'Rarity' || item.label === 'Not Rarity')
    .map(item => `${item.label}: ${item.value}`)
    .filter(Boolean)
    .join(' | ');
}

function playstylePlusAdded(task) {
  return (task.upgrades || []).filter(item => item.label === 'PS+');
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeStage(tasks, stage) {
  const selected = tasks.filter(task => task.releaseDate >= stage.from && task.releaseDate <= stage.to);
  const inputCaps = selected.map(task => requirementMax(task, 'Overall')).filter(Number.isFinite);
  const outputCaps = selected.map(outputOverall).filter(Number.isFinite);
  const confidences = {};
  for (const task of selected) confidences[task.dateConfidence || 'unknown'] = (confidences[task.dateConfidence || 'unknown'] || 0) + 1;
  return {
    ...stage,
    tasks: selected.length,
    activeDates: new Set(selected.map(task => task.releaseDate)).size,
    inputOverallMin: inputCaps.length ? Math.min(...inputCaps) : null,
    inputOverallMax: inputCaps.length ? Math.max(...inputCaps) : null,
    outputOverallMin: outputCaps.length ? Math.min(...outputCaps) : null,
    outputOverallMax: outputCaps.length ? Math.max(...outputCaps) : null,
    tasksAddingPlaystylePlus: selected.filter(task => playstylePlusAdded(task).length > 0).length,
    dateConfidence: confidences,
  };
}

const timelineDocument = readJson(files.timeline);
const tasks = timelineDocument.tasks;
const taskById = new Map(tasks.map(task => [Number(task.id), task]));

const timelineRows = tasks.map(task => ({
  releaseDate: task.releaseDate,
  evolutionId: task.id,
  name: task.name,
  category: (task.categories || []).join(' | '),
  inputOverallMax: requirementMax(task, 'Overall'),
  inputPlaystylePlusMax: requirementMax(task, 'PlayStyle+'),
  outputOverall: outputOverall(task),
  positions: positionRequirement(task),
  rarity: rarityRequirement(task),
  playstylePlusAddCount: playstylePlusAdded(task).length,
  playstylePlusAdded: playstylePlusAdded(task).map(item => item.value).join(' | '),
  free: task.availability?.free,
  repeatable: task.availability?.repeatable,
  dateConfidence: task.dateConfidence,
  sourceUrl: task.url,
}));

writeCsv(path.join(outputDir, 'fc26-all-evolutions.csv'), timelineRows, [
  'releaseDate', 'evolutionId', 'name', 'category', 'inputOverallMax', 'inputPlaystylePlusMax',
  'outputOverall', 'positions', 'rarity', 'playstylePlusAddCount', 'playstylePlusAdded', 'free',
  'repeatable', 'dateConfidence', 'sourceUrl',
]);

writeCsv(path.join(outputDir, 'fc26-first-month-evolutions.csv'), timelineRows.filter(row =>
  row.releaseDate >= '2025-09-18' && row.releaseDate <= '2025-10-17'
), [
  'releaseDate', 'evolutionId', 'name', 'inputOverallMax', 'inputPlaystylePlusMax',
  'outputOverall', 'positions', 'rarity', 'playstylePlusAddCount', 'playstylePlusAdded',
  'free', 'repeatable', 'dateConfidence', 'sourceUrl',
]);

const popular = readJson(files.firstMonthPopular);
const pricePlayers = readJson(files.firstMonthPrices).players;
const priceBySlug = new Map(pricePlayers.map(player => [player.slug, player]));
const eventRows = [];
const seenEvents = new Set();

for (const evolution of popular) {
  const task = taskById.get(Number(evolution.evoId));
  if (!task || task.releaseDate > '2025-10-17') continue;
  for (const player of evolution.players || []) {
    const slug = String(player.link || '').split('/').filter(Boolean).at(-1);
    const eventKey = `${task.id}:${slug}`;
    if (!slug || seenEvents.has(eventKey)) continue;
    seenEvents.add(eventKey);
    const pricePlayer = priceBySlug.get(slug);
    if (!pricePlayer) continue;
    const prices = pricePlayer.prices?.cross || {};
    const releaseDate = task.releaseDate;
    const beforeDate = dateAdd(releaseDate, -1);
    const baseDate = prices[beforeDate] ? beforeDate : (prices[releaseDate] ? releaseDate : null);
    const basePrice = baseDate ? prices[baseDate] : null;
    if (!basePrice) continue;
    const sevenDayWindow = Object.entries(prices)
      .filter(([date, price]) => date >= releaseDate && date <= dateAdd(releaseDate, 7) && Number(price) > 0)
      .sort((a, b) => b[1] - a[1]);
    const [peakDate, peakPrice] = sevenDayWindow[0] || [null, null];
    eventRows.push({
      releaseDate,
      evolutionId: task.id,
      evolutionName: evolution.evoName,
      player: player.name,
      playerZh: player.nameZh,
      slug,
      rating: player.rating,
      position: player.position,
      baseDate,
      basePrice,
      priceD0: prices[releaseDate],
      priceD1: prices[dateAdd(releaseDate, 1)],
      priceD3: prices[dateAdd(releaseDate, 3)],
      priceD7: prices[dateAdd(releaseDate, 7)],
      peakDate,
      peakPrice,
      peakReturnPct: peakPrice ? Number(((peakPrice / basePrice - 1) * 100).toFixed(2)) : null,
      sourceUrl: pricePlayer.sourceUrl,
    });
  }
}

writeCsv(path.join(outputDir, 'fc26-first-month-popular-price-events.csv'), eventRows, [
  'releaseDate', 'evolutionId', 'evolutionName', 'player', 'playerZh', 'slug', 'rating', 'position',
  'baseDate', 'basePrice', 'priceD0', 'priceD1', 'priceD3', 'priceD7', 'peakDate', 'peakPrice',
  'peakReturnPct', 'sourceUrl',
]);

const fc27CandidateDocument = readJson(files.fc27Candidates);
const fc27Rows = fc27CandidateDocument.rows.map(player => ({
  resourceId: player.resourceId,
  name: player.name,
  rating: player.rating,
  position: player.mainPos,
  alternatePositions: (player.positions || []).filter(position => position !== player.mainPos).join(' | '),
  pace: player.six?.PAC,
  shooting: player.six?.SHO,
  passing: player.six?.PAS,
  dribbling: player.six?.DRI,
  defending: player.six?.DEF,
  physical: player.six?.PHY,
  skills: player.skills,
  weakFoot: player.weakFoot,
  playstyleCount: player.playStylesCount,
  playstyles: (player.playStyles || []).join(' | '),
  goldPlaystyleCount: (player.playStylesPlus || []).length,
  goldPlaystyles: (player.playStylesPlus || []).join(' | '),
  historicalFc26PopularCount: player.fc26HotCount,
  fc27PopularityScore: typeof player.popularHot === 'number' ? player.popularHot : null,
  matchingFc26EvolutionCount: (player.fitFC26Evos || []).length,
  matchingFc26Evolutions: (player.fitFC26Evos || []).join(' | '),
  club: player.club,
  league: player.league,
  isBigClub: player.isBigClub,
  isTopLeague: player.isTopLeague,
  prelaunchPriceSnapshot: player.price,
  launchPriceReference: player.launchPrice,
})).sort((a, b) =>
  (b.fc27PopularityScore ?? -1) - (a.fc27PopularityScore ?? -1)
  || b.historicalFc26PopularCount - a.historicalFc26PopularCount
  || b.rating - a.rating
  || a.name.localeCompare(b.name)
);

writeCsv(path.join(outputDir, 'fc27-evolution-watchlist.csv'), fc27Rows, [
  'resourceId', 'name', 'rating', 'position', 'alternatePositions', 'pace', 'shooting', 'passing',
  'dribbling', 'defending', 'physical', 'skills', 'weakFoot', 'playstyleCount', 'playstyles',
  'goldPlaystyleCount', 'goldPlaystyles', 'historicalFc26PopularCount', 'fc27PopularityScore',
  'matchingFc26EvolutionCount', 'matchingFc26Evolutions', 'club', 'league', 'isBigClub',
  'isTopLeague', 'prelaunchPriceSnapshot', 'launchPriceReference',
]);

const stages = [
  { id: 'launch-month', name: '开服一个月', from: '2025-09-18', to: '2025-10-17' },
  { id: 'black-friday', name: '黑色星期五', from: '2025-11-27', to: '2025-12-02' },
  { id: 'christmas', name: '圣诞节', from: '2025-12-19', to: '2026-01-02' },
  { id: 'toty', name: '年度蓝', from: '2026-01-15', to: '2026-01-31' },
].map(stage => summarizeStage(tasks, stage));

const firstFor = predicate => {
  const task = tasks.find(predicate);
  return task ? { date: task.releaseDate, evolutionId: task.id, name: task.name } : null;
};

const milestones = {
  inputOverallMax: Object.fromEntries([81, 82, 83, 84, 85, 86, 87, 88, 89].map(cap => [cap,
    firstFor(task => requirementMax(task, 'Overall') === cap),
  ])),
  outputOverall: Object.fromEntries([82, 83, 84, 85, 86, 87, 88, 89, 90].map(cap => [cap,
    firstFor(task => outputOverall(task) === cap),
  ])),
  firstPlaystylePlus: firstFor(task => playstylePlusAdded(task).length > 0),
  firstTwoPlaystylePlusAdditions: firstFor(task => playstylePlusAdded(task).length >= 2),
};

const stagePriceStats = {};
const rowsByEvolution = {};
for (const row of eventRows) (rowsByEvolution[row.evolutionName] ||= []).push(row);
for (const [evolutionName, rows] of Object.entries(rowsByEvolution)) {
  stagePriceStats[evolutionName] = {
    releaseDate: rows[0].releaseDate,
    observations: rows.length,
    medianPeakReturnPct: median(rows.map(row => row.peakReturnPct)),
    medianD1ReturnPct: median(rows.map(row => row.priceD1 ? (row.priceD1 / row.basePrice - 1) * 100 : null)),
    medianD3ReturnPct: median(rows.map(row => row.priceD3 ? (row.priceD3 / row.basePrice - 1) * 100 : null)),
    medianD7ReturnPct: median(rows.map(row => row.priceD7 ? (row.priceD7 / row.basePrice - 1) * 100 : null)),
  };
}

const summary = {
  generatedAt: new Date().toISOString(),
  sourceCoverage: {
    fc26EvolutionTasks: tasks.length,
    fc26ActiveDates: new Set(tasks.map(task => task.releaseDate)).size,
    exactDates: tasks.filter(task => task.dateConfidence === 'exact').length,
    normalizedDates: tasks.filter(task => task.dateConfidence === 'normalized').length,
    inferredDates: tasks.filter(task => task.dateConfidence === 'inferred').length,
    firstMonthPopularEvolutionRecords: popular.filter(item => taskById.get(Number(item.evoId))?.releaseDate <= '2025-10-17').length,
    firstMonthMatchedPriceEvents: eventRows.length,
    firstMonthMatchedPlayers: new Set(eventRows.map(row => row.slug)).size,
    fc27WatchlistPlayers: fc27Rows.length,
    fc27PopularPlayers: fc27Rows.filter(row => row.fc27PopularityScore != null).length,
    fc27HistoricallyPopularPlayers: fc27Rows.filter(row => row.historicalFc26PopularCount > 0).length,
    fc27PlayersWithGoldPlaystyle: fc27Rows.filter(row => row.goldPlaystyleCount > 0).length,
  },
  stages,
  milestones,
  firstMonthPriceByEvolution: stagePriceStats,
  limitations: [
    'FC26真实逐日价格仅覆盖开服首月的152名金卡，并非全部进化候选。',
    '黑五、圣诞与年度蓝阶段缺少对应球员逐日价格，报告只计算进化门槛与能力曲线。',
    'FC27尚未正式开服，当前观察表是83分及以下金卡与FC26规则的匹配候选池，不代表已开放进化；价格字段是开服前快照。',
  ],
};

atomicWrite(path.join(outputDir, 'analysis.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary.sourceCoverage));
