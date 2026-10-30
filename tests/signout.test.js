import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeSignOut} from '../public/signout.js';

// A missing or rejected push subscription must never prevent authentication sign-out.
test('sign-out succeeds when notification cleanup rejects', async () => {
  let signedOut = false;
  const cleaned = await completeSignOut(() => Promise.reject(Error('push failed')), async () => { signedOut = true; });
  assert.equal(signedOut, true); assert.equal(cleaned, false);
});

// An offline Firestore request must not leave the user waiting indefinitely.
test('sign-out is bounded when notification cleanup stalls', async () => {
  let signedOut = false;
  const cleaned = await completeSignOut(() => new Promise(() => {}), async () => { signedOut = true; }, 10);
  assert.equal(signedOut, true); assert.equal(cleaned, false);
});

// Run successful cleanup first and report completion without an unnecessary warning.
test('successful cleanup precedes sign-out', async () => {
  const order = [];
  assert.equal(await completeSignOut(async () => { order.push('cleanup'); }, async () => { order.push('logout'); }), true);
  assert.deepEqual(order, ['cleanup', 'logout']);
});

// Only authentication failure may be surfaced as sign-out failure.
test('authentication errors are not hidden', async () => {
  await assert.rejects(completeSignOut(async () => {}, async () => { throw Error('auth failed'); }), /auth failed/);
});

// A cleanup rejection that arrives after the timeout must remain handled.
test('late cleanup rejection does not undo sign-out', async () => {
  let rejectCleanup, signedOut = false;
  const cleanup = new Promise((resolve, reject) => { rejectCleanup = reject; });
  await completeSignOut(() => cleanup, async () => { signedOut = true; }, 5);
  rejectCleanup(Error('late network error'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signedOut, true);
});
