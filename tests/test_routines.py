import unittest
from unittest.mock import MagicMock, patch
from tracker.routines import occurrence_dates, materialize_routines

class RoutineTests(unittest.TestCase):
    # Keep daily entries separate and never regenerate an occurrence that was already evaluated.
    def test_daily_watermark(self):
        routine = {'startDay': '2026-10-30', 'generatedThrough': '2026-10-30', 'frequency': 'daily'}
        dates, watermark = occurrence_dates(routine, '2026-11-01')
        self.assertEqual(dates, ['2026-10-31', '2026-11-01'])
        self.assertEqual(watermark, '2026-11-01')
        self.assertEqual(occurrence_dates(dict(routine, generatedThrough=watermark), watermark)[0], [])

    # Preserve the original weekday and bound catch-up batches after a prolonged outage.
    def test_weekly_and_bounded_catchup(self):
        routine = {'startDay': '2026-10-26', 'generatedThrough': '2026-10-26', 'frequency': 'weekly'}
        self.assertEqual(occurrence_dates(routine, '2026-11-03')[0], ['2026-11-02'])
        dates, watermark = occurrence_dates(dict(routine, frequency='daily'), '2027-01-01')
        self.assertEqual(len(dates), 32)
        self.assertEqual(watermark, '2026-11-27')

    # Materializing the next schedule must never overwrite a completed or rescheduled occurrence.
    def test_preserves_existing_occurrences(self):
        root, record, schedules, tasks = MagicMock(), MagicMock(), MagicMock(), MagicMock()
        root.id, record.id = 'student', 'routine'
        root.collection.side_effect = lambda name: {'routines': schedules, 'todos': tasks}[name]
        schedules.where.return_value.stream.return_value = [record]
        routine = {'startDay': '2026-10-30', 'generatedThrough': '2026-10-30', 'frequency': 'daily', 'enabled': True, 'title': 'Practice', 'priority': 'high', 'category': 'DSA', 'notes': ''}
        record.to_dict.return_value = routine
        record.reference.get.return_value.to_dict.return_value = routine
        first, second = MagicMock(), MagicMock()
        first.get.return_value.exists, second.get.return_value.exists = True, False
        tasks.document.side_effect = [first, second]
        with patch('tracker.routines.now', return_value='2026-10-31T12:00:00+05:30'), patch('tracker.routines.firestore.client') as client, patch('tracker.routines.firestore.transactional', side_effect=lambda function: function):
            client.return_value.collection.return_value.document.return_value.get.return_value.exists = False
            materialize_routines(root)
            writes = client.return_value.transaction.return_value.set.call_args_list
            self.assertEqual(len(writes), 1)
            self.assertEqual(writes[0].args[1]['due'], '2026-11-01')
