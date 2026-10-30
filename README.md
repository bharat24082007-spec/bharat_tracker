# Momentum

A multi-user student workspace: public coding profiles, a private planner, topic progress, goals, and daily history. Plain Python + buildless JavaScript + Firebase Authentication, Firestore, and Hosting.

Live app: **https://bharat-tracker-bdcf0.web.app**. Source and schedules: **https://github.com/bharat24082007-spec/bharat_tracker**.

Deployment checked October 31, 2026: 14 Python tests, 7 JavaScript tests, and the Firestore isolation test passed. The first GitHub-hosted run successfully fetched and saved all four connected platforms. A dedicated `progress-runner` service account has Cloud Datastore User access; its JSON key is stored in the repository secret, not a local file. `OWNER_UID` is configured. Telegram delivery still needs the bot token and chat ID secrets; it has not been tested or enabled without those values.

## Use the app

1. Sign in with Google. Each user has a separate private workspace.
2. Open **Connections**, paste profile links or usernames, and save.
3. **Sync profiles** queues a refresh. A running background worker processes it; the page listens for saved results.
4. Use **Planner** for Today, Tomorrow, missed work, categories, notes, priorities, completion, and rescheduling. Forwarding preserves the original deadline.
5. Use **Skills & goals** for automatic LeetCode topic counts, manual topic totals for other platforms, targets, deadlines, and required daily pace.

Supported profiles: LeetCode, CodeChef, GeeksforGeeks, HackerRank. Only supported hosts and simple usernames are accepted. The backend builds fixed provider URLs; it never fetches a user-supplied arbitrary URL. This links a public profile for tracking, not proof of ownership of that external account.

## 1. Local setup and independent fetcher tests

Use Python 3.12/3.13, Node 22+, and Java 21+ for the rules emulator.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
npm ci
python -m tracker.leetcode YOUR_USERNAME
python -m tracker.codechef YOUR_USERNAME
python -m tracker.gfg YOUR_USERNAME
python -m tracker.hackerrank YOUR_USERNAME
python -m tracker.run --dry-run --platform leetcode --username YOUR_USERNAME
```

Each fetcher prints `{platform, solved, rating, status, fetched_at}` plus available details. Dry runs do not write data or send messages. Failed endpoints return `unavailable` without stopping other platforms. HackerRank uses the unofficial `hackerrank-stats.tashif.codes` service; your public username is sent to it, not your credentials. GfG uses an undocumented data endpoint. Both can change or omit data; manual fallback remains available. CodeChef parses the explicit total rather than summing overlapping sections. LeetCode calendar entries are submissions, not unique solves.

## 2. Firebase setup

Configured project: `bharat-tracker-bdcf0`, default Firestore database in `asia-south1`.

| Value | Location | Destination |
| --- | --- | --- |
| Public web config | Firebase Console → Project settings → General → Your apps → Web app → Config | `public/config.js`: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId. Analytics is unnecessary. |
| Service-account JSON | Project settings → Service accounts → Generate new private key, or a dedicated Google Cloud IAM service account with Cloud Datastore User | Local `GOOGLE_APPLICATION_CREDENTIALS` points to a file outside the repo; GitHub Secret `FIREBASE_SERVICE_ACCOUNT_JSON` contains the whole JSON. |
| Optional Telegram owner UID | Authentication → Users → intended recipient's User UID | GitHub Secret `OWNER_UID`, only needed for the original owner's Telegram summaries. Never used for dashboard access control. |
| Telegram token/chat | Existing BotFather bot; `get_chat_id.py` below | Environment or GitHub Secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. |

Enable Google under Authentication → Sign-in method. Authorized domains must include `localhost` for local testing and `bharat-tracker-bdcf0.web.app` for production. Never put service-account JSON, bot tokens, or private credentials under `public/` or commit them. Web config is public; rules enforce isolation.

```powershell
npx firebase login
npx firebase deploy --only firestore:rules --project bharat-tracker-bdcf0
```

Rules require verified Google authentication and `request.auth.uid == uid`. Users cannot list other users or read/write their data. Root profile updates are limited to connection fields and refresh requests; sync metadata and automatic snapshots remain server-controlled. Manual snapshots must match a linked profile. Admin service-account access bypasses client rules.

## 3. Run locally

```powershell
python -m http.server 8000 --directory public --bind 127.0.0.1
```

Open `http://localhost:8000`. In another terminal, after `npx firebase login`:

```powershell
node scripts/fetch-local.cjs
node scripts/watch-local.cjs
```

The first command fetches all registered workspaces once. The watcher checks requests every minute, with a one-minute per-user cooldown and a five-minute periodic refresh. It passes a short-lived Firebase CLI token to Python only in memory. It stops when the process/computer stops; use GitHub Actions for hosted polling. Refreshing a webpage does not fetch upstream platforms.

