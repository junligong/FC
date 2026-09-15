#!/usr/bin/env node
// 作用：抓取FC26基础金卡资料并保存为本地可复核数据集。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_DIR = path.join(PROJECT_DIR, '.futbin-browser-profile');
const CHECKPOINT_DIR = path.join(PROJECT_DIR, 'output', '_cache', 'fc26-base-cards-checkpoint');

const START_DATE = '2025-09-18';
const END_DATE = '2025-10-17';
const START_MS = Date.parse(`${START_DATE}T00:00:00.000Z`);
const END_EXCLUSIVE_MS = Date.parse('2025-10-18T00:00:00.000Z');
const DATES = Array.from({ length: 30 }, (_, i) =>
  new Date(START_MS + i * 86_400_000).toISOString().slice(0, 10)
);

const CARD_TYPES = [
  {
    key: 'icon',
    label: 'Base Icon',
    listUrl: 'https://www.futbin.com/26/players?version=icon',
    outputDir: path.join(PROJECT_DIR, 'icons', 'data', 'players', 'fc26'),
    outputFile: 'base-icons.json',
  },
  {
    key: 'hero',
    label: 'Base Hero',
    listUrl: 'https://www.futbin.com/26/players?version=hero',
    outputDir: path.join(PROJECT_DIR, 'heroes', 'data', 'players', 'fc26'),
    outputFile: 'base-heroes.json',
  },
  {
    key: 'totw1',
    label: 'TOTW 1',
    listUrl: 'https://www.futbin.com/26/players?version=totw',
    outputDir: path.join(PROJECT_DIR, 'totw', 'data', 'players', 'fc26'),
    outputFile: 'totw-1.json',
  },
];

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

function isChallenge(title, bodyText) {
  const v = `${title}\n${bodyText}`.toLowerCase();
  return ['just a moment', 'checking your browser', 'verify you are human',
    'performing security verification', 'cloudflare ray id',
    '请稍候', '正在进行安全验证'].some(n => v.includes(n));
}

async function setWindowState(context, page, state) {
  const session = await context.newCDPSession(page);
  try {
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: state } });
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
    if (options.headless) throw new Error('FUTBIN 要求安全验证，请改用 --background');
    if (!announced) {
      if (options.background) {
        await setWindowState(context, page, 'normal').catch(() => {});
        restored = true;
      }
      log('出现 FUTBIN 安全验证，请在脚本 Chrome 窗口中完成');
      announced = true;
    }
    await sleep(2_000);
  }
  throw new Error('等待 FUTBIN 安全验证超时');
}

async function navigate(context, page, url, options) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitThroughChallenge(context, page, options);
      return;
    } catch (error) {
      lastError = error;
      if (/安全验证/.test(error.message)) throw error;
      if (attempt < 3) {
        log(`页面加载失败，第 ${attempt} 次重试：${url}`);
        await sleep(2_000 * attempt);
      }
    }
  }
  throw lastError;
}

async function scrollToBottom(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
  await page.waitForTimeout(500);
}

async function extractPlayerList(page, year) {
  await scrollToBottom(page);
  const players = await page.evaluate((targetYear) => {
    const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
    const rows = [];
    const seen = new Set();

    for (const anchor of document.querySelectorAll('a[href]')) {
      let url;
      try {
        url = new URL(anchor.getAttribute('href'), location.href);
      } catch { continue; }

      const match = url.pathname.match(new RegExp(`^/${targetYear}/player/\\d+/([^/?#]+)`, 'i'));
      if (!match) continue;

      const playerUrl = `${url.origin}${url.pathname}`;
      if (seen.has(playerUrl)) continue;
      seen.add(playerUrl);

      const image = anchor.querySelector('img[alt]');
      const name = clean(
        anchor.getAttribute('data-player-name') ||
        anchor.getAttribute('aria-label') ||
        image?.getAttribute('alt') ||
        anchor.querySelector('[class*="name" i]')?.textContent ||
        ''
      );

      // Try to find rating, position, price from nearby elements
      const card = anchor.closest('[class*="player" i], [class*="card" i], tr, li');
      const ratingEl = card?.querySelector('[class*="rating" i], .rating');
      const rating = ratingEl ? clean(ratingEl.textContent) : '';
      
      // Find price - look for elements with price-like content
      let priceText = '';
      const priceEls = card?.querySelectorAll('[class*="price" i], .price, [data-price]');
      if (priceEls?.length) {
        priceText = clean(priceEls[0].textContent);
      }

      rows.push({
        url: playerUrl,
        slug: match[1],
        name: name || match[1].replace(/-/g, ' '),
        rating: rating ? Number(rating) : null,
        currentPriceText: priceText,
      });
    }
    return rows;
  }, String(year));

  // Deduplicate by URL
  const byUrl = new Map();
  for (const p of players) {
    if (!byUrl.has(p.url)) byUrl.set(p.url, p);
  }
  return [...byUrl.values()];
}

