import unittest
from unittest.mock import MagicMock, patch
from tracker.push import reminder_plan, claim_delivery, deliver

class PushTests(unittest.TestCase):
    # Require due work and task consent before creating a morning notification.
    def test_morning_and_preferences(self):
        tasks = [{'due': '2026-10-30', 'done': False}, {'due': '2026-10-31', 'done': False}, {'due': '2026-10-31', 'done': True}, {'due': '2026-11-01', 'done': False}]
        result = reminder_plan({}, [], tasks, {}, '2026-10-31T07:30:00+05:30')
        self.assertIn('2 tasks', result[0]['body'])
        self.assertIn('1 past', result[0]['body'])
        self.assertEqual(reminder_plan({}, [], tasks, {'tasks': False}, '2026-10-31T08:00:00+05:30'), [])
        self.assertEqual(reminder_plan({}, [], tasks, {}, '2026-10-31T06:00:00+05:30'), [])

    # Suppress false streak warnings when counts are unknown, unavailable, corrected, or positive.
    def test_evening_streak_certainty(self):
        rows = [{'platform': 'leetcode', 'day': day, 'solved': 5, 'status': 'ok'} for day in ('2026-10-30', '2026-10-31')]
        stamp = '2026-10-31T21:00:00+05:30'
        self.assertEqual(len(reminder_plan({'leetcode': 'a'}, rows, [], {}, stamp)), 1)
        self.assertEqual(reminder_plan({}, rows, [], {}, stamp), [])
        self.assertEqual(reminder_plan({'leetcode': 'a'}, rows[1:], [], {}, stamp), [])
        for solved, status in [(6, 'ok'), (4, 'ok'), (5, 'unavailable')]:
            rows[1].update(solved=solved, status=status)
            self.assertEqual(reminder_plan({'leetcode': 'a'}, rows, [], {}, stamp), [])

    # Permit task-only reminders even without a connected coding account.
    def test_task_only_user(self):
        tasks = [{'due': '2026-10-31', 'done': False, 'title': 'Private task title'}]
        result = reminder_plan({}, [], tasks, {}, '2026-10-31T21:00:00+05:30')
        self.assertEqual(len(result), 1)
        self.assertNotIn('Private task title', result[0]['body'])
        self.assertEqual(reminder_plan({}, [], tasks, {'tasks': False, 'streak': False}, '2026-10-31T21:00:00+05:30'), [])

    # Prevent overlapping or repeated claims but allow bounded retries after an abandoned attempt.
    def test_delivery_lease(self):
        ref = MagicMock()
        for old, expected in [({}, True), ({'state': 'sent'}, False), ({'attempts': 3}, False), ({'attemptedAt': '2026-10-31T20:59:00+05:30'}, False), ({'state': 'failed', 'attempts': 1, 'attemptedAt': '2026-10-31T20:50:00+05:30'}, True)]:
            ref.get.return_value.to_dict.return_value = old
            with patch('tracker.push.firestore.client'), patch('tracker.push.firestore.transactional', side_effect=lambda function: function):
                self.assertEqual(claim_delivery(ref, '2026-10-31T21:00:00+05:30'), expected)

    # Use only the selected user's saved device token and skip a previously delivered event.
    def test_recipient_and_duplicate(self):
        root, device = MagicMock(), MagicMock()
        root.id, device.id = 'alice', 'a' * 64
        device.to_dict.return_value = {'token': 'alice-device-token'}
        event = {'id': '2026-10-31_morning', 'title': 'Plan', 'body': 'One task', 'url': '/?view=planner'}
        with patch('tracker.push.claim_delivery', return_value=True), patch('tracker.push.messaging.send') as send:
            self.assertEqual(deliver(root, device, event), 'sent')
            message = send.call_args.args[0]
            self.assertEqual(message.token, 'alice-device-token')
            self.assertEqual(message.data['uid'], 'alice')
        root.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'state': 'sent'}
        with patch('tracker.push.claim_delivery', return_value=False), patch('tracker.push.messaging.send') as send:
            self.assertEqual(deliver(root, device, event), 'sent')
            send.assert_not_called()
