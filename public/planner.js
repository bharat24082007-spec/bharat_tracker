import {shift} from './metrics.js';

// Keep overdue, completed, and scheduled tasks distinct using IST date strings.
export function taskStatus(task, day) {
  if (task.done) return 'completed';
  if (!task.due) return 'unscheduled';
  if (task.due < day) return 'missed';
  if (task.due === day) return 'today';
  if (task.due === shift(day, 1)) return 'tomorrow';
  return 'upcoming';
}

// Select a planner view and sort urgent work before lower-priority tasks.
export function selectTasks(tasks, filter, day, selectedDate) {
  const priority = {high: 0, medium: 1, low: 2};
  return tasks.filter(task => {
    const status = taskStatus(task, day);
    if (filter === 'all') return true;
    if (filter === 'done') return task.done;
    if (filter === 'date') return task.due === selectedDate;
    if (filter === 'today') return status === 'today' || status === 'missed';
    if (filter === 'upcoming') return !task.done && task.due > day;
    return status === filter;
  }).sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999') || priority[a.priority] - priority[b.priority]);
}

// Preserve the original deadline whenever a task is forwarded or rescheduled.
export function reschedule(task, due) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw Error('Choose a date.');
  return {due, originalDue: task.originalDue || task.due || due};
}
