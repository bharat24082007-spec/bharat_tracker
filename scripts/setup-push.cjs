const {getGlobalDefaultAccount, getAccessToken} = require('firebase-tools/lib/auth');

// Enable the required APIs and grant only FCM sending permissions to the existing sync runner.
async function main() {
  const {firebaseConfig} = await import('../public/config.js');
  const account = getGlobalDefaultAccount();
  if (!account) throw Error('Run npx firebase login first.');
  const token = (await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const project = firebaseConfig.projectId;

  // Keep credentials in memory and redact Google response bodies from setup errors.
  async function api(url, body) {
    const result = await fetch(url, {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    if (!result.ok) throw Error('Push setup API failed: HTTP ' + result.status);
    return result.json();
  }
  for (const service of ['fcm.googleapis.com', 'fcmregistrations.googleapis.com', 'firebaseinstallations.googleapis.com']) {
    await api(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${service}:enable`, {});
    console.log('Enabled ' + service);
  }
  const base = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
  const policy = await api(base + ':getIamPolicy', {});
  const role = 'roles/firebasecloudmessaging.admin', member = `serviceAccount:progress-runner@${project}.iam.gserviceaccount.com`;
  let binding = policy.bindings.find(item => item.role === role && !item.condition);
  if (!binding) { binding = {role, members: []}; policy.bindings.push(binding); }
  if (!binding.members.includes(member)) {
    binding.members.push(member); await api(base + ':setIamPolicy', {policy});
  }
  console.log('Scheduled runner can send Firebase Cloud Messaging notifications. Existing secret is unchanged.');
}

// Report sanitized setup failures without printing access tokens.
main().catch(error => { console.error(error.message); process.exitCode = 1; });
