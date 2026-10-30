import json
import re
from datetime import datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

IST = ZoneInfo('Asia/Kolkata')
PLATFORMS = ('leetcode', 'codechef', 'gfg', 'hackerrank')

# Validate stored usernames before interpolating them into fixed upstream endpoints.
def username(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,60}', value):
        raise ValueError('Invalid profile username')
    return value

# Return an ISO timestamp in India's timezone.
def now():
    return datetime.now(IST).isoformat()

# Fetch a public endpoint with a timeout and optional JSON body.
def request(url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = Request(url, data=data, headers={'User-Agent': 'StudentProgressTracker/1.0', 'Content-Type': 'application/json'})
    with urlopen(req, timeout=25) as response:
        return response.read().decode()

# Make every platform use the same core snapshot fields.
def snapshot(platform, solved=None, rating=None, status='ok', **extra):
    if solved is not None and (isinstance(solved, bool) or int(solved) < 0):
        raise ValueError('Invalid solved count')
    return dict(platform=platform, solved=None if solved is None else int(solved), rating=rating, status=status, fetched_at=now(), **extra)

# Isolate endpoint failures without exposing response bodies or credentials.
def safe_fetch(platform, fetch):
    try:
        return fetch()
    except Exception as error:
        return snapshot(platform, status='unavailable', error=type(error).__name__)
