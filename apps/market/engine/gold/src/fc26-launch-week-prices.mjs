#!/usr/bin/env node
// 作用：采集并整理FC26开服周金卡价格，生成跨平台可核验数据集。

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createI18n, TRANSLATIONS } from '../../src/i18n.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = path.join(PROJECT_DIR, 'data', 'players');
const PRICE_DIR = path.join(PROJECT_DIR, 'gold', 'data', 'prices', 'fc26');
const PLAYER_INDEX_FILE = path.join(DATA_DIR, 'player-index.json');
const CHECKPOINT_FILE = path.join(PRICE_DIR, '.fc26-launch-week-checkpoint.json');
const RAW_FILE = path.join(PRICE_DIR, 'fc26-launch-week-raw.json');
const OUTPUT_FILE = path.join(PRICE_DIR, 'fc26-launch-week.json');
const CSV_FILE = path.join(PRICE_DIR, 'fc26-launch-week.csv');
const PROFILE_DIR = path.join(PROJECT_DIR, '.futbin-browser-profile');

// Read language from config (sync, with fallback)
let lang = 'zh';
try {
  const configRaw = readFileSync(path.join(PROJECT_DIR, 'config.json'), 'utf8');
  lang = JSON.parse(configRaw).language || 'zh';
} catch { /* fallback to zh */ }
const i18n = createI18n(lang);

const START_DATE = '2025-09-18';
const END_DATE = '2025-09-24';
const START_MS = Date.parse(`${START_DATE}T00:00:00.000Z`);
const END_EXCLUSIVE_MS = Date.parse('2025-09-25T00:00:00.000Z');
const DATES = Array.from({ length: 7 }, (_, index) => (
  new Date(START_MS + index * 86_400_000).toISOString().slice(0, 10)
));

const HELP = `
FC26 Launch Week FUTBIN Historical Price Scraper / FC26 开服首周 FUTBIN 历史价格抓取

Usage / 用法:
  npm run prices:fc26-launch
  node gold/src/fc26-launch-week-prices.mjs --background

Options / 参数:
  --background     Use normal Chrome, minimize script window (recommended) / 使用正常 Chrome，最小化窗口（推荐）
  --headless       Run headless; switch to --background if challenge occurs / 无界面运行；遇验证改用 --background
  --force          Ignore checkpoint, re-capture all / 忽略检查点，全部重新抓取
  --limit <n>      Max cards to process this run / 本次最多处理 n 张
  --delay <ms>     Delay between visits, default 1500ms / 每次访问后等待，默认 1500ms
  --only <slug>    Process only specified players (comma-separated) / 只处理指定球员
  -h, --help       Show help / 显示帮助
`;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(args) {
  const result = { background: false, headless: false, force: false, limit: Infinity, delayMs: 1_500, only: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--background') result.background = true;
    else if (arg === '--headless') result.headless = true;
    else if (arg === '--force') result.force = true;
    else if (arg === '--limit') result.limit = Math.max(0, Number(args[++index]) || 0);
    else if (arg === '--delay') result.delayMs = Math.max(500, Number(args[++index]) || 1_500);
    else if (arg === '--only') result.only = String(args[++index] || '').split(',').map((value) => value.trim()).filter(Boolean);
    else throw new Error(`${i18n.t('cli_unknownArg')}: ${arg}`);
  }
  if (result.headless) result.background = false;
  return result;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsv(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const text = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, text, 'utf8');
  await fs.rename(temporary, file);
}

function isChallenge(title, bodyText) {
  const value = `${title}\n${bodyText}`.toLowerCase();
  return [
    'just a moment',
    'checking your browser',
    'verify you are human',
    'performing security verification',
    '正在进行安全验证',
    '请稍候',
    'cloudflare ray id',
  ].some((needle) => value.includes(needle));
}

async function setWindowState(context, page, windowState) {
  const session = await context.newCDPSession(page);
  try {
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
  } finally {
    await session.detach();
  }
}

async function waitThroughChallenge(context, page, options) {
  const started = Date.now();
  let announced = false;
  let restored = false;
  while (Date.now() - started < 300_000) {
    const title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '');
    if (!isChallenge(title, bodyText)) {
      if (restored) await setWindowState(context, page, 'minimized').catch(() => {});
      return;
    }
    if (options.headless) throw new Error('FUTBIN security challenge detected. Please re-run with --background to complete it manually.');
    if (!announced) {
      if (options.background) {
        await setWindowState(context, page, 'normal').catch(() => {});
        restored = true;
      }
      log('FUTBIN security challenge detected. Please complete it in the script Chrome window; it will auto-continue and re-minimize.');
      announced = true;
    }
    await sleep(2_000);
  }
  throw new Error('Timed out waiting for FUTBIN security challenge.');
}

async function navigate(context, page, url, options) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitThroughChallenge(context, page, options);
      return;
    } catch (error) {
      lastError = error;
      if (/security challenge/i.test(error.message)) throw error;
      if (attempt < 3) {
        log(`Page load failed, retry ${attempt}: ${url}`);
        await sleep(2_000 * attempt);
      }
    }
  }
  throw lastError;
}

