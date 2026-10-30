export const platforms = ['leetcode', 'codechef', 'gfg', 'hackerrank'];

// Format the current date explicitly in IST, regardless of browser timezone.
export function today() {
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}

// Shift a date-only string without involving the device timezone.
export function shift(day, amount) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

// Compare consecutive observations and leave missing baselines unknown.
export function delta(rows, platform, day) {
  const current = rows.find(r => r.platform === platform && r.day === day);
  const previous = rows.find(r => r.platform === platform && r.day === shift(day, -1));
  return current?.solved != null && previous?.solved != null ? current.solved - previous.solved : null;
}

// Count proven consecutive active days while allowing today to remain unfinished.
export function streak(rows, platform, day) {
  let cursor = day, count = 0;
  while (true) {
    const value = delta(rows, platform, cursor);
    if (!(value > 0)) {
      if (cursor === day) { cursor = shift(cursor, -1); continue; }
      return count;
    }
    count++;
    cursor = shift(cursor, -1);
  }
}

// Compare goal progress with a straight-line plan from its creation baseline.
export function goalProgress(goal, solved, day) {
  const days = Math.round((Date.parse(goal.deadline) - Date.parse(day)) / 86400000);
  const duration = Math.max(1, (Date.parse(goal.deadline) - Date.parse(goal.startDay)) / 86400000);
  const elapsed = Math.max(0, (Date.parse(day) - Date.parse(goal.startDay)) / 86400000);
  const expected = goal.startSolved + (goal.target - goal.startSolved) * Math.min(1, elapsed / duration);
  const remaining = Math.max(0, goal.target - solved);
  return {remaining, perDay: Math.ceil(remaining / Math.max(1, days + 1)), label: !remaining ? 'Complete' : days < 0 ? 'Overdue' : solved >= expected ? 'Ahead / on track' : 'Behind'};
}
