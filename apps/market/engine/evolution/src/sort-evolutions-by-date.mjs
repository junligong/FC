#!/usr/bin/env node
// 作用：按发布日期整理进化项目，生成稳定的日期索引和分类数据。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizeSlug } from '../../src/core.mjs';
import { categorySlug, readJson, writeJson } from './evolution-data.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_FROM = '2025-09-18';
const DEFAULT_TO = '2026-08-24';
const FUTMIND_URL = 'https://futmind.com/evolutions';
const FUTBIN_RAW_FILE = path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'raw', 'all-tasks.json');
const FUTMIND_RAW_FILE = path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'raw', 'futmind-evolution-schedule.json');

const HELP = `
FC26 进化任务日期排序

用法：
  npm run evolution:sort
  node evolution/src/sort-evolutions-by-date.mjs --source-html /path/to/futmind.html

参数：
  --from <YYYY-MM-DD>  开始日期，默认 ${DEFAULT_FROM}
  --to <YYYY-MM-DD>    结束日期，默认 ${DEFAULT_TO}
  --source-html <file> 使用已经下载的 FUT Mind 页面 HTML
  -h, --help           显示帮助
`;

function parseArgs(argv) {
  const result = { from: DEFAULT_FROM, to: DEFAULT_TO, sourceHtml: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '-h' || value === '--help') result.help = true;
    else if (value === '--from') result.from = argv[++index];
    else if (value === '--to') result.to = argv[++index];
    else if (value === '--source-html') result.sourceHtml = path.resolve(argv[++index]);
    else throw new Error(`未知参数：${value}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.from) || !/^\d{4}-\d{2}-\d{2}$/.test(result.to)) {
    throw new Error('--from 与 --to 必须是 YYYY-MM-DD。');
  }
  return result;
}

function parseNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('FUT Mind 页面中没有找到 __NEXT_DATA__。');
  const document = JSON.parse(match[1]);
  const records = document?.props?.pageProps?.data;
  if (!Array.isArray(records)) throw new Error('FUT Mind 页面中的进化数据格式已变化。');
  return records;
}

function timelineName(value) {
  return normalizeSlug(value).replaceAll('-', '');
}

export function alignChronologicalNames(futbinTasks, scheduleRecords) {
  const left = futbinTasks.map((task) => timelineName(task.name));
  const right = scheduleRecords.map((record) => timelineName(record.name));
  const matrix = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      matrix[leftIndex][rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? matrix[leftIndex - 1][rightIndex - 1] + 1
        : Math.max(matrix[leftIndex - 1][rightIndex], matrix[leftIndex][rightIndex - 1]);
    }
  }
  const matches = [];
  let leftIndex = left.length;
  let rightIndex = right.length;
  while (leftIndex > 0 && rightIndex > 0) {
    if (left[leftIndex - 1] === right[rightIndex - 1]) {
      matches.push({ taskIndex: leftIndex - 1, scheduleIndex: rightIndex - 1 });
      leftIndex -= 1;
      rightIndex -= 1;
    } else if (matrix[leftIndex - 1][rightIndex] >= matrix[leftIndex][rightIndex - 1]) leftIndex -= 1;
    else rightIndex -= 1;
  }
  return matches.reverse();
}

function utcDate(value) {
  return String(value).slice(0, 10);
}

function clampDate(value, from) {
  if (value < from) return from;
  return value;
}

function dayNumber(value) {
  return Math.floor(Date.parse(`${value}T00:00:00.000Z`) / 86_400_000);
}

function dateFromDay(value) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

export function buildChronologicalTasks(futbinTasks, scheduleRecords, { from, to }) {
  const tasks = [...futbinTasks].sort((left, right) => left.id - right.id);
  const schedule = [...scheduleRecords].sort((left, right) => (
    left.createdAt.localeCompare(right.createdAt) || left.id - right.id
  ));
  const matches = alignChronologicalNames(tasks, schedule);
  const exactByTaskIndex = new Map(matches.map(({ taskIndex, scheduleIndex }) => [taskIndex, schedule[scheduleIndex]]));
  const exactAnchors = matches.map(({ taskIndex, scheduleIndex }) => ({
    taskIndex,
    taskId: tasks[taskIndex].id,
    date: clampDate(utcDate(schedule[scheduleIndex].createdAt), from),
    record: schedule[scheduleIndex],
  }));

  const enriched = tasks.map((task, taskIndex) => {
    const exact = exactByTaskIndex.get(taskIndex);
    if (exact) {
      const originalDate = utcDate(exact.createdAt);
      const releaseDate = clampDate(originalDate, from);
      return {
        ...task,
        releaseDate,
        releaseDateTimeUtc: exact.createdAt,
        dateSource: originalDate < from ? 'fc26-launch-boundary' : 'futmind-created-at',
        dateConfidence: originalDate < from ? 'normalized' : 'exact',
        dateEvidence: {
          provider: 'FUT Mind',
          providerEvolutionId: exact.id,
          providerUrl: exact.url,
          originalCreatedAt: exact.createdAt,
        },
      };
    }

    let previous = null;
    let next = null;
    for (const anchor of exactAnchors) {
      if (anchor.taskIndex < taskIndex) previous = anchor;
      else if (anchor.taskIndex > taskIndex) {
        next = anchor;
        break;
      }
    }
    let releaseDate;
    if (!previous) releaseDate = from;
    else if (!next) releaseDate = to;
    else if (previous.date === next.date) releaseDate = previous.date;
    else {
      const span = next.taskId - previous.taskId;
      const ratio = span > 0 ? (task.id - previous.taskId) / span : 0;
      const interpolatedDay = Math.round(dayNumber(previous.date) + ratio * (dayNumber(next.date) - dayNumber(previous.date)));
      releaseDate = dateFromDay(interpolatedDay);
    }
    return {
      ...task,
      releaseDate: clampDate(releaseDate, from),
      releaseDateTimeUtc: null,
      dateSource: 'inferred-between-futbin-chronology-anchors',
      dateConfidence: 'inferred',
      dateEvidence: {
        previousAnchor: previous ? { evolutionId: previous.taskId, releaseDate: previous.date } : null,
        nextAnchor: next ? { evolutionId: next.taskId, releaseDate: next.date } : null,
      },
    };
  });

  return enriched
    .filter((task) => task.releaseDate >= from && task.releaseDate <= to)
    .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate) || left.id - right.id)
    .map((task, index) => ({ ...task, chronologicalRank: index + 1 }));
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsv(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const text = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  await fs.writeFile(temporary, text, 'utf8');
  await fs.rename(temporary, file);
}

async function loadSchedule(options) {
  const html = options.sourceHtml
    ? await fs.readFile(options.sourceHtml, 'utf8')
    : await fetch(FUTMIND_URL).then((response) => {
      if (!response.ok) throw new Error(`FUT Mind 返回 HTTP ${response.status}`);
      return response.text();
    });
  return parseNextData(html).map((record) => ({
    id: Number(record.id),
    name: record.slotName,
    slug: normalizeSlug(record.slotName),
    createdAt: record.created_at,
    releaseDate: utcDate(record.created_at),
    url: `https://futmind.com/evolutions/${record.id}/${normalizeSlug(record.slotName)}`,
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP.trim());
    return;
  }
  const futbinDocument = await readJson(FUTBIN_RAW_FILE);
  if (!Array.isArray(futbinDocument?.tasks)) throw new Error(`FUTBIN 原始任务文件格式错误：${FUTBIN_RAW_FILE}`);
  const schedule = await loadSchedule(options);
  await writeJson(FUTMIND_RAW_FILE, {
    schemaVersion: 1,
    game: 'FC26',
    source: 'FUT Mind public evolution index',
    sourceUrl: FUTMIND_URL,
    fetchedAt: new Date().toISOString(),
    counts: { records: schedule.length },
    records: schedule,
  });

  const tasks = buildChronologicalTasks(futbinDocument.tasks, schedule, options);
  const rangeKey = `${options.from}_${options.to}`;
  const rangeDir = path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'ranges', rangeKey);
  const exact = tasks.filter((task) => task.dateConfidence === 'exact').length;
  const normalized = tasks.filter((task) => task.dateConfidence === 'normalized').length;
  const inferred = tasks.filter((task) => task.dateConfidence === 'inferred').length;
  const dateCounts = Object.fromEntries([...new Set(tasks.map((task) => task.releaseDate))].map((date) => [
    date,
    tasks.filter((task) => task.releaseDate === date).length,
  ]));
  const categoryCounts = {};
  for (const task of tasks) for (const category of task.categories || ['UNCATEGORIZED']) {
    const slug = categorySlug(category) || 'uncategorized';
    categoryCounts[slug] = (categoryCounts[slug] || 0) + 1;
  }
  const common = {
    schemaVersion: 2,
    game: 'FC26',
    source: 'FUTBIN + FUT Mind release schedule',
    generatedAt: new Date().toISOString(),
    window: { from: options.from, to: options.to, inclusive: true },
    sort: ['releaseDate:asc', 'futbinEvolutionId:asc'],
    dateMethod: {
      exact: 'FUT Mind created_at aligned to FUTBIN by chronological longest common subsequence of task names',
      normalized: `pre-launch provider timestamps normalized to the requested FC26 opening boundary ${options.from}`,
      inferred: 'interpolated between surrounding exact chronological FUTBIN/FUT Mind anchors',
    },
  };
  const document = {
    ...common,
    counts: {
      tasks: tasks.length,
      datesWithTasks: Object.keys(dateCounts).length,
      exactDates: exact,
      normalizedLaunchDates: normalized,
      inferredDates: inferred,
      categories: categoryCounts,
    },
    first: tasks[0] ? { id: tasks[0].id, name: tasks[0].name, releaseDate: tasks[0].releaseDate } : null,
    last: tasks.at(-1) ? { id: tasks.at(-1).id, name: tasks.at(-1).name, releaseDate: tasks.at(-1).releaseDate } : null,
    tasks,
  };
  await writeJson(path.join(rangeDir, 'tasks.json'), document);
  await writeJson(path.join(rangeDir, 'tasks-chronological.json'), document);
  await writeCsv(path.join(rangeDir, 'tasks-chronological.csv'), [
    ['chronological_rank', 'release_date', 'date_confidence', 'evolution_id', 'name', 'slug', 'category', 'status', 'url'],
    ...tasks.map((task) => [
      task.chronologicalRank,
      task.releaseDate,
      task.dateConfidence,
      task.id,
      task.name,
      task.slug,
      (task.categories || []).join('|'),
      task.status,
      task.url,
    ]),
  ]);

  const dailyDir = path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'by-date', 'daily');
  for (const [date, count] of Object.entries(dateCounts)) {
    await writeJson(path.join(dailyDir, `${date}.json`), {
      ...common,
      date,
      count,
      tasks: tasks.filter((task) => task.releaseDate === date),
    });
  }
  await writeJson(path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'by-date', 'index.json'), {
    ...common,
    counts: { tasks: tasks.length, datesWithTasks: Object.keys(dateCounts).length },
    dates: Object.entries(dateCounts).map(([date, count]) => ({
      date,
      count,
      file: `daily/${date}.json`,
      firstChronologicalRank: tasks.find((task) => task.releaseDate === date)?.chronologicalRank,
      lastChronologicalRank: tasks.findLast((task) => task.releaseDate === date)?.chronologicalRank,
    })),
  });

  for (const slug of Object.keys(categoryCounts)) {
    const categoryTasks = tasks.filter((task) => (task.categories || ['UNCATEGORIZED']).some((category) => (categorySlug(category) || 'uncategorized') === slug));
    await writeJson(path.join(rangeDir, 'by-category', `${slug}.json`), {
      ...common,
      category: slug,
      count: categoryTasks.length,
      tasks: categoryTasks,
    });
  }
  await writeJson(path.join(rangeDir, 'manifest.json'), {
    ...common,
    completed: true,
    counts: document.counts,
    first: document.first,
    last: document.last,
    files: {
      tasksJson: 'tasks.json',
      chronologicalJson: 'tasks-chronological.json',
      chronologicalCsv: 'tasks-chronological.csv',
      categoriesDirectory: 'by-category',
      dailyIndex: '../../by-date/index.json',
      dailyDirectory: '../../by-date/daily',
      scheduleSource: '../../raw/futmind-evolution-schedule.json',
    },
  });
  console.log(JSON.stringify({ range: rangeKey, ...document.counts, first: document.first, last: document.last }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
