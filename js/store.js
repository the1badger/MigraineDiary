// Tiny IndexedDB helper. Two object stores: "days" (keyPath "date") and
// "settings" (keyPath "id", one record). All methods return promises.
// Nothing here knows about the DOM.

const DB_NAME = 'migraine-diary';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('The database is open in another tab. Close it and try again.')); };
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeNames, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    const stores = Array.isArray(storeNames) ? storeNames.map(n => t.objectStore(n)) : t.objectStore(storeNames);
    Promise.resolve()
      .then(() => fn(stores))
      .then(r => { result = r; })
      .catch(err => { try { t.abort(); } catch (_) { /* already aborted */ } reject(err); });
  }));
}

export const store = {
  getDay(date) { return tx('days', 'readonly', s => reqToPromise(s.get(date))); },
  putDay(day) { return tx('days', 'readwrite', s => reqToPromise(s.put(day))); },
  putDays(days) { return tx('days', 'readwrite', s => Promise.all(days.map(d => reqToPromise(s.put(d))))); },
  deleteDay(date) { return tx('days', 'readwrite', s => reqToPromise(s.delete(date))); },
  getAllDays() { return tx('days', 'readonly', s => reqToPromise(s.getAll())); },
  countDays() { return tx('days', 'readonly', s => reqToPromise(s.count())); },
  getSettings() { return tx('settings', 'readonly', s => reqToPromise(s.get('settings'))); },
  putSettings(settings) { return tx('settings', 'readwrite', s => reqToPromise(s.put({ ...settings, id: 'settings' }))); },
  clearAll() {
    return tx(['days', 'settings'], 'readwrite', ([d, s]) => Promise.all([reqToPromise(d.clear()), reqToPromise(s.clear())]));
  },
  /** Write many days and the settings in one transaction (used by import and demo). */
  writeBatch(days, settings) {
    return tx(['days', 'settings'], 'readwrite', ([d, s]) =>
      Promise.all([...days.map(day => reqToPromise(d.put(day))), reqToPromise(s.put({ ...settings, id: 'settings' }))]));
  },
  async requestPersist() {
    if (!navigator.storage || !navigator.storage.persist) return null;
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (_) { return null; }
  },
  async isPersisted() {
    if (!navigator.storage || !navigator.storage.persisted) return null;
    try { return await navigator.storage.persisted(); } catch (_) { return null; }
  },
  async estimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try { return await navigator.storage.estimate(); } catch (_) { return null; }
  },
};

/**
 * Debounced writer: call queue(day) on every change; the latest version of
 * each date is written `delay` ms after the last change. flush() writes at
 * once (used on pagehide so nothing is lost when the app is backgrounded).
 */
export function createWriter({ delay = 300, onState = () => {} } = {}) {
  const pending = new Map();
  let timer = null;
  let inflight = 0;

  async function write() {
    timer = null;
    const items = [...pending.values()];
    pending.clear();
    if (!items.length) return;
    inflight++;
    onState('saving');
    try {
      await store.putDays(items);
      if (inflight === 1 && pending.size === 0) onState('saved');
    } catch (err) {
      onState('error', err);
    } finally {
      inflight--;
    }
  }

  return {
    queue(day) {
      pending.set(day.date, day);
      onState('dirty');
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, delay);
    },
    flush() {
      if (timer) clearTimeout(timer);
      return write();
    },
    hasPending() { return pending.size > 0 || inflight > 0; },
  };
}
