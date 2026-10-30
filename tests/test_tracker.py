import unittest
from unittest.mock import patch
from tracker import codechef, leetcode, gfg, hackerrank
from tracker.common import safe_fetch
from tracker.metrics import delta, daily, streak

class TrackerTests(unittest.TestCase):
    # Ensure CodeChef uses the explicit total instead of adding misleading sections.
    def test_codechef_total(self):
        result = codechef.parse('<h3>Total Problems Solved: 5</h3><div class="rating-number">1200</div><p>Fully Solved (200)</p><script>var all_rating = [{"code":"START1"}];</script>')
        self.assertEqual(result['solved'], 5)
        self.assertEqual(result['rating'], 1200)
        self.assertEqual(len(result['contests']), 1)

    # Confirm missing selectors cannot become a false zero.
    def test_unavailable(self):
        with patch('tracker.codechef.request', return_value='Challenge page'):
            self.assertEqual(codechef.fetch('fixture')['status'], 'unavailable')
        self.assertEqual(safe_fetch('gfg', lambda: 1 / 0)['status'], 'unavailable')

    # Accept a real zero baseline and never substitute practice score for solved count.
    def test_hackerrank(self):
        result = hackerrank.parse({'status': 'success', 'username': 'bharat24082007', 'totalSolved': 0, 'ranking': 100}, 'bharat24082007')
        self.assertEqual(result['solved'], 0)
        self.assertIsNone(result['rating'])
        for value in (None, -1, True, '0'):
            with self.assertRaises(ValueError):
                hackerrank.parse({'status': 'success', 'username': 'bharat24082007', 'totalSolved': value}, 'bharat24082007')
        with patch('tracker.hackerrank.request', side_effect=TimeoutError):
            self.assertEqual(hackerrank.fetch('fixture')['status'], 'unavailable')

    # Validate LeetCode's nested totals, calendar, topics, and unrated profile.
    def test_leetcode(self):
        result = leetcode.parse({'data': {'matchedUser': {'submitStatsGlobal': {'acSubmissionNum': [{'difficulty': 'All', 'count': 8}]}, 'tagProblemCounts': {'fundamental': [{'tagName': 'Array', 'problemsSolved': 4}]}, 'submissionCalendar': '{"1700000000": 2}'}, 'userContestRanking': None}})
        self.assertEqual(result['solved'], 8)
        self.assertEqual(result['topics']['Array'], 4)
        self.assertIsNone(result['rating'])

    # Reject unrecognized GfG responses and accept explicit totals.
    def test_gfg(self):
        self.assertEqual(gfg.parse({'data': {'total_problems_solved': 12}})['solved'], 12)
        with self.assertRaises(ValueError):
            gfg.parse({'data': {}})

    # Verify gaps, counter corrections, and incomplete days do not invent activity.
    def test_metrics(self):
        rows = [{'platform': 'leetcode', 'day': day, 'solved': value} for day, value in [('2026-10-25', 10), ('2026-10-26', 12), ('2026-10-27', 13), ('2026-10-28', 13)]]
        self.assertEqual(delta(rows, 'leetcode', '2026-10-26'), 2)
        self.assertIsNone(delta(rows, 'leetcode', '2026-10-25'))
        self.assertEqual(streak(rows, '2026-10-28', 'leetcode'), 2)
        self.assertEqual(daily(rows, '2026-10-27'), (1, False))
        rows[-1]['solved'] = 11
        self.assertEqual(delta(rows, 'leetcode', '2026-10-28'), -2)

if __name__ == '__main__':
    unittest.main()
