// A small-effort daily reminder. Works only while the app is open (or, on some
// platforms, installed), because the web cannot schedule a notification for a
// future time without a push server. Settings tells the user to set a phone
// alarm if reminders do not appear.

import { state, getDay } from './state.js';
import { todayISO, minutesOfTime } from './dates.js';

let timer = null;

export function notificationsSupported() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch (_) { return 'denied'; }
}

export function scheduleReminder() {
  if (timer) { clearTimeout(timer); timer = null; }
  const s = state.settings;
  if (!s.reminderEnabled || !notificationsSupported() || Notification.permission !== 'granted') return;
  const mins = minutesOfTime(s.reminderTime);
  if (mins == null) return;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(mins / 60), mins % 60, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const wait = Math.min(target - now, 2147483647);
  timer = setTimeout(async () => {
    timer = null;
    try {
      if (!getDay(todayISO())) {
        const reg = await navigator.serviceWorker.getRegistration();
        const opts = { body: 'Thirty seconds now keeps the trigger analysis honest.', tag: 'daily-reminder', icon: 'icons/icon-192.png' };
        if (reg && reg.showNotification) await reg.showNotification('Log today in Migraine Diary', opts);
        else new Notification('Log today in Migraine Diary', opts);
      }
    } catch (err) { console.warn('Reminder failed', err); }
    scheduleReminder();
  }, wait);
}
