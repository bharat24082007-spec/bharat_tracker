import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs} from 'firebase/firestore';

// Exercise real rules with owner, stranger, anonymous, and non-Google contexts.
test('verified Google users have isolated workspaces', async () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const env = await initializeTestEnvironment({projectId: 'demo-progress-tracker', firestore: {rules}});
  try {
    const claims = {email_verified: true, firebase: {sign_in_provider: 'google.com'}};
    const owner = env.authenticatedContext('owner-test', claims).firestore();
    const stranger = env.authenticatedContext('stranger', claims).firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    const password = env.authenticatedContext('owner-test', {...claims, firebase: {sign_in_provider: 'password'}}).firestore();
    await assertSucceeds(setDoc(doc(owner, 'users/owner-test'), {profiles: {gfg: 'sample'}, syncRequest: 'now'}));
    await assertSucceeds(setDoc(doc(stranger, 'users/stranger'), {profiles: {leetcode: 'other'}, syncRequest: 'now'}));
    await assertFails(getDoc(doc(stranger, 'users/owner-test')));
    await assertFails(getDocs(collection(owner, 'users')));
    await assertSucceeds(updateDoc(doc(stranger, 'users/stranger'), {syncRequest: 'requested-again'}));
    await assertSucceeds(setDoc(doc(stranger, 'users/stranger/todos/task'), {title: 'Own task', due: '', priority: 'low', done: false}));
    await assertFails(getDoc(doc(owner, 'users/stranger/todos/task')));
    await assertFails(setDoc(doc(owner, 'users/owner-test'), {profiles: {gfg: 'http://evil.test'}, syncRequest: 'now'}));
    await assertFails(setDoc(doc(owner, 'users/owner-test'), {profiles: {}, syncRequest: 'now', lastSyncAt: 'fake'}));
    const path = 'users/owner-test/todos/task';
    const task = {title: 'Practice graphs', due: '2026-12-31', priority: 'high', done: false};
    await assertSucceeds(setDoc(doc(owner, path), task));
    await assertSucceeds(getDoc(doc(owner, path)));
    for (const db of [stranger, anonymous, password]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), task));
    }
    await assertFails(setDoc(doc(owner, 'users/stranger/todos/task'), task));
    await assertFails(setDoc(doc(owner, path), {...task, admin: true}));
    await assertSucceeds(setDoc(doc(owner, path), {...task, category: 'Exam revision', notes: 'Review graphs', originalDue: '2026-10-27'}));
    await assertFails(setDoc(doc(owner, path), {...task, notes: 'x'.repeat(1001)}));
    const skillPath = 'users/owner-test/skills/gfg_arrays';
    const skill = {platform: 'gfg', topic: 'Arrays', count: 3};
    await assertSucceeds(setDoc(doc(owner, skillPath), skill));
    await assertFails(setDoc(doc(stranger, skillPath), skill));
    await assertFails(getDoc(doc(anonymous, skillPath)));
    await assertFails(setDoc(doc(owner, skillPath), {...skill, count: -1}));
    await assertFails(setDoc(doc(owner, skillPath), {...skill, platform: 'leetcode'}));
    await assertSucceeds(deleteDoc(doc(owner, skillPath)));
    const snapshot = {day: '2026-10-28', platform: 'gfg', username: 'sample', solved: 5, rating: null, status: 'manual', fetched_at: new Date().toISOString()};
    await assertSucceeds(setDoc(doc(owner, 'users/owner-test/snapshots/2026-10-28_gfg'), snapshot));
    await assertFails(setDoc(doc(owner, 'users/owner-test/snapshots/wrong-id'), snapshot));
    await assertFails(setDoc(doc(owner, 'users/owner-test/snapshots/2026-10-28_leetcode'), {...snapshot, platform: 'leetcode'}));
    const devicePath = 'users/owner-test/devices/' + 'a'.repeat(64);
    const device = {token: 'test-device-token-123456789', updatedAt: new Date().toISOString()};
    await assertSucceeds(setDoc(doc(owner, devicePath), device));
    await assertFails(getDoc(doc(stranger, devicePath)));
    await assertFails(setDoc(doc(stranger, devicePath), device));
    await assertFails(setDoc(doc(owner, devicePath), {...device, token: 'short'}));
    const preferences = 'users/owner-test/settings/notifications';
    await assertSucceeds(setDoc(doc(owner, preferences), {tasks: true, streak: false, testRequest: 'now', testDeviceId: 'a'.repeat(64)}));
    await assertFails(setDoc(doc(owner, preferences), {tasks: true, lastTestAt: 'fake'}));
    await assertFails(setDoc(doc(owner, preferences), {tasks: 'yes'}));
    await assertFails(getDoc(doc(stranger, preferences)));
    await assertFails(setDoc(doc(owner, 'users/owner-test/notificationDeliveries/fake'), {state: 'sent'}));
    await assertSucceeds(deleteDoc(doc(owner, devicePath)));
  } finally { await env.cleanup(); }
});
