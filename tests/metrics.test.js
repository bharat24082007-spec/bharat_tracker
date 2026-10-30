import {test} from 'node:test';
import assert from 'node:assert/strict';
import {delta, shift, streak, goalProgress, today} from '../public/metrics.js';

// Verify calendar arithmetic and unknown-baseline handling.
test('date boundaries and missing days', () => {
  assert.equal(shift('2026-01-01', -1), '2025-12-31');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(delta([], 'leetcode', '2026-10-28'), null);
});

// Verify current streaks tolerate an unfinished day but break on historical gaps.
test('streak and correction', () => {
  const rows = [10, 12, 13, 13].map((solved, i) => ({platform: 'leetcode', day: `2026-10-${25 + i}`, solved}));
  assert.equal(streak(rows, 'leetcode', '2026-10-28'), 2);
  rows.pop();
  assert.equal(streak(rows, 'leetcode', '2026-10-28'), 2);
  rows[2].solved = 8;
  assert.equal(delta(rows, 'leetcode', '2026-10-27'), -4);
});

// Verify goal pace, completion, and overdue behavior.
test('goal pacing', () => {
  const goal = {target: 100, startSolved: 0, startDay: '2026-10-01', deadline: '2026-10-11'};
  assert.equal(goalProgress(goal, 20, '2026-10-06').label, 'Behind');
  assert.equal(goalProgress(goal, 20, '2026-10-06').perDay, 14);
  assert.equal(goalProgress(goal, 100, '2026-10-12').label, 'Complete');
  assert.equal(goalProgress(goal, 90, '2026-10-12').label, 'Overdue');
});
