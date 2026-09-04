// Banners shown above the current screen: app update, iOS Add-to-Home-Screen,
// and the backup reminder. Re-rendered on settings or day changes.

import { state, saveSettings } from './state.js';
import { h, p, replaceChildren, isIOS, isStandalone } from './ui.js';
import { diffDays, todayISO } from './dates.js';

export function renderBanners() {
  const host = document.getElementById('banners');
  if (!host) return;
  const items = [];

  if (typeof state.updateAvailable === 'function') {
    items.push(h('div', { class: 'banner', role: 'status' },
      p('Update available – reload to get the latest version. Your diary is kept.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => state.updateAvailable() }, 'Reload now'))));
  }

  if (isIOS() && !isStandalone() && !state.settings.iosBannerDismissed) {
    items.push(h('div', { class: 'banner warn', role: 'region', 'aria-label': 'Add to Home Screen' },
      h('strong', null, 'Add this app to your Home Screen'),
      p('On an iPhone, Safari can delete a website’s stored data after 7 days without use. Installing the app stops that.'),
      h('ol', null,
        h('li', null, 'Tap the Share button (the square with an arrow) at the bottom of Safari.'),
        h('li', null, 'Scroll down and tap "Add to Home Screen".'),
        h('li', null, 'Tap "Add", then open the app from the new icon.')),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => saveSettings({ iosBannerDismissed: true }) }, 'Got it'))));
  }

  const nag = backupNagText();
  if (nag) {
    items.push(h('div', { class: 'banner warn', role: 'region', 'aria-label': 'Backup reminder' },
      h('strong', null, 'Back up your diary'), p(nag),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => import('./export.js').then(m => m.exportBackup('json')) }, 'Export backup'),
        h('a', { class: 'btn', href: '#/settings' }, 'Backup settings'))));
  }

  replaceChildren(host, ...items);
}

function backupNagText() {
  const n = state.days.size;
  if (n === 0) return null;
  const last = state.settings.lastBackupAt;
  if (!last) {
    return n >= 7 ? `You have ${n} days logged and no backup yet. Export a copy now so nothing is lost if this device is reset.` : null;
  }
  const days = diffDays(last.slice(0, 10), todayISO());
  if (days >= 14) return `Your last backup was ${days} days ago. Export a fresh copy so nothing is lost if this device is reset.`;
  return null;
}
