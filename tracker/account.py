from firebase_admin import auth, firestore
from .common import now

# Fulfil only a user's authenticated deletion request; retries can finish after partial cleanup.
def process_deletion(root):
    request = root.collection('accountRequests').document('deletion').get()
    if not request.exists:
        return False
    if not request.to_dict().get('confirmed'):
        return False
    marker = firestore.client().collection('accountDeletions').document(root.id)
    marker.set({'requestedAt': now()}, merge=True)
    try:
        auth.delete_user(root.id)
    except auth.UserNotFoundError:
        pass
    firestore.client().recursive_delete(root)
    marker.set({'completedAt': now()}, merge=True)
    print('Requested account deletion completed.')
    return True
