// Unit tests for the analysis engine. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, fisherExact, classifyOnsets, exposureValue, exposureDefinitions, GATES, medicationSummary } from '../js/analysis.js';
import { generateDemo, DEMO_TRIGGER, DEMO_DECOY, DEMO_SEED } from '../js/demo.js';
import { defaultSettings, normaliseDay, FIELD_BY_KEY } from '../js/fields.js';
import { addDays } from '../js/dates.js';

const T = { today: '2026-09-03' };

test('Fisher exact test matches known values', () => {
  // Classic tea-tasting table [[3,1],[1,3]]: two-sided p = 0.4857
  assert.ok(Math.abs(fisherExact(3, 1, 1, 3) - 0.4857) < 0.001);
  // Perfect separation of 20: p = 2 / C(20,10) = 1.0825e-5
  assert.ok(Math.abs(fisherExact(10, 0, 0, 10) - 1.0825e-5) < 1e-8);
  // No association: p = 1
  assert.equal(fisherExact(5, 5, 5, 5), 1);
  // Empty margins are not an error
  assert.equal(fisherExact(0, 0, 3, 4), 1);
  // [[8,2],[1,5]] two-sided p = 0.0350 (known from R fisher.test)
  assert.ok(Math.abs(fisherExact(8, 2, 1, 5) - 0.0350) < 0.001);
});

test('demo data: planted lag-2 trigger ranks first, strongest two days later, decoy shows no signal', () => {
  const { days, settings } = generateDemo({ days: 180, seed: DEMO_SEED });
  const report = analyse(days, settings, T);
  assert.ok(report.gates.ok, 'gates should pass with 180 days: ' + report.gates.messages.join(' '));
  const first = report.exposures[0];
  assert.equal(first.label, DEMO_TRIGGER, 'planted trigger should rank first');
  assert.equal(first.verdict, 'clear');
  assert.equal(first.strongestKey, 'lag2', 'lag 2 should be strongest');
  assert.match(first.headline, /strongest two days later/);
  assert.match(first.headline, /Clear signal/);
  const decoy = report.exposures.find(e => e.label === DEMO_DECOY);
  assert.ok(decoy, 'decoy present');
  assert.equal(decoy.verdict, 'none', `decoy should show no signal, got ${decoy.verdict}: ${decoy.headline}`);
  assert.match(decoy.headline, /No signal so far/);
});

test('demo data is robust across seeds', () => {
  // A planted trigger with P(attack | exposed two days earlier) = 0.5 against a 0.12 baseline,
  // over six months with about four attacks a month, is found most of the time but not always:
  // this is the small-numbers problem the brief warns about, and the test allows for it.
  let wins = 0, decoyClear = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const seed of seeds) {
    const { days, settings } = generateDemo({ days: 180, seed });
    const report = analyse(days, settings, T);
    const first = report.exposures[0];
    if (first.label === DEMO_TRIGGER && first.strongestKey === 'lag2' && first.verdict === 'clear') wins++;
    const decoy = report.exposures.find(e => e.label === DEMO_DECOY);
    if (decoy.verdict === 'clear') decoyClear++;
  }
  assert.ok(wins >= 7, `trigger found first, clear, at lag 2 in ${wins} of ${seeds.length} seeds`);
  assert.ok(decoyClear <= 1, `decoy was "clear" by chance in ${decoyClear} seeds`);
});

test('20 days of data: every exposure shows the not-enough-data message with the count needed', () => {
  const { days, settings } = generateDemo({ days: 20, seed: 7, missingRate: 0 });
  assert.equal(days.length, 20);
  const report = analyse(days, settings, T);
  assert.equal(report.gates.ok, false);
  assert.equal(report.gates.daysNeeded, 8);
  assert.match(report.gates.messages[0], /8 more logged days needed/);
  assert.ok(report.exposures.length > 5);
  for (const e of report.exposures) {
    assert.equal(e.verdict, 'insufficient');
    assert.match(e.headline, /Not enough data yet – 8 more logged days needed/);
  }
});

