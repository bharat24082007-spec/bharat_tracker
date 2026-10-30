import hashlib
from datetime import datetime
from firebase_admin import firestore, messaging
from .common import now
from .metrics import delta

# Build generic reminders for opted-in users during bounded IST delivery windows.
def reminder_plan(profiles, rows, tasks, preferences, timestamp):
    moment = datetime.fromisoformat(timestamp)
    day, hour = moment.date().isoformat(), moment.hour + moment.minute / 60
    pending = [t for t in tasks if not t.get('done') and t.get('due') and t['due'] <= day]
    missed = sum(t['due'] < day for t in pending)
    if 7.5 <= hour < 12 and preferences.get('tasks', True) and pending:
        return [{'id': day + '_morning', 'title': 'Your plan for today', 'body': f'{len(pending)} tasks need your attention, including {missed} past their due date.', 'url': '/?view=planner'}]
    if 21 <= hour < 24:
        parts = []
        if preferences.get('tasks', True) and pending:
            parts.append(f'{len(pending)} tasks are still open. Finish them or plan a new date.')
        changes = [delta(rows, platform, day) for platform in profiles]
        current = [next((r for r in rows if r['platform'] == platform and r['day'] == day), {}) for platform in profiles]
        certain = changes and all(v is not None for v in changes) and all(r.get('status') in ('ok', 'manual') for r in current)
        if preferences.get('streak', True) and certain and all(v == 0 for v in changes):
            parts.append('No new solves measured today. Keep your streak going before midnight IST.')
        if parts:
            return [{'id': day + '_evening', 'title': 'Before you call it a day', 'body': ' '.join(parts), 'url': '/?view=planner' if pending else '/'}]
    return []

# Claim a device reminder transactionally to avoid overlapping scheduled deliveries.
def claim_delivery(ref, timestamp):
    tx = firestore.client().transaction()

    # Retry failed or abandoned attempts at most three times, with a five-minute lease.
    @firestore.transactional
    def claim(transaction):
        old = ref.get(transaction=transaction).to_dict() or {}
        if old.get('state') == 'sent' or old.get('attempts', 0) >= 3:
            return False
        if old.get('attemptedAt') and (datetime.fromisoformat(timestamp) - datetime.fromisoformat(old['attemptedAt'])).total_seconds() < 300:
            return False
        transaction.set(ref, {'state': 'pending', 'attemptedAt': timestamp, 'attempts': old.get('attempts', 0) + 1})
        return True
    return claim(tx)

# Send to exactly one saved device, never a client-supplied topic or another user's token.
def deliver(root, device, event):
    record = root.collection('notificationDeliveries').document(event['id'] + '_' + device.id)
    if not claim_delivery(record, now()):
        return 'sent' if (record.get().to_dict() or {}).get('state') == 'sent' else 'pending'
    try:
        token = device.to_dict()['token']
        messaging.send(messaging.Message(token=token, data={
            'title': event['title'], 'body': event['body'], 'url': event['url'],
            'tag': event['id'], 'uid': root.id
        }, webpush=messaging.WebpushConfig(headers={'TTL': '3600', 'Urgency': 'normal'})))
        record.set({'state': 'sent', 'sentAt': now()}, merge=True)
        return 'sent'
    except messaging.UnregisteredError:
        device.reference.delete()
        record.set({'state': 'expired'}, merge=True)
        return 'expired'
    except Exception as error:
        record.set({'state': 'failed', 'error': type(error).__name__}, merge=True)
        print('Push delivery failed: ' + type(error).__name__)
        return 'failed'

# Process queued tests and daily reminders even for users with no linked coding profiles.
def process_notifications(root):
    devices = list(root.collection('devices').limit(100).stream())
    if not devices:
        return
    settings_ref = root.collection('settings').document('notifications')
    settings = settings_ref.get().to_dict() or {}
    request = settings.get('testRequest')
    if request and request != settings.get('lastTestRequest'):
        age = (datetime.fromisoformat(now()) - datetime.fromisoformat(settings.get('lastTestAt', '2000-01-01T00:00:00+05:30'))).total_seconds()
        if age >= 60:
            device = next((d for d in devices if d.id == settings.get('testDeviceId')), None)
            event = {'id': 'test_' + hashlib.sha256(request.encode()).hexdigest()[:24], 'title': 'Momentum reminders are connected', 'body': 'This device is ready for your task plans and evening reminders.', 'url': '/'}
            status = deliver(root, device, event) if device else 'expired'
            if status != 'pending':
                settings_ref.set({'lastTestRequest': request, 'lastTestAt': now(), 'testStatus': status}, merge=True)
    profiles = (root.get().to_dict() or {}).get('profiles', {})
    from .store import read
    rows = [r for r in read(root, 'snapshots') if r.get('username') == profiles.get(r['platform'])]
    for event in reminder_plan(profiles, rows, read(root, 'todos'), settings, now()):
        for device in devices:
            deliver(root, device, event)
