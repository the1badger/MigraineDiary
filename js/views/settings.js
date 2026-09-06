// Settings: custom tick boxes, hidden fields, thresholds, medicines, theme,
// reminder, backup/import, storage status, demo data, delete everything.

import { state, saveSettings, replaceAll, eraseAll } from '../state.js';
import { h, p, tickRow, segmented, toast, confirmDialog, infoDialog, promptDialog, plural, isIOS, isStandalone, formatPct } from '../ui.js';
import { FIELDS, DAY_FLAGS, GROUPS, GROUP_LABELS, WEATHER_FIELDS, medClass, defaultSettings } from '../fields.js';
import { exportBackup, prepareImport, commitImport } from '../export.js';
import { generateDemo, DEMO_TRIGGER, DEMO_DECOY } from '../demo.js';
import { store } from '../store.js';
import { notificationsSupported, requestPermission, scheduleReminder } from '../reminders.js';
import { todayISO, addDays, formatMedium, nowWithOffset, diffDays } from '../dates.js';

const GROUP_LABEL = GROUP_LABELS;

function rerender() { window.dispatchEvent(new Event('app:rerender')); }

export function renderSettings() {
  const s = state.settings;
  const root = h('section', { class: 'view settings', 'aria-label': 'Settings' });
  root.appendChild(h('h2', null, 'Settings'));

  root.appendChild(customSection(s));
  root.appendChild(builtinSection(s));
  root.appendChild(thresholdSection(s));
  root.appendChild(medicineSection(s));
  root.appendChild(appearanceSection(s));
  root.appendChild(reminderSection(s));
  root.appendChild(weatherSection(s));
  root.appendChild(backupSection(s));
  root.appendChild(storageSection(s));
  root.appendChild(demoSection(s));
  root.appendChild(dangerSection());
  root.appendChild(aboutSection());
  return root;
}

/* ---------- Custom tick boxes ---------- */

function customSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'Your own tick boxes'),
    p('Add anything you suspect: a food, a place, a habit. Each one appears on the Today screen in the group you choose and is tested for lagged patterns like the built-in items.', 'explain'));
  const list = h('ul', { class: 'list' });
  const items = s.customExposures;
  items.forEach((c, i) => {
    list.appendChild(h('li', null,
      h('span', { class: `name${c.hidden ? ' hidden-item' : ''}` }, c.name, h('span', { class: 'hint small muted' }, ` · ${GROUP_LABEL[c.group] || 'Food and drink'}`)),
      h('button', { class: 'btn icon', type: 'button', disabled: i === 0, 'aria-label': `Move ${c.name} up`, onclick: () => move(i, -1) }, '↑'),
      h('button', { class: 'btn icon', type: 'button', disabled: i === items.length - 1, 'aria-label': `Move ${c.name} down`, onclick: () => move(i, 1) }, '↓'),
      h('button', { class: 'btn', type: 'button', onclick: () => rename(i) }, 'Rename'),
      h('button', { class: 'btn', type: 'button', onclick: () => toggleHidden(i) }, c.hidden ? 'Show' : 'Hide'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => remove(i) }, 'Delete')));
  });
  if (!items.length) list.appendChild(h('li', { class: 'muted' }, 'None yet.'));
  sec.appendChild(list);

  let group = 'food';
  const name = h('input', { type: 'text', placeholder: 'e.g. dark chocolate', maxlength: 60, 'aria-label': 'New tick box name', autocomplete: 'off' });
  const add = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const n = name.value.trim();
    if (!n) { name.focus(); return; }
    if (items.some(c => c.name.toLowerCase() === n.toLowerCase())) { toast('That tick box already exists'); return; }
    await saveSettings({ customExposures: [...items, { name: n, group, hidden: false, since: todayISO() }] });
    toast(`"${n}" added`);
    rerender();
  } }, 'Add');
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } });
  sec.appendChild(h('div', { class: 'add-row' }, name, add));
  sec.appendChild(h('div', { class: 'field' }, h('div', { class: 'label' }, 'Show it under'),
    segmented({ options: GROUPS.map(g => [g.key, g.label.split(' ')[0]]), value: group, allowClear: false, ariaLabel: 'Group for the new tick box', onChange: v => { group = v; } })));

  async function move(i, dir) {
    const arr = [...items];
    const [x] = arr.splice(i, 1);
    arr.splice(i + dir, 0, x);
    await saveSettings({ customExposures: arr });
    rerender();
  }
  async function rename(i) {
    const n = await promptDialog({ title: 'Rename tick box', label: 'Name', value: items[i].name });
    if (!n || n === items[i].name) return;
    const old = items[i].name;
    const arr = items.map((c, j) => (j === i ? { ...c, name: n } : c));
    // Carry the data across so old entries are not orphaned.
    const { updateDay } = await import('../state.js');
    for (const d of state.days.values()) {
      if (d.exposures.custom && old in d.exposures.custom) {
        updateDay(d.date, day => { day.exposures.custom[n] = day.exposures.custom[old]; delete day.exposures.custom[old]; });
      }
    }
    await saveSettings({ customExposures: arr, challenges: state.settings.challenges.map(c => (c.exposure === old ? { ...c, exposure: n } : c)) });
    rerender();
  }
  async function toggleHidden(i) {
    const arr = items.map((c, j) => (j === i ? { ...c, hidden: !c.hidden } : c));
    await saveSettings({ customExposures: arr });
    rerender();
  }
  async function remove(i) {
    const ok = await confirmDialog({ title: `Delete "${items[i].name}"?`, body: 'The box disappears from Today and from the analysis. Days already logged keep their ticks in the backup file, so you can add it back later under the same name.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await saveSettings({ customExposures: items.filter((_, j) => j !== i) });
    rerender();
  }
  return sec;
}

/* ---------- Built-in fields ---------- */

function builtinSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'Built-in questions'),
    p('Untick anything you never need; hidden questions leave the Today screen and the analysis. Cycle day and hormonal phase are off until you turn them on.', 'explain'));
  const hidden = new Set(s.hiddenBuiltins);
  const all = [...FIELDS.filter(f => f.group !== 'meds').map(f => ({ key: f.key, label: (f.subgroup ? `${f.subgroup}: ` : '') + f.label + (f.hint ? ` (${f.hint})` : ''), group: GROUP_LABEL[f.group] })),
    ...DAY_FLAGS.map(f => ({ key: f.key, label: f.label, group: GROUP_LABEL.meds })),
    ...FIELDS.filter(f => f.group === 'meds').map(f => ({ key: f.key, label: `${f.subgroup}: ${f.label}`, group: GROUP_LABEL.meds })),
    ...WEATHER_FIELDS.map(f => ({ key: f.key, label: `${f.label} (from the weather fetch)`, group: GROUP_LABEL.weather }))];
  let lastGroup = null;
  for (const f of all) {
    if (f.group !== lastGroup) { sec.appendChild(h('h3', null, f.group)); lastGroup = f.group; }
    sec.appendChild(tickRow({ label: f.label, checked: !hidden.has(f.key), onChange: async v => {
      const set = new Set(state.settings.hiddenBuiltins);
      if (v) set.delete(f.key); else set.add(f.key);
      await saveSettings({ hiddenBuiltins: [...set] });
    } }));
  }
  return sec;
}

/* ---------- Thresholds ---------- */

function thresholdSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'What counts as "yes"'),
    p('Numbers become yes/no for the analysis at these cut-offs. Change them to suit you; the analysis re-runs instantly.', 'explain'));
  const withThreshold = [...FIELDS.filter(f => f.threshold), ...WEATHER_FIELDS];
  let weatherHeading = false;
  for (const f of withThreshold) {
    if (WEATHER_FIELDS.includes(f) && !weatherHeading) { sec.appendChild(h('h3', null, 'From the weather fetch')); weatherHeading = true; }
    const input = h('input', { type: 'number', value: s.thresholds[f.key], step: f.step || 1, min: f.min ?? 0, max: f.max ?? 10, 'aria-label': `Cut-off for ${f.label}` });
    const desc = h('div', { class: 'desc' }, f.label + (f.unit && WEATHER_FIELDS.includes(f) ? ` (${f.unit})` : ''), h('small', { class: 'muted' }, f.analysisLabel(s.thresholds[f.key])));
    input.addEventListener('change', async () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      await saveSettings({ thresholds: { ...state.settings.thresholds, [f.key]: v } });
      desc.lastChild.textContent = f.analysisLabel(v);
    });
    sec.appendChild(h('div', { class: 'threshold-row' }, desc, input));
  }
  sec.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
    await saveSettings({ thresholds: defaultSettings().thresholds });
    rerender();
  } }, 'Reset cut-offs to defaults')));
  return sec;
}