test('per-exposure sufficiency: a rarely-ticked custom box reports how many more exposure days are needed', () => {
  const { days, settings } = generateDemo({ days: 90, seed: 3 });
  settings.customExposures.push({ name: 'durian', group: 'food', hidden: false });
  // tick durian on only two days
  days[10].exposures.custom.durian = true;
  days[40].exposures.custom.durian = true;
  const report = analyse(days, settings, T);
  const d = report.exposures.find(e => e.label === 'durian');
  assert.equal(d.verdict, 'insufficient');
  assert.equal(d.needed.exposed, 3);
  assert.match(d.headline, /3 more exposure days needed/);
});

test('threshold conversion follows settings and treats unanswered as null', () => {
  const settings = defaultSettings();
  const defs = exposureDefinitions(settings);
  const sleep = defs.find(d => d.key === 'sleepHours');
  const caffeine = defs.find(d => d.key === 'caffeineServings');
  const neck = defs.find(d => d.key === 'neckLoad');
  const day = normaliseDay({ date: '2026-01-01', exposures: { sleepHours: 5.5, caffeineServings: 2 } });
  assert.equal(exposureValue(day, sleep), 1);         // under 6 h
  assert.equal(exposureValue(day, caffeine), 0);      // 2 < 3
  assert.equal(exposureValue(day, neck), 0);          // unticked on a logged day = no
  assert.equal(exposureValue(null, neck), null);      // unlogged day
  const day2 = normaliseDay({ date: '2026-01-02', exposures: {} });
  assert.equal(exposureValue(day2, sleep), null);     // not answered
  settings.thresholds.caffeineServings = 2;
  const defs2 = exposureDefinitions(settings);
  assert.equal(exposureValue(day, defs2.find(d => d.key === 'caffeineServings')), 1);
  assert.match(defs2.find(d => d.key === 'caffeineServings').label, /2\+/);
  // hidden built-ins and hidden customs are not analysed; custom "since" makes earlier days null
  settings.hiddenBuiltins = ['neckLoad'];
  settings.customExposures = [{ name: 'kimchi', group: 'food', hidden: false, since: '2026-01-02' }, { name: 'gone', group: 'food', hidden: true }];
  const defs3 = exposureDefinitions(settings);
  assert.ok(!defs3.find(d => d.key === 'neckLoad'));
  assert.ok(!defs3.find(d => d.label === 'gone'));
  const kimchi = defs3.find(d => d.label === 'kimchi');
  assert.equal(exposureValue(day, kimchi), null);
  assert.equal(exposureValue(day2, kimchi), 0);
});

test('onsets within 48 hours are folded into one episode', () => {
  const mk = (date, start) => normaliseDay({ date, attacks: [{ id: date, start, peakSeverity: 5 }] });
  const days = [mk('2026-03-01', '2026-03-01T08:00'), mk('2026-03-02', '2026-03-02T20:00'), mk('2026-03-05', '2026-03-05T09:00'),
    mk('2026-03-06', null), mk('2026-03-08', null)];
  const { primary, secondary } = classifyOnsets(days);
  assert.deepEqual([...primary], ['2026-03-01', '2026-03-05', '2026-03-08']);
  assert.deepEqual([...secondary], ['2026-03-02', '2026-03-06']);
});

test('lag 0 reverse causation: an exposure that coincides with early-warning signs is flagged and ranked lower', () => {
  // Build 120 days: attacks on every 6th day; "cravings box" ticked on attack days with prodrome logged.
  const settings = defaultSettings();
  settings.customExposures = [{ name: 'chocolate craving', group: 'food', hidden: false }, { name: 'late night', group: 'sleep', hidden: false }];
  const days = [];
  const start = '2026-01-01';
  for (let i = 0; i < 120; i++) {
    const date = addDays(start, i);
    const attack = i % 6 === 3;
    const day = normaliseDay({ date, exposures: { custom: { 'chocolate craving': attack, 'late night': i % 6 === 2 } }, prodrome: attack ? ['cravings', 'yawning'] : [] });
    if (attack) day.attacks.push({ id: `a${i}`, start: `${date}T09:00`, peakSeverity: 6 });
    days.push(day);
  }
  const report = analyse(days, settings, { today: addDays(start, 119) });
  const craving = report.exposures.find(e => e.label === 'chocolate craving');
  const late = report.exposures.find(e => e.label === 'late night');
  assert.equal(craving.strongestKey, 'lag0');
  assert.equal(craving.earlySymptom, true);
  assert.match(craving.headline, /early symptom/);
  assert.equal(late.strongestKey, 'lag1');
  assert.equal(late.verdict, 'clear');
  assert.ok(late.rank < craving.rank, 'lag-1 finding should rank above the flagged lag-0 finding');
});

