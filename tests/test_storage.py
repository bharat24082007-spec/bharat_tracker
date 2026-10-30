import unittest
from unittest.mock import MagicMock, patch
from tracker.store import save
from tracker.common import snapshot

class StorageTests(unittest.TestCase):
    # Verify retries update one daily ID and failed refreshes preserve measured data.
    def test_failed_refresh_preserves_count(self):
        root = MagicMock()
        ref = root.collection.return_value.document.return_value
        ref.get.return_value.to_dict.return_value = {'platform': 'leetcode', 'solved': 8, 'status': 'ok', 'day': '2026-10-28', 'fetched_at': 'earlier'}
        transaction = MagicMock()
        with patch('tracker.store.firestore.client') as client, patch('tracker.store.firestore.transactional', side_effect=lambda f: f):
            client.return_value.transaction.return_value = transaction
            client.return_value.collection.return_value.document.return_value.get.return_value.exists = False
            save(root, snapshot('leetcode', status='unavailable'), '2026-10-28')
        root.collection.return_value.document.assert_called_once_with('2026-10-28_leetcode')
        saved = transaction.set.call_args.args[1]
        self.assertEqual(saved['solved'], 8)
        self.assertEqual(saved['fetched_at'], 'earlier')
        self.assertEqual(saved['status'], 'unavailable')

    # Verify an automatic result cannot overwrite the owner's manual daily entry.
    def test_manual_wins(self):
        root = MagicMock()
        root.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'status': 'manual', 'solved': 12}
        transaction = MagicMock()
        with patch('tracker.store.firestore.client') as client, patch('tracker.store.firestore.transactional', side_effect=lambda f: f):
            client.return_value.transaction.return_value = transaction
            client.return_value.collection.return_value.document.return_value.get.return_value.exists = False
            save(root, snapshot('gfg', 10), '2026-10-28')
        transaction.set.assert_not_called()

    # Discard a stale response if a user changed the linked handle during its fetch.
    def test_changed_profile_drops_response(self):
        root = MagicMock()
        root.get.return_value.to_dict.return_value = {'profiles': {'leetcode': 'new-user'}}
        transaction = MagicMock()
        with patch('tracker.store.firestore.client') as client, patch('tracker.store.firestore.transactional', side_effect=lambda f: f):
            client.return_value.transaction.return_value = transaction
            client.return_value.collection.return_value.document.return_value.get.return_value.exists = False
            save(root, snapshot('leetcode', 9, username='old-user'), '2026-10-30')
        transaction.set.assert_not_called()

    # A manual count from another handle must never block the newly linked account.
    def test_changed_account_replaces_daily_count(self):
        root = MagicMock()
        root.get.return_value.to_dict.return_value = {'profiles': {'gfg': 'new-user'}}
        root.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'status': 'manual', 'solved': 20, 'username': 'old-user'}
        transaction = MagicMock()
        with patch('tracker.store.firestore.client') as client, patch('tracker.store.firestore.transactional', side_effect=lambda f: f):
            client.return_value.transaction.return_value = transaction
            client.return_value.collection.return_value.document.return_value.get.return_value.exists = False
            save(root, snapshot('gfg', 3, username='new-user'), '2026-10-30')
        self.assertEqual(transaction.set.call_args.args[1]['solved'], 3)
