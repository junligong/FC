#!/usr/bin/env node
// 作用：抓取并生成FC27与FC26球员卡的一对一视觉对比素材。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_CONFIG,
  displayNameFromSlug,
  matchPlayers,
  mergePlayerCatalog,
  mergeConfig,
  normalizeSlug,
  parseCliArgs,
  partitionNewPlayers,
  resolveFrom,
  safeFilename,
  slugFromPlayerUrl,
  uniquePlayers,
} from './core.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `
FUTBIN FC27 vs FC26 1V1 截图工具

用法：
  npm run capture
  npm run capture -- --group midfield
  npm run capture -- --group defender
  npm run capture -- --limit 5
  npm run capture -- --only alexia-putellas-segura

参数：
  --config <file>    配置文件，默认 config.json；不存在时使用内置配置
  --output <dir>     覆盖输出目录
  --group <name>     位置组：forward（前锋）、midfield（中场）或 defender（后卫）
  --list-limit <n>   每个位置列表最多收集的人数，默认 100
  --limit <n>        只处理前 n 名球员
  --only <slug,...>  只处理指定球员，可逗号分隔
  --headed           强制显示浏览器（默认）
  --headless         无界面运行；首次运行不建议使用
  --force            覆盖已有球员截图
  --refresh-index    忽略列表缓存，重新抓取
  --dry-run          只建立索引和匹配，不截图
  --verify-only      仅完成一次安全验证并保存会话，然后退出
  --background       使用正常 Chrome 渲染，但最小化脚本窗口后台运行
  -h, --help         显示帮助
`;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function equivalentUrl(left, right) {
  try {
    const first = new URL(left);
    const second = new URL(right);
    first.hash = '';
    second.hash = '';
    first.searchParams.sort();
    second.searchParams.sort();
    const firstPath = first.pathname.replace(/\/$/, '');
    const secondPath = second.pathname.replace(/\/$/, '');
    return first.origin === second.origin && firstPath === secondPath && first.search === second.search;
  } catch {
    return false;
  }
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

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
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

async function waitThroughChallenge(page, config) {
  const started = Date.now();
  let announced = false;
  let restoredForChallenge = false;
  while (Date.now() - started < config.challengeTimeoutMs) {
    const title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
    if (!isChallenge(title, bodyText)) {
      if (restoredForChallenge) {
        await setAutomationWindowState(page.context(), page, 'minimized').catch(() => {});
        log('安全验证已通过，脚本 Chrome 窗口已重新最小化。');
      }
      return;
    }
    if (config.headless) {
      throw new Error('FUTBIN 正在进行安全验证。请去掉 --headless，用有界面模式首次运行并手动完成验证。');
    }
    if (!announced) {
      if (config.background) {
        await setAutomationWindowState(page.context(), page, 'normal').catch(() => {});
        restoredForChallenge = true;
      }
      log('浏览器中出现 FUTBIN/Cloudflare 安全验证，请在打开的 Chrome 窗口里手动完成；脚本会自动继续。');
      announced = true;
    }
    if (config.background && !restoredForChallenge) {
      await setAutomationWindowState(context, page, 'normal').catch(() => {});
      restoredForChallenge = true;
      log('后台模式：Chrome 窗口已恢复以便手动完成验证。');
    }
    await sleep(2_000);
  }
  throw new Error(`等待安全验证超时（${Math.round(config.challengeTimeoutMs / 1000)} 秒）。`);
}

async function dismissCookieBanner(page) {
  const names = [/accept all/i, /accept cookies/i, /^accept$/i, /同意全部/, /全部接受/];
  for (const name of names) {
    const button = page.getByRole('button', { name }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 3_000 }).catch(() => {});
      return;
    }
  }
}

async function setAutomationWindowState(context, page, windowState) {
  const session = await context.newCDPSession(page);
  try {
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState },
    });
  } finally {
    await session.detach();
  }
}

async function navigate(page, url, config) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.navigationTimeoutMs,
      });
      await waitThroughChallenge(page, config);
      await dismissCookieBanner(page);
      return;
    } catch (error) {
      lastError = error;
      if (/安全验证|security verification/i.test(error.message)) throw error;
      if (attempt < 3) {
        log(`页面加载失败，第 ${attempt} 次重试：${url}`);
        await sleep(2_000 * attempt);
      }
    }
  }
  throw lastError;
}

async function autoScroll(page) {
  let stable = 0;
  let lastHeight = 0;
  for (let round = 0; round < 12 && stable < 3; round += 1) {
    const height = await page.evaluate(() => document.scrollingElement?.scrollHeight || document.body.scrollHeight);
    if (height === lastHeight) stable += 1;
    else stable = 0;
    lastHeight = height;
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement?.scrollHeight || document.body.scrollHeight));
    await sleep(450);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function extractPlayers(page, year) {
  const players = await page.evaluate((targetYear) => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const rows = [];
    for (const anchor of document.querySelectorAll('a[href]')) {
      let url;
      try {
        url = new URL(anchor.getAttribute('href'), location.href);
      } catch {
        continue;
      }
      const match = url.pathname.match(new RegExp(`^/${targetYear}/player/\\d+/([^/?#]+)`, 'i'));
      if (!match) continue;
      const image = anchor.querySelector('img[alt]');
      const candidateName = clean(
        anchor.getAttribute('data-player-name') ||
        anchor.getAttribute('aria-label') ||
        image?.getAttribute('alt') ||
        anchor.querySelector('[class*="name" i]')?.textContent ||
        ''
      );
      rows.push({
        url: `${url.origin}${url.pathname}`,
        slug: match[1],
        name: candidateName,
      });
    }
    return rows;
  }, String(year));

  return uniquePlayers(players.map((player) => ({
    ...player,
    slug: normalizeSlug(player.slug),
    name: player.name || displayNameFromSlug(player.slug),
  })));
}

