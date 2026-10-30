const {spawnSync} = require('node:child_process');
const {getGlobalDefaultAccount, getAccessToken} = require('firebase-tools/lib/auth');
const repository = process.argv[2];
let accessToken;

// Call Google Cloud APIs without printing access tokens, private keys, or response bodies.
async function api(url, method = 'GET', body) {
  const response = await fetch(url, {method, headers: {Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  if (response.status === 404) return null;
  if (!response.ok) throw Error('Google Cloud setup failed with HTTP ' + response.status);
  return response.status === 204 ? {} : response.json();
}

// Provision a least-privilege runner and pass its JSON key to GitHub only over stdin.
async function main() {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw Error('Usage: node scripts/setup-actions.cjs OWNER/REPOSITORY');
  const verified = spawnSync('gh', ['repo', 'view', repository, '--json', 'name'], {encoding: 'utf8'});
  if (verified.status !== 0) throw Error('Sign into GitHub CLI and verify access to the repository first.');
  const {firebaseConfig} = await import('../public/config.js');
  const project = firebaseConfig.projectId;
  const account = getGlobalDefaultAccount();
  if (!account) throw Error('Run npx firebase login first.');
  accessToken = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const email = `progress-runner@${project}.iam.gserviceaccount.com`;
  const resource = `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${email}`;
  if (!await api(resource)) await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`, 'POST', {accountId: 'progress-runner', serviceAccount: {displayName: 'Momentum scheduled Firestore sync'}});
  const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
  const policy = await api(policyUrl + ':getIamPolicy', 'POST', {});
  policy.bindings ||= [];
  let binding = policy.bindings.find(b => b.role === 'roles/datastore.user' && !b.condition);
  if (!binding) { binding = {role: 'roles/datastore.user', members: []}; policy.bindings.push(binding); }
  if (!binding.members.includes('serviceAccount:' + email)) {
    binding.members.push('serviceAccount:' + email);
    await api(policyUrl + ':setIamPolicy', 'POST', {policy});
  }
  const secrets = spawnSync('gh', ['secret', 'list', '--repo', repository, '--json', 'name'], {encoding: 'utf8'});
  if (secrets.status !== 0) throw Error('Cannot inspect repository secret names.');
  if (JSON.parse(secrets.stdout).some(s => s.name === 'FIREBASE_SERVICE_ACCOUNT_JSON')) {
    console.log('Existing FIREBASE_SERVICE_ACCOUNT_JSON preserved; no duplicate key created.'); return;
  }
  const key = await api(resource + '/keys', 'POST', {privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE', keyAlgorithm: 'KEY_ALG_RSA_2048'});
  const saved = spawnSync('gh', ['secret', 'set', 'FIREBASE_SERVICE_ACCOUNT_JSON', '--repo', repository], {input: Buffer.from(key.privateKeyData, 'base64'), encoding: 'utf8'});
  if (saved.status !== 0) {
    await api('https://iam.googleapis.com/v1/' + key.name, 'DELETE');
    throw Error('GitHub secret could not be saved; the newly created key was revoked.');
  }
  console.log('Runner key saved to GitHub Secrets. No private key file was written.');
}

// Limit setup diagnostics to sanitized messages.
main().catch(error => {console.error(error.message); process.exitCode = 1;});
