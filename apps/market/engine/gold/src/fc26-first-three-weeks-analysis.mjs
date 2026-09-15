#!/usr/bin/env node
// 作用：分析FC26开服前三周价格趋势，为FC27市场策略提供历史基线。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createI18n, TRANSLATIONS } from '../../src/i18n.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRICE_DIR = path.join(PROJECT_DIR, 'gold', 'data', 'prices', 'fc26');
const PLAYER_INDEX_FILE = path.join(PROJECT_DIR, 'data', 'players', 'player-index.json');
const CHECKPOINT_FILE = path.join(PRICE_DIR, '.fc26-first-three-weeks-checkpoint.json');
const RAW_FILE = path.join(PRICE_DIR, 'fc26-first-three-weeks-raw.json');
const OUTPUT_FILE = path.join(PRICE_DIR, 'fc26-first-three-weeks.json');
const DAILY_CSV_FILE = path.join(PRICE_DIR, 'fc26-first-three-weeks-daily.csv');
const SUMMARY_CSV_FILE = path.join(PRICE_DIR, 'fc26-first-three-weeks-summary.csv');

export const THREE_WEEK_WINDOWS = Object.freeze([
  Object.freeze({ key: 'week1', label: 'week1', start: '2025-09-18', end: '2025-09-24' }),
  Object.freeze({ key: 'week2', label: 'week2', start: '2025-09-25', end: '2025-10-01' }),
  Object.freeze({ key: 'week3', label: 'week3', start: '2025-10-02', end: '2025-10-08' }),
]);

export const ALL_DATES = Object.freeze(Array.from({ length: 21 }, (_, index) => (
  new Date(Date.parse('2025-09-18T00:00:00.000Z') + index * 86_400_000).toISOString().slice(0, 10)
)));

