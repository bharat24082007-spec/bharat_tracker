from firebase_admin import auth, firestore
from .common import now

# Fulfil only a user's authenticated deletion request; retries can finish after partial cleanup.
def process_deletion(root):
    request = root.collection('accountRequests').document('deletion').get()
    marker = firestore.client().collection('accountDeletions').document(root.id)
    state = marker.get().to_dict() or {}
    approved = request.exists and request.to_dict().get('confirmed') is True
    unfinished = state.get('requestedAt') and not state.get('completedAt')
    if not approved and not unfinished:
        return False
    marker.set({'requestedAt': now()}, merge=True)
    try:
        auth.delete_user(root.id)
    except auth.UserNotFoundError:
        pass
    firestore.client().recursive_delete(root)
    marker.set({'completedAt': now()}, merge=True)
    print('Requested account deletion completed.')
    return True

# Recover interrupted cleanups even when recursive deletion removed the root or request first.
def pending_deletion_roots(client):
    return [client.collection('users').document(marker.id)
            for marker in client.collection('accountDeletions').stream()
            if marker.to_dict().get('requestedAt') and not marker.to_dict().get('completedAt')]