With a service-account file instead:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\private\tracker-service-account.json'
python -m tracker.run --all
```

Data lives under `users/UID`: root `profiles` and sync metadata, with `snapshots`, `todos`, `goals`, and `skills` subcollections. Each snapshot ID is `YYYY-MM-DD_platform`. Usernames are stored on observations to prevent comparing different connected accounts. A response for a profile that was changed during fetching is discarded transactionally. Today's manual entries take precedence. Failed refreshes preserve today's prior valid count and timestamp. Older account history is retained but filtered from the current profile view.

All day boundaries use IST. Daily changes need both today's and yesterday's totals. Missing days are unknown, never silently zero. Streaks count proven consecutive active days and allow today to remain unfinished. The first day establishes a baseline; calendars are not backfilled with invented history. Negative counter corrections don't create activity. Goals use their saved baseline; topic totals can overlap and are never summed into platform totals.

## 4. Tests

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
npm test
npm run test:rules
```

Tests cover profile URL validation, account identity, failures, manual override preservation, date boundaries, goal pacing, planner filtering/rescheduling, refresh cooldowns, Telegram recipient isolation, and actual Firestore rules. Rules tests use a `demo-` emulator project, never production. If port 8080 is occupied, select an unused port in `firebase.json` for the test.

Browser smoke test: sign in, save a profile, sync, and verify the fetched timestamp; add a task, forward it, complete it, and reload; create a goal; record a manual topic. Sign in with a second Google account to verify it starts with its own empty workspace. A disconnected account should show a Connect action rather than somebody else's stats.

## 5. GitHub Actions

Repository: https://github.com/bharat24082007-spec/bharat_tracker

Under Settings → Secrets and variables → Actions, add `FIREBASE_SERVICE_ACCOUNT_JSON`. The service account needs Cloud Datastore User (`roles/datastore.user`), not project Owner. Do not use a personal Firebase CLI refresh token for unattended jobs.

For a new deployment, `node scripts/setup-actions.cjs OWNER/REPOSITORY` can provision the dedicated runner using your Firebase CLI login and pass its generated key directly to `gh secret set` via stdin. Sign into both CLIs first. Existing secrets are preserved. This repository's runner credential has already been configured.

The workflow processes every user's saved connections. `*/5 * * * *` checks periodically; GitHub schedules are best-effort and can be delayed. The original daily jobs remain: 02:00 UTC / 07:30 IST morning, 15:30 UTC / 21:00 IST evening, and 18:00 UTC / 23:30 IST snapshot. The workflow must be on the default branch. Use Actions → Daily progress → Run workflow to verify the first run. GitHub usage limits and disabled schedules can interrupt polling; monitor failed runs. The implementation processes users sequentially and is intended for a small community, not unbounded production scale.

LeetCode may block GitHub-hosted IPs. If the same fetch works locally, use the local worker or a trusted self-hosted runner. Other platforms continue and blocked platforms stay unavailable. Don't commit cookies or attempt CAPTCHA bypasses.

## 6. Optional Telegram

```powershell
$env:TELEGRAM_BOT_TOKEN = 'your-token'
python get_chat_id.py
$env:TELEGRAM_CHAT_ID = 'printed-chat-id'
$env:OWNER_UID = 'your-firebase-auth-uid'
python -c "from tracker.telegram import send; send('Tracker test')"
python -m tracker.run --all --mode morning
```

Send `/start` to the bot before running `get_chat_id.py`. It does not remove existing webhooks. Add the three environment values as GitHub Secrets for scheduled notifications. Only the explicitly configured OWNER_UID receives summaries in this bot chat; other users' tasks are never sent there. Self-service Telegram linking for other users is not implemented. Evening warnings require complete data proving zero activity. Manual reruns may send duplicate summaries.

To finish the missing Telegram setup without pasting secrets into this chat, run these commands in your own terminal; GitHub CLI prompts for each value:

```powershell
gh secret set TELEGRAM_BOT_TOKEN --repo bharat24082007-spec/bharat_tracker
gh secret set TELEGRAM_CHAT_ID --repo bharat24082007-spec/bharat_tracker
```

## 7. Publish

```powershell
npx firebase deploy --only firestore:rules,hosting --project bharat-tracker-bdcf0
```

Hosting publishes only `public/`. A static frontend deployment does not start the Python worker: Actions or the local watcher must also run. No build step is needed. Open `https://bharat-tracker-bdcf0.web.app` and test Google sign-in. Internet access is needed for Firebase SDK modules and optional Google Fonts.
