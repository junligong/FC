// 作用：验证进化日期窗口、分类和进化数据仓库行为。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvolutionRepository } from '../src/player-data.mjs';
import { categorySlug, selectTasksForWindow } from '../evolution/src/evolution-data.mjs';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RANGE_DIR = path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'ranges', '2025-09-18_2026-02-14');
const CHRONOLOGICAL_RANGE_DIR = path.join(PROJECT_DIR, 'evolution', 'data', 'fc26', 'ranges', '2025-09-18_2026-08-24');

test('selects the verified inclusive FC26 launch-to-February evolution window', () => {
  const tasks = [{ id: 4 }, { id: 5 }, { id: 55 }, { id: 482 }, { id: 483 }];
  assert.deepEqual(
    selectTasksForWindow(tasks, { from: '2025-09-18', to: '2026-02-14' }).map(({ id }) => id),
    [5, 55, 482],
  );
});

test('normalizes FUTBIN category labels to stable file slugs', () => {
  assert.equal(categorySlug('FS ACADEMY ROLES'), 'fs-academy-roles');
  assert.equal(categorySlug('BUILD YOUR TOTY HM'), 'build-your-toty-hm');
});

test('generated evolution range is complete, unique and queryable', async () => {
  const document = JSON.parse(await fs.readFile(path.join(RANGE_DIR, 'tasks-with-popular-players.json'), 'utf8'));
  assert.equal(document.window.from, '2025-09-18');
  assert.equal(document.window.to, '2026-02-14');
  assert.equal(document.tasks.length, 424);
  assert.equal(new Set(document.tasks.map(({ id }) => id)).size, 424);
  assert.equal(document.tasks[0].id, 5);
  assert.equal(document.tasks.at(-1).id, 482);
  assert.equal(Object.values(document.counts.categories).reduce((sum, count) => sum + count, 0), 424);
  assert.ok(document.tasks.every((task) => task.url.startsWith('https://www.futbin.com/26/evolutions/')));
  assert.ok(document.tasks.every((task) => ['ok', 'no-popular-players'].includes(task.popularPlayersStatus)));

  const repository = createEvolutionRepository(document);
  assert.equal(repository.get(55).name, 'The Big Fella');
  assert.equal(repository.get('inside-edge').id, 482);
  assert.equal(repository.listByCategory('FS ACADEMY').length, 49);
  assert.equal(repository.listWithPopularPlayers().length, 1);
});

test('full FC26 evolution timeline is sorted from launch through 2026-08-24', async () => {
  const document = JSON.parse(await fs.readFile(path.join(CHRONOLOGICAL_RANGE_DIR, 'tasks.json'), 'utf8'));
  assert.equal(document.tasks.length, 1217);
  assert.deepEqual(document.first, { id: 5, name: 'Intro to Evolutions', releaseDate: '2025-09-18' });
  assert.deepEqual(document.last, { id: 1281, name: 'The Tenant', releaseDate: '2026-08-24' });
  assert.equal(document.tasks[0].chronologicalRank, 1);
  assert.equal(document.tasks.at(-1).chronologicalRank, 1217);
  assert.ok(document.tasks.every((task, index) => index === 0 || (
    task.releaseDate > document.tasks[index - 1].releaseDate
    || (task.releaseDate === document.tasks[index - 1].releaseDate && task.id > document.tasks[index - 1].id)
  )));

  const repository = createEvolutionRepository(document);
  assert.equal(repository.listByDate('2025-09-18')[0].id, 5);
  assert.equal(repository.listByDate('2026-08-24').at(-1).id, 1281);
});
