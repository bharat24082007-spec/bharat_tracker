import os
import unittest
from unittest.mock import patch
import firebase_admin
from firebase_admin.credentials import Base
from google.auth.credentials import AnonymousCredentials

class EmulatorCredential(Base):
    # Prevent the isolated deletion integration test from using real cloud credentials.
    def get_credential(self):
        return AnonymousCredentials()

@unittest.skipUnless(os.environ.get('FIRESTORE_EMULATOR_HOST'), 'Firestore emulator required')
class AccountEmulatorTests(unittest.TestCase):
    # Exercise real recursive Firestore cleanup while mocking the external Authentication deletion.
    def test_recursive_cleanup_and_security_marker(self):
        from firebase_admin import firestore
        from tracker.account import process_deletion
        if not firebase_admin._apps:
            firebase_admin.initialize_app(EmulatorCredential(), {'projectId': 'demo-progress-tracker'})
        client = firestore.client()
        self.assertEqual(client.project, 'demo-progress-tracker')
        root = client.collection('users').document('deletion-emulator-user')
        root.set({'profiles': {}})
        for name in ('todos', 'snapshots', 'goals', 'routines', 'devices', 'notificationDeliveries', 'settings'):
            root.collection(name).document('sample').set({'testOnly': True})
        root.collection('accountRequests').document('deletion').set({'confirmed': True})
        with patch('tracker.account.auth.delete_user') as delete:
            self.assertTrue(process_deletion(root))
            delete.assert_called_once_with('deletion-emulator-user')
        self.assertFalse(root.get().exists)
        self.assertEqual(list(root.collections()), [])
        marker = client.collection('accountDeletions').document(root.id).get().to_dict()
        self.assertIn('completedAt', marker)

    # Recover orphaned child data from an interrupted cleanup without a root or request.
    def test_retry_orphaned_workspace(self):
        from firebase_admin import firestore
        from tracker.account import process_deletion, pending_deletion_roots
        if not firebase_admin._apps:
            firebase_admin.initialize_app(EmulatorCredential(), {'projectId': 'demo-progress-tracker'})
        client = firestore.client()
        self.assertEqual(client.project, 'demo-progress-tracker')
        root = client.collection('users').document('orphaned-deletion-test')
        root.collection('todos').document('leftover').set({'testOnly': True})
        client.collection('accountDeletions').document(root.id).set({'requestedAt': 'test'})
        self.assertIn(root.id, [r.id for r in pending_deletion_roots(client)])
        with patch('tracker.account.auth.delete_user'):
            self.assertTrue(process_deletion(root))
        self.assertEqual(list(root.collections()), [])
        self.assertNotIn(root.id, [r.id for r in pending_deletion_roots(client)])
