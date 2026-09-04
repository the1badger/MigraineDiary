// Service worker: precache the app shell, serve cache-first, never touch the
// network for anything else. No data passes through here; the diary lives in
// IndexedDB, which the service worker does not read.
//
// UPDATE STRATEGY: bump VERSION whenever any file in SHELL changes. The new
// worker installs a fresh cache in the background and waits; the app shows
// "Update available – reload" and posts SKIP_WAITING when the user agrees.
// Old caches are deleted on activate.

const VERSION = '1.0.0';
const CACHE = `migraine-diary-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/analysis.js',
  './js/banners.js',
  './js/charts.js',
  './js/dates.js',
  './js/demo.js',
  './js/export.js',
  './js/fields.js',
  './js/reminders.js',
  './js/state.js',
  './js/store.js',
  './js/ui.js',
  './js/views/attack.js',
  './js/views/calendar.js',
  './js/views/help.js',
  './js/views/settings.js',
  './js/views/today.js',
  './js/views/trends.js',
  './js/views/triggers.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline and not cached.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      });
    }));
});
