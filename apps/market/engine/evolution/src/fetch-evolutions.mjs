#!/usr/bin/env node
// 作用：从指定来源抓取FC26进化项目详情，并保存可复核的原始数据。

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_FROM,
  DEFAULT_TO,
  KNOWN_WINDOWS,
  categorySlug,
  finalizeEvolutionRange,
  rangeDirectory,
  rangeKey,
  readJson,
  selectTasksForWindow,
  writeJson,
} from './evolution-data.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILE_DIR = path.join(PROJECT_DIR, '.futbin-browser-profile');
const RAW_FILE = path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'raw', 'all-tasks.json');
const DEFAULT_CDP = 'http://localhost:19222';

const HELP = `
FC26 FUTBIN 进化任务抓取

用法：
  npm run evolution:fetch
  npm run evolution:fetch -- --normalize-only

参数：
  --from <YYYY-MM-DD>  日期区间开始，默认 ${DEFAULT_FROM}
  --to <YYYY-MM-DD>    日期区间结束，默认 ${DEFAULT_TO}
  --start-id <n>       自定义区间的首个 FUTBIN 进化 ID
  --end-id <n>         自定义区间的最后一个 FUTBIN 进化 ID
  --cdp <url>          连接已登录 Chrome，默认 ${DEFAULT_CDP}
  --profile            不连接现有 Chrome，改用项目持久化浏览器资料
  --background         最小化脚本自己创建的 Chrome 窗口
  --headless           无界面运行（重新触发验证时不能使用）
  --delay <ms>         热门球员页之间的等待时间，默认 500ms
  --workers <n>        后台标签页并发数，默认 3，最大 6
  --force              重新抓取已有热门球员记录
  --normalize-only     只从现有任务和断点生成最终 JSON/CSV
  -h, --help           显示帮助
`;

