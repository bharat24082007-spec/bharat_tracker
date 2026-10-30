import {GoogleAuthProvider, reauthenticateWithPopup, getIdToken} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection, doc, getDoc, getDocs, setDoc, serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {today} from './metrics.js';

// Download only the signed-in user's workspace; push credentials are deliberately excluded.
export async function exportWorkspace(db, auth) {
  const user = auth.currentUser;
  if (!user) throw Error('Sign in before exporting.');
  const root = doc(db, 'users', user.uid), profile = await getDoc(root);
  const result = {schemaVersion: 1, exportedAt: new Date().toISOString(), timezone: 'Asia/Kolkata', account: {uid: user.uid, email: user.email}, profile: profile.data() || {}, collections: {}, excluded: ['Push registration tokens', 'Internal delivery logs', 'Security deletion markers']};
  for (const name of ['snapshots', 'todos', 'goals', 'skills', 'routines']) {
    const records = await getDocs(collection(root, name));
    result.collections[name] = records.docs.map(record => ({id: record.id, ...record.data()}));
  }
  const preferences = await getDoc(doc(root, 'settings', 'notifications'));
  const saved = preferences.data() || {};
  result.notificationPreferences = Object.fromEntries(['tasks', 'streak', 'morningTime', 'eveningTime'].filter(key => key in saved).map(key => [key, saved[key]]));
  if (auth.currentUser?.uid !== user.uid) throw Error('The signed-in account changed; export cancelled.');
  const blob = new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'momentum-export-' + today() + '.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Require fresh Google verification before queuing irreversible cleanup of this user's account.
export async function requestAccountDeletion(db, auth, beforeRequest) {
  const user = auth.currentUser;
  if (!user) throw Error('Sign in before requesting deletion.');
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
  await getIdToken(user, true);
  if (auth.currentUser?.uid !== user.uid) throw Error('Account changed; deletion cancelled.');
  await beforeRequest();
  if (auth.currentUser?.uid !== user.uid) throw Error('Account changed; deletion cancelled.');
  await setDoc(doc(db, 'users', user.uid, 'accountRequests', 'deletion'), {confirmed: true, requestedAt: serverTimestamp()});
}
