from datetime import date, timedelta

# Compare only adjacent dated observations; missing counts remain unknown.
def delta(rows, platform, day):
    previous = (date.fromisoformat(day) - timedelta(days=1)).isoformat()
    counts = {r['day']: r['solved'] for r in rows if r['platform'] == platform and r.get('solved') is not None}
    if day not in counts or previous not in counts:
        return None
    return counts[day] - counts[previous]

# Sum known daily changes while reporting whether all platforms were measured.
def daily(rows, day):
    from .common import PLATFORMS
    values = [delta(rows, p, day) for p in PLATFORMS]
    return sum(max(0, v) for v in values if v is not None), all(v is not None for v in values)

# Count consecutive proven active days, allowing today to still be in progress.
def streak(rows, today, platform=None):
    cursor = date.fromisoformat(today)
    count = 0
    while True:
        value = delta(rows, platform, cursor.isoformat()) if platform else daily(rows, cursor.isoformat())[0]
        if not value or value < 0:
            if cursor.isoformat() == today:
                cursor -= timedelta(days=1)
                continue
            return count
        count += 1
        cursor -= timedelta(days=1)
