#!/usr/bin/env node
// 作用：分析FC26开服首月金卡价格曲线、分档表现和投资信号。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TRANSLATIONS } from '../../src/i18n.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRICE_DIR = path.join(PROJECT_DIR, 'gold', 'data', 'prices', 'fc26');
const PLAYER_INDEX_FILE = path.join(PROJECT_DIR, 'data', 'players', 'player-index.json');
const CHECKPOINT_FILE = path.join(PRICE_DIR, '.fc26-first-month-checkpoint.json');
const RAW_FILE = path.join(PRICE_DIR, 'fc26-first-month-raw.json');
const OUTPUT_FILE = path.join(PRICE_DIR, 'fc26-first-month.json');
const DASHBOARD_FILE = path.join(PRICE_DIR, 'fc26-first-month-dashboard.json');
const DAILY_CSV_FILE = path.join(PRICE_DIR, 'fc26-first-month-daily.csv');
const SUMMARY_CSV_FILE = path.join(PRICE_DIR, 'fc26-first-month-summary.csv');

export const FIRST_MONTH_DATES = Object.freeze(Array.from({ length: 30 }, (_, index) => (
  new Date(Date.parse('2025-09-18T00:00:00.000Z') + index * 86_400_000).toISOString().slice(0, 10)
)));

