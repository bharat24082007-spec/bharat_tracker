import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskStatus, selectTasks, reschedule} from '../public/planner.js';

// Check that incomplete work becomes missed after midnight while completed work stays completed.
test('missed work and calendar boundaries', () => {
  const task = {due: '2026-12-31', done: false};
  assert.equal(taskStatus(task, '2026-12-31'), 'today');
  assert.equal(taskStatus(task, '2027-01-01'), 'missed');
  assert.equal(taskStatus({...task, done: true}, '2027-01-01'), 'completed');
  assert.equal(taskStatus({due: '2027-01-01'}, '2026-12-31'), 'tomorrow');
});

// Check views keep overdue work visible and do not hide unscheduled legacy tasks from All.
test('planner filters and priorities', () => {
  const tasks = [
    {id: 'a', due: '2026-10-27', priority: 'low', done: false},
    {id: 'b', due: '2026-10-28', priority: 'high', done: false},
    {id: 'c', due: '2026-10-29', priority: 'medium', done: false},
    {id: 'd', due: '2026-10-28', priority: 'low', done: true},
    {id: 'e', due: '', priority: 'low', done: false}
  ];
  assert.deepEqual(selectTasks(tasks, 'today', '2026-10-28').map(t => t.id), ['a', 'b']);
  assert.equal(selectTasks(tasks, 'tomorrow', '2026-10-28')[0].id, 'c');
  assert.equal(selectTasks(tasks, 'done', '2026-10-28')[0].id, 'd');
  assert.equal(selectTasks(tasks, 'date', '2026-10-28', '2026-10-28').length, 2);
  assert.equal(selectTasks(tasks, 'all', '2026-10-28').length, 5);
});

// Preserve the first deadline through repeated forwarding instead of losing missed history.
test('forwarding retains original due date', () => {
  const task = {due: '2026-10-27'};
  const first = reschedule(task, '2026-10-29');
  assert.equal(first.originalDue, '2026-10-27');
  assert.equal(reschedule(first, '2026-11-01').originalDue, '2026-10-27');
  assert.throws(() => reschedule(task, ''));
});