async function extractLaunchWeek(page) {
  try {
    await page.waitForFunction(() => {
      return [...document.querySelectorAll('[data-ps-data], [data-pc-data]')].some((element) => {
        const raw = element.getAttribute('data-ps-data') || element.getAttribute('data-pc-data') || '[]';
        try {
          return JSON.parse(raw).length > 100;
        } catch {
          return false;
        }
      });
    }, null, { timeout: 25_000, polling: 250 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      graphCount: document.querySelectorAll('.highcharts-graph-wrapper').length,
      dataSeriesCount: document.querySelectorAll('[data-ps-data], [data-pc-data]').length,
      body: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 240),
    })).catch(() => null);
    throw new Error(`${error.message}; 页面诊断=${JSON.stringify(diagnostic)}`);
  }

  return page.evaluate(({ startMs, endMs }) => {
    const elements = [...document.querySelectorAll('.highcharts-graph-wrapper')];
    const readDaily = (attribute) => {
      for (const element of elements.filter((candidate) => candidate.hasAttribute(attribute))) {
        let series = [];
        try {
          series = JSON.parse(element.getAttribute(attribute) || '[]');
        } catch {
          continue;
        }
        if (series.length > 100 && series.some(([timestamp]) => timestamp === startMs)) {
          return series.filter(([timestamp]) => timestamp >= startMs && timestamp < endMs);
        }
      }
      return [];
    };
    return {
      title: document.title,
      cross: readDaily('data-ps-data'),
      pc: readDaily('data-pc-data'),
    };
  }, { startMs: START_MS, endMs: END_EXCLUSIVE_MS });
}

function priceMap(series = []) {
  const byDate = new Map(series.map(([timestamp, price]) => [
    new Date(timestamp).toISOString().slice(0, 10),
    Number(price) > 0 ? Number(price) : null,
  ]));
  return Object.fromEntries(DATES.map((date) => [date, byDate.get(date) ?? null]));
}

function metrics(prices) {
  const observations = Object.entries(prices).filter(([, price]) => Number.isFinite(price) && price > 0);
  const values = observations.map(([, price]) => price);
  const start = prices[START_DATE];
  const end = prices[END_DATE];
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const change = Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
  const changePct = change == null || !start ? null : change / start;
  return {
    observedDays: values.length,
    start,
    end,
    change,
    changePct,
    minimum,
    maximum,
    range: minimum == null || maximum == null ? null : maximum - minimum,
    rangePct: minimum ? (maximum - minimum) / minimum : null,
    troughDate: minimum == null ? null : observations.find(([, price]) => price === minimum)?.[0] || null,
    peakDate: maximum == null ? null : observations.find(([, price]) => price === maximum)?.[0] || null,
  };
}

