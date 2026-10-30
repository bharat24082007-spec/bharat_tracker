import json
import re
from html import unescape
from .common import username, request, snapshot, safe_fetch

# Extract the explicit total, current rating, and available contest history.
def parse(html):
    text = unescape(re.sub(r'<[^>]+>', ' ', html))
    total = re.search(r'Total\s+Problems\s+Solved\s*:?\s*([\d,]+)', text, re.I)
    if not total:
        raise ValueError('Total Problems Solved missing')
    rating = re.search(r'class=[\"\'][^\"\']*rating-number[^\"\']*[\"\'][^>]*>\s*(\d+)', html)
    history = re.search(r'\ball_rating\s*=\s*(\[.*?\])\s*;', html, re.S)
    contests = json.loads(history.group(1)) if history else []
    return snapshot('codechef', int(total.group(1).replace(',', '')), int(rating.group(1)) if rating else None,
                    contests=contests, contests_available=history is not None)

# Fetch the public CodeChef page without adding practice-section counts.
def fetch_raw(handle):
    return parse(request(f'https://www.codechef.com/users/{handle}'))

# Keep other platforms running if CodeChef cannot be parsed.
def fetch(handle):
    return safe_fetch('codechef', lambda: fetch_raw(username(handle)))

if __name__ == '__main__':
    import sys
    print(json.dumps(fetch(sys.argv[1] if len(sys.argv) > 1 else ''), indent=2))