/* ---------- Medicines ---------- */

function medicineSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'Attack medicines'),
    p('These appear on the attack sheet with a "+1 dose" button. Triptans and combination painkillers count against the 10-day-a-month line; simple painkillers against 15. The class is guessed from the name; change it if the guess is wrong.', 'explain'));
  const list = h('ul', { class: 'list' });
  for (const name of s.acuteMedNames) {
    list.appendChild(h('li', null,
      h('span', { class: 'name' }, name),
      segmented({ options: [['simple', 'Simple'], ['triptan', 'Triptan / combo']], value: medClass(name, s), allowClear: false, ariaLabel: `Class of ${name}`,
        onChange: v => saveSettings({ acuteMedClasses: { ...state.settings.acuteMedClasses, [name]: v } }) }),
      h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: `Remove "${name}"?`, body: 'Doses already logged are kept.', confirmLabel: 'Remove', danger: true });
        if (!ok) return;
        await saveSettings({ acuteMedNames: state.settings.acuteMedNames.filter(n => n !== name) });
        rerender();
      } }, 'Remove')));
  }
  sec.appendChild(list);
  const input = h('input', { type: 'text', placeholder: 'e.g. naproxen 500 mg', maxlength: 60, 'aria-label': 'New medicine', autocomplete: 'off' });
  const add = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const n = input.value.trim();
    if (!n) return;
    if (state.settings.acuteMedNames.includes(n)) { toast('Already in the list'); return; }
    await saveSettings({ acuteMedNames: [...state.settings.acuteMedNames, n] });
    rerender();
  } }, 'Add');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } });
  sec.appendChild(h('div', { class: 'add-row' }, input, add));
  return sec;
}

/* ---------- Appearance ---------- */

function appearanceSection(s) {
  return h('div', { class: 'group' }, h('h2', null, 'Appearance'),
    h('div', { class: 'field' }, h('div', { class: 'label' }, 'Theme', h('span', { class: 'hint' }, 'Auto is dark from 20:00 to 06:00 and otherwise follows your phone.')),
      segmented({ options: [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']], value: s.theme, allowClear: false, ariaLabel: 'Theme', onChange: v => saveSettings({ theme: v }) })));
}

/* ---------- Reminder ---------- */

function reminderSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'Daily reminder'));
  const supported = notificationsSupported();
  const status = h('p', { class: 'explain' });
  const describe = () => {
    if (!supported) status.textContent = 'This browser cannot show notifications. Set a daily phone alarm instead.';
    else if (Notification.permission === 'denied') status.textContent = 'Notifications are blocked for this app in your phone settings. Set a daily phone alarm instead.';
    else if (s.reminderEnabled && Notification.permission === 'granted') status.textContent = `A reminder is set for ${s.reminderTime} on days you have not logged. It can only fire while the app is open or installed to the Home Screen, and phones often silence web reminders. If reminders don't appear on your phone, set a daily phone alarm instead.`;
    else status.textContent = "If reminders don't appear on your phone, set a daily phone alarm instead.";
  };
  describe();
  const time = h('input', { type: 'time', value: s.reminderTime, 'aria-label': 'Reminder time', onchange: async () => { await saveSettings({ reminderTime: time.value || '20:30' }); describe(); } });
  sec.appendChild(h('div', { class: 'field' }, h('div', { class: 'label' }, 'Remind me at'), time));
  sec.appendChild(tickRow({ label: 'Show a reminder notification', checked: !!s.reminderEnabled, disabled: !supported, onChange: async v => {
    if (v) {
      const perm = await requestPermission();
      if (perm !== 'granted') { toast('Notifications were not allowed'); await saveSettings({ reminderEnabled: false }); rerender(); return; }
    }
    await saveSettings({ reminderEnabled: v });
    scheduleReminder();
    describe();
  } }));
  sec.appendChild(status);
  if (isIOS() && !isStandalone()) sec.appendChild(p('On an iPhone, notifications only work once the app is added to the Home Screen (iOS 16.4 or later).', 'explain'));
  return sec;
}

/* ---------- Weather ---------- */

function weatherSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'Weather and air'),
    p('The "Fetch weather" button on the Today screen asks Open-Meteo (a free service, no account) for the day\'s pressure, humidity, sunshine, temperature, rain, PM2.5 and pollen. It is the only time the app uses the network after loading, and only your location rounded to about 1 km plus the date are sent. Pollen is available in Europe only.', 'explain'));
  const loc = s.lastLocation;
  sec.appendChild(h('div', { class: 'kv' }, h('span', null, 'Last location used'),
    h('span', null, loc ? `${loc.lat}, ${loc.lon}${loc.at ? ` (${formatMedium(loc.at.slice(0, 10))})` : ''}` : 'None yet')));
  if (loc) {
    sec.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
      await saveSettings({ lastLocation: null });
      toast('Location forgotten');
      rerender();
    } }, 'Forget location')));
  }
  sec.appendChild(p('The phone\'s location is asked for each time you tap the button; the last position is kept only so the fetch still works when location access is refused or unavailable. Cut-offs for the weather triggers are in "What counts as yes" above.', 'explain'));
  return sec;
}

