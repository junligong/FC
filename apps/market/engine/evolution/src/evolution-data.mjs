// 作用：提供进化任务的日期窗口、分类映射和JSON读写等共享数据能力。
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_FROM = '2025-09-18';
export const DEFAULT_TO = '2026-02-14';

export const KNOWN_WINDOWS = Object.freeze({
  [`${DEFAULT_FROM}_${DEFAULT_TO}`]: Object.freeze({
    firstEvolutionId: 5,
    lastEvolutionId: 482,
    cutoffAnchor: {
      id: 474,
      name: 'Get your Protein',
      releaseDate: '2026-02-14',
    },
    includedSamePromoBatch: {
      ids: [475, 476, 477, 478, 479, 480, 481, 482],
      releaseDate: '2026-02-13',
    },
    nextExcluded: {
      id: 483,
      name: 'The Invisible Wall',
      releaseDate: '2026-02-15',
    },
    evidenceUrls: [
      'https://www.gamers.de/2026/02/14/fc-26-get-your-protein-evolution-anforderungen-upgrades-und-beste-spieler/',
      'https://www.ea.com/games/ea-sports-fc/fc-26/news/fc-26-knockout-royalty',
      'https://www.reddit.com/r/EASportsFC/comments/1r5le0q/new_evo_available_the_invisible_wall/',
    ],
  }),
  [`${DEFAULT_FROM}_2026-08-24`]: Object.freeze({
    firstEvolutionId: 5,
    lastEvolutionId: 1281,
    cutoffAnchor: {
      id: 1281,
      name: 'The Tenant',
      releaseDate: '2026-08-24',
    },
    nextExcluded: {
      id: 1283,
      name: 'In That Order',
      releaseDate: '2026-08-26',
    },
    evidenceUrls: [
      'https://futmind.com/evolutions/2657/the-tenant',
      'https://futmind.com/evolutions/2669/in-that-order',
    ],
  }),
});

export function rangeKey(from, to) {
  return `${from}_${to}`;
}

export function rangeDirectory(projectDir, from, to) {
  return path.join(projectDir, 'evolution', 'data', 'fc26', 'ranges', rangeKey(from, to));
}

export function categorySlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function selectTasksForWindow(tasks, { from, to, startId, endId } = {}) {
  const known = KNOWN_WINDOWS[rangeKey(from, to)];
  const firstEvolutionId = Number.isFinite(startId) ? startId : known?.firstEvolutionId;
  const lastEvolutionId = Number.isFinite(endId) ? endId : known?.lastEvolutionId;
  if (!Number.isFinite(firstEvolutionId) || !Number.isFinite(lastEvolutionId)) {
    throw new Error(`日期区间 ${from} 至 ${to} 没有已验证的 FUTBIN ID 边界；请同时传入 --start-id 和 --end-id。`);
  }
  return tasks
    .filter((task) => task.id >= firstEvolutionId && task.id <= lastEvolutionId)
    .sort((left, right) => left.id - right.id);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function stringifyCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

async function writeAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, file);
}

