const {spawnSync} = require('node:child_process');
const {existsSync} = require('node:fs');
const {getGlobalDefaultAccount, getAccessToken} = require('firebase-tools/lib/auth');

// Reuse Firebase CLI login for a local fetch, passing a short-lived token only in memory.
async function main() {
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error('Run npx firebase login first.');
  const token = await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const {firebaseConfig} = await import('../public/config.js');
  const localPython = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
  const result = spawnSync(existsSync(localPython) ? localPython : 'python', ['-m', 'tracker.local', '--all', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {...process.env, FIREBASE_LOCAL_ACCESS_TOKEN: token.access_token,
      GOOGLE_CLOUD_PROJECT: firebaseConfig.projectId}
  });
  if (result.error) throw new Error('Could not start Python. Install requirements.txt in .venv first.');
  process.exitCode = result.status ?? 1;
}

// Report setup failures without printing credential-bearing objects.
main().catch(() => { console.error('Local fetch failed. Check Firebase CLI login and your Python environment.'); process.exitCode = 1; });