/* ---------- Backup ---------- */

function backupSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'Backup and export'));
  const last = s.lastBackupAt ? `Last backup: ${formatMedium(s.lastBackupAt.slice(0, 10))} (${daysAgo(s.lastBackupAt)}).` : 'No backup yet.';
  sec.appendChild(p(`${last} Your diary lives only on this device. A backup file is the only copy; keep one in Files, Drive or an email to yourself every couple of weeks.`, 'explain'));
  sec.appendChild(h('div', { class: 'btn-row' },
    h('button', { class: 'btn primary', type: 'button', onclick: async () => { await exportBackup('json'); rerender(); } }, 'Export backup (JSON)'),
    h('button', { class: 'btn', type: 'button', onclick: () => exportBackup('csv') }, 'Export spreadsheet (CSV)')));
  sec.appendChild(p('The JSON file restores everything, including settings. The CSV opens in Excel or Numbers with one row per day.', 'explain'));

  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'import-file' });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    let prepared;
    try { prepared = await prepareImport(f); }
    catch (err) { await infoDialog('Could not import', err.message); return; }
    const { parsed, plan } = prepared;
    const body = h('div', null,
      p(`Backup from ${parsed.exportedAt ? formatMedium(parsed.exportedAt.slice(0, 10)) : 'an unknown date'} with ${plural(parsed.days.length, 'day')}.`),
      h('ul', null,
        h('li', null, `${plural(plan.add.length, 'new day')} will be added`),
        h('li', null, `${plural(plan.update.length, 'day')} will be replaced by a newer copy from the file`),
        h('li', null, `${plural(plan.keep.length, 'day')} already here are newer or identical and will be kept`)),
      p(parsed.settings ? (state.days.size === 0 ? 'Settings will be taken from the file.' : 'Your settings are kept; tick boxes and medicines from the file are added to yours.') : 'The file has no settings; yours are kept.'));
    const ok = await confirmDialog({ title: 'Import this backup?', body, confirmLabel: 'Import' });
    if (!ok) return;
    try {
      await commitImport(prepared);
      toast(`Imported: ${plan.add.length} added, ${plan.update.length} updated`);
      rerender();
    } catch (err) {
      await infoDialog('Import failed', `Nothing was changed. ${err.message}`);
    }
  });
  sec.appendChild(file);
  sec.appendChild(h('div', { class: 'btn-row' }, h('label', { class: 'btn', for: 'import-file', tabindex: '0', role: 'button',
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } }, 'Import backup…')));
  sec.appendChild(p('Importing merges by date: for any day in both places, the copy edited most recently wins. You see the counts before anything changes.', 'explain'));
  return sec;
}

function daysAgo(iso) {
  const n = diffDays(iso.slice(0, 10), todayISO());
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}

/* ---------- Storage ---------- */