async function findNextPage(page) {
  return page.evaluate(() => {
    const current = new URL(location.href);
    const selectors = [
      'a[rel="next"]',
      'a[aria-label*="next" i]',
      'li.next a[href]',
      '.pagination-next a[href]',
      '[class*="pagination" i] a[href]',
    ];
    const candidates = [];
    for (const selector of selectors) {
      for (const anchor of document.querySelectorAll(selector)) candidates.push(anchor);
    }
    for (const anchor of candidates) {
      const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
      const rel = anchor.getAttribute('rel') || '';
      const label = anchor.getAttribute('aria-label') || '';
      if (!/next|下一页|›|»/i.test(`${rel} ${label} ${text}`)) continue;
      if (anchor.getAttribute('aria-disabled') === 'true' || anchor.closest('.disabled,[disabled]')) continue;
      try {
        const url = new URL(anchor.getAttribute('href'), current);
        if (url.origin === current.origin && url.pathname === current.pathname && url.href !== current.href) return url.href;
      } catch {
        // Ignore malformed href values.
      }
    }

    // Some FUTBIN layouts render only numbered pagination links with no
    // accessible "Next" label. Follow the smallest observed page number that
    // is greater than the current page instead of guessing a URL.
    const currentPage = Number(current.searchParams.get('page') || 1);
    const numbered = candidates.map((anchor) => {
      try {
        const url = new URL(anchor.getAttribute('href'), current);
        const pageNumber = Number(url.searchParams.get('page'));
        if (url.origin !== current.origin || url.pathname !== current.pathname) return null;
        if (!Number.isInteger(pageNumber) || pageNumber <= currentPage) return null;
        return { url: url.href, pageNumber };
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => a.pageNumber - b.pageNumber);
    if (numbered.length) return numbered[0].url;
    return null;
  });
}

async function crawlPlayerList(page, startUrl, year, config, label, limit) {
  const collected = new Map();
  const visited = new Set();
  let url = startUrl;

  for (let pageNumber = 1; url && pageNumber <= config.maxPages; pageNumber += 1) {
    if (visited.has(url)) break;
    visited.add(url);
    log(`抓取${label}列表，第 ${pageNumber} 页`);
    const currentUrl = await page.url();
    if (equivalentUrl(currentUrl, url)) {
      await waitThroughChallenge(page, config);
      await dismissCookieBanner(page);
    } else {
      await navigate(page, url, config);
    }
    let pagePlayers = [];
    for (let renderAttempt = 1; renderAttempt <= 3; renderAttempt += 1) {
      await page.locator(`a[href*="/${year}/player/"]`).first()
        .waitFor({ state: 'attached', timeout: 25_000 })
        .catch(() => {});
      await autoScroll(page);
      pagePlayers = await extractPlayers(page, year);
      if (pagePlayers.length) break;
      if (renderAttempt < 3) {
        log(`${label}第 ${pageNumber} 页暂未渲染球员卡，重新加载（${renderAttempt}/2）。`);
        await navigate(page, url, config);
        await sleep(3_000);
      }
    }
    if (pagePlayers.length === 0) {
      throw new Error(`${label}第 ${pageNumber} 页连续 3 次没有找到球员链接，未写入不完整索引。`);
    }
    for (const player of pagePlayers) {
      if (!collected.has(player.slug)) collected.set(player.slug, player);
      if (collected.size >= limit) break;
    }
    log(`${label}：本页 ${pagePlayers.length} 人，累计 ${collected.size} 人`);

    if (collected.size >= limit) break;

    const nextUrl = await findNextPage(page);
    if (!nextUrl) {
      throw new Error(`${label}只收集到 ${collected.size}/${limit} 人，但页面没有可用的下一页链接。`);
    }
    url = nextUrl;
    await sleep(config.requestDelayMs);
  }

  if (collected.size === 0) {
    throw new Error(`${label}列表没有找到任何球员链接。FUTBIN 可能改版，请检查页面或更新选择器。`);
  }
  if (collected.size < limit) {
    throw new Error(`${label}只收集到 ${collected.size}/${limit} 人，未写入不完整索引。`);
  }
  return [...collected.values()].slice(0, limit);
}

async function loadOrCrawlIndex({ page, cacheFile, url, year, config, label, refresh, limit }) {
  if (!refresh) {
    const cached = await readJson(cacheFile);
    if (cached?.sourceUrl === url && cached?.limit === limit && cached?.complete === true && cached?.players?.length >= limit) {
      const players = uniquePlayers(cached.players).slice(0, limit);
      log(`读取${label}缓存：${players.length} 人`);
      return players;
    }
  }
  const players = await crawlPlayerList(page, url, year, config, label, limit);
  await writeJson(cacheFile, { sourceUrl: url, limit, complete: true, capturedAt: new Date().toISOString(), players });
  return players;
}

async function prepareDetailPage(page) {
  await page.addStyleTag({
    content: `
      [id^="google_ads"], [data-ad-slot], [class*="ad-container" i],
      #venatus-video-container, .desktop-bottom-overlay, [data-desktop-overlay],
      [class*="cookie" i][class*="banner" i], [class*="consent" i][style*="fixed"] {
        display: none !important;
      }
      html { scroll-behavior: auto !important; }
      *, *::before, *::after { animation: none !important; transition: none !important; }
    `,
  }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 });
  await sleep(1_000);
}

async function findHeroClip(page, config) {
  if (config.captureSelector) {
    const target = page.locator(config.captureSelector).first();
    if (await target.isVisible().catch(() => false)) {
      const box = await target.boundingBox();
      if (box) return box;
    }
  }
  if (config.captureClip) return config.captureClip;

  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const scrollY = window.scrollY;
    const all = [...document.body.querySelectorAll('*')];
    const visibleRect = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
      if (rect.width < 2 || rect.height < 2) return null;
      return rect;
    };
    const directText = (element) => [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const exact = (pattern) => all.find((element) => {
      const rect = visibleRect(element);
      return rect && pattern.test(directText(element));
    });
    const rectOf = (element) => element ? visibleRect(element) : null;

    const skills = exact(/^skills\s*\d*/i);
    const weakFoot = exact(/^weak\s*foot\s*\d*/i);
    const height = exact(/^height\b/i);
    const foot = exact(/^foot\b/i);
    const playerStats = exact(/^player\s*stats$/i);

    const infoCandidates = all.map((element) => {
      const rect = visibleRect(element);
      if (!rect || rect.width < viewportWidth * 0.38 || rect.height < 100 || rect.height > 900) return null;
      const text = (element.innerText || '').toLowerCase();
      const hits = ['skills', 'weak foot', 'height', 'foot'].filter((item) => text.includes(item)).length;
      return hits >= 3 ? { element, rect, hits, area: rect.width * rect.height } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits || a.area - b.area);

    const cardCandidates = all.map((element) => {
      const rect = visibleRect(element);
      if (!rect || rect.left > viewportWidth * 0.46 || rect.width < 180 || rect.height < 220 || rect.height > 850) return null;
      const text = (element.innerText || '').toUpperCase();
      const hits = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'].filter((item) => text.includes(item)).length;
      return hits >= 4 ? { rect, hits, area: rect.width * rect.height } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits || a.area - b.area);

    const anchorRects = [rectOf(skills), rectOf(weakFoot), rectOf(height), rectOf(foot)].filter(Boolean);
    const infoRect = infoCandidates[0]?.rect || (anchorRects.length ? {
      top: Math.min(...anchorRects.map((rect) => rect.top)),
      bottom: Math.max(...anchorRects.map((rect) => rect.bottom)),
    } : null);
    const cardRect = cardCandidates[0]?.rect || null;
    const statsRect = rectOf(playerStats);
    const mainRect = rectOf(document.querySelector('main'));

    const heroTops = [infoRect?.top, cardRect?.top].filter(Number.isFinite);
    let top = heroTops.length ? Math.min(...heroTops) : (mainRect?.top ?? 0);
    if (!Number.isFinite(top)) top = 0;
    top = Math.max(0, top - 24);

    const heroBottoms = [infoRect?.bottom, cardRect?.bottom].filter(Number.isFinite);
    let bottom = (heroBottoms.length
      ? Math.max(...heroBottoms)
      : Math.min(mainRect?.bottom ?? top + 760, top + 760)) + 24;
    if (statsRect && statsRect.top > top + 300 && statsRect.top < top + 950) bottom = statsRect.bottom + 12;
    bottom = Math.max(bottom, top + 420);
    bottom = Math.min(bottom, top + 900, document.documentElement.scrollHeight - scrollY);

    return {
      x: 0,
      y: top + scrollY,
      width: viewportWidth,
      height: Math.max(300, Math.min(bottom - top, Math.max(viewportHeight, 900))),
    };
  });
}

async function capturePlayer(page, player, year, destination, config) {
  log(`截图 FC${String(year).slice(-2)}：${player.name} (${player.url})`);
  await navigate(page, player.url, config);
  await prepareDetailPage(page);
  await page.getByText(/skills|weak foot|height/i).first().waitFor({ state: 'visible', timeout: 12_000 }).catch(() => {});
  await page.waitForFunction(() => [...document.images].some((image) => {
    const source = image.currentSrc || image.src || '';
    return /\/img\/players\//i.test(source) && image.complete && image.naturalWidth >= 100 && image.naturalHeight >= 100;
  }), null, { timeout: 12_000 }).catch(() => {});
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const clip = await findHeroClip(page, config);
  await page.screenshot({
    path: destination,
    clip,
    animations: 'disabled',
    caret: 'hide',
  });
  await sleep(config.requestDelayMs);
  return clip;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function makePairImage(context, fc27File, fc26File, outputFile, playerName, panelWidth) {
  const gap = 16;
  const [left, right] = await Promise.all([
    fs.readFile(fc27File, 'base64'),
    fs.readFile(fc26File, 'base64'),
  ]);
  const pairPage = await context.newPage();
  try {
    await pairPage.setViewportSize({ width: panelWidth * 2 + gap, height: 1200 });
    await pairPage.setContent(`<!doctype html>
      <html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #171a20; }
        #comparison { display: flex; gap: ${gap}px; width: max-content; background: #171a20; }
        .panel { width: ${panelWidth}px; background: #171a20; }
        .label { height: 64px; display: flex; align-items: center; gap: 28px; padding: 0 24px;
          background: #12151a; font-family: Arial, "PingFang SC", sans-serif; }
        .year { color: #35e6aa; font-size: 30px; font-weight: 700; white-space: nowrap; }
        .name { color: #f5f7fa; font-size: 25px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        img { display: block; width: ${panelWidth}px; height: auto; }
      </style></head><body>
        <div id="comparison">
          <section class="panel"><div class="label"><span class="year">FC 27</span><span class="name">${escapeHtml(playerName)}</span></div><img src="data:image/png;base64,${left}"></section>
          <section class="panel"><div class="label"><span class="year">FC 26</span><span class="name">${escapeHtml(playerName)}</span></div><img src="data:image/png;base64,${right}"></section>
        </div>
      </body></html>`, { waitUntil: 'load' });
    await pairPage.locator('#comparison').screenshot({ path: outputFile, animations: 'disabled' });
  } finally {
    await pairPage.close();
  }
}

function selectPlayers(matches, cli) {
  let selected = matches;
  if (cli.only.length) {
    const wanted = new Set(cli.only);
    selected = selected.filter((match) => wanted.has(match.fc27.slug));
  }
  if (cli.limit > 0) selected = selected.slice(0, cli.limit);
  return selected;
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

async function writePlayerCatalog(dataDir, document) {
  const jsonFile = path.join(dataDir, 'player-index.json');
  const csvFile = path.join(dataDir, 'player-links.csv');
  await writeJson(jsonFile, document);
  const headers = [
    'name', 'slug', 'sourceGroups', 'forwardRank', 'midfieldRank', 'defenderRank',
    'excludedFromGroups', 'fc27Url', 'fc26Url', 'matchedBy',
  ];
  const rows = document.players.map((player) => [
    player.name,
    player.slug,
    player.sourceGroups,
    player.rankByGroup?.forward || '',
    player.rankByGroup?.midfield || '',
    player.rankByGroup?.defender || '',
    player.excludedFromGroups,
    player.fc27Url,
    player.fc26Url,
    player.matchedBy,
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  const temporary = `${csvFile}.tmp`;
  await fs.writeFile(temporary, csv, 'utf8');
  await fs.rename(temporary, csvFile);
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(HELP.trim());
    return;
  }

  const configFile = resolveFrom(PROJECT_DIR, cli.config);
  const fileConfig = await readJson(configFile, {});
  const externalOverrides = await readJson(path.join(PROJECT_DIR, 'overrides.json'), {});
  const config = mergeConfig(DEFAULT_CONFIG, {
    ...fileConfig,
    ...(cli.outputDir ? { outputDir: cli.outputDir } : {}),
    ...(cli.listLimit === undefined ? {} : { listLimit: cli.listLimit }),
    ...(cli.headless === undefined ? {} : { headless: cli.headless }),
    ...(cli.background ? { background: true, headless: false } : {}),
    overrides: { ...(fileConfig.overrides || {}), ...externalOverrides },
  });
  const dataDir = resolveFrom(PROJECT_DIR, config.dataDir);
  const outputDir = resolveFrom(PROJECT_DIR, config.outputDir);
  const profileDir = resolveFrom(PROJECT_DIR, config.browserProfileDir);
  const goldPlayersDir = path.join(PROJECT_DIR, 'gold', 'data', 'players');
  const fc27CacheDir = path.join(goldPlayersDir, 'fc27');
  const fc26CacheDir = path.join(goldPlayersDir, 'fc26');
  const matchesDir = path.join(dataDir, 'matches');
  const duplicatesDir = path.join(dataDir, 'duplicates');
  const singleDir = path.join(outputDir, 'single');
  const pairDir = path.join(outputDir, '1v1');
  const manifestFile = path.join(outputDir, 'manifest.json');
  const catalogFile = path.join(dataDir, 'player-index.json');
  const groupSpecs = {
    forward: {
      fc27Url: config.fc27ListUrl,
      fc26Url: config.fc26ForwardListUrl,
      fc27Cache: 'forwards.json',
      fc26Cache: 'forwards.json',
      fc27Label: 'FC27 金稀有前锋前 100',
      fc26Label: 'FC26 金卡前锋前 100',
    },
    midfield: {
      fc27Url: config.fc27MidfieldListUrl,
      fc26Url: config.fc26MidfieldListUrl,
      fc27Cache: 'midfield.json',
      fc26Cache: 'midfield.json',
      fc27Label: 'FC27 金稀有中场前 100',
      fc26Label: 'FC26 金卡中场前 100',
    },
    defender: {
      fc27Url: config.fc27DefenderListUrl,
      fc26Url: config.fc26DefenderListUrl,
      fc27Cache: 'defenders.json',
      fc26Cache: 'defenders.json',
      fc27Label: 'FC27 金稀有后卫前 100',
      fc26Label: 'FC26 金卡后卫前 100',
    },
  };
  const groupSpec = groupSpecs[cli.group];
  const listLimit = Math.max(1, Number(config.listLimit) || 100);
  await Promise.all([
    fs.mkdir(fc27CacheDir, { recursive: true }),
    fs.mkdir(fc26CacheDir, { recursive: true }),
    fs.mkdir(matchesDir, { recursive: true }),
    fs.mkdir(duplicatesDir, { recursive: true }),
    fs.mkdir(singleDir, { recursive: true }),
    fs.mkdir(pairDir, { recursive: true }),
    fs.mkdir(profileDir, { recursive: true }),
  ]);

  const browserMode = config.headless ? '无界面' : config.background ? '最小化后台' : '有界面';
  log(`启动 Google Chrome（${browserMode}模式）`);
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: config.headless,
    viewport: config.viewport,
    deviceScaleFactor: config.deviceScaleFactor || 2,
    locale: 'en-US',
    colorScheme: 'dark',
    acceptDownloads: false,
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(20_000);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await context.close().catch(() => {});
  };
  process.once('SIGINT', () => stop().finally(() => process.exit(130)));
  process.once('SIGTERM', () => stop().finally(() => process.exit(143)));

  try {
    if (cli.verifyOnly) {
      log('验证模式：打开 FUTBIN 并等待安全验证完成。');
      await navigate(page, groupSpec.fc27Url, config);
      log('安全验证已通过，会话已保存。现在可以使用 --headless 在后台抓取。');
      return;
    }

    if (config.background) {
      log('后台模式准备：先在当前进程完成 FUTBIN 安全验证。');
      await navigate(page, groupSpec.fc27Url, config);
      await setAutomationWindowState(context, page, 'minimized');
      log('验证完成，脚本 Chrome 窗口已最小化，开始后台抓取。');
    }

    const forwardReference = await loadOrCrawlIndex({
      page,
      cacheFile: path.join(fc27CacheDir, 'forwards.json'),
      url: config.fc27ListUrl,
      year: 27,
      config,
      label: `FC27 金稀有前锋前 ${listLimit}`,
      refresh: cli.refreshIndex,
      limit: listLimit,
    });

    let midfieldReference = [];
    if (cli.group === 'midfield' || cli.group === 'defender') {
      midfieldReference = await loadOrCrawlIndex({
        page,
        cacheFile: path.join(fc27CacheDir, 'midfield.json'),
        url: config.fc27MidfieldListUrl,
        year: 27,
        config,
        label: `FC27 金稀有中场前 ${listLimit}`,
        refresh: cli.refreshIndex,
        limit: listLimit,
      });
    }

    let groupCandidates = forwardReference;
    let duplicatePlayers = [];
    if (cli.group === 'midfield') {
      groupCandidates = midfieldReference;
    } else if (cli.group === 'defender') {
      groupCandidates = await loadOrCrawlIndex({
        page,
        cacheFile: path.join(fc27CacheDir, groupSpec.fc27Cache),
        url: groupSpec.fc27Url,
        year: 27,
        config,
        label: `FC27 金稀有后卫前 ${listLimit}`,
        refresh: cli.refreshIndex,
        limit: listLimit,
      });
    }
    const excludedReferences = cli.group === 'midfield'
      ? forwardReference
      : cli.group === 'defender'
        ? [...forwardReference, ...midfieldReference]
        : [];
    const partitioned = excludedReferences.length
      ? partitionNewPlayers(groupCandidates, excludedReferences)
      : { included: groupCandidates, duplicates: [] };
    const fc27 = partitioned.included;
    duplicatePlayers = partitioned.duplicates;
    if (duplicatePlayers.length) {
      const priorLabel = cli.group === 'defender' ? '前锋/中场' : '前锋';
      const currentLabel = cli.group === 'defender' ? '后卫' : '中场';
      log(`${currentLabel}前 ${listLimit} 与${priorLabel}前 ${listLimit} 重复 ${duplicatePlayers.length} 人，已从${currentLabel}截图队列移除。`);
    }

    const fc26Position = await loadOrCrawlIndex({
      page,
      cacheFile: path.join(fc26CacheDir, groupSpec.fc26Cache),
      url: groupSpec.fc26Url,
      year: 26,
      config,
      label: cli.group === 'defender'
        ? `FC26 金卡后卫前 ${listLimit}`
        : cli.group === 'midfield'
          ? `FC26 金卡中场前 ${listLimit}`
          : `FC26 金卡前锋前 ${listLimit}`,
      refresh: cli.refreshIndex,
      limit: listLimit,
    });

    const existingCatalog = await readJson(catalogFile, { players: [] });
    const existingFallback = (existingCatalog.players || [])
      .filter((player) => player.fc26Url)
      .map((player) => ({ name: player.name, slug: player.slug, url: player.fc26Url }));
    let forwardMatches = [];
    if (cli.group === 'midfield') {
      const fc26Forward = await loadOrCrawlIndex({
        page,
        cacheFile: path.join(fc26CacheDir, 'forwards.json'),
        url: config.fc26ForwardListUrl,
        year: 26,
        config,
        label: `FC26 金卡前锋前 ${listLimit}`,
        refresh: cli.refreshIndex,
        limit: listLimit,
      });
      forwardMatches = matchPlayers(forwardReference, fc26Forward, existingFallback, config.overrides, {
        primary: 'forward',
        fallback: 'catalog',
      });
      await writeJson(path.join(matchesDir, 'forward.json'), forwardMatches.map((match) => ({
        slug: match.fc27.slug,
        name: match.fc27.name,
        fc27Url: match.fc27.url,
        fc26Url: match.fc26?.url || null,
        matchedBy: match.matchedBy,
      })));
    }
    const catalogFallback = [
      ...existingFallback,
      ...forwardMatches.filter((match) => match.fc26).map((match) => match.fc26),
    ];
    const matches = matchPlayers(fc27, fc26Position, catalogFallback, config.overrides, {
      primary: cli.group,
      fallback: 'catalog',
    });
    if (cli.group === 'forward') forwardMatches = matches;

    const matchReport = matches.map((match) => ({
      slug: match.fc27.slug,
      name: match.fc27.name,
      fc27Url: match.fc27.url,
      fc26Url: match.fc26?.url || null,
      matchedBy: match.matchedBy,
    }));
    const duplicateSourcesBySlug = new Map();
    const addDuplicateSource = (players, group) => {
      for (const player of players) {
        const groups = duplicateSourcesBySlug.get(player.slug) || [];
        if (!groups.includes(group)) groups.push(group);
        duplicateSourcesBySlug.set(player.slug, groups);
      }
    };
    addDuplicateSource(forwardReference, 'forward');
    if (cli.group === 'defender') addDuplicateSource(midfieldReference, 'midfield');
    await Promise.all([
      writeJson(path.join(outputDir, 'matches.json'), matchReport),
      writeJson(path.join(matchesDir, `${cli.group}.json`), matchReport),
      writeJson(path.join(duplicatesDir, `${cli.group}.json`), duplicatePlayers.map((player) => ({
        slug: player.slug,
        name: player.name,
        fc27Url: player.url,
        duplicateOf: player.duplicateOf,
        duplicateSourceGroups: duplicateSourcesBySlug.get(player.duplicateOf) || [],
        reason: 'already-in-prior-position-top-list',
      }))),
    ]);
    const unmatched = matches.filter((match) => !match.fc26);
    log(`匹配完成：${matches.length - unmatched.length}/${matches.length}；未匹配 ${unmatched.length} 人。`);
    if (unmatched.length) {
      log(`未匹配名单已写入 ${path.join(matchesDir, `${cli.group}.json`)}，可在 overrides.json 中补充。`);
    }

    const matchBySlug = new Map(matches.map((match) => [match.fc27.slug, match]));
    const forwardMatchBySlug = new Map(forwardMatches.map((match) => [match.fc27.slug, match]));
    const catalogUpdates = [];
    for (const [index, player] of forwardReference.entries()) {
      const forwardMatch = forwardMatchBySlug.get(player.slug);
      catalogUpdates.push({
        slug: player.slug,
        name: player.name,
        fc27Url: player.url,
        fc26Url: forwardMatch?.fc26?.url || null,
        matchedBy: forwardMatch?.matchedBy || null,
        sourceGroups: ['forward'],
        rankByGroup: { forward: index + 1 },
      });
    }
    if (midfieldReference.length) {
      const midfieldDuplicates = partitionNewPlayers(midfieldReference, forwardReference).duplicates;
      const midfieldDuplicateSlugs = new Set(midfieldDuplicates.map((player) => player.slug));
      for (const [index, player] of midfieldReference.entries()) {
        const match = cli.group === 'midfield' ? matchBySlug.get(player.slug) : null;
        catalogUpdates.push({
          slug: player.slug,
          name: player.name,
          fc27Url: player.url,
          fc26Url: match?.fc26?.url || null,
          matchedBy: match?.matchedBy || null,
          sourceGroups: ['midfield'],
          excludedFromGroups: midfieldDuplicateSlugs.has(player.slug) ? ['midfield'] : [],
          rankByGroup: { midfield: index + 1 },
        });
      }
    }
    if (cli.group === 'defender') {
      const defenderDuplicateSlugs = new Set(duplicatePlayers.map((player) => player.slug));
      for (const [index, player] of groupCandidates.entries()) {
        const match = matchBySlug.get(player.slug);
        catalogUpdates.push({
          slug: player.slug,
          name: player.name,
          fc27Url: player.url,
          fc26Url: match?.fc26?.url || null,
          matchedBy: match?.matchedBy || null,
          sourceGroups: ['defender'],
          excludedFromGroups: defenderDuplicateSlugs.has(player.slug) ? ['defender'] : [],
          rankByGroup: { defender: index + 1 },
        });
      }
    }
    const catalogPlayers = mergePlayerCatalog(existingCatalog.players || [], catalogUpdates);
    await writePlayerCatalog(dataDir, {
      generatedAt: new Date().toISOString(),
      listLimit,
      currentGroup: cli.group,
      counts: {
        totalUnique: catalogPlayers.length,
        currentCandidates: groupCandidates.length,
        currentIncluded: fc27.length,
        currentDuplicatesRemoved: duplicatePlayers.length,
        currentMatched: matches.length - unmatched.length,
        currentUnmatched: unmatched.length,
      },
      players: catalogPlayers,
    });
    log(`球员索引已更新：${path.join(dataDir, 'player-index.json')} 和 player-links.csv`);

    const selected = selectPlayers(matches.filter((match) => match.fc26), cli);
    if (cli.only.length && selected.length === 0) {
      throw new Error(`--only 指定的球员未找到：${cli.only.join(', ')}`);
    }
    if (cli.dryRun) {
      log(`dry-run 完成，准备截图 ${selected.length} 组。`);
      return;
    }

    const manifest = await readJson(manifestFile, { generatedAt: null, players: {} });
    for (let index = 0; index < selected.length; index += 1) {
      const match = selected[index];
      const basename = safeFilename(match.fc27.slug);
      const fc27File = path.join(singleDir, `${basename}-fc27.png`);
      const fc26File = path.join(singleDir, `${basename}-fc26.png`);
      const pairFile = path.join(pairDir, `${basename}-1v1.png`);

      if (!cli.force && await fileExists(pairFile)) {
        log(`跳过已完成 ${index + 1}/${selected.length}：${match.fc27.name}`);
        continue;
      }

      try {
        log(`处理 ${index + 1}/${selected.length}：${match.fc27.name}`);
        const fc27Clip = await capturePlayer(page, match.fc27, 27, fc27File, config);
        const fc26Clip = await capturePlayer(page, match.fc26, 26, fc26File, config);
        await makePairImage(context, fc27File, fc26File, pairFile, match.fc27.name, config.pairPanelWidth);
        manifest.players[match.fc27.slug] = {
          status: 'completed',
          name: match.fc27.name,
          matchedBy: match.matchedBy,
          fc27Url: match.fc27.url,
          fc26Url: match.fc26.url,
          fc27Clip,
          fc26Clip,
          fc27File: path.relative(outputDir, fc27File),
          fc26File: path.relative(outputDir, fc26File),
          pairFile: path.relative(outputDir, pairFile),
          capturedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error(`截图失败：${match.fc27.name}\n${error.stack || error.message}`);
        manifest.players[match.fc27.slug] = {
          status: 'failed',
          name: match.fc27.name,
          fc27Url: match.fc27.url,
          fc26Url: match.fc26.url,
          error: error.message,
          capturedAt: new Date().toISOString(),
        };
      }
      manifest.generatedAt = new Date().toISOString();
      await writeJson(manifestFile, manifest);
    }
    log(`全部完成。1V1 合图位于：${pairDir}`);
  } finally {
    await stop();
  }
}

export { findHeroClip, findNextPage, makePairImage };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
