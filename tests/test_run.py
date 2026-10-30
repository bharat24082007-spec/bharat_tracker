import unittest
from unittest.mock import MagicMock, patch
from tracker.run import fetch_profiles, needs_sync, notify_user
from tracker.common import username

class MultiUserTests(unittest.TestCase):
    # Ensure failures remain per-platform and every result carries the requested identity.
    def test_profile_isolation(self):
        with patch('tracker.run.leetcode.fetch', return_value={'status': 'ok', 'solved': 4}), patch('tracker.run.gfg.fetch', side_effect=RuntimeError):
            result = fetch_profiles({'leetcode': 'alice', 'gfg': 'bob'})
        self.assertEqual(result[0]['username'], 'alice')
        self.assertEqual(result[1]['username'], 'bob')
        self.assertEqual(result[1]['status'], 'unavailable')

    # Never send a different user's tasks to the deployment owner's Telegram chat.
    def test_telegram_recipient_isolation(self):
        with patch.dict('os.environ', {'OWNER_UID': 'owner', 'TELEGRAM_CHAT_ID': '123'}), patch('tracker.telegram.send') as send:
            root = MagicMock(id='another-user')
            notify_user(root, [], 'morning')
            send.assert_not_called()

    # Prevent stored usernames from injecting URL paths or query strings.
    def test_username_validation(self):
        for invalid in ('https://localhost', '../admin', 'a?secret=1', ''):
            with self.assertRaises(ValueError):
                username(invalid)

    # Honor new requests after cooldown and periodic refreshes after five minutes.
    def test_sync_cooldown(self):
        with patch('tracker.run.now', return_value='2026-10-30T12:05:00+05:30'):
            self.assertTrue(needs_sync({}))
            self.assertTrue(needs_sync({'lastSyncAt': '2026-10-30T12:00:00+05:30'}))
            self.assertFalse(needs_sync({'lastSyncAt': '2026-10-30T12:04:40+05:30', 'syncRequest': 'new'}))

    # A corrupt handle must not prevent subsequent platforms from being fetched.
    def test_invalid_handle_is_unavailable(self):
        with patch('tracker.run.gfg.fetch', return_value={'status': 'ok', 'solved': 1}):
            results = fetch_profiles({'leetcode': '../invalid', 'gfg': 'valid-user'})
        self.assertEqual(results[0]['status'], 'unavailable')
        self.assertEqual(results[1]['solved'], 1)

    # Failed storage must not be advertised as a completed sync or trigger reminders.
    def test_storage_failure_does_not_mark_sync_complete(self):
        from tracker.run import main
        root = MagicMock(id='owner')
        root.get.return_value.to_dict.return_value = {'profiles': {'gfg': 'valid-user'}}
        with patch('sys.argv', ['tracker', '--all']), patch('tracker.store.database'), patch('tracker.run.fetch_profiles', return_value=[{'platform': 'gfg', 'fetched_at': '2026-10-31T12:00:00+05:30'}]), patch('tracker.store.save', side_effect=RuntimeError), patch('tracker.store.save_sync_status') as metadata, patch('tracker.account.process_deletion', return_value=False), patch('tracker.account.pending_deletion_roots', return_value=[]), patch('tracker.routines.materialize_routines'), patch('tracker.push.process_notifications') as notify, patch('firebase_admin.firestore.client') as client:
            client.return_value.collection.return_value.stream.return_value = [MagicMock(reference=root)]
            with self.assertRaises(SystemExit):
                main()
            metadata.assert_not_called()
            notify.assert_not_called()