export const FIRST_MONTH_PERIODS = Object.freeze([
  Object.freeze({ key: 'week1', label: 'week1', start: '2025-09-18', end: '2025-09-24' }),
  Object.freeze({ key: 'week2', label: 'week2', start: '2025-09-25', end: '2025-10-01' }),
  Object.freeze({ key: 'week3', label: 'week3', start: '2025-10-02', end: '2025-10-08' }),
  Object.freeze({ key: 'week4', label: 'week4', start: '2025-10-09', end: '2025-10-15' }),
  Object.freeze({ key: 'tail', label: 'tail', start: '2025-10-16', end: '2025-10-17' }),
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
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

function standardDeviation(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return null;
  const mean = average(valid);
  return Math.sqrt(valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (valid.length - 1));
}

function datesBetween(start, end) {
  return FIRST_MONTH_DATES.filter((date) => date >= start && date <= end);
}

function normalizeSeries(series = []) {
  const byDate = new Map(series.map(([timestamp, price]) => [
    new Date(timestamp).toISOString().slice(0, 10),
    Number(price) > 0 ? Number(price) : null,
  ]));
  return Object.fromEntries(FIRST_MONTH_DATES.map((date) => [date, byDate.get(date) ?? null]));
}

function calculateMetrics(prices, dates) {
  const observations = dates.map((date) => [date, prices[date]]).filter(([, price]) => Number.isFinite(price));
  const values = observations.map(([, price]) => price);
  const start = prices[dates[0]];
  const end = prices[dates.at(-1)];
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const change = Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
  const changePct = change == null || !start ? null : change / start;
  const firstObserved = observations[0] || null;
  const lastObserved = observations.at(-1) || null;
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
    observedChangePct: firstObserved && lastObserved && firstObserved[1]
      ? (lastObserved[1] - firstObserved[1]) / firstObserved[1]
      : null,
  };
}

function calculateMaxDrawdown(prices) {
  let peak = null;
  let maximumDrawdown = null;
  for (const date of FIRST_MONTH_DATES) {
    const price = prices[date];
    if (!Number.isFinite(price)) continue;
    peak = peak == null ? price : Math.max(peak, price);
    const drawdown = peak ? (peak - price) / peak : 0;
    maximumDrawdown = maximumDrawdown == null ? drawdown : Math.max(maximumDrawdown, drawdown);
  }
  return maximumDrawdown;
}

function calculateTradingAnalysis(prices, overall) {
  const valid = FIRST_MONTH_DATES.map((date) => prices[date]).filter(Number.isFinite);
  const dailyReturns = [];
  for (let index = 1; index < valid.length; index += 1) {
    if (valid[index - 1]) dailyReturns.push(valid[index] / valid[index - 1] - 1);
  }
  const last7Dates = FIRST_MONTH_DATES.slice(-7);
  const last14Dates = FIRST_MONTH_DATES.slice(-14);
  const last7 = calculateMetrics(prices, last7Dates);
  const last14 = calculateMetrics(prices, last14Dates);
  const lastPrice = prices[FIRST_MONTH_DATES.at(-1)];
  const volatility = standardDeviation(dailyReturns);
  const maxDrawdown = calculateMaxDrawdown(prices);
  const pricePosition = Number.isFinite(lastPrice) && overall.maximum !== overall.minimum
    ? (lastPrice - overall.minimum) / (overall.maximum - overall.minimum)
    : null;
  const distanceFromLow = Number.isFinite(lastPrice) && overall.minimum ? lastPrice / overall.minimum - 1 : null;
  const distanceFromHigh = Number.isFinite(lastPrice) && overall.maximum ? lastPrice / overall.maximum - 1 : null;
  const riskScore = Number.isFinite(volatility) && Number.isFinite(maxDrawdown)
    ? Math.round(clamp(volatility * 220 + maxDrawdown * 55, 0, 100))
    : null;
  const momentumComponent = Number.isFinite(last7.changePct) ? clamp((last7.changePct + 0.2) / 0.4, 0, 1) * 40 : 0;
  const lowPositionComponent = Number.isFinite(pricePosition) ? (1 - clamp(pricePosition, 0, 1)) * 25 : 0;
  const monthComponent = Number.isFinite(overall.changePct) ? clamp((overall.changePct + 0.5), 0, 1) * 20 : 0;
  const stabilityComponent = Number.isFinite(volatility) ? (1 - clamp(volatility / 0.15, 0, 1)) * 15 : 0;
  const opportunityScore = overall.observedDays === 30
    ? Math.round(clamp(momentumComponent + lowPositionComponent + monthComponent + stabilityComponent, 0, 100))
    : null;
  const recentValues = last7Dates.map((date) => prices[date]).filter(Number.isFinite);
  return {
    last7,
    last14,
    dailyVolatility: volatility,
    maxDrawdown,
    pricePosition,
    distanceFromLow,
    distanceFromHigh,
    riskScore,
    opportunityScore,
    support7d: recentValues.length ? Math.min(...recentValues) : null,
    resistance7d: recentValues.length ? Math.max(...recentValues) : null,
    breakEvenBuyPrice: Number.isFinite(lastPrice) ? Math.floor(lastPrice * 0.95) : null,
    taxAdjustedReturn: Number.isFinite(lastPrice) && overall.start
      ? (lastPrice * 0.95 - overall.start) / overall.start
      : null,
  };
}

export function classifyMonthlySignal(overall, trading) {
  if (overall.observedDays !== 30 || !Number.isFinite(trading.last7.changePct)) return 'signal_insufficient';
  if (trading.last7.changePct <= -0.12 && trading.maxDrawdown >= 0.25) return 'signal_decline';
  if (overall.changePct >= 0.2 && trading.last7.changePct >= 0.05) return 'signal_strongUp';
  if (overall.changePct < 0 && trading.last7.changePct >= 0.08) return 'signal_rebound';
  if (trading.distanceFromLow <= 0.12 && trading.last7.changePct >= -0.03 && trading.last7.changePct <= 0.06) return 'signal_lowStable';
  if (trading.dailyVolatility >= 0.12) return 'signal_highVol';
  return 'signal_range';
}

function platformAnalysis(prices) {
  const periods = Object.fromEntries(FIRST_MONTH_PERIODS.map((period) => [
    period.key,
    calculateMetrics(prices, datesBetween(period.start, period.end)),
  ]));
  const overall = calculateMetrics(prices, FIRST_MONTH_DATES);
  const trading = calculateTradingAnalysis(prices, overall);
  return { periods, overall, trading, signal: classifyMonthlySignal(overall, trading) };
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
  const dailyMedian = Object.fromEntries(FIRST_MONTH_DATES.map((date) => [
    date,
    median(players.map((player) => player.prices[platform][date])),
  ]));
  const periods = Object.fromEntries(FIRST_MONTH_PERIODS.map((period) => {
    const metrics = players.map((player) => player.analysis[platform].periods[period.key]);
    const changes = metrics.map((item) => item.changePct).filter(Number.isFinite);
    const startMedian = dailyMedian[period.start];
    const endMedian = dailyMedian[period.end];
    return [period.key, {
      ...period,
      completePlayers: metrics.filter((item) => item.observedDays === datesBetween(period.start, period.end).length).length,
      gainers: changes.filter((value) => value > 0).length,
      losers: changes.filter((value) => value < 0).length,
      flat: changes.filter((value) => value === 0).length,
      medianPlayerChangePct: median(changes),
      marketMedianStart: startMedian,
      marketMedianEnd: endMedian,
      marketMedianChangePct: startMedian ? (endMedian - startMedian) / startMedian : null,
    }];
  }));
  const ranked = players.filter((player) => Number.isFinite(player.analysis[platform].overall.changePct));
  const startMedian = dailyMedian[FIRST_MONTH_DATES[0]];
  const endMedian = dailyMedian[FIRST_MONTH_DATES.at(-1)];
  return {
    dailyMedian,
    periods,
    signalCounts: countBy(players, (player) => player.analysis[platform].signal),
    overall: {
      completePlayers: players.filter((player) => player.analysis[platform].overall.observedDays === 30).length,
      marketMedianStart: startMedian,
      marketMedianEnd: endMedian,
      marketMedianChangePct: startMedian ? (endMedian - startMedian) / startMedian : null,
      medianPlayerChangePct: median(ranked.map((player) => player.analysis[platform].overall.changePct)),
    },
  };
}

export function buildFirstMonthDocument(playerIndex, rawRecords) {
  const byUrl = new Map(rawRecords.map((record) => [record.fc26Url, record]));
  const players = playerIndex.players.filter((player) => player.fc26Url).map((player) => {
    const raw = byUrl.get(player.fc26Url);
    const prices = { cross: normalizeSeries(raw?.cross), pc: normalizeSeries(raw?.pc) };
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
      analysis: { cross: platformAnalysis(prices.cross), pc: platformAnalysis(prices.pc) },
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    game: 'FC26',
    source: 'FUTBIN historical daily average price',
    sourceBaseUrl: 'https://www.futbin.com/26/players',
    launchDate: '2025-09-18',
    window: { start: FIRST_MONTH_DATES[0], end: FIRST_MONTH_DATES.at(-1), days: FIRST_MONTH_DATES },
    periods: Object.fromEntries(FIRST_MONTH_PERIODS.map((period) => [period.key, period])),
    platforms: { cross: 'platform_cross', pc: 'platform_pc' },
    zeroPricePolicy: 'FUTBIN returns 0 for days with no valid average; normalized to null; metrics ignore missing values.',
    tradingMethod: {
      taxRate: 0.05,
      opportunityScore: 'last7 momentum 40% + month low position 25% + month change 20% + stability 15%',
      riskScore: 'weighted score of daily return volatility and max drawdown, range 0-100',
      disclaimer: 'Signals are for historical screening and backtesting only; no guarantee of future prices.',
    },
    labels: Object.fromEntries(
      ['week1', 'week2', 'week3', 'week4', 'tail',
       'signal_strongUp', 'signal_rebound', 'signal_decline', 'signal_lowStable',
       'signal_highVol', 'signal_range', 'signal_insufficient',
       'platform_cross', 'platform_pc',
       'pos_forward', 'pos_midfield', 'pos_defender'].map((key) => [key, TRANSLATIONS[key] || { zh: key, en: key }])
    ),
    counts: {
      requested: players.length,
      captured: players.filter((player) => player.status === 'captured').length,
      missing: players.filter((player) => player.status === 'missing').length,
      completeCross30Days: players.filter((player) => player.analysis.cross.overall.observedDays === 30).length,
      completePc30Days: players.filter((player) => player.analysis.pc.overall.observedDays === 30).length,
    },
    summary: { cross: summarizePlatform(players, 'cross'), pc: summarizePlatform(players, 'pc') },
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

async function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

function dailyRows(document) {
  const rows = [['slug', 'name', 'source_groups', 'platform', 'date', 'period', 'price', 'available', 'source_url']];
  for (const player of document.players) {
    for (const platform of ['cross', 'pc']) {
      for (const date of FIRST_MONTH_DATES) {
        const period = FIRST_MONTH_PERIODS.find((item) => date >= item.start && date <= item.end);
        const price = player.prices[platform][date];
        rows.push([player.slug, player.name, player.sourceGroups.join('|'), platform, date, period?.key || '', price, Number.isFinite(price), player.sourceUrl]);
      }
    }
  }
  return rows;
}

function summaryRows(document) {
  const rows = [[
    'slug', 'name', 'source_groups', 'platform', 'signal', 'observed_days', 'start', 'end', 'change_pct',
    'last_7d_change_pct', 'last_14d_change_pct', 'daily_volatility', 'max_drawdown', 'price_position',
    'support_7d', 'resistance_7d', 'break_even_buy_price', 'tax_adjusted_return', 'opportunity_score', 'risk_score',
    'trough_date', 'peak_date', 'source_url',
  ]];
  for (const player of document.players) {
    for (const platform of ['cross', 'pc']) {
      const { overall, trading, signal } = player.analysis[platform];
      rows.push([
        player.slug, player.name, player.sourceGroups.join('|'), platform, signal, overall.observedDays,
        overall.start, overall.end, overall.changePct, trading.last7.changePct, trading.last14.changePct,
        trading.dailyVolatility, trading.maxDrawdown, trading.pricePosition, trading.support7d, trading.resistance7d,
        trading.breakEvenBuyPrice, trading.taxAdjustedReturn, trading.opportunityScore, trading.riskScore,
        overall.troughDate, overall.peakDate, player.sourceUrl,
      ]);
    }
  }
  return rows;
}

function dashboardDocument(document) {
  return {
    generatedAt: document.generatedAt,
    launchDate: document.launchDate,
    window: document.window,
    periods: document.periods,
    platforms: document.platforms,
    counts: document.counts,
    summary: document.summary,
    tradingMethod: document.tradingMethod,
    players: document.players,
  };
}

async function main() {
  await fs.mkdir(PRICE_DIR, { recursive: true });
  const [playerIndex, checkpoint] = await Promise.all([
    fs.readFile(PLAYER_INDEX_FILE, 'utf8').then(JSON.parse),
    fs.readFile(CHECKPOINT_FILE, 'utf8').then(JSON.parse),
  ]);
  const document = buildFirstMonthDocument(playerIndex, checkpoint.records || []);
  await Promise.all([
    writeJson(RAW_FILE, { schemaVersion: 1, generatedAt: document.generatedAt, window: document.window, records: checkpoint.records || [], failures: checkpoint.failures || [] }),
    writeJson(OUTPUT_FILE, document),
    writeJson(DASHBOARD_FILE, dashboardDocument(document)),
    writeCsv(DAILY_CSV_FILE, dailyRows(document)),
    writeCsv(SUMMARY_CSV_FILE, summaryRows(document)),
  ]);
  console.log(JSON.stringify({ output: OUTPUT_FILE, counts: document.counts, dailyRows: document.players.length * 2 * FIRST_MONTH_DATES.length, summaryRows: document.players.length * 2 }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