export async function writeJson(file, value) {
  await writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readChineseNameLookup(projectDir) {
  const file = path.join(projectDir, 'data', 'players', 'player-name-zh.json');
  const document = await readJson(file, { players: [] });
  const bySlug = new Map();
  const byName = new Map();
  for (const player of document.players || []) {
    if (!player.nameZh) continue;
    if (player.slug) bySlug.set(player.slug, player.nameZh);
    if (player.name) byName.set(player.name.toLocaleLowerCase('en'), player.nameZh);
  }
  return { bySlug, byName, sourceFile: path.relative(projectDir, file) };
}

function enrichPlayer(player, lookup) {
  const nameZh = lookup.bySlug.get(player.slug) || lookup.byName.get(String(player.name || '').toLocaleLowerCase('en'));
  return nameZh ? { ...player, nameZh } : { ...player };
}

export async function finalizeEvolutionRange(projectDir, { from = DEFAULT_FROM, to = DEFAULT_TO } = {}) {
  const directory = rangeDirectory(projectDir, from, to);
  const tasksDocument = await readJson(path.join(directory, 'tasks.json'));
  const checkpoint = await readJson(path.join(directory, '.popular-players-checkpoint.json'));
  if (!tasksDocument?.tasks || !checkpoint?.records) {
    throw new Error(`缺少任务或热门球员断点数据：${directory}`);
  }

  const tasks = [...tasksDocument.tasks].sort((left, right) => left.id - right.id);
  const lookup = await readChineseNameLookup(projectDir);
  const popularRecords = tasks.map((task) => {
    const record = checkpoint.records[String(task.id)] || {
      taskId: task.id,
      taskName: task.name,
      taskUrl: task.url,
      popularUrl: task.popularUrl,
      status: 'not-fetched',
      players: [],
    };
    return {
      ...record,
      players: (record.players || []).map((player) => enrichPlayer(player, lookup)),
    };
  });
  const popularById = new Map(popularRecords.map((record) => [record.taskId, record]));
  const combinedTasks = tasks.map((task) => {
    const popular = popularById.get(task.id);
    return {
      ...task,
      dateClassification: {
        type: 'inclusive-range',
        from,
        to,
        exactReleaseDate: null,
      },
      popularPlayersStatus: popular.status,
      popularPlayersCount: popular.players.length,
      popularPlayers: popular.players,
    };
  });

  const statusCounts = Object.fromEntries(
    [...new Set(popularRecords.map((record) => record.status))]
      .sort()
      .map((status) => [status, popularRecords.filter((record) => record.status === status).length]),
  );
  const categories = {};
  for (const task of combinedTasks) {
    for (const label of task.categories || ['UNCATEGORIZED']) {
      const slug = categorySlug(label) || 'uncategorized';
      categories[slug] ||= { label, tasks: [] };
      categories[slug].tasks.push(task);
    }
  }

  const common = {
    schemaVersion: 1,
    game: 'FC26',
    source: 'FUTBIN',
    generatedAt: new Date().toISOString(),
    window: { from, to, inclusive: true },
    dateClassification: {
      method: 'verified FUTBIN chronological ID boundary',
      exactReleaseDatesAvailableFromFutbin: false,
      note: 'FUTBIN historical evolution pages do not expose a per-task absolute release date; tasks are therefore grouped into the verified inclusive range without inventing daily dates.',
    },
  };
  const popularDocument = {
    ...common,
    counts: {
      tasks: popularRecords.length,
      players: popularRecords.reduce((sum, record) => sum + record.players.length, 0),
      statuses: statusCounts,
    },
    chineseNames: { sourceFile: lookup.sourceFile, unresolvedAreLeftBlank: true },
    tasks: popularRecords,
  };
  const combinedDocument = {
    ...common,
    counts: {
      tasks: combinedTasks.length,
      popularPlayers: popularDocument.counts.players,
      categories: Object.fromEntries(Object.entries(categories).map(([slug, value]) => [slug, value.tasks.length])),
      popularStatuses: statusCounts,
    },
    selection: tasksDocument.selection,
    tasks: combinedTasks,
  };

  await writeJson(path.join(directory, 'popular-players.json'), popularDocument);
  await writeJson(path.join(directory, 'tasks-with-popular-players.json'), combinedDocument);
  await writeAtomic(path.join(directory, 'tasks.csv'), stringifyCsv([
    ['evolution_id', 'name', 'slug', 'date_range_start', 'date_range_end', 'exact_release_date', 'category', 'status', 'free', 'repeatable', 'url', 'popular_url', 'popular_status', 'popular_player_count'],
    ...combinedTasks.map((task) => [
      task.id,
      task.name,
      task.slug,
      from,
      to,
      '',
      (task.categories || []).join('|'),
      task.status,
      task.availability?.free ?? '',
      task.availability?.repeatable ?? '',
      task.url,
      task.popularUrl,
      task.popularPlayersStatus,
      task.popularPlayersCount,
    ]),
  ]));
  await writeAtomic(path.join(directory, 'popular-players.csv'), stringifyCsv([
    ['evolution_id', 'evolution_name', 'player_rank', 'name', 'name_zh', 'slug', 'rating', 'position', 'alternate_positions', 'popularity', 'player_url'],
    ...popularRecords.flatMap((record) => record.players.map((player) => [
      record.taskId,
      record.taskName,
      player.rank,
      player.name,
      player.nameZh || '',
      player.slug,
      player.rating,
      player.position,
      (player.alternatePositions || []).join('|'),
      player.popularity,
      player.url,
    ])),
  ]));

  for (const [slug, category] of Object.entries(categories)) {
    await writeJson(path.join(directory, 'by-category', `${slug}.json`), {
      ...common,
      category: { slug, label: category.label },
      counts: {
        tasks: category.tasks.length,
        popularPlayers: category.tasks.reduce((sum, task) => sum + task.popularPlayersCount, 0),
      },
      tasks: category.tasks,
    });
  }

  const byDateFile = path.join(projectDir, 'evolution', 'data', 'fc26', 'by-date', `${rangeKey(from, to)}.json`);
  await writeJson(byDateFile, {
    ...common,
    rangeFile: path.relative(projectDir, path.join(directory, 'tasks-with-popular-players.json')),
    counts: combinedDocument.counts,
    tasks: combinedTasks,
  });

  const manifest = {
    ...common,
    completed: popularRecords.every((record) => !['not-fetched', 'error', 'challenge'].includes(record.status)),
    counts: combinedDocument.counts,
    selection: tasksDocument.selection,
    files: {
      tasksJson: 'tasks.json',
      tasksCsv: 'tasks.csv',
      popularPlayersJson: 'popular-players.json',
      popularPlayersCsv: 'popular-players.csv',
      combinedJson: 'tasks-with-popular-players.json',
      categoriesDirectory: 'by-category',
      checkpoint: '.popular-players-checkpoint.json',
      byDateIndex: path.relative(directory, byDateFile),
    },
  };
  await writeJson(path.join(directory, 'manifest.json'), manifest);
  return manifest;
}
