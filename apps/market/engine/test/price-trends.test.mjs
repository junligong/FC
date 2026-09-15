// 作用：验证开服前三周价格趋势分类和窗口计算逻辑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DATES, THREE_WEEK_WINDOWS, classifyTrend } from '../gold/src/fc26-first-three-weeks-analysis.mjs';

function changeSet(values) {
  return Object.fromEntries(THREE_WEEK_WINDOWS.map((window, index) => [
    window.key,
    { changePct: values[index] },
  ]));
}

test('defines three consecutive seven-day windows from launch day', () => {
  assert.equal(ALL_DATES.length, 21);
  assert.equal(ALL_DATES[0], '2025-09-18');
  assert.equal(ALL_DATES.at(-1), '2025-10-08');
  assert.deepEqual(THREE_WEEK_WINDOWS.map(({ start, end }) => [start, end]), [
    ['2025-09-18', '2025-09-24'],
    ['2025-09-25', '2025-10-01'],
    ['2025-10-02', '2025-10-08'],
  ]);
});

test('classifies weekly player price patterns', () => {
  assert.equal(classifyTrend(changeSet([0.1, 0.2, 0.05]), { changePct: 0.4 }), 'trend_up3');
  assert.equal(classifyTrend(changeSet([-0.1, -0.2, -0.05]), { changePct: -0.4 }), 'trend_down3');
  assert.equal(classifyTrend(changeSet([0.1, -0.2, 0.05]), { changePct: -0.1 }), 'trend_rebound');
  assert.equal(classifyTrend(changeSet([-0.1, 0.2, -0.05]), { changePct: 0.1 }), 'trend_turnDown');
  assert.equal(classifyTrend(changeSet([null, 0.2, -0.05]), { changePct: -0.1 }), 'trend_insufficient');
});
