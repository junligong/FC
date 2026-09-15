// 作用：验证开服首月日期区间和价格信号分类逻辑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_MONTH_DATES, FIRST_MONTH_PERIODS, classifyMonthlySignal } from '../gold/src/fc26-first-month-analysis.mjs';

test('defines 30 consecutive launch-month dates and four full weeks plus two tail days', () => {
  assert.equal(FIRST_MONTH_DATES.length, 30);
  assert.equal(FIRST_MONTH_DATES[0], '2025-09-18');
  assert.equal(FIRST_MONTH_DATES.at(-1), '2025-10-17');
  assert.deepEqual(FIRST_MONTH_PERIODS.map(({ start, end }) => [start, end]), [
    ['2025-09-18', '2025-09-24'],
    ['2025-09-25', '2025-10-01'],
    ['2025-10-02', '2025-10-08'],
    ['2025-10-09', '2025-10-15'],
    ['2025-10-16', '2025-10-17'],
  ]);
});

test('classifies transparent monthly trading signals', () => {
  const complete = { observedDays: 30, changePct: 0.35 };
  assert.equal(classifyMonthlySignal(complete, { last7: { changePct: 0.1 }, maxDrawdown: 0.2, distanceFromLow: 0.5, dailyVolatility: 0.04 }), 'signal_strongUp');
  assert.equal(classifyMonthlySignal({ observedDays: 30, changePct: -0.2 }, { last7: { changePct: 0.1 }, maxDrawdown: 0.4, distanceFromLow: 0.2, dailyVolatility: 0.05 }), 'signal_rebound');
  assert.equal(classifyMonthlySignal({ observedDays: 30, changePct: -0.4 }, { last7: { changePct: -0.2 }, maxDrawdown: 0.5, distanceFromLow: 0.04, dailyVolatility: 0.06 }), 'signal_decline');
  assert.equal(classifyMonthlySignal({ observedDays: 29, changePct: -0.1 }, { last7: { changePct: 0.1 } }), 'signal_insufficient');
});
