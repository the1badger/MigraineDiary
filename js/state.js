// In-memory copy of the diary plus the write-through to IndexedDB.
// Views read from `state`, change data only via updateDay / saveSettings,
// and listen for 'daychange' / 'settingschange' / 'savestate' events.

import { store, createWriter } from './store.js';
import { normaliseDay, normaliseSettings, emptyDay, defaultSettings } from './fields.js';
import { nowWithOffset } from './dates.js';

export const state = {
  days: new Map(),        // date -> DayRecord
  settings: defaultSettings(),
  ready: false,
  saveState: 'saved',
};

const bus = new EventTarget();
export function on(type, fn) { bus.addEventListener(type, fn); return () => bus.removeEventListener(type, fn); }
export function emit(type, detail) { bus.dispatchEvent(new CustomEvent(type, { detail })); }

const writer = createWriter({
  delay: 300,
  onState: (s, err) => { state.saveState = s; emit('savestate', { state: s, err }); },
});

export async function loadAll() {
  const [days, settings] = await Promise.all([store.getAllDays(), store.getSettings()]);
  state.days = new Map(days.map(d => [d.date, normaliseDay(d)]));
  state.settings = normaliseSettings(settings);
  if (!settings) {
    state.settings.firstRunAt = nowWithOffset();
    await store.putSettings(state.settings);
  }
  state.ready = true;
  emit('loaded');
}

export function getDay(date) { return state.days.get(date) || null; }

export function allDays() { return [...state.days.values()].sort((a, b) => a.date < b.date ? -1 : 1); }

/** Apply a change to a day (creating the record if needed) and queue the save. */
export function updateDay(date, mutate) {
  let day = state.days.get(date);
  if (!day) { day = emptyDay(date); state.days.set(date, day); }
  mutate(day);
  day.updatedAt = nowWithOffset();
  writer.queue(day);
  emit('daychange', { date });
  return day;
}

export async function removeDay(date) {
  state.days.delete(date);
  await store.deleteDay(date);
  emit('daychange', { date });
}

export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await store.putSettings(state.settings);
  emit('settingschange', { patch });
}

/** Replace the whole diary (import or demo). days: normalised DayRecords. */
export async function replaceAll(days, settings) {
  await writer.flush();
  const s = normaliseSettings(settings);
  await store.clearAll();
  await store.writeBatch(days, s);
  state.days = new Map(days.map(d => [d.date, d]));
  state.settings = s;
  emit('daychange', { date: null });
  emit('settingschange', { patch: null });
}

/** Add or update many days without touching the rest (import merge). */
export async function mergeDays(days, settings) {
  await writer.flush();
  const s = normaliseSettings(settings);
  await store.writeBatch(days, s);
  for (const d of days) state.days.set(d.date, d);
  state.settings = s;
  emit('daychange', { date: null });
  emit('settingschange', { patch: null });
}

export async function eraseAll() {
  await writer.flush();
  await store.clearAll();
  state.days = new Map();
  state.settings = normaliseSettings(null);
  state.settings.firstRunAt = nowWithOffset();
  await store.putSettings(state.settings);
  emit('daychange', { date: null });
  emit('settingschange', { patch: null });
}

export function flush() { return writer.flush(); }
export function hasPendingWrites() { return writer.hasPending(); }

// Write immediately when the page is hidden or closed: on phones the app is
// frequently backgrounded a second after the last tap.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writer.flush(); });
  window.addEventListener('pagehide', () => writer.flush());
  window.addEventListener('beforeunload', () => writer.flush());
}