async function crawlList(context, page, startUrl, year, options, label) {
  const collected = new Map();
  let url = startUrl;
  let pageNum = 1;

  while (url && pageNum <= 50) {
    log(`抓取${label}列表，第 ${pageNum} 页`);
    await navigate(context, page, url, options);
    await page.waitForTimeout(1500);

    const batch = await extractPlayerList(page, year);
    log(`  第 ${pageNum} 页提取 ${batch.length} 名球员`);

    for (const p of batch) {
      if (!collected.has(p.url)) collected.set(p.url, p);
    }

    // Find next page
    const nextUrl = await page.evaluate(() => {
      const current = new URL(location.href);
      const selectors = ['a[rel="next"]', 'a[aria-label*="next" i]', 'li.next a[href]'];
      for (const sel of selectors) {
        const anchor = document.querySelector(sel);
        if (anchor && !anchor.closest('.disabled,[disabled]')) {
          try {
            const u = new URL(anchor.getAttribute('href'), current);
            if (u.href !== current.href) return u.href;
          } catch {}
        }
      }
      // Try numbered pagination
      const currentPage = Number(current.searchParams.get('page') || 1);
      const links = document.querySelectorAll('a[href*="page="]');
      const candidates = [];
      for (const a of links) {
        try {
          const u = new URL(a.getAttribute('href'), current);
          const pn = Number(u.searchParams.get('page'));
          if (pn > currentPage) candidates.push({ url: u.href, page: pn });
        } catch {}
      }
      candidates.sort((a, b) => a.page - b.page);
      return candidates[0]?.url || null;
    });

    if (!nextUrl || nextUrl === url) break;
    url = nextUrl;
    pageNum++;
    await sleep(options.delayMs);
  }

  return [...collected.values()];
}