function datesBetween(start, end) {
  return ALL_DATES.filter((date) => date >= start && date <= end);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function normalizeSeries(series = []) {
  const byDate = new Map(series.map(([timestamp, price]) => [
    new Date(timestamp).toISOString().slice(0, 10),
    Number(price) > 0 ? Number(price) : null,
  ]));
  return Object.fromEntries(ALL_DATES.map((date) => [date, byDate.get(date) ?? null]));
}

function calculateMetrics(prices, dates) {
  const observations = dates
    .map((date) => [date, prices[date]])
    .filter(([, price]) => Number.isFinite(price));
  const values = observations.map(([, price]) => price);
  const start = prices[dates[0]];
  const end = prices[dates.at(-1)];
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const change = Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
  const changePct = change == null || !start ? null : change / start;
  const firstObserved = observations[0] || null;
  const lastObserved = observations.at(-1) || null;
  const observedChange = firstObserved && lastObserved ? lastObserved[1] - firstObserved[1] : null;
  return {
    observedDays: values.length,
    start,
    end,
    change,
    changePct,
    average: average(values),
    median: median(values),
    minimum,
    maximum,
    range: minimum == null || maximum == null ? null : maximum - minimum,
    rangePct: minimum ? (maximum - minimum) / minimum : null,
    troughDate: minimum == null ? null : observations.find(([, price]) => price === minimum)?.[0] || null,
    peakDate: maximum == null ? null : observations.find(([, price]) => price === maximum)?.[0] || null,
    firstObservedDate: firstObserved?.[0] || null,
    lastObservedDate: lastObserved?.[0] || null,
    observedChangePct: observedChange == null || !firstObserved?.[1] ? null : observedChange / firstObserved[1],
  };
}

export function classifyTrend(weeks, overall) {
  const changes = THREE_WEEK_WINDOWS.map(({ key }) => weeks[key].changePct);
  if (changes.some((value) => !Number.isFinite(value)) || !Number.isFinite(overall.changePct)) return 'trend_insufficient';
  if (changes.every((value) => value > 0)) return 'trend_up3';
  if (changes.every((value) => value < 0)) return 'trend_down3';
  if (changes[2] > 0 && changes[1] < 0) return 'trend_rebound';
  if (changes[2] < 0 && changes[1] > 0) return 'trend_turnDown';
  if (overall.changePct > 0) return 'trend_oscUp';
  if (overall.changePct < 0) return 'trend_oscDown';
  return 'trend_flat';
}

function platformAnalysis(prices) {
  const weeks = Object.fromEntries(THREE_WEEK_WINDOWS.map((window) => [
    window.key,
    calculateMetrics(prices, datesBetween(window.start, window.end)),
  ]));
  const overall = calculateMetrics(prices, ALL_DATES);
  return { weeks, overall, trend: classifyTrend(weeks, overall) };
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function summarizePlatform(players, platform) {
  const dailyMedian = Object.fromEntries(ALL_DATES.map((date) => [
    date,
    median(players.map((player) => player.prices[platform][date])),
  ]));
  const weeks = Object.fromEntries(THREE_WEEK_WINDOWS.map((window) => {
    const metrics = players.map((player) => player.analysis[platform].weeks[window.key]);
    const changes = metrics.map((item) => item.changePct).filter(Number.isFinite);
    const startMedian = dailyMedian[window.start];
    const endMedian = dailyMedian[window.end];
    return [window.key, {
      label: window.label,
      start: window.start,
      end: window.end,
      completePlayers: metrics.filter((item) => item.observedDays === 7).length,
      gainers: changes.filter((value) => value > 0).length,
      losers: changes.filter((value) => value < 0).length,
      flat: changes.filter((value) => value === 0).length,
      medianPlayerChangePct: median(changes),
      averagePlayerChangePct: average(changes),
      marketMedianStart: startMedian,
      marketMedianEnd: endMedian,
      marketMedianChangePct: startMedian ? (endMedian - startMedian) / startMedian : null,
    }];
  }));

  const ranked = players
    .filter((player) => Number.isFinite(player.analysis[platform].overall.changePct))
    .sort((left, right) => right.analysis[platform].overall.changePct - left.analysis[platform].overall.changePct);
  const overallStart = dailyMedian[ALL_DATES[0]];
  const overallEnd = dailyMedian[ALL_DATES.at(-1)];
  return {
    dailyMedian,
    weeks,
    trendCounts: countBy(players, (player) => player.analysis[platform].trend),
    overall: {
      completePlayers: players.filter((player) => player.analysis[platform].overall.observedDays === 21).length,
      marketMedianStart: overallStart,
      marketMedianEnd: overallEnd,
      marketMedianChangePct: overallStart ? (overallEnd - overallStart) / overallStart : null,
      medianPlayerChangePct: median(ranked.map((player) => player.analysis[platform].overall.changePct)),
      topGainers: ranked.slice(0, 10).map((player) => ({
        slug: player.slug,
        name: player.name,
        changePct: player.analysis[platform].overall.changePct,
      })),
      topLosers: ranked.slice(-10).reverse().map((player) => ({
        slug: player.slug,
        name: player.name,
        changePct: player.analysis[platform].overall.changePct,
      })),
    },
  };
}

export function buildThreeWeekDocument(playerIndex, rawRecords) {
  const byUrl = new Map(rawRecords.map((record) => [record.fc26Url, record]));
  const players = playerIndex.players.filter((player) => player.fc26Url).map((player) => {
    const raw = byUrl.get(player.fc26Url);
    const prices = {
      cross: normalizeSeries(raw?.cross),
      pc: normalizeSeries(raw?.pc),
    };
    return {
      slug: player.slug,
      name: player.name,
      sourceGroups: player.sourceGroups || [],
      rankByGroup: player.rankByGroup || {},
      fc27Url: player.fc27Url,
      fc26Url: player.fc26Url,
      sourceUrl: `${player.fc26Url}/market`,
      status: raw ? 'captured' : 'missing',
      prices,
      analysis: {
        cross: platformAnalysis(prices.cross),
        pc: platformAnalysis(prices.pc),
      },
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    game: 'FC26',
    source: 'FUTBIN historical daily average price',
    sourceBaseUrl: 'https://www.futbin.com/26/players',
    launchDate: '2025-09-18',
    window: { start: ALL_DATES[0], end: ALL_DATES.at(-1), days: ALL_DATES },
    weeks: Object.fromEntries(THREE_WEEK_WINDOWS.map((window) => [window.key, window])),
    platforms: { cross: 'platform_cross', pc: 'platform_pc' },
    zeroPricePolicy: 'FUTBIN returns 0 for days with no valid average; normalized to null; metrics ignore missing values.',
    trendRules: {
      'trend_up3': 'All three weeks have positive changePct',
      'trend_down3': 'All three weeks have negative changePct',
      'trend_rebound': 'Week 2 down, Week 3 up',
      'trend_turnDown': 'Week 2 up, Week 3 down',
      'trend_oscUp': 'Overall up but no consecutive pattern',
      'trend_oscDown': 'Overall down but no consecutive pattern',
      'trend_flat': 'Overall changePct is zero',
      'trend_insufficient': 'Missing data for at least one week or overall',
    },
    labels: Object.fromEntries(
      ['week1', 'week2', 'week3', 'tail',
       'trend_up3', 'trend_down3', 'trend_rebound', 'trend_turnDown',
       'trend_oscUp', 'trend_oscDown', 'trend_flat', 'trend_insufficient',
       'platform_cross', 'platform_pc'].map((key) => [key, TRANSLATIONS[key] || { zh: key, en: key }])
    ),
    counts: {
      requested: players.length,
      captured: players.filter((player) => player.status === 'captured').length,
      missing: players.filter((player) => player.status === 'missing').length,
      completeCross21Days: players.filter((player) => player.analysis.cross.overall.observedDays === 21).length,
      completePc21Days: players.filter((player) => player.analysis.pc.overall.observedDays === 21).length,
    },
    summary: {
      cross: summarizePlatform(players, 'cross'),
      pc: summarizePlatform(players, 'pc'),
    },
    players,
  };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsv(file, rows) {
  const text = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, text, 'utf8');
  await fs.rename(temporary, file);
}

function dailyRows(document) {
  const rows = [['slug', 'name', 'source_groups', 'platform', 'date', 'week', 'price', 'available', 'source_url']];
  for (const player of document.players) {
    for (const platform of ['cross', 'pc']) {
      for (const date of ALL_DATES) {
        const window = THREE_WEEK_WINDOWS.find((item) => date >= item.start && date <= item.end);
        const price = player.prices[platform][date];
        rows.push([
          player.slug,
          player.name,
          player.sourceGroups.join('|'),
          platform,
          date,
          window?.key || '',
          price,
          Number.isFinite(price),
          player.sourceUrl,
        ]);
      }
    }
  }
  return rows;
}

function summaryRows(document) {
  const headers = [
    'slug', 'name', 'source_groups', 'platform', 'trend',
    ...THREE_WEEK_WINDOWS.flatMap((window) => [
      `${window.key}_observed_days`, `${window.key}_start`, `${window.key}_end`, `${window.key}_change`, `${window.key}_change_pct`,
      `${window.key}_average`, `${window.key}_median`, `${window.key}_min`, `${window.key}_max`, `${window.key}_range_pct`,
    ]),
    'overall_observed_days', 'overall_start', 'overall_end', 'overall_change', 'overall_change_pct',
    'overall_average', 'overall_median', 'overall_min', 'overall_max', 'overall_range_pct', 'source_url',
  ];
  const rows = [headers];
  for (const player of document.players) {
    for (const platform of ['cross', 'pc']) {
      const analysis = player.analysis[platform];
      rows.push([
        player.slug,
        player.name,
        player.sourceGroups.join('|'),
        platform,
        analysis.trend,
        ...THREE_WEEK_WINDOWS.flatMap((window) => {
          const item = analysis.weeks[window.key];
          return [item.observedDays, item.start, item.end, item.change, item.changePct, item.average, item.median, item.minimum, item.maximum, item.rangePct];
        }),
        analysis.overall.observedDays,
        analysis.overall.start,
        analysis.overall.end,
        analysis.overall.change,
        analysis.overall.changePct,
        analysis.overall.average,
        analysis.overall.median,
        analysis.overall.minimum,
        analysis.overall.maximum,
        analysis.overall.rangePct,
        player.sourceUrl,
      ]);
    }
  }
  return rows;
}

async function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

async function main() {
  await fs.mkdir(PRICE_DIR, { recursive: true });
  const [playerIndex, checkpoint] = await Promise.all([
    fs.readFile(PLAYER_INDEX_FILE, 'utf8').then(JSON.parse),
    fs.readFile(CHECKPOINT_FILE, 'utf8').then(JSON.parse),
  ]);
  const document = buildThreeWeekDocument(playerIndex, checkpoint.records || []);
  await Promise.all([
    writeJson(RAW_FILE, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      window: document.window,
      records: checkpoint.records || [],
      failures: checkpoint.failures || [],
    }),
    writeJson(OUTPUT_FILE, document),
    writeCsv(DAILY_CSV_FILE, dailyRows(document)),
    writeCsv(SUMMARY_CSV_FILE, summaryRows(document)),
  ]);
  console.log(JSON.stringify({
    output: OUTPUT_FILE,
    counts: document.counts,
    dailyRows: document.players.length * 2 * ALL_DATES.length,
    summaryRows: document.players.length * 2,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
