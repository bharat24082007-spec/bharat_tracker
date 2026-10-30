import {shift, delta, platforms} from './metrics.js';

// Align a date-only value with the Monday of its IST calendar week.
export function weekStart(day) {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return shift(day, -((weekday + 6) % 7));
}

// Convert a stored completion timestamp into its IST calendar date.
export function completionDay(task) {
  if (!task.done || !task.completedAt) return null;
  const stamp = new Date(task.completedAt);
  if (Number.isNaN(stamp.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(stamp);
}

// Summarize measured progress without treating missing snapshots or legacy completions as activity.
export function weeklyReview(rows, tasks, selected, today, linked) {
  const start = weekStart(selected), end = shift(start, 6), until = end < today ? end : today;
  const days = Array.from({length: 7}, (_, i) => shift(start, i)).filter(day => day <= until);
  const counts = Object.fromEntries(platforms.filter(p => linked[p]).map(platform => [platform, {solved: 0, measured: 0, days: days.length}]));
  for (const [platform, count] of Object.entries(counts)) for (const day of days) {
    const change = delta(rows, platform, day);
    if (change !== null && change >= 0) { count.solved += change; count.measured++; }
  }
  const completed = tasks.filter(task => { const day = completionDay(task); return day && day >= start && day <= until; });
  const missed = tasks.filter(task => !task.done && task.due >= start && task.due <= end && task.due < today);
  const baseline = rows.find(row => row.platform === 'leetcode' && row.day === shift(start, -1) && row.topics);
  const latest = rows.filter(row => row.platform === 'leetcode' && row.day >= start && row.day <= until && row.topics).sort((a, b) => b.day.localeCompare(a.day))[0];
  const topics = baseline && latest ? Object.entries(latest.topics).map(([name, total]) => [name, Math.max(0, total - (baseline.topics[name] || 0))]).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]) : null;
  return {start, end, counts, completed, missed, topics, solved: Object.values(counts).reduce((total, value) => total + value.solved, 0)};
}
