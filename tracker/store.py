import json
import os
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Admin access from an environment JSON value or a local ADC key path.
def database(uid=None):
    if not firebase_admin._apps:
        key = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
        cred = credentials.Certificate(json.loads(key)) if key else credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
    return firestore.client().collection('users').document(uid or os.environ['OWNER_UID'])

# Upsert one daily document without letting a failed fetch erase a valid count.
def save(root, result, day):
    ref = root.collection('snapshots').document(day + '_' + result['platform'])
    transaction = firestore.client().transaction()

    # Atomically preserve a manual entry or successful earlier daily observation.
    @firestore.transactional
    def update(tx):
        if result.get('username'):
            profile = root.get(transaction=tx).to_dict() or {}
            if profile.get('profiles', {}).get(result['platform']) != result['username']:
                return
        old = ref.get(transaction=tx).to_dict() or {}
        if old.get('username') != result.get('username'):
            old = {}
        if old.get('status') == 'manual' and old.get('solved') is not None:
            return
        merged = dict(result, day=day)
        if result['solved'] is None and old.get('solved') is not None:
            merged = dict(old, status=result['status'], last_attempt_at=result['fetched_at'])
        tx.set(ref, merged)
    update(transaction)

# Read a small personal collection and retain each document ID.
def read(root, collection):
    return [dict(doc.to_dict(), id=doc.id) for doc in root.collection(collection).stream()]