test('exposure days that are attack days are excluded for lags 1-3', () => {
  const settings = defaultSettings();
  settings.customExposures = [{ name: 'painkiller-day box', group: 'food', hidden: false }];
  const days = [];
  const start = '2026-01-01';
  for (let i = 0; i < 100; i++) {
    const date = addDays(start, i);
    const attack = i % 5 === 0;
    const day = normaliseDay({ date, exposures: { custom: { 'painkiller-day box': attack } } });
    if (attack) day.attacks.push({ id: `a${i}`, start: `${date}T09:00`, peakSeverity: 6 });
    days.push(day);
  }
  const report = analyse(days, settings, { today: addDays(start, 99) });
  const e = report.exposures.find(x => x.label === 'painkiller-day box');
  // Lag 1: the only exposed days are attack days, all excluded -> nExp = 0 -> insufficient at that lag
  assert.equal(e.results.lag1.nExp, 0);
  assert.equal(e.results.lag1.sufficient, false);
  // Lag 0 keeps them, so the box "predicts" same-day attacks perfectly
  assert.equal(e.results.lag0.a, 20);
  assert.equal(e.results.lag0.b, 0);
});

test('unlogged days and ongoing-attack days are excluded, never treated as no', () => {
  const settings = defaultSettings();
  settings.customExposures = [{ name: 'x', group: 'food', hidden: false }];
  const days = [];
  const start = '2026-01-01';
  for (let i = 0; i < 60; i++) {
    const date = addDays(start, i);
    if (i % 4 === 1) continue;                           // unlogged
    const day = normaliseDay({ date, exposures: { custom: { x: i % 3 === 0 } } });
    if (i % 4 === 2) day.ongoingAttack = true;           // continuing attack, no onset
    days.push(day);
  }
  const report = analyse(days, settings, { today: addDays(start, 59) });
  const e = report.exposures.find(x => x.label === 'x');
  // Outcome days: only i%4 in {0,3} are valid (i%4==1 unlogged, i%4==2 ongoing). For lag 0 the exposure day must be valid too.
  const validOutcomes = e.results.lag0.nExp + e.results.lag0.nUnexp;
  assert.equal(validOutcomes, 30);
  assert.equal(report.validOutcomeDays, 30);
});

test('co-occurring exposures are reported for a clear finding', () => {
  const { days, settings } = generateDemo({ days: 180, seed: DEMO_SEED });
  // Make "red wine" co-occur with the planted trigger on 80% of trigger days
  for (const d of days) if (d.exposures.custom[DEMO_TRIGGER] && (Number(d.date.slice(8)) % 5) !== 0) d.exposures.custom['red wine'] = true;
  const report = analyse(days, settings, T);
  const trig = report.exposures.find(e => e.label === DEMO_TRIGGER);
  const wine = report.exposures.find(e => e.label === 'red wine');
  // Both now look guilty; each must name the other so the user does not over-read a single factor.
  assert.ok(['clear', 'possible'].includes(trig.verdict));
  assert.ok(['clear', 'possible'].includes(wine.verdict));
  const w = trig.cooccurring.find(c => c.label === 'red wine');
  assert.ok(w, 'red wine should appear as co-occurring with the trigger');
  assert.ok(w.share >= 0.7);
  assert.ok(wine.cooccurring.find(c => c.label === DEMO_TRIGGER), 'the trigger should appear as co-occurring with red wine');
});

