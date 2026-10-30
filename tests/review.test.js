import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weeklyReview, weekStart, completionDay} from '../public/review.js';

// Keep week boundaries and UTC completion timestamps aligned to IST.
test('IST weekly boundaries and completion history', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  assert.equal(completionDay({done: true, completedAt: '2026-10-25T20:00:00Z'}), '2026-10-26');
  assert.equal(completionDay({done: true}), null);
  assert.equal(completionDay({done: false, completedAt: '2026-10-25T20:00:00Z'}), null);
});

// Report only measured daily changes and retain gaps instead of inventing zeroes.
test('weekly measured solves, topics, missed work, and future weeks', () => {
  const rows = [[25, 10], [26, 12], [27, 15], [30, 16], [31, 17]].map(([day, solved]) => ({platform: 'leetcode', day: `2026-10-${day}`, solved, topics: {Array: solved - 7}}));
  const tasks = [{done: true, completedAt: '2026-10-25T20:00:00Z'}, {done: true}, {done: false, due: '2026-10-28'}, {done: false, due: '2026-10-31'}];
  const review = weeklyReview(rows, tasks, '2026-10-31', '2026-10-31', {leetcode: 'student'});
  assert.equal(review.solved, 6);
  assert.deepEqual(review.counts.leetcode, {solved: 6, measured: 3, days: 6});
  assert.equal(review.completed.length, 1);
  assert.equal(review.missed.length, 1);
  assert.deepEqual(review.topics, [['Array', 7]]);
  assert.equal(weeklyReview(rows.slice(1), tasks, '2026-10-31', '2026-10-31', {leetcode: 'student'}).topics, null);
  assert.equal(weeklyReview(rows, tasks, '2027-01-01', '2026-10-31', {leetcode: 'student'}).counts.leetcode.days, 0);
});
