import json
from .common import username, request, snapshot, safe_fetch

QUERY = '''query($username: String!) {
  matchedUser(username: $username) {
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    tagProblemCounts {
      advanced { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      fundamental { tagName problemsSolved }
    }
    submissionCalendar
  }
  userContestRanking(username: $username) { rating attendedContestsCount }
}'''

# Parse public LeetCode statistics without treating submissions as unique solves.
def parse(data):
    if data.get('errors'):
        raise ValueError('GraphQL error')
    user = data['data']['matchedUser']
    split = {item['difficulty'].lower(): item['count'] for item in user['submitStatsGlobal']['acSubmissionNum']}
    topics = {item['tagName']: item['problemsSolved'] for group in user['tagProblemCounts'].values() for item in group}
    contest = data['data'].get('userContestRanking') or {}
    return snapshot('leetcode', split['all'], contest.get('rating'), difficulty=split, topics=topics,
                    calendar=json.loads(user['submissionCalendar']), contests=contest.get('attendedContestsCount', 0))

# Request the configured student's public LeetCode profile.
def fetch_raw(handle):
    return parse(json.loads(request('https://leetcode.com/graphql', {'query': QUERY, 'variables': {'username': handle}})))

# Return unavailable if LeetCode blocks or changes its endpoint.
def fetch(handle):
    return safe_fetch('leetcode', lambda: fetch_raw(username(handle)))

if __name__ == '__main__':
    import sys
    print(json.dumps(fetch(sys.argv[1] if len(sys.argv) > 1 else ''), indent=2))
