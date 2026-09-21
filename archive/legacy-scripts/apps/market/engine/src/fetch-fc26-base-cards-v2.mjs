#!/usr/bin/env node
// 作用：使用第二版采集流程补全FC26基础金卡数据与价格快照。
import { execSync, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START_DATE = '2025-09-18';
const END_DATE = '2025-10-17';
const START_MS = Date.parse(`${START_DATE}T00:00:00.000Z`);
const END_EXCLUSIVE_MS = Date.parse('2025-10-18T00:00:00.000Z');
const DATES = Array.from({ length: 30 }, (_, i) =>
  new Date(START_MS + i * 86_400_000).toISOString().slice(0, 10)
);

function cli(cmd, timeout = 60_000) {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    console.error(`CLI error: ${e.message}`);
    return e.stdout || '';
  }
}

function extractResult(output) {
  const m = output.match(/### Result\s*\n(.+?)\n### Ran/s);
  if (!m) return null;
  let s = m[1].trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try { s = JSON.parse(s); } catch {}
  }
  return s;
}

function openPage(url) {
  cli(`dumate-browser-cli open "${url}"`, 30_000);
  cli('dumate-browser-cli sleep 5', 10_000);
}

function evalJs(code, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const output = execFileSync('dumate-browser-cli', ['eval', code, '--timeout', '25000', '--retries', '1'], {
        encoding: 'utf8', timeout: 45_000, maxBuffer: 10 * 1024 * 1024
      });
      return extractResult(output);
    } catch (e) {
      console.error(`evalJs error (attempt ${attempt + 1}/${retries + 1}): ${e.message}`);
      if (attempt < retries) {
        cli('dumate-browser-cli sleep 2', 10_000);
      }
    }
  }
  return null;
}

// Extract player list from a FUTBIN players listing page
function extractPlayerList() {
  const code = `(function(){
    var rows = [];
    var seen = {};
    var trs = document.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
      var link = trs[i].querySelector("a[href*='/26/player/']");
      if (!link) continue;
      var href = link.getAttribute("href") || "";
      var m = href.match(/\\/26\\/player\\/(\\d+)\\/([^/?#]+)/i);
      if (!m) continue;
      var url = "https://www.futbin.com" + href;
      if (seen[url]) continue;
      seen[url] = true;
      var rowText = trs[i].innerText.replace(/\\n/g, " ").replace(/\\s+/g, " ").trim();
      var name = link.getAttribute("data-player-name") || link.getAttribute("aria-label") || "";
      if (!name) {
        var img = link.querySelector("img[alt]");
        if (img) name = img.getAttribute("alt");
      }
      if (!name) name = m[2].replace(/-/g, " ");
      var ratingMatch = rowText.match(/^(\\d{2,3})\\s/);
      var rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
      var priceMatch = rowText.match(/(\\d[\\d.]*[MK]?)/);
      var currentPrice = null;
      if (priceMatch) {
        var p = priceMatch[1];
        if (p.indexOf("M") >= 0) currentPrice = Math.round(parseFloat(p) * 1_000_000);
        else if (p.indexOf("K") >= 0) currentPrice = Math.round(parseFloat(p) * 1_000);
        else currentPrice = parseInt(p);
      }
      rows.push({url, id: m[1], slug: m[2], name, rating, currentPrice, rowText: rowText.substring(0, 300)});
    }
    return JSON.stringify(rows);
  })()`;
  const result = evalJs(code);
  if (!result) return [];
  try { return JSON.parse(result); } catch { return []; }
}

// Extract player list from a FUTBIN TOTW page
function extractTotwPlayerList() {
  const code = `(function(){
    var rows = [];
    var seen = {};
    var links = document.querySelectorAll("a[href*='/26/player/']");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var m = href.match(/\\/26\\/player\\/(\\d+)\\/([^/?#]+)/i);
      if (!m) continue;
      var url = "https://www.futbin.com" + href;
      if (seen[url]) continue;
      seen[url] = true;
      var name = links[i].getAttribute("data-player-name") || links[i].getAttribute("aria-label") || "";
      if (!name) {
        var img = links[i].querySelector("img[alt]");
        if (img) name = img.getAttribute("alt");
      }
      if (!name) name = m[2].replace(/-/g, " ");
      rows.push({url, id: m[1], slug: m[2], name});
    }
    return JSON.stringify(rows);
  })()`;
  const result = evalJs(code);
  if (!result) return [];
  try { return JSON.parse(result); } catch { return []; }
}

// Extract price chart data from a player's market page
function extractPriceData() {
  const code = `(function(){
    var elements = document.querySelectorAll(".highcharts-graph-wrapper, [data-ps-data], [data-pc-data]");
    function readDaily(attr) {
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (!el.hasAttribute(attr)) continue;
        var raw = el.getAttribute(attr) || "[]";
        try {
          var series = JSON.parse(raw);
          if (series.length > 100) {
            var filtered = [];
            for (var j = 0; j < series.length; j++) {
              var ts = series[j][0];
              if (ts >= ${START_MS} && ts < ${END_EXCLUSIVE_MS}) filtered.push(series[j]);
            }
            return filtered;
          }
        } catch(e) {}
      }
      return [];
    }
    return JSON.stringify({cross: readDaily("data-ps-data"), pc: readDaily("data-pc-data")});
  })()`;
  const result = evalJs(code);
  if (!result) return { cross: [], pc: [] };
  try { return JSON.parse(result); } catch { return { cross: [], pc: [] }; }
}

