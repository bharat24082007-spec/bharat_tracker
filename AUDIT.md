# End-to-end audit — 31 October 2026

## Verified

- Google provider enabled; authorized domains include localhost and both Firebase project domains. The live app restores its signed-in session.
- Firestore emulator checks pass for verified-Google ownership, anonymous/other-user/non-Google denial, server-owned field protection, notification settings, recurring tasks, and deletion lockdown.
- Live read-only inspection found one production workspace, 12 snapshots, one task, one device, and no queued account-deletion request. No production data was deleted or replaced as part of this audit.
- Live fetchers returned LeetCode 2, CodeChef 5, GfG 1, and HackerRank 0. LeetCode returned difficulty, topics, calendar, and no contest rating. These are API/page observations rather than seeded totals.
- No student usernames or owner UID are hardcoded in the deployed frontend/fetchers. Firebase public app configuration and its VAPID public key are expected project configuration. Example placeholders are labels only.
- A tracked-file scan found no private-key material, service-account JSON, or Telegram bot token. Hosting publishes only public/, excluding tests and artifacts.
- Python: 33 tests, 31 passing and two emulator-only skips. JavaScript logic: nine passing. Rules and both cleanup integration checks pass against demo Firestore with Authentication deletion mocked.
- Isolated browser checks verified topic totals survive switching between two profiles, goals update the Today summary, and task completion reaches the weekly review. Earlier fixture checks cover recurring tasks, forwarding, export, deletion confirmation, and mobile layout. A real foreground push was received before this audit.

## Fixed

- Manual topic document IDs now include the connected username; removing a topic also matches that username.
- A failed snapshot write no longer marks the sync complete or sends that run's reminders. Other platform writes are still attempted.
- Invalid stored handles become an unavailable result instead of stopping other linked fetchers.
- Account changes clear cached workspace content, form state, dialogs, and foreground push text before loading the next workspace.
- Deletion captures the original authenticated UID and cancels if the account changes during verification or device cleanup.
- Interrupted deletion resumes from its server-owned marker even if the request or root document was already removed. Completed markers cannot initiate another deletion.
- Completing all of today's tasks now shows a completion message rather than asking for a first task.

## Expected behavior and limits

- Each day/platform snapshot is an upsert. Refreshing today updates today's document; a manual count wins over automatic refreshes that day. Changing a linked handle on the same day replaces that platform's daily slot; prior days remain stored and are filtered by username. This is not separate same-day history for multiple handles.
- Charts, streaks, and weekly topic changes require dated baselines. Missing observations remain unknown; the LeetCode submission calendar is fetched but is not treated as unique daily solves.
- GitHub cron is best effort and can be delayed. Profile providers and unofficial GfG/HackerRank services can change or fail. Fetch failures preserve earlier valid daily values and show unavailable status.
- Background push display depends on browser permission, device/browser support, and OS settings. This audit does not prove delivery on every device.
- Telegram is optional and its recipient/token secrets remain unconfigured. Browser reminders are the configured notification path.
- Production account deletion was not executed. The real Authentication API and irreversible cleanup are intentionally covered with mocked Auth plus real emulator storage, rather than deleting the user's account.