function storageSection(s) {
  const sec = h('div', { class: 'group' }, h('h2', null, 'Storage'));
  const rows = h('div', null);
  rows.appendChild(h('div', { class: 'kv' }, h('span', null, 'Days logged'), h('span', null, String(state.days.size))));
  const persisted = h('div', { class: 'kv' }, h('span', null, 'Protected from automatic clean-up'), h('span', null, s.persisted === true ? 'Yes' : s.persisted === false ? 'No – browser declined' : 'Unknown'));
  rows.appendChild(persisted);
  const usage = h('div', { class: 'kv' }, h('span', null, 'Space used'), h('span', null, '…'));
  rows.appendChild(usage);
  store.estimate().then(est => {
    usage.lastChild.textContent = est && est.usage != null ? `${(est.usage / 1024).toFixed(0)} KB${est.quota ? ` of ${(est.quota / 1048576).toFixed(0)} MB available` : ''}` : 'Not reported';
  });
  store.isPersisted().then(v => { if (v != null && v !== s.persisted) saveSettings({ persisted: v }); });
  sec.appendChild(rows);
  sec.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
    const r = await store.requestPersist();
    await saveSettings({ persisted: r });
    toast(r ? 'Storage is now protected' : 'The browser declined; a Home Screen install and regular backups are the safeguard');
    rerender();
  } }, 'Ask the browser to protect storage')));
  sec.appendChild(p(isIOS()
    ? 'iPhone: Safari can delete a website’s data after 7 days without use unless the app is on the Home Screen. Add it, and keep backups.'
    : 'Browsers may clear site data when space runs low. A backup every couple of weeks makes that harmless.', 'explain'));
  if (isIOS() && !isStandalone() && s.iosBannerDismissed) {
    sec.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => saveSettings({ iosBannerDismissed: false }) }, 'Show the Add to Home Screen steps again')));
  }
  return sec;
}

/* ---------- Demo data ---------- */

function demoSection(s) {
  const empty = state.days.size === 0;
  const sec = h('div', { class: 'group' }, h('h2', null, 'Demo data'),
    p(`Loads six months of made-up diary entries to show what the screens look like. One planted trigger ("${DEMO_TRIGGER}", acting two days later) and one decoy ("${DEMO_DECOY}") are hidden in it. Only available while the diary is empty, so it can never overwrite real entries.`, 'explain'));
  sec.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', disabled: !empty, onclick: async () => {
    const ok = await confirmDialog({ title: 'Load demo data?', body: 'Made-up entries for the last six months will be written into the empty diary. Use "Delete everything" below to clear them before you start logging for real.', confirmLabel: 'Load demo data' });
    if (!ok) return;
    const { days, settings } = generateDemo({ endDate: addDays(todayISO(), -1) });
    settings.lastBackupAt = nowWithOffset();
    settings.iosBannerDismissed = state.settings.iosBannerDismissed;
    settings.persisted = state.settings.persisted;
    settings.theme = state.settings.theme;
    settings.firstRunAt = state.settings.firstRunAt;
    await replaceAll(days, settings);
    toast('Demo data loaded – see Triggers');
    location.hash = '#/triggers';
  } }, empty ? 'Load demo data' : 'Load demo data (diary is not empty)')));
  return sec;
}

/* ---------- Delete everything ---------- */

function dangerSection() {
  return h('div', { class: 'group' }, h('h2', null, 'Delete everything'),
    p('Removes every entry and setting from this device. Export a backup first if there is any chance you want it back.', 'explain'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      const ok = await confirmDialog({ title: 'Delete the whole diary?', body: `${plural(state.days.size, 'day')} and all settings will be erased from this device. This cannot be undone.`, confirmLabel: 'Delete everything', danger: true, typeToConfirm: 'DELETE' });
      if (!ok) return;
      await eraseAll();
      toast('Diary deleted');
      location.hash = '#/today';
    } }, 'Delete everything…')));
}

/* ---------- About ---------- */

function aboutSection() {
  return h('div', { class: 'group' }, h('h2', null, 'About'),
    p('Migraine Diary keeps everything on this device. After loading it makes no network requests except the weather fetch you trigger yourself, has no account and sends nothing else anywhere.', 'explain'),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/help' }, 'How the analysis works')));
}

export { formatPct };
