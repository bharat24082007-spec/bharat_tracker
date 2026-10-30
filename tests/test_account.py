import unittest
from unittest.mock import MagicMock, patch
from tracker.account import process_deletion
from firebase_admin import auth

class AccountTests(unittest.TestCase):
    # Never delete an account merely because a worker inspected it.
    def test_requires_explicit_request(self):
        root = MagicMock()
        root.collection.return_value.document.return_value.get.return_value.exists = False
        with patch('tracker.account.firestore.client') as client, patch('tracker.account.auth.delete_user') as delete:
            client.return_value.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {}
            self.assertFalse(process_deletion(root))
            delete.assert_not_called()

    # Write the security marker before deleting the requested UID, then remove only that workspace.
    def test_requested_cleanup_order(self):
        root = MagicMock(id='requesting-user')
        root.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'confirmed': True}
        with patch('tracker.account.firestore.client') as client, patch('tracker.account.auth.delete_user') as delete:
            events = MagicMock()
            events.attach_mock(client.return_value.collection.return_value.document.return_value.set, 'mark')
            events.attach_mock(delete, 'delete')
            events.attach_mock(client.return_value.recursive_delete, 'cleanup')
            self.assertTrue(process_deletion(root))
            delete.assert_called_once_with('requesting-user')
            client.return_value.recursive_delete.assert_called_once_with(root)
            self.assertEqual([call[0] for call in events.method_calls], ['mark', 'delete', 'cleanup', 'mark'])

    # Retry Firestore cleanup safely if an earlier attempt already removed the auth user.
    def test_partial_cleanup_retry(self):
        root = MagicMock(id='requesting-user')
        root.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'confirmed': True}
        with patch('tracker.account.firestore.client') as client, patch('tracker.account.auth.delete_user', side_effect=auth.UserNotFoundError('gone')):
            self.assertTrue(process_deletion(root))
            client.return_value.recursive_delete.assert_called_once_with(root)

    # Preserve the request and security lock for retry if Authentication rejects the deletion.
    def test_auth_failure_does_not_discard_request(self):
        root = MagicMock(id='requesting-user')
        root.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'confirmed': True}
        with patch('tracker.account.firestore.client') as client, patch('tracker.account.auth.delete_user', side_effect=RuntimeError):
            with self.assertRaises(RuntimeError):
                process_deletion(root)
            client.return_value.recursive_delete.assert_not_called()

    # Resume an approved deletion after its request document disappeared in partial cleanup.
    def test_retry_without_request(self):
        root = MagicMock(id='requesting-user')
        root.collection.return_value.document.return_value.get.return_value.exists = False
        with patch('tracker.account.firestore.client') as client, patch('tracker.account.auth.delete_user') as delete:
            marker = client.return_value.collection.return_value.document.return_value
            marker.get.return_value.to_dict.return_value = {'requestedAt': 'earlier'}
            self.assertTrue(process_deletion(root))
            delete.assert_called_once_with('requesting-user')
            client.return_value.recursive_delete.assert_called_once_with(root)

    # A completed security marker alone never authorizes a second deletion.
    def test_completed_marker_does_not_repeat(self):
        root = MagicMock()
        root.collection.return_value.document.return_value.get.return_value.exists = False
        with patch('tracker.account.firestore.client') as client, patch('tracker.account.auth.delete_user') as delete:
            client.return_value.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'requestedAt': 'earlier', 'completedAt': 'done'}
            self.assertFalse(process_deletion(root))
            delete.assert_not_called()
