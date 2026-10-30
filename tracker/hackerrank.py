import json
from .common import username, snapshot, request, safe_fetch

# Validate the unofficial API's explicit solved count without confusing rank with rating.
def parse(data, handle):
    solved = data.get('totalSolved')
    if data.get('status') != 'success' or data.get('username') != handle:
        raise ValueError('Unexpected HackerRank response')
    if type(solved) is not int or solved < 0:
        raise ValueError('Missing or invalid solved count')
    return snapshot('hackerrank', solved, source='unofficial-api')

# Read public statistics through the third-party API without scraping HackerRank directly.
def fetch_raw(handle):
    return parse(json.loads(request(f'https://hackerrank-stats.tashif.codes/{handle}')), handle)

# Preserve manual fallback when the unofficial service is unavailable.
def fetch(handle):
    return safe_fetch('hackerrank', lambda: fetch_raw(username(handle)))

if __name__ == '__main__':
    import sys
    print(json.dumps(fetch(sys.argv[1] if len(sys.argv) > 1 else ''), indent=2))
