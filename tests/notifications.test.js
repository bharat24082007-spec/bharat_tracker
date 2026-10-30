import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Run the real notification controller against isolated SDK and browser substitutes.
async function controller(stored) {
  const nodes = new Map(), storage = new Map(stored ? [['momentum-push:owner', 'device']] : []), events = [];
  const auth = {currentUser: {uid: 'owner', emailVerified: true}};
  const code = readFileSync('public/notifications.js', 'utf8').replace(/^import .*;$/gm, '').replace('export function initializeNotifications', 'function initializeNotifications');
  const context = {Promise, setTimeout, clearTimeout, navigator: {}, Notification: {permission: 'default'}, window: {Notification: {}, addEventListener() {}},
    document: {querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, {value: '', textContent: ''}); return nodes.get(selector); }},
    localStorage: {getItem: key => storage.get(key), removeItem: key => storage.delete(key)},
    sessionOwner: async uid => { events.push(['owner', uid]); },
    onAuthStateChanged: (instance, callback) => { callback(instance.currentUser); },
    isSupported: async () => true, getMessaging: () => ({}), onMessage() {},
    onSnapshot: () => () => {}, doc: (...parts) => parts,
    deleteDoc: async () => { events.push(['deleteDoc']); throw Error('offline'); },
    deleteToken: async () => { events.push(['deleteToken']); throw Error('no subscription'); }
  };
  const initialize = runInNewContext(code + '; initializeNotifications', context);
  const result = initialize({}, auth, {});
  await new Promise(resolve => setImmediate(resolve));
  return {result, events, storage};
}

// Failure of either remote cleanup must not skip local suppression or the other cleanup.
test('notification cleanup suppresses locally and attempts both remote removals', async () => {
  const {result, events, storage} = await controller(true);
  await assert.rejects(result.beforeSignOut(), /cleanup could not finish/);
  assert.deepEqual(events.filter(event => event[0] !== 'owner').map(event => event[0]), ['deleteDoc', 'deleteToken']);
  assert.ok(events.some(event => event[0] === 'owner' && event[1] === null));
  assert.equal(storage.has('momentum-push:owner'), false);
});

// Browsers that never enabled notifications do not need an FCM unsubscribe call.
test('sign-out without a stored push device skips token deletion', async () => {
  const {result, events} = await controller(false);
  await result.beforeSignOut();
  assert.equal(events.some(event => event[0] === 'deleteToken'), false);
});
