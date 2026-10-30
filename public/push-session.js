// Keep only a local owner UID so queued pushes from a previous session are suppressed.
export function sessionOwner(value) {
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