function priceMap(series) {
  const byDate = new Map();
  for (const [ts, price] of series) {
    const date = new Date(ts).toISOString().slice(0, 10);
    byDate.set(date, Number(price) > 0 ? Number(price) : null);
  }
  const result = {};
  for (const d of DATES) result[d] = byDate.get(d) ?? null;
  return result;
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
    observedDays: vals.length, start, end, change, changePct,
    minimum: min, maximum: max,
    range: (min != null && max != null) ? max - min : null,
    rangePct: min ? (max - min) / min : null,
  };
}

const CARD_TYPES = [
  {
    key: 'icon',
    label: 'Base Icon',
    listUrl: 'https://www.futbin.com/26/players?version=icons',
    pages: 5,
    outputDir: path.join(PROJECT_DIR, 'icons', 'data', 'prices', 'fc26'),
    outputFile: 'base-icons.json',
    extractFn: extractPlayerList,
  },
  {
    key: 'hero',
    label: 'Base Hero',
    listUrl: 'https://www.futbin.com/26/players?version=heroes',
    pages: 4,
    outputDir: path.join(PROJECT_DIR, 'heroes', 'data', 'prices', 'fc26'),
    outputFile: 'base-heroes.json',
    extractFn: extractPlayerList,
  },
  {
    key: 'totw1',
    label: 'TOTW 1',
    listUrl: 'https://www.futbin.com/26/totw/TOTW1',
    pages: 1,
    outputDir: path.join(PROJECT_DIR, 'totw', 'data', 'prices', 'fc26'),
    outputFile: 'totw-1.json',
    extractFn: extractTotwPlayerList,
  },
];

async function main() {
  const checkpointDir = path.join(PROJECT_DIR, 'output', '_cache', 'fc26-base-cards-checkpoint');
  await mkdir(checkpointDir, { recursive: true });

  for (const cardType of CARD_TYPES) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${cardType.label} (${cardType.key})`);
    console.log("=".repeat(60));

    const checkpointFile = path.join(checkpointDir, `${cardType.key}-checkpoint.json`);
    let checkpoint;
    try { checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8')); } catch { checkpoint = null; }

    // Step 1: Get player list (all pages)
    let playerList = checkpoint?.playerList || [];
    if (!playerList.length) {
      console.log(`Fetching player list...`);
      for (let page = 1; page <= cardType.pages; page++) {
        const url = page === 1 ? cardType.listUrl : `${cardType.listUrl}&page=${page}`;
        console.log(`  Page ${page}/${cardType.pages}: ${url}`);
        openPage(url);
        const players = cardType.extractFn();
        console.log(`    Found ${players.length} players`);
        playerList.push(...players);
      }
      console.log(`Total: ${playerList.length} players`);
    } else {
      console.log(`Cached: ${playerList.length} players`);
    }

    // Step 2: Fetch prices
    let priceRecords = checkpoint?.priceRecords || [];
    const fetchedUrls = new Set(priceRecords.map(r => r.url));
    const candidates = playerList.filter(p => !fetchedUrls.has(p.url));

    console.log(`Total: ${playerList.length}, Fetched: ${priceRecords.length}, Remaining: ${candidates.length}`);

    for (let i = 0; i < candidates.length; i++) {
      const player = candidates[i];
      const marketUrl = `${player.url}/market`;
      console.log(`[${i + 1}/${candidates.length}] ${player.name} (${player.id})`);

      openPage(marketUrl);
      const priceData = extractPriceData();

      if (priceData.cross.length === 0 && priceData.pc.length === 0) {
        console.log(`  No price data found`);
        priceRecords.push({
          ...player, marketUrl,
          prices: { cross: {}, pc: {} },
          metrics: { cross: metrics({}), pc: metrics({}) },
          status: 'no_price_data',
        });
      } else {
        const cross = priceMap(priceData.cross);
        const pc = priceMap(priceData.pc);
        const launchPrice = cross[START_DATE];
        console.log(`  Launch: ${launchPrice ? launchPrice.toLocaleString() : 'N/A'} | Cross: ${priceData.cross.length}pts PC: ${priceData.pc.length}pts`);
        priceRecords.push({
          ...player, marketUrl,
          prices: { cross, pc },
          metrics: { cross: metrics(cross), pc: metrics(pc) },
          status: 'captured',
        });
      }

      // Checkpoint every 5 players
      if ((i + 1) % 5 === 0 || i === candidates.length - 1) {
        await writeFile(checkpointFile, JSON.stringify({
          generatedAt: new Date().toISOString(),
          cardType: cardType.key,
          playerList,
          priceRecords,
        }, null, 2));
        console.log(`  [checkpoint saved: ${priceRecords.length}/${playerList.length}]`);
      }
    }

    // Step 3: Save output
    const output = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      game: 'FC26',
      cardType: cardType.key,
      cardLabel: cardType.label,
      source: 'FUTBIN historical daily average price',
      launchDate: START_DATE,
      window: { start: START_DATE, end: END_DATE, days: DATES },
      counts: {
        total: playerList.length,
        captured: priceRecords.filter(r => r.status === 'captured').length,
        withLaunchPrice: priceRecords.filter(r => r.prices.cross[START_DATE] != null).length,
      },
      players: priceRecords,
    };

    await mkdir(cardType.outputDir, { recursive: true });
    const outputPath = path.join(cardType.outputDir, cardType.outputFile);
    await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`\nSaved: ${outputPath}`);
    console.log(`  Total: ${output.counts.total}, Captured: ${output.counts.captured}, WithLaunchPrice: ${output.counts.withLaunchPrice}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log('All card types processed!');
  console.log("=".repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