async function extractPriceHistory(page) {
  try {
    await page.waitForFunction(() => {
      return [...document.querySelectorAll('[data-ps-data], [data-pc-data]')].some((el) => {
        const raw = el.getAttribute('data-ps-data') || el.getAttribute('data-pc-data') || '[]';
        try { return JSON.parse(raw).length > 100; } catch { return false; }
      });
    }, null, { timeout: 25_000, polling: 250 });
  } catch {
    return { cross: [], pc: [], title: '' };
  }

  return page.evaluate(({ startMs, endMs }) => {
    const elements = [...document.querySelectorAll('.highcharts-graph-wrapper')];
    const readDaily = (attr) => {
      for (const el of elements.filter(e => e.hasAttribute(attr))) {
        let series = [];
        try { series = JSON.parse(el.getAttribute(attr) || '[]'); } catch { continue; }
        if (series.length > 100 && series.some(([ts]) => ts === startMs)) {
          return series.filter(([ts]) => ts >= startMs && ts < endMs);
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
  const byDate = new Map(series.map(([ts, price]) => [
    new Date(ts).toISOString().slice(0, 10),
    Number(price) > 0 ? Number(price) : null,
  ]));
  return Object.fromEntries(DATES.map(d => [d, byDate.get(d) ?? null]));
}

function metrics(prices) {
  const obs = Object.entries(prices).filter(([, p]) => Number.isFinite(p) && p > 0);
  const vals = obs.map(([, p]) => p);
  const start = prices[START_DATE];
  const end = prices[END_DATE];
  const min = vals.length ? Math.min(...vals) : null;
  const max = vals.length ? Math.max(...vals) : null;
  const change = (Number.isFinite(start) && Number.isFinite(end)) ? end - start : null;
  const changePct = (change != null && start) ? change / start : null;
  return {
    observedDays: vals.length,
    start, end, change, changePct, minimum: min, maximum: max,
    range: (min != null && max != null) ? max - min : null,
    rangePct: min ? (max - min) / min : null,
  };
}

function parseArgs(args) {
  const result = { background: false, headless: false, force: false, limit: Infinity, delayMs: 1500, only: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--background') result.background = true;
    else if (a === '--headless') result.headless = true;
    else if (a === '--force') result.force = true;
    else if (a === '--limit') result.limit = Math.max(0, Number(args[++i]) || 0);
    else if (a === '--delay') result.delayMs = Math.max(500, Number(args[++i]) || 1500);
    else if (a === '--only') result.only = String(args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '-h' || a === '--help') {
      console.log(`
FC26 Base Cards (Icon/Hero/TOTW1) Player List + Price Fetcher

Usage:
  node src/fetch-fc26-base-cards.mjs --background
  node src/fetch-fc26-base-cards.mjs --only icon,hero
  node src/fetch-fc26-base-cards.mjs --force --limit 10

Options:
  --background    Use normal Chrome, minimize window (recommended)
  --headless      Headless mode
  --force         Ignore checkpoint, re-fetch everything
  --limit <n>     Max players to process per card type
  --delay <ms>    Delay between requests, default 1500ms
  --only <types>  Only process specified types: icon,hero,totw1
`);
      process.exit(0);
    }
  }
  if (result.headless) result.background = false;
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });

  const onlyTypes = new Set(options.only.length ? options.only : CARD_TYPES.map(t => t.key));
  const typesToFetch = CARD_TYPES.filter(t => onlyTypes.has(t.key));

  log(`准备抓取卡牌类型: ${typesToFetch.map(t => t.label).join(', ')}`);

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

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await context.close().catch(() => {});
  };
  process.once('SIGINT', () => stop().finally(() => process.exit(130)));
  process.once('SIGTERM', () => stop().finally(() => process.exit(143)));

  try {
    // Initial navigation to pass Cloudflare
    if (options.background) {
      await navigate(context, page, 'https://www.futbin.com/26/players', options);
      await setWindowState(context, page, 'minimized').catch(() => {});
      log('安全验证完成，Chrome 窗口已最小化');
    } else {
      await navigate(context, page, 'https://www.futbin.com/26/players', options);
      log('FUTBIN 首页加载完成');
    }

    for (const cardType of typesToFetch) {
      log(`\n========== 处理 ${cardType.label} ==========`);

      // Step 1: Crawl player list
      const checkpointFile = path.join(CHECKPOINT_DIR, `${cardType.key}-checkpoint.json`);
      const existingCheckpoint = options.force ? null : await readJson(checkpointFile, null);

      let playerList = existingCheckpoint?.playerList || [];

      if (!playerList.length) {
        log(`抓取 ${cardType.label} 球员列表...`);
        playerList = await crawlList(context, page, cardType.listUrl, 26, options, cardType.label);
        log(`${cardType.label} 列表抓取完成: ${playerList.length} 名球员`);

        // Save checkpoint
        await writeJson(checkpointFile, {
          generatedAt: new Date().toISOString(),
          cardType: cardType.key,
          playerList,
          priceRecords: [],
          failures: [],
        });
      } else {
        log(`${cardType.label} 列表已缓存: ${playerList.length} 名球员`);
      }

      // Step 2: Fetch prices for each player
      const priceRecords = existingCheckpoint?.priceRecords || [];
      const failures = existingCheckpoint?.failures || [];
      const fetchedUrls = new Set(priceRecords.map(r => r.url));
      const failedUrls = new Set(failures.map(f => f.url));

      let candidates = playerList.filter(p => !fetchedUrls.has(p.url) && !failedUrls.has(p.url));
      candidates = candidates.slice(0, options.limit);

      log(`${cardType.label}: 总 ${playerList.length} 人，已抓 ${priceRecords.length} 人，待抓 ${candidates.length} 人`);

      for (let i = 0; i < candidates.length; i++) {
        const player = candidates[i];
        const marketUrl = `${player.url}/market`;
        try {
          await navigate(context, page, marketUrl, options);
          const extracted = await extractPriceHistory(page);
          if (!extracted.cross.length && !extracted.pc.length) {
            throw new Error('未找到历史价格数据');
          }
          const cross = priceMap(extracted.cross);
          const pc = priceMap(extracted.pc);
          priceRecords.push({
            ...player,
            marketUrl,
            prices: { cross, pc },
            metrics: { cross: metrics(cross), pc: metrics(pc) },
            capturedAt: new Date().toISOString(),
          });
          fetchedUrls.add(player.url);
          const launchPrice = cross[START_DATE];
          log(`[${i + 1}/${candidates.length}] ${player.name} | 开服价: ${launchPrice ? launchPrice.toLocaleString() : 'N/A'} | Cross ${extracted.cross.length} 天`);
        } catch (error) {
          failures.push({ ...player, error: error.message });
          failedUrls.add(player.url);
          log(`[${i + 1}/${candidates.length}] ${player.name} 失败: ${error.message}`);
        }

        // Save checkpoint every 5 players
        if ((i + 1) % 5 === 0 || i === candidates.length - 1) {
          await writeJson(checkpointFile, {
            generatedAt: new Date().toISOString(),
            cardType: cardType.key,
            playerList,
            priceRecords,
            failures,
          });
        }
        if (i < candidates.length - 1) await sleep(options.delayMs);
      }

      // Step 3: Build output
      const output = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        game: 'FC26',
        cardType: cardType.key,
        cardLabel: cardType.label,
        source: 'FUTBIN historical daily average price',
        launchDate: START_DATE,
        window: { start: START_DATE, end: END_DATE, days: DATES },
        platforms: {
          cross: 'Cross (PlayStation/Xbox)',
          pc: 'PC',
        },
        counts: {
          total: playerList.length,
          captured: priceRecords.length,
          failed: failures.length,
          withLaunchPrice: priceRecords.filter(r => r.prices.cross[START_DATE] != null).length,
        },
        players: priceRecords,
        failures,
      };

      const outputPath = path.join(cardType.outputDir, cardType.outputFile);
      await writeJson(outputPath, output);
      log(`${cardType.label} 数据已保存: ${outputPath}`);
      log(`  总计 ${output.counts.total} 人，抓取成功 ${output.counts.captured} 人，开服有价格 ${output.counts.withLaunchPrice} 人`);
    }
  } finally {
    await stop();
  }

  log('\n全部卡牌类型处理完成');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
