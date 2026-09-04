// Export (JSON with full fidelity, CSV one row per day) and import with a
// merge by date where the newest updatedAt wins. The pure helpers at the top
// are unit-tested in Node; the browser-only parts (share/download, file read)
// are at the bottom.

import { FIELDS, DAY_FLAGS, normaliseDay, normaliseSettings } from './fields.js';
import { nowWithOffset, isValidISODate } from './dates.js';

export const EXPORT_APP = 'migraine-diary';
export const EXPORT_VERSION = 1;

/* ---------- Pure helpers ---------- */

export function buildExport(days, settings) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const s = { ...settings };
  delete s.id;
  return { app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: nowWithOffset(), settings: s, days: sorted };
}

function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** All custom exposure names: from settings plus any found in the days. */
export function customNames(days, settings) {
  const names = [];
  for (const c of (settings && settings.customExposures) || []) if (!names.includes(c.name)) names.push(c.name);
  for (const d of days) for (const n of Object.keys((d.exposures && d.exposures.custom) || {})) if (!names.includes(n)) names.push(n);
  return names;
}

export function csvHeaders(days, settings) {
  const cols = ['Date', 'Migraine day', 'Attacks started', 'Attack continued from previous day', 'Early-warning signs'];
  for (const f of FIELDS) cols.push(f.unit ? `${f.label} (${f.unit === 'h' ? 'hours' : f.unit === 'L' ? 'litres' : f.unit === 'min' ? 'minutes' : f.unit})` : f.label);
  for (const n of customNames(days, settings)) cols.push(n);
  for (const fl of DAY_FLAGS) cols.push(fl.label);
  cols.push('Attack 1 start', 'Attack 1 end', 'Attack 1 still going', 'Attack 1 peak severity', 'Attack 1 aura', 'Attack 1 side',
    'Attack 1 nausea', 'Attack 1 light sensitivity', 'Attack 1 sound sensitivity', 'Attack 1 neck pain', 'Attack 1 medicines',
    'Attack 1 worked within 2 h', 'Attack 1 lost the day', 'Note', 'Last edited');
  return cols;
}

/** Wide CSV, one row per logged day. CRLF line endings and a BOM so Excel opens it as UTF-8. */
export function toCSV(days, settings) {
  const sorted = [...days].map(normaliseDay).sort((a, b) => (a.date < b.date ? -1 : 1));
  const customs = customNames(sorted, settings);
  const rows = [csvHeaders(sorted, settings)];
  for (const d of sorted) {
    const ex = d.exposures || {};
    const a = d.attacks[0] || null;
    const row = [
      d.date,
      d.attacks.length > 0 || d.ongoingAttack,
      d.attacks.length,
      d.ongoingAttack,
      (d.prodrome || []).join('; '),
    ];
    for (const f of FIELDS) row.push(ex[f.key] == null ? null : ex[f.key]);
    for (const n of customs) row.push(ex.custom && ex.custom[n] != null ? !!ex.custom[n] : null);
    for (const fl of DAY_FLAGS) row.push(!!d[fl.key]);
    if (a) {
      row.push(a.start, a.end, a.ongoing, a.peakSeverity, a.aura, a.side, a.nausea, a.lightSensitivity, a.soundSensitivity, a.neckPain,
        a.acuteMeds.map(m => `${m.name} x${m.doses}`).join('; '), a.workedWithin2h, a.lostDay);
    } else {
      for (let i = 0; i < 13; i++) row.push(null);
    }
    row.push(d.note || '', d.updatedAt || '');
    rows.push(row);
  }
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Parse and validate a JSON backup. Throws an Error with a plain-English message. */
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (_) { throw new Error('That file is not a Migraine Diary backup (it is not valid JSON).'); }
  if (Array.isArray(data)) data = { days: data };
  if (!data || typeof data !== 'object' || !Array.isArray(data.days)) throw new Error('That file is not a Migraine Diary backup (no list of days inside).');
  if (data.app && data.app !== EXPORT_APP) throw new Error(`That file was made by "${data.app}", not by Migraine Diary.`);
  const days = [];
  for (const raw of data.days) {
    if (!raw || typeof raw !== 'object' || !isValidISODate(raw.date)) throw new Error('The backup contains a day without a valid date, so it was not imported.');
    days.push(normaliseDay(raw));
  }
  const settings = data.settings ? normaliseSettings(data.settings) : null;
  return { days, settings, exportedAt: data.exportedAt || null, version: data.version || null };
}

