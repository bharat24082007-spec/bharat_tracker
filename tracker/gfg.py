import json
from .common import username, request, snapshot, safe_fetch, InvalidProfileError

# Read an explicit total from GfG's lightweight profile response.
def parse(data):
    info = data.get('data', data)
    info = info.get('userInfo', info)
    message = str(info.get('message', info.get('error', ''))).lower() if isinstance(info, dict) else ''
    if any(marker in message for marker in ('user not found', 'profile not found', 'invalid user', 'user does not exist')):
        raise InvalidProfileError('GeeksforGeeks profile does not exist')
    value = info.get('total_problems_solved', info.get('totalProblemsSolved'))
    if value is None:
        raise ValueError('Unrecognized GfG response; use manual entry')
    return snapshot('gfg', int(value), info.get('contest_rating'))

# Try GfG's own data endpoint without rendering or scraping its JS page.
def fetch_raw(handle):
    return parse(json.loads(request(f'https://authapi.geeksforgeeks.org/api-get/user-profile-info/?handle={handle}')))

# Enable dashboard manual entry when the unofficial endpoint is unavailable.
def fetch(handle):
    return safe_fetch('gfg', lambda: fetch_raw(username(handle)))

if __name__ == '__main__':
    import sys
    print(json.dumps(fetch(sys.argv[1] if len(sys.argv) > 1 else ''), indent=2))
