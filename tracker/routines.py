from datetime import date, timedelta
from firebase_admin import firestore
from .common import now

# Find the next bounded batch of daily or weekly dates without recreating deleted occurrences.
def occurrence_dates(routine, through, limit=32):
    start = date.fromisoformat(routine['startDay'])
    cursor = date.fromisoformat(routine.get('generatedThrough', routine['startDay'])) + timedelta(days=1)
    finish = min(date.fromisoformat(through), cursor + timedelta(days=limit - 1))
    dates = []
    while cursor <= finish:
        if cursor >= start and (routine['frequency'] == 'daily' or (cursor - start).days % 7 == 0):
            dates.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return dates, max(routine.get('generatedThrough', routine['startDay']), finish.isoformat())

# Materialize today/tomorrow and missed dates transactionally, preserving completion and rescheduling.
def materialize_routines(root):
    through = (date.fromisoformat(now()[:10]) + timedelta(days=1)).isoformat()
    for record in root.collection('routines').where('enabled', '==', True).stream():
        if record.to_dict().get('generatedThrough', '') >= through:
            continue
        tx = firestore.client().transaction()

        # Read every affected document before writing and advance an immutable generation watermark.
        @firestore.transactional
        def generate(transaction):
            if firestore.client().collection('accountDeletions').document(root.id).get(transaction=transaction).exists:
                return
            routine = record.reference.get(transaction=transaction).to_dict() or {}
            if not routine.get('enabled'):
                return
            dates, watermark = occurrence_dates(routine, through)
            references = [root.collection('todos').document(record.id + '_' + day) for day in dates]
            existing = [reference.get(transaction=transaction).exists for reference in references]
            for reference, exists, day in zip(references, existing, dates):
                if not exists:
                    fields = {key: routine[key] for key in ('title', 'priority', 'category', 'notes')}
                    transaction.set(reference, dict(fields, due=day, done=False, seriesId=record.id, createdAt=now()))
            if watermark != routine.get('generatedThrough'):
                transaction.update(record.reference, {'generatedThrough': watermark})
        generate(tx)