function buildOutput(playerIndex, rawRecords, failures = []) {
  const recordsByUrl = new Map(rawRecords.map((record) => [record.fc26Url, record]));
  const failuresByUrl = new Map(failures.map((failure) => [failure.url, failure]));
  const players = playerIndex.players.filter((player) => player.fc26Url).map((player) => {
    const raw = recordsByUrl.get(player.fc26Url);
    const cross = priceMap(raw?.cross);
    const pc = priceMap(raw?.pc);
    return {
      slug: player.slug,
      name: player.name,
      sourceGroups: player.sourceGroups || [],
      rankByGroup: player.rankByGroup || {},
      fc27Url: player.fc27Url,
      fc26Url: player.fc26Url,
      sourceUrl: `${player.fc26Url}/market`,
      status: raw ? 'captured' : 'missing',
      error: failuresByUrl.get(player.fc26Url)?.error || null,
      prices: { cross, pc },
      metrics: { cross: metrics(cross), pc: metrics(pc) },
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    game: 'FC26',
    source: 'FUTBIN historical daily average price',
    sourceBaseUrl: 'https://www.futbin.com/26/players',
    launchDate: START_DATE,
    window: { start: START_DATE, end: END_DATE, days: DATES },
    platforms: {
      cross: 'platform_cross',
      pc: 'platform_pc',
    },
    zeroPricePolicy: 'FUTBIN returns 0 for days with no valid average; normalized to null; metrics ignore missing values.',
    labels: Object.fromEntries(
      ['platform_cross', 'platform_pc'].map((key) => [key, TRANSLATIONS[key] || { zh: key, en: key }])
    ),
    counts: {
      requested: players.length,
      captured: players.filter((player) => player.status === 'captured').length,
      missing: players.filter((player) => player.status === 'missing').length,
      completeCross: players.filter((player) => player.metrics.cross.observedDays === 7).length,
      completePc: players.filter((player) => player.metrics.pc.observedDays === 7).length,
    },
    players,
  };
}

function buildCsvRows(document) {
  const headers = [
    'slug', 'name', 'source_groups', 'fc27_url', 'fc26_url', 'source_url', 'status',
    ...DATES.map((date) => `cross_${date}`),
    'cross_observed_days', 'cross_start', 'cross_end', 'cross_change', 'cross_change_pct', 'cross_min', 'cross_max', 'cross_range_pct',
    ...DATES.map((date) => `pc_${date}`),
    'pc_observed_days', 'pc_start', 'pc_end', 'pc_change', 'pc_change_pct', 'pc_min', 'pc_max', 'pc_range_pct',
    'error',
  ];
  const rows = document.players.map((player) => [
    player.slug,
    player.name,
    player.sourceGroups.join('|'),
    player.fc27Url,
    player.fc26Url,
    player.sourceUrl,
    player.status,
    ...DATES.map((date) => player.prices.cross[date]),
    player.metrics.cross.observedDays,
    player.metrics.cross.start,
    player.metrics.cross.end,
    player.metrics.cross.change,
    player.metrics.cross.changePct,
    player.metrics.cross.minimum,
    player.metrics.cross.maximum,
    player.metrics.cross.rangePct,
    ...DATES.map((date) => player.prices.pc[date]),
    player.metrics.pc.observedDays,
    player.metrics.pc.start,
    player.metrics.pc.end,
    player.metrics.pc.change,
    player.metrics.pc.changePct,
    player.metrics.pc.minimum,
    player.metrics.pc.maximum,
    player.metrics.pc.rangePct,
    player.error,
  ]);
  return [headers, ...rows];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  await fs.mkdir(PRICE_DIR, { recursive: true });
  const playerIndex = await readJson(PLAYER_INDEX_FILE);
  if (!playerIndex || !Array.isArray(playerIndex.players)) throw new Error(`Invalid player index: ${PLAYER_INDEX_FILE}`);

  const checkpoint = options.force ? null : await readJson(CHECKPOINT_FILE, null);
  const rawByUrl = new Map((checkpoint?.records || []).map((record) => [record.fc26Url, record]));
  const only = new Set(options.only);
  let candidates = playerIndex.players.filter((player) => player.fc26Url && !rawByUrl.has(player.fc26Url));
  if (only.size) candidates = candidates.filter((player) => only.has(player.slug));
  candidates = candidates.slice(0, options.limit);

  log(`FC26 linked cards: ${playerIndex.players.filter((player) => player.fc26Url).length}; cached: ${rawByUrl.size}; pending: ${candidates.length}.`);

  const writeOutputs = async (failures = []) => {
    const rawRecords = [...rawByUrl.values()];
    const output = buildOutput(playerIndex, rawRecords, failures);
    await writeJson(RAW_FILE, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      window: { start: START_DATE, end: END_DATE },
      records: rawRecords,
      failures,
    });
    await writeJson(OUTPUT_FILE, output);
    await writeCsv(CSV_FILE, buildCsvRows(output));
    log(`Done: ${output.counts.captured}/${output.counts.requested}; Cross 7-day complete ${output.counts.completeCross}; PC 7-day complete ${output.counts.completePc}.`);
    log(`JSON：${OUTPUT_FILE}`);
    log(`CSV：${CSV_FILE}`);
    if (output.counts.missing) process.exitCode = 2;
  };

  if (!candidates.length) {
    await writeOutputs(checkpoint?.failures || []);
    return;
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: options.headless,
    viewport: { width: 1229, height: 900 },
    locale: 'en-US',
    colorScheme: 'dark',
    acceptDownloads: false,
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(25_000);
  const failures = [];

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await context.close().catch(() => {});
  };
  process.once('SIGINT', () => stop().finally(() => process.exit(130)));
  process.once('SIGTERM', () => stop().finally(() => process.exit(143)));

  try {
    if (options.background && candidates.length) {
      await navigate(context, page, candidates[0].fc26Url, options);
      await setWindowState(context, page, 'minimized').catch(() => {});
      log('Security challenge completed, script Chrome window minimized.');
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const player = candidates[index];
      const sourceUrl = `${player.fc26Url}/market`;
      try {
        await navigate(context, page, sourceUrl, options);
        const extracted = await extractLaunchWeek(page);
        if (!extracted.cross.length && !extracted.pc.length) throw new Error('No launch week price data found');
        rawByUrl.set(player.fc26Url, { ...player, sourceUrl, ...extracted, capturedAt: new Date().toISOString() });
        log(`[${index + 1}/${candidates.length}] ${player.name}：Cross ${extracted.cross.length} 天，PC ${extracted.pc.length} 天`);
      } catch (error) {
        failures.push({ slug: player.slug, name: player.name, url: player.fc26Url, error: error.message });
        log(`[${index + 1}/${candidates.length}] ${player.name} 失败：${error.message}`);
      }
      await writeJson(CHECKPOINT_FILE, {
        generatedAt: new Date().toISOString(),
        window: { start: START_DATE, end: END_DATE },
        records: [...rawByUrl.values()],
        failures,
      });
      if (index < candidates.length - 1) await sleep(options.delayMs);
    }
  } finally {
    await stop();
  }

  await writeOutputs(failures);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