test('medication overuse warning at the 10-day (triptan) and 15-day (simple) lines', () => {
  const settings = defaultSettings();
  const today = '2026-06-30';
  const mkDays = (n, med) => {
    const days = [];
    for (let i = 0; i < 40; i++) {
      const date = addDays(today, -i);
      const day = normaliseDay({ date });
      if (i < n) day.attacks.push({ id: `a${i}`, start: `${date}T09:00`, peakSeverity: 5, acuteMeds: [{ name: med, doses: 1 }] });
      days.push(day);
    }
    return days;
  };
  const dayMap = days => new Map(days.map(d => [d.date, d]));
  let d = mkDays(11, 'sumatriptan 50 mg');
  let m = medicationSummary(d, dayMap(d), settings, today);
  assert.equal(m.level, 'over');
  assert.match(m.text, /11 of the last 30 days/);
  assert.match(m.text, /raising with your GP/);
  d = mkDays(11, 'paracetamol 1 g');
  m = medicationSummary(d, dayMap(d), settings, today);
  assert.notEqual(m.level, 'over', 'simple painkiller on 11 days is under the 15-day line');
  d = mkDays(16, 'paracetamol 1 g');
  m = medicationSummary(d, dayMap(d), settings, today);
  assert.equal(m.level, 'over');
  d = mkDays(10, 'sumatriptan 50 mg');
  m = medicationSummary(d, dayMap(d), settings, today);
  assert.notEqual(m.level, 'over', '10 days is at the line, not above it');
  // Full report exposes the same summary
  const report = analyse(mkDays(12, 'sumatriptan 50 mg'), settings, { today });
  assert.equal(report.medication.level, 'over');
});

test('monthly summary carries the 2*sqrt(M) noise band and attack profile has medians', () => {
  const { days, settings } = generateDemo({ days: 180, seed: DEMO_SEED });
  const report = analyse(days, settings, T);
  assert.ok(report.monthly.length >= 6);
  for (const m of report.monthly) {
    const M = m.migraineDays;
    assert.ok(Math.abs(m.band[1] - (M + 2 * Math.sqrt(M))) < 1e-9);
    assert.ok(m.band[0] >= 0);
  }
  assert.ok(report.profile.count > 20);
  assert.ok(report.profile.medianSeverity >= 2 && report.profile.medianSeverity <= 10);
  assert.ok(report.profile.medianDurationHours > 0);
  assert.ok(report.profile.auraShare > 0 && report.profile.auraShare < 1);
  assert.ok(report.completeness.share30 > 0.8);
});

test('challenge summary compares attacks after challenge days with the baseline', () => {
  const { days, settings } = generateDemo({ days: 180, seed: DEMO_SEED });
  const dates = days.map(d => d.date);
  settings.challenges = [
    { id: 'c1', exposure: DEMO_TRIGGER, date: dates[20], cleanMorning: true },
    { id: 'c2', exposure: DEMO_TRIGGER, date: dates[40], cleanMorning: true },
    { id: 'c3', exposure: DEMO_TRIGGER, date: '2030-01-01', cleanMorning: true },
  ];
  const report = analyse(days, settings, T);
  const c = report.challenges.find(g => g.exposure === DEMO_TRIGGER);
  assert.ok(c);
  assert.equal(c.items.length, 3);
  assert.equal(c.items.find(i => i.id === 'c3').result, 'unlogged');
  assert.ok(c.done <= 2);
  assert.ok(c.baseline2day > 0 && c.baseline2day < 1);
});

test('empty diary produces a calm, valid report', () => {
  const report = analyse([], defaultSettings(), { today: '2026-09-03' });
  assert.equal(report.loggedDays, 0);
  assert.equal(report.gates.ok, false);
  assert.equal(report.gates.daysNeeded, GATES.minDays);
  assert.ok(report.exposures.every(e => e.verdict === 'insufficient'));
  assert.deepEqual(report.monthly, []);
  assert.equal(report.medication.level, 'ok');
});
