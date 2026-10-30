import argparse
import json
import os
from datetime import date, datetime, timedelta
from . import leetcode, codechef, gfg, hackerrank
from .common import now, safe_fetch, username
from .metrics import daily, streak

MODULES = dict(zip(('leetcode', 'codechef', 'gfg', 'hackerrank'), (leetcode, codechef, gfg, hackerrank)))

# Fetch only linked accounts and preserve their identity on each result.
def fetch_profiles(profiles):
    results = []
    for platform, handle in profiles.items():
        if platform in MODULES:
            username(handle)
            result = safe_fetch(platform, lambda: MODULES[platform].fetch(handle))
            results.append(dict(result, username=handle))
    return results

# Send legacy Telegram notifications only to the explicitly configured owner recipient.
def notify_user(root, results, mode):
    if root.id != os.environ.get('OWNER_UID') or not os.environ.get('TELEGRAM_CHAT_ID'):
        return
    from .store import read
    from .telegram import send
    day = now()[:10]
    profiles = (root.get().to_dict() or {}).get('profiles', {})
    rows = [r for r in read(root, 'snapshots') if r.get('username') == profiles.get(r['platform'])]
    if mode == 'morning':
        yesterday = (date.fromisoformat(day) - timedelta(days=1)).isoformat()
        count, complete = daily(rows, yesterday)
        tasks = sorted([t for t in read(root, 'todos') if not t.get('done')], key=lambda t: t.get('due') or '9999')
        text = '\n'.join(f"• {'MISSED: ' if t.get('due') and t['due'] < day else ''}{t['title']} ({t.get('priority', 'medium')}, due {t.get('due') or 'anytime'})" for t in tasks)
        send(f"Yesterday: {count} solved{' (partial data)' if not complete else ''}.\nStreak: {streak(rows, day)} days.\nPending:\n{text or 'No pending tasks.'}")
    elif mode == 'evening':
        count, complete = daily(rows, day)
        if count == 0 and complete and all(r['status'] != 'unavailable' for r in results):
            send('Streak at risk: no new problems solved today. Solve one before midnight IST.')

# Check a new refresh request or the five-minute polling interval with a one-minute cooldown.
def needs_sync(profile):
    last = profile.get('lastSyncAt')
    if not last:
        return True
    elapsed = (datetime.fromisoformat(now()) - datetime.fromisoformat(last)).total_seconds()
    return elapsed >= 300 or (elapsed >= 60 and profile.get('syncRequest') != profile.get('lastSyncRequest'))

# Process users independently so one account or provider cannot stop the remaining work.
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['snapshot', 'morning', 'evening'], default='snapshot')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--due-only', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--platform', choices=list(MODULES))
    parser.add_argument('--username')
    args = parser.parse_args()
    if args.dry_run:
        if not args.platform or not args.username:
            parser.error('--dry-run requires --platform and --username')
        print(json.dumps(fetch_profiles({args.platform: args.username}), indent=2))
        return
    from .store import database, save
    from .push import process_notifications
    from firebase_admin import firestore
    database(os.environ.get('OWNER_UID', '_initialize'))
    roots = [doc.reference for doc in firestore.client().collection('users').stream()] if args.all else [database()]
    failures = 0
    for root in roots:
        try:
            profile = root.get().to_dict() or {}
            if not profile.get('profiles') or (args.due_only and not needs_sync(profile)):
                process_notifications(root)
                continue
            results = fetch_profiles(profile['profiles'])
            for result in results:
                try:
                    save(root, result, result['fetched_at'][:10])
                except Exception:
                    failures += 1
            root.set({'lastSyncAt': now(), 'lastSyncRequest': profile.get('syncRequest', '')}, merge=True)
            notify_user(root, results, args.mode)
            process_notifications(root)
            print('Synced account: ' + ', '.join(f"{r['platform']}={r['solved']} ({r['status']})" for r in results))
        except Exception as error:
            failures += 1
            print('Account sync failed: ' + type(error).__name__)
    if failures:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
