// Export / import tests. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, toCSV, parseImport, planMerge, mergeSettings, csvHeaders } from '../js/export.js';
import { generateDemo, DEMO_TRIGGER } from '../js/demo.js';
import { normaliseDay, defaultSettings, FIELDS } from '../js/fields.js';

function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

test('JSON export -> delete everything -> import gives identical data', () => {
  const { days, settings } = generateDemo({ days: 120, seed: 11 });
  const exported = buildExport(days, settings);
  const text = JSON.stringify(exported);
  const { days: back, settings: backSettings } = parseImport(text);
  // "delete everything": the merge target is empty
  const plan = planMerge(new Map(), back);
  assert.equal(plan.add.length, days.length);
  assert.equal(plan.update.length, 0);
  const sortedIn = [...days].map(normaliseDay).sort((a, b) => (a.date < b.date ? -1 : 1));
  assert.deepEqual(plan.write, sortedIn);
  const merged = mergeSettings(defaultSettings(), backSettings, { localEmpty: true });
  assert.deepEqual(merged.customExposures, settings.customExposures);
  assert.deepEqual(merged.thresholds, settings.thresholds);
  assert.deepEqual(merged.acuteMedNames, settings.acuteMedNames);
});

test('import merges by date and the newest updatedAt wins', () => {
  const a = normaliseDay({ date: '2026-05-01', updatedAt: '2026-05-01T20:00:00+10:00', note: 'old' });
  const b = normaliseDay({ date: '2026-05-02', updatedAt: '2026-05-02T20:00:00+10:00', note: 'local newer' });
  const existing = new Map([[a.date, a], [b.date, b]]);
  const incoming = [
    normaliseDay({ date: '2026-05-01', updatedAt: '2026-05-03T09:00:00+10:00', note: 'incoming newer' }),
    normaliseDay({ date: '2026-05-02', updatedAt: '2026-05-01T09:00:00+10:00', note: 'incoming older' }),
    normaliseDay({ date: '2026-05-03', updatedAt: '2026-05-03T09:00:00+10:00', note: 'new day' }),
  ];
  const plan = planMerge(existing, incoming);
  assert.equal(plan.add.length, 1);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.keep.length, 1);
  assert.equal(plan.update[0].note, 'incoming newer');
  assert.equal(plan.keep[0].note, 'local newer');
  assert.deepEqual(plan.write.map(d => d.date), ['2026-05-01', '2026-05-03']);
});

test('settings merge unions lists without losing local preferences', () => {
  const local = defaultSettings();
  local.theme = 'dark';
  local.customExposures = [{ name: 'kimchi', group: 'food', hidden: false }];
  local.acuteMedNames = ['naproxen 500 mg'];
  const incoming = defaultSettings();
  incoming.theme = 'light';
  incoming.customExposures = [{ name: 'kimchi', group: 'food', hidden: true }, { name: 'red wine', group: 'food', hidden: false }];
  incoming.challenges = [{ id: 'c1', exposure: 'red wine', date: '2026-01-05', cleanMorning: true }];
  const merged = mergeSettings(local, incoming);
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.customExposures.map(c => c.name), ['kimchi', 'red wine']);
  assert.equal(merged.customExposures[0].hidden, false);
  assert.ok(merged.acuteMedNames.includes('naproxen 500 mg') && merged.acuteMedNames.includes('sumatriptan 50 mg'));
  assert.equal(merged.challenges.length, 1);
});

test('rejects files that are not backups with a plain message', () => {
  assert.throws(() => parseImport('not json'), /not valid JSON/);
  assert.throws(() => parseImport('{"hello":1}'), /no list of days/);
  assert.throws(() => parseImport('{"app":"other","days":[]}'), /made by "other"/);
  assert.throws(() => parseImport('{"days":[{"date":"2026-13-40"}]}'), /valid date/);
  assert.equal(parseImport('[]').days.length, 0);
});

test('CSV has one row per day, readable headers, a column per exposure, and escapes notes', () => {
  const { days, settings } = generateDemo({ days: 30, seed: 5, missingRate: 0 });
  days[3].note = 'Late night, "wine", and\na long drive';
  days[3].exposures.custom[DEMO_TRIGGER] = true;
  const csv = toCSV(days, settings);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.replace('﻿', '').split('\r\n').filter(l => l.length);
  // the escaped note contains a newline, so count rows by parsing with a proper splitter
  const rows = [];
  let buf = '';
  for (const l of csv.replace('﻿', '').split('\r\n')) {
    buf = buf ? buf + '\n' + l : l;
    if ((buf.match(/"/g) || []).length % 2 === 0) { if (buf.length) rows.push(parseCsvLine(buf)); buf = ''; }
  }
  assert.equal(rows.length, 31, 'header + 30 days');
  const header = rows[0];
  assert.equal(header[0], 'Date');
  assert.ok(header.includes('Sleep (hours)'));
  assert.ok(header.includes('Caffeine'));
  assert.ok(header.includes(DEMO_TRIGGER));
  assert.ok(header.includes('Attack 1 peak severity'));
  assert.ok(header.includes('Note'));
  for (const r of rows.slice(1)) assert.equal(r.length, header.length, 'every row has every column');
  const noteCol = header.indexOf('Note');
  assert.equal(rows[4][noteCol], 'Late night, "wine", and\na long drive');
  const trigCol = header.indexOf(DEMO_TRIGGER);
  assert.equal(rows[4][trigCol], 'yes');
  assert.equal(rows[1][0], days[0].date);
  assert.equal(csvHeaders(days, settings).length, header.length);
  assert.ok(FIELDS.every(f => header.some(hh => hh.startsWith(f.label))));
  assert.ok(lines.length >= 31);
});