function parseArgs(argv) {
  const options = {
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    cdp: DEFAULT_CDP,
    useProfile: false,
    background: false,
    headless: false,
    delayMs: 500,
    workers: 3,
    force: false,
    normalizeOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '-h' || value === '--help') options.help = true;
    else if (value === '--from') options.from = argv[++index];
    else if (value === '--to') options.to = argv[++index];
    else if (value === '--start-id') options.startId = Number(argv[++index]);
    else if (value === '--end-id') options.endId = Number(argv[++index]);
    else if (value === '--cdp') options.cdp = argv[++index];
    else if (value === '--profile') options.useProfile = true;
    else if (value === '--background') options.background = true;
    else if (value === '--headless') options.headless = true;
    else if (value === '--delay') options.delayMs = Math.max(180, Number(argv[++index]) || 500);
    else if (value === '--workers') options.workers = Math.min(6, Math.max(1, Number(argv[++index]) || 3));
    else if (value === '--force') options.force = true;
    else if (value === '--normalize-only') options.normalizeOnly = true;
    else throw new Error(`未知参数：${value}`);
  }
  if ((Number.isFinite(options.startId) && !Number.isFinite(options.endId)) || (!Number.isFinite(options.startId) && Number.isFinite(options.endId))) {
    throw new Error('--start-id 与 --end-id 必须一起使用。');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
    throw new Error('--from 与 --to 必须是 YYYY-MM-DD。');
  }
  if (options.headless) {
    options.background = false;
    options.useProfile = true;
  }
  return options;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const log = (message) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`);

function isChallenge(title, bodyText) {
  return /just a moment|checking your browser|verify you are human|performing security verification|正在进行安全验证|请稍候|cloudflare ray id/i.test(`${title}\n${bodyText}`);
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
      if (restored && !options.sharedBrowser) await setWindowState(context, page, 'minimized').catch(() => {});
      return;
    }
    if (options.headless) throw new Error('FUTBIN 要求安全验证，请使用已验证 Chrome 或 --profile --background。');
    if (!announced) {
      log('FUTBIN 要求安全验证，请在脚本 Chrome 窗口中手动完成；通过后会自动继续。');
      if (options.background && !options.sharedBrowser) {
        await setWindowState(context, page, 'normal').catch(() => {});
        restored = true;
      }
      announced = true;
    }
    await sleep(2_000);
  }
  throw new Error('等待 FUTBIN 安全验证超时。');
}

async function navigate(context, page, url, options) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitThroughChallenge(context, page, options);
}

async function waitForEvolutionCards(page) {
  let previous = -1;
  let stable = 0;
  for (let round = 0; round < 120; round += 1) {
    const count = await page.locator('.evolutions-overview-wrapper').count();
    stable = count === previous && count > 0 ? stable + 1 : 0;
    previous = count;
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement?.scrollHeight || document.body.scrollHeight));
    await sleep(500);
    if (round >= 30 && stable >= 6) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

function parseEvolutionCards(status) {
  const absolute = (value) => new URL(value, location.origin).href;
  const section = (root, title) => {
    const heading = [...root.querySelectorAll('.s-font.semi-bold')].find((element) => element.innerText.trim() === title);
    if (!heading) return [];
    return [...(heading.parentElement.querySelector('.evo-box-req')?.children || [])].map((row) => {
      const parts = row.innerText.split('\n').map((value) => value.trim()).filter((value) => value && value !== '|');
      return { label: parts[0] || null, value: parts[1] || null, cap: parts[2] || null, raw: parts };
    });
  };
  return [...document.querySelectorAll('.evolutions-overview-wrapper')].map((root, index) => {
    const link = root.querySelector('a.evolutions-card-top');
    const href = link?.getAttribute('href') || '';
    const match = href.match(/^\/26\/evolutions\/(\d+)\/([^/?#]+)/);
    const cards = [...root.querySelectorAll('.playercard-26')].map((card, cardIndex) => {
      const numbers = [...card.querySelectorAll('.playercard-26-stat-number')].map((element) => Number(element.innerText.trim())).filter(Number.isFinite);
      return {
        kind: cardIndex === 0 ? 'before' : 'after',
        name: card.getAttribute('title') || null,
        rating: Number(card.querySelector('.playercard-26-rating')?.innerText) || null,
        position: card.querySelector('.playercard-26-position')?.innerText.trim() || null,
        displayName: card.querySelector('.playercard-26-name')?.innerText.trim() || null,
        stats: Object.fromEntries(['pac', 'sho', 'pas', 'dri', 'def', 'phy'].map((key, statIndex) => [key, numbers[statIndex] ?? null])),
      };
    });
    const availability = Object.fromEntries([...root.querySelectorAll('.evolution-upgrade')].map((box) => {
      const parts = box.innerText.split('\n').map((value) => value.trim()).filter(Boolean);
      return [parts[0]?.toLowerCase().replace(/\s+/g, '_'), parts.slice(1).join(' ') || true];
    }).filter(([key]) => key));
    return {
      id: Number(match?.[1]),
      slug: match?.[2] || null,
      rank: index + 1,
      name: link?.querySelector('.xs-font.text-center')?.innerText.trim() || root.dataset.filterSearchKey || null,
      status,
      categories: [...(link?.querySelectorAll('.evolution-badge') || [])].map((element) => element.innerText.trim()),
      description: root.querySelector('.evolution-description')?.innerText.trim() || null,
      url: absolute(href),
      popularUrl: absolute(`/26/popular/evolutions?evo_id=${match?.[1]}`),
      availability,
      requirements: section(root, 'Player Requirements'),
      upgrades: section(root, 'Total Upgrades'),
      previewPlayers: cards,
    };
  }).filter((task) => Number.isFinite(task.id));
}

function parsePopularPlayers(evolutionId) {
  const absolute = (value) => new URL(value, location.origin).href;
  const pageText = document.body.innerText || '';
  const players = [...document.querySelectorAll('.popular-cards-wrapper > .column.align-center')].map((container, index) => {
    const link = container.querySelector('a.playercard-wrapper[href^="/26/player/"]');
    if (!link) return null;
    const href = link.getAttribute('href');
    const card = link.querySelector('.playercard-26');
    const match = href.match(/^\/26\/player\/([^/]+)\/([^/?#]+)/);
    const numbers = [...card.querySelectorAll('.playercard-26-stat-number')].map((element) => Number(element.innerText.trim())).filter(Number.isFinite);
    const image = card.querySelector('.playercard-26-special-img')?.getAttribute('src') || null;
    const popularity = Number(container.querySelector('.popular-wrapper .bold')?.innerText.trim());
    return {
      rank: index + 1,
      evolutionId: Number(evolutionId),
      name: card.getAttribute('title') || null,
      displayName: card.querySelector('.playercard-26-name')?.innerText.trim() || null,
      slug: match?.[2] || null,
      cardPathId: match?.[1] || null,
      basePlayerId: match?.[1]?.split('_')[0] || null,
      rating: Number(card.querySelector('.playercard-26-rating')?.innerText) || null,
      position: card.querySelector('.playercard-26-position')?.innerText.trim() || null,
      alternatePositions: [...card.querySelectorAll('.playercard-26-alt-pos-sub')].map((element) => element.innerText.trim()).filter(Boolean),
      popularity: Number.isFinite(popularity) ? popularity : null,
      stats: Object.fromEntries(['pac', 'sho', 'pas', 'dri', 'def', 'phy'].map((key, statIndex) => [key, numbers[statIndex] ?? null])),
      imageUrl: image ? absolute(image) : null,
      url: absolute(href),
    };
  }).filter(Boolean);
  return {
    heading: document.querySelector('h1')?.innerText.trim() || null,
    description: document.querySelector('h2')?.innerText.trim() || null,
    players,
    noPlayers: /no players/i.test(pageText),
    challenge: /just a moment|checking your browser|verify you are human|performing security verification|正在进行安全验证|请稍候|cloudflare ray id/i.test(`${document.title || ''}\n${pageText.slice(0, 1_000)}`),
  };
}

async function createBrowser(options) {
  if (!options.useProfile) {
    const browser = await chromium.connectOverCDP(options.cdp);
    const context = browser.contexts()[0];
    if (!context) throw new Error(`Chrome 没有可用上下文：${options.cdp}`);
    return { browser, context, shared: true };
  }
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: options.headless,
    viewport: { width: 1280, height: 900 },
  });
  return { browser: null, context, shared: false };
}

async function scrapeTaskLists(context, options) {
  const page = await context.newPage();
  try {
    const groups = [];
    for (const [status, url] of [['active', 'https://www.futbin.com/26/evolutions'], ['expired', 'https://www.futbin.com/26/evolutions/expired']]) {
      log(`抓取 ${status === 'active' ? '当前' : '已过期'}进化任务...`);
      await navigate(context, page, url, options);
      await waitForEvolutionCards(page);
      groups.push(...await page.evaluate(parseEvolutionCards, status));
    }
    const byId = new Map();
    for (const task of groups) {
      const current = byId.get(task.id);
      if (!current || (current.status === 'expired' && task.status === 'active')) byId.set(task.id, task);
    }
    return [...byId.values()].sort((left, right) => left.id - right.id);
  } finally {
    await page.close();
  }
}

async function scrapePopular(context, tasks, checkpointFile, options) {
  const checkpoint = options.force ? null : await readJson(checkpointFile);
  const state = checkpoint || {
    schemaVersion: 1,
    game: 'FC26',
    window: { from: options.from, to: options.to, inclusive: true },
    updatedAt: null,
    records: {},
  };
  const pending = tasks.filter((task) => options.force || !state.records[String(task.id)]);
  let cursor = 0;
  let checkpointWrite = Promise.resolve();
  const saveCheckpoint = async () => {
    checkpointWrite = checkpointWrite.then(() => writeJson(checkpointFile, state));
    await checkpointWrite;
  };
  async function worker(workerIndex) {
    const page = await context.newPage();
    try {
      while (cursor < pending.length) {
        const task = pending[cursor++];
        let record;
        try {
          await navigate(context, page, task.popularUrl, options);
          await sleep(250);
          const parsed = await page.evaluate(parsePopularPlayers, task.id);
          record = {
            taskId: task.id,
            taskName: task.name,
            taskUrl: task.url,
            popularUrl: task.popularUrl,
            status: parsed.players.length ? 'ok' : 'no-popular-players',
            attempts: 1,
            fetchedAt: new Date().toISOString(),
            pageHeading: parsed.heading,
            description: parsed.description,
            players: parsed.players,
          };
        } catch (error) {
          record = {
            taskId: task.id,
            taskName: task.name,
            taskUrl: task.url,
            popularUrl: task.popularUrl,
            status: 'error',
            attempts: 1,
            fetchedAt: new Date().toISOString(),
            error: error.message,
            players: [],
          };
        }
        state.records[String(task.id)] = record;
        state.updatedAt = new Date().toISOString();
        await saveCheckpoint();
        if (cursor % 25 === 0 || cursor === pending.length) log(`热门球员 ${cursor}/${pending.length}（工作页 ${workerIndex + 1}）`);
        await sleep(options.delayMs);
      }
    } finally {
      await page.close();
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.workers, pending.length || 1) }, (_, index) => worker(index)));
  return state;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP.trim());
    return;
  }
  const directory = rangeDirectory(PROJECT_DIR, options.from, options.to);
  if (options.normalizeOnly) {
    const manifest = await finalizeEvolutionRange(PROJECT_DIR, options);
    console.log(JSON.stringify(manifest.counts, null, 2));
    return;
  }

  const known = KNOWN_WINDOWS[rangeKey(options.from, options.to)];
  if (!known && (!Number.isFinite(options.startId) || !Number.isFinite(options.endId))) {
    throw new Error(`日期区间 ${options.from} 至 ${options.to} 尚无已验证边界，请提供 --start-id 与 --end-id。`);
  }
  const runtime = await createBrowser(options);
  options.sharedBrowser = runtime.shared;
  const pagesBefore = new Set(runtime.context.pages());
  try {
    if (!runtime.shared && options.background && !options.headless) {
      const page = runtime.context.pages()[0] || await runtime.context.newPage();
      await setWindowState(runtime.context, page, 'minimized').catch(() => {});
    }
    const allTasks = await scrapeTaskLists(runtime.context, options);
    const counts = {
      total: allTasks.length,
      active: allTasks.filter((task) => task.status === 'active').length,
      expired: allTasks.filter((task) => task.status === 'expired').length,
    };
    await writeJson(RAW_FILE, {
      schemaVersion: 1,
      game: 'FC26',
      source: 'FUTBIN',
      fetchedAt: new Date().toISOString(),
      counts,
      tasks: allTasks,
    });

    const tasks = selectTasksForWindow(allTasks, options);
    const selection = {
      method: 'chronological FUTBIN evolution ID boundary with independently verified release-day boundary',
      firstEvolutionId: options.startId ?? known.firstEvolutionId,
      lastEvolutionId: options.endId ?? known.lastEvolutionId,
      firstEvolutionName: tasks[0]?.name || null,
      lastEvolutionName: tasks.at(-1)?.name || null,
      ...(known || {}),
    };
    const categoryCounts = {};
    for (const task of tasks) for (const category of task.categories || []) {
      const slug = categorySlug(category);
      categoryCounts[slug] = (categoryCounts[slug] || 0) + 1;
    }
    await writeJson(path.join(directory, 'tasks.json'), {
      schemaVersion: 1,
      game: 'FC26',
      source: 'FUTBIN',
      fetchedAt: new Date().toISOString(),
      window: { from: options.from, to: options.to, inclusive: true },
      counts: { tasks: tasks.length, categories: categoryCounts },
      selection,
      tasks,
    });
    await scrapePopular(runtime.context, tasks, path.join(directory, '.popular-players-checkpoint.json'), options);
    const manifest = await finalizeEvolutionRange(PROJECT_DIR, options);
    log(`完成：${manifest.counts.tasks} 项任务，${manifest.counts.popularPlayers} 条热门球员记录。`);
  } finally {
    for (const page of runtime.context.pages()) {
      if (!pagesBefore.has(page)) await page.close().catch(() => {});
    }
    if (!runtime.shared) await runtime.context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
