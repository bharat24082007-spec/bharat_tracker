const {getGlobalDefaultAccount, getAccessToken} = require('firebase-tools/lib/auth');

// Grant the scheduled runner only the Firebase Authentication permission needed for requested deletion.
async function main() {
  const {firebaseConfig} = await import('../public/config.js');
  const account = getGlobalDefaultAccount();
  if (!account) throw Error('Run npx firebase login first.');
  const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const project = firebaseConfig.projectId;

  // Use authenticated Cloud APIs without exposing credentials or response bodies.
  async function api(url, method, body) {
    const response = await fetch(url, {method, headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
    if (response.status === 404) return null;
    if (!response.ok) throw Error('Deletion setup failed: HTTP ' + response.status);
    return response.json();
  }
  const role = `projects/${project}/roles/momentumAccountDeletion`;
  if (!await api('https://iam.googleapis.com/v1/' + role, 'GET')) {
    await api(`https://iam.googleapis.com/v1/projects/${project}/roles`, 'POST', {roleId: 'momentumAccountDeletion', role: {title: 'Momentum requested account deletion', description: 'Delete Firebase Auth users only; data cleanup uses the existing Datastore User role.', stage: 'GA', includedPermissions: ['firebaseauth.users.delete']}});
  }
  const base = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
  const policy = await api(base + ':getIamPolicy', 'POST', {});
  let binding = policy.bindings.find(binding => binding.role === role && !binding.condition);
  if (!binding) { binding = {role, members: []}; policy.bindings.push(binding); }
  const member = `serviceAccount:progress-runner@${project}.iam.gserviceaccount.com`;
  if (!binding.members.includes(member)) { binding.members.push(member); await api(base + ':setIamPolicy', 'POST', {policy}); }
  console.log('Runner can process confirmed account deletion requests. No account was deleted.');
}

// Print only sanitized setup failures.
main().catch(error => {console.error(error.message); process.exitCode = 1;});
