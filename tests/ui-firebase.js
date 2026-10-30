// In-memory Firebase substitute used only by the isolated UI test build.
const data = new Map(), listeners = new Map();
const user = {uid: 'ui-test', emailVerified: true, displayName: 'UI test workspace'};
const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(new Date());
data.set('users/ui-test', {profiles: {leetcode: 'sample-student'}, syncRequest: 'test', lastSyncRequest: 'test', lastSyncAt: new Date().toISOString()});
data.set(`users/ui-test/snapshots/${day}_leetcode`, {platform: 'leetcode', username: 'sample-student', day, solved: 42, rating: 1450, fetched_at: new Date().toISOString(), status: 'ok', topics: {Array: 20, Graph: 6, 'Dynamic Programming': 8}, difficulty: {easy: 20, medium: 20, hard: 2}});

// Produce document and collection references with the same shape used by the app.
export function doc(base, ...parts) { const path = [base.path, ...parts, ...(!parts.length && base.path ? [crypto.randomUUID()] : [])].filter(Boolean).join('/'); return {path, id: path.split('/').at(-1)}; }
export const collection = doc;
// Create a minimal app handle for the isolated UI fixture.
export function initializeApp() { return {}; }
// Provide the fixture database handle.
export function getFirestore() { return {path: ''}; }
// Provide the fixture authentication handle.
export function getAuth() { return {currentUser: user}; }
export class GoogleAuthProvider {}
// Start a test session without connecting to real authentication.
export function onAuthStateChanged(auth, callback) { queueMicrotask(() => callback(user)); }
// Resolve the test sign-in action without external requests.
export async function signInWithPopup() { return user; }
// Reload the isolated fixture after sign-out for repeatable tests.
export async function signOut() { location.reload(); }
// Return a minimal document snapshot.
function snapshot(path, value) { return {id: path.split('/').at(-1), data: () => value, exists: () => value !== undefined}; }
// Notify active views after a fixture mutation.
function emit() {
  for (const [path, callbacks] of listeners) {
    const value = data.get(path);
    const result = path.split('/').length % 2 === 0 ? snapshot(path, value) : {docs: [...data].filter(([key]) => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1).map(([key, value]) => snapshot(key, value))};
    for (const callback of callbacks) callback(result);
  }
}
// Subscribe to fixture snapshots and support unsubscription.
export function onSnapshot(ref, callback) {
  const callbacks = listeners.get(ref.path) || new Set(); callbacks.add(callback); listeners.set(ref.path, callbacks);
  queueMicrotask(emit); return () => callbacks.delete(callback);
}
// Save a fixture document, mirroring top-level merge behavior used by the app.
export async function setDoc(ref, value, options) { data.set(ref.path, options ? {...data.get(ref.path), ...value} : value); emit(); }
// Update an existing fixture document.
export async function updateDoc(ref, value) { return setDoc(ref, value, {merge: true}); }
// Add an isolated test record.
export async function addDoc(ref, value) { return setDoc(doc(ref, crypto.randomUUID()), value); }
// Remove an isolated test record.
export async function deleteDoc(ref) { data.delete(ref.path); emit(); }
// Read one isolated fixture record for onboarding, export, and confirmation tests.
export async function getDoc(ref) { return snapshot(ref.path, data.get(ref.path)); }
// Read fixture collection contents without connecting to Firestore.
export async function getDocs(ref) { return {docs: [...data].filter(([key]) => key.startsWith(ref.path + '/') && key.split('/').length === ref.path.split('/').length + 1).map(([key, value]) => snapshot(key, value))}; }
// Batch UI fixture writes so routine creation behaves atomically from the viewer's perspective.
export function writeBatch() {
  const operations = [];
  return {set: (ref, value) => operations.push(() => data.set(ref.path, value)), commit: async () => { operations.forEach(operation => operation()); emit(); }};
}
// Simulate a transaction using fixture reads and a single batch commit.
export async function runTransaction(db, callback) { const batch = writeBatch(); await callback({get: getDoc, set: batch.set}); await batch.commit(); }
// Use an ISO marker for timestamps in the sample-data test only.
export function serverTimestamp() { return new Date().toISOString(); }
// Keep account verification inside the isolated test fixture.
export async function reauthenticateWithPopup() { return {user}; }
// Return a placeholder that can never authenticate against a real service.
export async function getIdToken() { return 'isolated-fixture'; }
