import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getMessaging, onBackgroundMessage} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-sw.js';
import {firebaseConfig} from './config.js';

const CACHE = 'momentum-offline-v1';

// Keep only a local owner UID so queued pushes from a previous session are suppressed.
function sessionOwner(value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('momentum-push-session', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('state');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('state', value === undefined ? 'readonly' : 'readwrite');
      const result = value === undefined ? tx.objectStore('state').get('owner') : tx.objectStore('state').put(value, 'owner');
      tx.oncomplete = () => { db.close(); resolve(result.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

// Bind reminders to the currently signed-in session instead of the browser's previous user.
self.addEventListener('message', event => {
  if (event.data?.type === 'MOMENTUM_SESSION') event.waitUntil(sessionOwner(event.data.uid || null));
});

// Cache only the offline page and public icons, never personal Firestore data.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

// Clean up old public-shell caches when a new worker takes control.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('momentum-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

// Show a clear offline page when a navigation cannot reach the network.
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});

// Open only this application's origin when a reminder is clicked.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(async clients => {
    const client = clients.find(client => new URL(client.url).origin === url.origin);
    if (client) { await client.navigate(url.href); return client.focus(); }
    return self.clients.openWindow(url.href);
  }));
});

// Display data-only FCM messages once, with generic lock-screen-safe summaries.
onBackgroundMessage(getMessaging(initializeApp(firebaseConfig)), async payload => {
  const data = payload.data || {};
  if (!data.uid || data.uid !== await sessionOwner()) return;
  return self.registration.showNotification(data.title || 'Momentum', {
    body: data.body || 'Open your workspace for an update.', icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png', tag: data.tag || 'momentum', data: {url: data.url || '/'}
  });
});
