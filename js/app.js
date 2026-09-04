// App entry: router, theme, save indicator, service-worker update prompt.
// Views live in js/views/*.js and each returns a DOM node (optionally with a
// .cleanup() function that the router calls before swapping it out).

import { state, loadAll, on, saveSettings } from './state.js';
import { h, replaceChildren, toast, p } from './ui.js';
import { todayISO } from './dates.js';
import { store } from './store.js';
import { renderToday } from './views/today.js';
import { renderAttack } from './views/attack.js';
import { renderCalendar } from './views/calendar.js';
import { renderTrends } from './views/trends.js';
import { renderTriggers } from './views/triggers.js';
import { renderSettings } from './views/settings.js';
import { renderHelp } from './views/help.js';
import { renderBanners } from './banners.js';
import { scheduleReminder } from './reminders.js';

export const APP_VERSION = '1.0.0';

const routes = [
  { re: /^#\/today$/, tab: 'today', view: () => renderToday({ date: todayISO() }) },
  { re: /^#\/day\/(\d{4}-\d{2}-\d{2})$/, tab: 'today', view: m => renderToday({ date: m[1] }) },
  { re: /^#\/attack\/(\d{4}-\d{2}-\d{2})\/([\w-]+)$/, tab: 'today', view: m => renderAttack({ date: m[1], id: m[2] }) },
  { re: /^#\/calendar(?:\/(\d{4}-\d{2}))?$/, tab: 'calendar', view: m => renderCalendar({ month: m[1] }) },
  { re: /^#\/trends$/, tab: 'trends', view: () => renderTrends() },
  { re: /^#\/triggers$/, tab: 'triggers', view: () => renderTriggers() },
  { re: /^#\/settings$/, tab: 'settings', view: () => renderSettings() },
  { re: /^#\/help$/, tab: 'settings', view: () => renderHelp() },
];

let current = null;

function route() {
  const hash = location.hash || '#/today';
  let match = null, r = null;
  for (const candidate of routes) {
    match = hash.match(candidate.re);
    if (match) { r = candidate; break; }
  }
  if (!r) { location.replace('#/today'); return; }
  if (current && typeof current.cleanup === 'function') current.cleanup();
  const main = document.getElementById('main');
  let node;
  try {
    node = r.view(match);
  } catch (err) {
    console.error(err);
    node = h('section', null, h('h2', null, 'Something went wrong'),
      p('This screen could not be drawn. Your data is safe. Try reloading the app; if it keeps happening, export a backup from Settings and report the message below.'),
      h('pre', null, String(err && err.stack || err)));
  }
  current = node;
  replaceChildren(main, node);
  for (const a of document.querySelectorAll('.tab-bar a')) {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

/* ---------- Theme ---------- */

function isNight() { const hr = new Date().getHours(); return hr >= 20 || hr < 6; }

export function applyTheme() {
  const pref = state.settings.theme || 'auto';
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = pref === 'dark' || (pref === 'auto' && (isNight() || systemDark));
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem('md-theme', pref); } catch (_) { /* private mode */ }
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') || document.head.appendChild(h('meta', { name: 'theme-color' }));
  meta.setAttribute('content', dark ? '#121417' : '#f6f4ef');
}

function startThemeClock() {
  setInterval(applyTheme, 60 * 1000);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
  }
}

/* ---------- Save indicator ---------- */

function setSaveIndicator(s, err) {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.className = 'save-indicator ' + s;
  if (s === 'saving' || s === 'dirty') el.textContent = 'Saving…';
  else if (s === 'saved') el.textContent = 'Saved';
  else if (s === 'error') {
    el.textContent = 'Not saved – storage error';
    console.error('Save failed', err);
    toast('Could not save. Free up storage space or export a backup, then try again.', 5000);
  } else el.textContent = '';
}

/* ---------- Service worker ---------- */

let refreshing = false;
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
      });
    });
  }).catch(err => console.warn('Service worker registration failed', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}

function showUpdate(reg) {
  state.updateAvailable = () => { if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); };
  renderBanners();
}

/* ---------- Boot ---------- */

async function boot() {
  applyTheme();
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    replaceChildren(document.getElementById('main'),
      h('section', null, h('h2', null, 'Storage is not available'),
        p('This browser would not open the diary database. Private browsing windows and some restricted browsers block it. Open the app in a normal window, or add it to your Home Screen.'),
        h('pre', null, String(err))));
    return;
  }
  applyTheme();
  startThemeClock();
  if (state.settings.persisted == null) {
    store.requestPersist().then(result => { if (result != null) saveSettings({ persisted: result }); });
  }
  on('savestate', e => setSaveIndicator(e.detail.state, e.detail.err));
  on('settingschange', () => { applyTheme(); renderBanners(); scheduleReminder(); });
  on('daychange', () => renderBanners());
  window.addEventListener('hashchange', route);
  if (!location.hash) location.replace('#/today');
  route();
  renderBanners();
  registerServiceWorker();
  scheduleReminder();
}

boot();