/**
 * Merge by date, newest updatedAt wins. existing: Map or array of DayRecords.
 * Returns { add, update, keep, write } where write is the list of days to store.
 */
export function planMerge(existing, incoming) {
  const map = existing instanceof Map ? existing : new Map(existing.map(d => [d.date, d]));
  const add = [], update = [], keep = [], write = [];
  for (const day of incoming) {
    const cur = map.get(day.date);
    if (!cur) { add.push(day); write.push(day); continue; }
    const a = cur.updatedAt || '', b = day.updatedAt || '';
    if (b > a) { update.push(day); write.push(day); }
    else if (b === a && JSON.stringify(cur) !== JSON.stringify(day) && !a) { update.push(day); write.push(day); }
    else keep.push(cur);
  }
  return { add, update, keep, write };
}

/** Settings merge: keep local preferences, union the lists so imported data is never orphaned. */
export function mergeSettings(local, incoming, { localEmpty = false } = {}) {
  if (!incoming) return normaliseSettings(local);
  if (localEmpty) {
    const s = normaliseSettings(incoming);
    s.iosBannerDismissed = !!(local && local.iosBannerDismissed);
    s.persisted = local ? local.persisted : null;
    s.firstRunAt = (local && local.firstRunAt) || s.firstRunAt;
    return s;
  }
  const s = normaliseSettings(local);
  const names = new Set(s.customExposures.map(c => c.name));
  for (const c of incoming.customExposures || []) if (!names.has(c.name)) { s.customExposures.push(c); names.add(c.name); }
  for (const m of incoming.acuteMedNames || []) if (!s.acuteMedNames.includes(m)) s.acuteMedNames.push(m);
  s.acuteMedClasses = { ...(incoming.acuteMedClasses || {}), ...s.acuteMedClasses };
  const ids = new Set(s.challenges.map(c => c.id));
  for (const c of incoming.challenges || []) if (!ids.has(c.id)) s.challenges.push(c);
  return s;
}

/* ---------- Browser side ---------- */

function stamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Share via the Web Share API where files are supported, otherwise download. Resolves true if the file left the app. */
export async function shareOrDownload(blob, filename, title) {
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: blob.type }) : null;
  if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

/** Export the whole diary as JSON (re-importable) or CSV (spreadsheet). Marks lastBackupAt on a JSON export. */
export async function exportBackup(kind = 'json') {
  const { state, allDays, saveSettings } = await import('./state.js');
  const { toast } = await import('./ui.js');
  const days = allDays();
  let ok;
  if (kind === 'csv') {
    const blob = new Blob([toCSV(days, state.settings)], { type: 'text/csv;charset=utf-8' });
    ok = await shareOrDownload(blob, `migraine-diary-${stamp()}.csv`, 'Migraine Diary spreadsheet');
    if (ok) toast('Spreadsheet exported');
  } else {
    const blob = new Blob([JSON.stringify(buildExport(days, state.settings), null, 1)], { type: 'application/json' });
    ok = await shareOrDownload(blob, `migraine-diary-backup-${stamp()}.json`, 'Migraine Diary backup');
    if (ok) {
      await saveSettings({ lastBackupAt: nowWithOffset() });
      toast('Backup exported');
    }
  }
  return ok;
}

/** Read a File and return the parsed import plus the merge plan against the current diary. */
export async function prepareImport(file) {
  const { state } = await import('./state.js');
  const text = await file.text();
  const parsed = parseImport(text);
  const plan = planMerge(state.days, parsed.days);
  return { parsed, plan };
}

/** Commit a prepared import. */
export async function commitImport({ parsed, plan }) {
  const { state, mergeDays } = await import('./state.js');
  const settings = mergeSettings(state.settings, parsed.settings, { localEmpty: state.days.size === 0 });
  await mergeDays(plan.write, settings);
}
