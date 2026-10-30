import {getMessaging, getToken, deleteToken, isSupported, onMessage} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {doc, getDoc, setDoc, deleteDoc, onSnapshot, runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {vapidKey} from './config.js';

// Connect install prompts, per-device subscriptions, private preferences, and test requests.
export function initializeNotifications(app, auth, db) {
  const status = document.querySelector('#push-status'), help = document.querySelector('#push-help');
  const enable = document.querySelector('#push-enable'), disableButton = document.querySelector('#push-disable'), test = document.querySelector('#push-test');
  let uid = null, deviceId = null, messaging, installPrompt, supported = null, stop = () => {}, version = 0;
  const registration = 'serviceWorker' in navigator ? Promise.race([
    navigator.serviceWorker.register('/sw.js', {type: 'module'}).then(() => navigator.serviceWorker.ready),
    new Promise((_, reject) => setTimeout(() => reject(Error('The app worker did not become ready. Reload with an internet connection.')), 15000))
  ]) : Promise.resolve(null);
  registration.catch(() => { status.textContent = 'App worker unavailable'; });

  // Keep this worker bound to the signed-in account, including after the worker restarts.
  async function bindWorker(owner) {
    const worker = await registration;
    worker?.active?.postMessage({type: 'MOMENTUM_SESSION', uid: owner});
  }

  // Reflect browser permission and this device's saved subscription in the controls.
  function renderDevice() {
    const permission = 'Notification' in window ? Notification.permission : 'unsupported';
    status.textContent = supported === false ? 'Use a supported browser' : deviceId && permission === 'granted' ? 'Enabled on this device' : permission === 'denied' ? 'Blocked in browser settings' : 'Not enabled on this device';
    enable.disabled = !uid || supported === false || (Boolean(deviceId) && permission === 'granted');
    disableButton.disabled = !deviceId;
    test.disabled = !deviceId || permission !== 'granted';
  }

  // Remove the server registration and invalidate this browser's token before signing out.
  async function disconnect() {
    await bindWorker(null).catch(() => {});
    const stored = uid && localStorage.getItem('momentum-push:' + uid);
    if (uid && stored) await deleteDoc(doc(db, 'users', uid, 'devices', stored));
    if (messaging) await deleteToken(messaging);
    if (uid) localStorage.removeItem('momentum-push:' + uid);
    localStorage.removeItem('momentum-push-owner');
    deviceId = null; renderDevice();
  }

  // Subscribe only after a direct user gesture and save the token inside that user's workspace.
  async function subscribe(askPermission) {
    const owner = uid, currentVersion = version;
    if (!owner) throw Error('Sign in before enabling reminders.');
    if (!('Notification' in window)) throw Error('This browser cannot receive push. Open Momentum in Chrome, Edge, or an installed supported web app.');
    if (askPermission && Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') throw Error('Allow notifications in this browser’s site settings, then try again.');
    if (!await isSupported()) throw Error('Push is unavailable here. On iPhone/iPad, install with Add to Home Screen and open that app first.');
    if (!vapidKey) throw Error('The project web-push key has not been configured.');
    const worker = await registration;
    if (!worker) throw Error('A service worker is required for reminders.');
    messaging ||= getMessaging(app);
    const token = await getToken(messaging, {vapidKey, serviceWorkerRegistration: worker});
    if (uid !== owner || version !== currentVersion) { await deleteToken(messaging); return; }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const id = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const oldId = localStorage.getItem('momentum-push:' + owner);
    await runTransaction(db, async transaction => {
      const root = doc(db, 'users', owner), existing = await transaction.get(root);
      if (!existing.exists()) transaction.set(root, {profiles: {}, syncRequest: ''});
      transaction.set(doc(db, 'users', owner, 'devices', id), {token, updatedAt: new Date().toISOString()});
    });
    if (uid !== owner || version !== currentVersion) return;
    if (oldId && oldId !== id) await deleteDoc(doc(db, 'users', owner, 'devices', oldId));
    deviceId = id;
    localStorage.setItem('momentum-push:' + owner, id);
    localStorage.setItem('momentum-push-owner', owner);
    await bindWorker(owner); renderDevice();
    help.textContent = 'Connected. Send a test, or wait for your next task reminder. You can disable this device at any time.';
  }

  // Show failures without exposing subscription tokens or Firebase request objects.
  function report(error) { help.textContent = error.message || 'Could not update reminder settings.'; renderDevice(); }

  // Capture Chromium's install prompt; other browsers retain their normal install menu.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; document.querySelector('#install-app').hidden = false;
  });
  document.querySelector('#install-app').onclick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt(); installPrompt = null; document.querySelector('#install-app').hidden = true;
  };
  enable.onclick = async () => { enable.disabled = true; try { await subscribe(true); } catch (error) { report(error); } };
  disableButton.onclick = async () => { try { await disconnect(); help.textContent = 'Reminders disabled on this device.'; } catch (error) { report(error); } };
  test.onclick = async () => {
    test.disabled = true;
    try {
      await setDoc(doc(db, 'users', uid, 'settings', 'notifications'), {testRequest: new Date().toISOString(), testDeviceId: deviceId}, {merge: true});
      help.textContent = 'Test queued for this device. The scheduled worker will process it; GitHub delivery can take several minutes.';
    } catch (error) { report(error); }
  };
  document.querySelector('#push-preferences').onsubmit = async event => {
    event.preventDefault();
    try {
      await setDoc(doc(db, 'users', uid, 'settings', 'notifications'), {tasks: document.querySelector('#push-tasks').checked, streak: document.querySelector('#push-streak').checked}, {merge: true});
      help.textContent = 'Reminder preferences saved for your devices.';
    } catch (error) { report(error); }
  };

  // Reconnect saved devices without another prompt and invalidate tokens after an account switch.
  onAuthStateChanged(auth, async user => {
    stop(); const currentVersion = ++version; uid = user?.emailVerified ? user.uid : null; deviceId = null;
    try {
      await bindWorker(uid);
      const priorOwner = localStorage.getItem('momentum-push-owner');
      if (priorOwner && priorOwner !== uid && await isSupported()) {
        messaging ||= getMessaging(app); await deleteToken(messaging);
        localStorage.removeItem('momentum-push:' + priorOwner); localStorage.removeItem('momentum-push-owner');
      }
      if (version !== currentVersion || !uid) { renderDevice(); return; }
      stop = onSnapshot(doc(db, 'users', uid, 'settings', 'notifications'), snapshot => {
        if (version !== currentVersion) return;
        const prefs = snapshot.data() || {};
        document.querySelector('#push-tasks').checked = prefs.tasks !== false;
        document.querySelector('#push-streak').checked = prefs.streak !== false;
        if (prefs.testRequest && prefs.testRequest === prefs.lastTestRequest) {
          help.textContent = prefs.testStatus === 'sent' ? 'Test accepted by the push service. When the page is open, the message appears in this panel; otherwise, check your device notifications.' : 'The test could not be sent. Try disabling and enabling this device again.';
          renderDevice();
        }
      }, report);
      if (localStorage.getItem('momentum-push:' + uid) && 'Notification' in window && Notification.permission === 'granted') await subscribe(false);
      else renderDevice();
    } catch (error) { report(error); }
  });

  // Keep foreground messages inside the signed-in app instead of producing duplicate OS alerts.
  isSupported().then(value => {
    supported = value; renderDevice();
    if (!supported) return;
    messaging ||= getMessaging(app);
    onMessage(messaging, payload => {
      if (payload.data?.uid !== auth.currentUser?.uid) return;
      document.querySelector('#push-received').textContent = `${payload.data.title}: ${payload.data.body}`;
      document.querySelector('.notification-panel').open = true;
    });
  }).catch(report);
  return {beforeSignOut: disconnect};
}
