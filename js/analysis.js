// The analysis engine. Pure: takes DayRecords and settings, returns a report.
// No DOM access, so it runs under `node --test` as well as in the browser.
//
// Vocabulary (see the brief, section 7):
//   A(d)  = 1 if an attack STARTED on day d (a "primary" onset: not within 48 h
//           of an earlier onset), 0 if the day was logged with no attack and no
//           ongoing attack, null otherwise (unlogged, ongoing-only, or an onset
//           within 48 h of a previous one, which is folded into that episode).
//   X(d)  = 1 if the exposure was present on day d (after thresholds), 0 if it
//           was answered "no/none", null if not answered.
//   Lag L = exposure on d, outcome on d+L, for L in 0..3.
//   Windows: exposure on any of the previous 2 (or 3) days, outcome on d.

import { FIELDS, DERIVED, isMigraineDay, acuteMedDay, normaliseDay } from './fields.js';
import { addDays, diffDays, monthKey, localMinuteToMs, hoursBetween, dateRange, daysInMonth } from './dates.js';

export const LAGS = [0, 1, 2, 3];
export const WINDOWS = [{ key: 'prev48', days: 2 }, { key: 'prev72', days: 3 }];
export const GATES = { minDays: 28, minExposed: 5, minUnexposed: 5, minOnsets: 5 };
export const P_CLEAR = 0.01;
export const P_POSSIBLE = 0.10;

export const LAG_WORDS = {
  lag0: 'the same day', lag1: 'one day later', lag2: 'two days later', lag3: 'three days later',
  prev48: 'when present in the previous 48 hours', prev72: 'when present in the previous 72 hours',
};
export const LAG_SHORT = { lag0: 'Same day', lag1: '1 day later', lag2: '2 days later', lag3: '3 days later', prev48: 'Previous 48 h', prev72: 'Previous 72 h' };

/* ---------- Fisher exact test ---------- */

const logFactCache = [0];
function logFact(n) {
  while (logFactCache.length <= n) {
    const k = logFactCache.length;
    logFactCache.push(logFactCache[k - 1] + Math.log(k));
  }
  return logFactCache[n];
}

function logHyper(a, b, c, d) {
  const n = a + b + c + d;
  return logFact(a + b) + logFact(c + d) + logFact(a + c) + logFact(b + d)
    - logFact(n) - logFact(a) - logFact(b) - logFact(c) - logFact(d);
}

/**
 * Two-sided Fisher exact test for the 2x2 table [[a, b], [c, d]]:
 * a = exposed & attack, b = exposed & no attack, c = unexposed & attack, d = unexposed & no attack.
 * Sums the probabilities of all tables with the same margins that are no more likely than the observed one.
 */
export function fisherExact(a, b, c, d) {
  const r1 = a + b, c1 = a + c, n = a + b + c + d;
  if (n === 0 || r1 === 0 || c1 === 0 || r1 === n || c1 === n) return 1;
  const pObs = logHyper(a, b, c, d);
  const lo = Math.max(0, r1 + c1 - n), hi = Math.min(r1, c1);
  let total = 0;
  for (let x = lo; x <= hi; x++) {
    const lp = logHyper(x, r1 - x, c1 - x, n - r1 - c1 + x);
    if (lp <= pObs + 1e-9) total += Math.exp(lp);
  }
  return Math.min(1, total);
}

/* ---------- Exposure definitions and binarisation ---------- */

function applyThreshold(op, value, t) {
  switch (op) {
    case '<': return value < t ? 1 : 0;
    case '<=': return value <= t ? 1 : 0;
    case '>': return value > t ? 1 : 0;
    case '>=': return value >= t ? 1 : 0;
    default: return value ? 1 : 0;
  }
}

/** The list of yes/no exposures the engine tests, given the settings. */
export function exposureDefinitions(settings) {
  const hidden = new Set(settings.hiddenBuiltins || []);
  const defs = [];
  for (const f of FIELDS) {
    if (f.noAnalysis || hidden.has(f.key)) continue;
    const t = settings.thresholds && settings.thresholds[f.key] != null ? settings.thresholds[f.key] : (f.threshold ? f.threshold.default : null);
    defs.push({ key: f.key, label: f.analysisLabel ? f.analysisLabel(t) : f.label, kind: 'builtin', field: f, threshold: t, group: f.group });
  }
  for (const d of DERIVED) {
    const parts = d.of.filter(k => !hidden.has(k)).map(k => FIELDS.find(f => f.key === k)).filter(Boolean);
    if (parts.length < 2) continue;      // a composite of one box is just that box
    defs.push({ key: d.key, label: d.label, kind: 'derived', parts, group: d.group });
  }
  for (const c of settings.customExposures || []) {
    if (c.hidden) continue;
    defs.push({ key: `custom:${c.name}`, label: c.name, kind: 'custom', name: c.name, since: c.since || null, group: c.group || 'food' });
  }
  return defs;
}

/** 1 / 0 / null for one exposure on one day. */
export function exposureValue(day, def) {
  if (!day) return null;
  const ex = day.exposures || {};
  if (def.kind === 'derived') {
    return def.parts.some(f => ex[f.key]) ? 1 : 0;
  }
  if (def.kind === 'custom') {
    if (def.since && day.date < def.since) return null;
    const v = ex.custom ? ex.custom[def.name] : undefined;
    if (v == null) return 0;          // an unticked box on a logged day means "no"
    return v ? 1 : 0;
  }
  const f = def.field;
  const v = ex[f.key];
  if (f.type === 'bool') return v == null ? 0 : (v ? 1 : 0);
  if (v == null) return null;
  if (f.threshold) return applyThreshold(f.threshold.op, Number(v), def.threshold);
  return v ? 1 : 0;
}

/* ---------- Outcomes ---------- */

function attackStartMs(day) {
  const starts = day.attacks.map(a => localMinuteToMs(a.start)).filter(x => x != null);
  if (starts.length) return Math.min(...starts);
  return localMinuteToMs(`${day.date}T12:00`);
}

/**
 * Classify onset days into primary and secondary (within 48 h of the previous onset).
 * Returns { primary: Set, secondary: Set }.
 */
export function classifyOnsets(dayList) {
  const primary = new Set(), secondary = new Set();
  let lastMs = null;
  for (const day of dayList) {
    if (!day.attacks.length) continue;
    const ms = attackStartMs(day);
    if (lastMs != null && (ms - lastMs) / 3600000 < 48) secondary.add(day.date);
    else primary.add(day.date);
    lastMs = ms;
  }
  return { primary, secondary };
}

/* ---------- Main entry ---------- */

/**
 * analyse(days, settings, { today }) -> report. `days` is an array of DayRecords in any order.
 */
export function analyse(daysInput, settings, { today = null } = {}) {
  const dayList = [...daysInput].filter(d => d && d.date).map(normaliseDay).sort((a, b) => (a.date < b.date ? -1 : 1));
  const dayMap = new Map(dayList.map(d => [d.date, d]));
  const loggedDays = dayList.length;
  const firstDate = loggedDays ? dayList[0].date : null;
  const lastDate = loggedDays ? dayList[loggedDays - 1].date : null;
  today = today || lastDate;

  const { primary, secondary } = classifyOnsets(dayList);
  const totalOnsetDays = dayList.filter(d => d.attacks.length).length;
  const totalAttacks = dayList.reduce((n, d) => n + d.attacks.length, 0);

  const outcome = date => {
    const day = dayMap.get(date);
    if (!day) return null;
    if (primary.has(date)) return 1;
    if (secondary.has(date)) return null;
    if (day.ongoingAttack) return null;
    return 0;
  };
  const isAttackDay = date => { const d = dayMap.get(date); return !!d && isMigraineDay(d); };

  let validOutcomeDays = 0, validOnsets = 0;
  for (const d of dayList) { const o = outcome(d.date); if (o != null) { validOutcomeDays++; if (o) validOnsets++; } }
  const baselineRate = validOutcomeDays ? validOnsets / validOutcomeDays : null;

  const gates = {
    enoughDays: loggedDays >= GATES.minDays,
    enoughOnsets: primary.size >= GATES.minOnsets,
    daysNeeded: Math.max(0, GATES.minDays - loggedDays),
    onsetsNeeded: Math.max(0, GATES.minOnsets - primary.size),
    messages: [],
  };
  if (!gates.enoughDays) gates.messages.push(`Not enough data yet – ${gates.daysNeeded} more logged ${gates.daysNeeded === 1 ? 'day' : 'days'} needed (the analysis starts at ${GATES.minDays}).`);
  if (!gates.enoughOnsets) gates.messages.push(`Only ${primary.size} ${primary.size === 1 ? 'attack' : 'attacks'} logged so far; the analysis needs at least ${GATES.minOnsets}.`);
  gates.ok = gates.enoughDays && gates.enoughOnsets;

  const defs = exposureDefinitions(settings);
  const dates = dayList.map(d => d.date);
  const xCache = new Map();
  const X = (def, date) => {
    const k = def.key + '|' + date;
    if (xCache.has(k)) return xCache.get(k);
    const v = exposureValue(dayMap.get(date), def);
    xCache.set(k, v);
    return v;
  };

  const exposures = defs.map(def => analyseExposure(def, { dates, dayMap, X, outcome, isAttackDay, gates, baselineRate }));

  // Co-occurrence for clear findings, hormonal notes.
  const hormonal = hormonalSummary(dayList, outcome);
  for (const e of exposures) {
    if (e.verdict === 'clear' || e.verdict === 'possible') {
      e.cooccurring = cooccurrence(e, exposures, dates, X);
      e.hormonalNote = hormonalNoteFor(e, dayMap, hormonal);
    } else {
      e.cooccurring = [];
      e.hormonalNote = null;
    }
  }

  rankExposures(exposures);

  const suggestions = exposures.filter(e => (e.verdict === 'clear' || e.verdict === 'possible') && e.direction === 'higher').slice(0, 2);

  return {
    generatedFor: today,
    loggedDays, firstDate, lastDate,
    totalAttacks, totalOnsetDays, primaryOnsets: primary.size, secondaryOnsets: secondary.size,
    validOutcomeDays, baselineRate,
    gates,
    exposures,
    suggestions,
    challenges: challengeSummary(settings.challenges || [], dayMap, dayList, baselineRate),
    monthly: monthlySummary(dayList, today),
    medication: medicationSummary(dayList, dayMap, settings, today),
    profile: attackProfile(dayList),
    completeness: completeness(dayMap, today),
    hormonal,
  };
}

/* ---------- Per exposure ---------- */

function analyseExposure(def, ctx) {
  const { dates, dayMap, X, outcome, isAttackDay, gates, baselineRate } = ctx;
  const results = {};

  for (const lag of LAGS) {
    const r = { key: `lag${lag}`, lag, a: 0, b: 0, c: 0, d: 0, exposedAttackDates: [] };
    for (const date of dates) {
      const x = X(def, date);
      if (x == null) continue;
      if (lag > 0 && isAttackDay(date)) continue;         // behaviour changes while unwell
      const out = outcome(addDays(date, lag));
      if (out == null) continue;
      if (x) { if (out) { r.a++; r.exposedAttackDates.push(date); } else r.b++; }
      else if (out) r.c++; else r.d++;
    }
    finishResult(r, gates);
    results[r.key] = r;
  }

  for (const w of WINDOWS) {
    const r = { key: w.key, lag: null, windowDays: w.days, a: 0, b: 0, c: 0, d: 0, exposedAttackDates: [] };
    for (const date of dates) {
      const out = outcome(date);
      if (out == null) continue;
      let any = false, allAnswered = true, contaminated = false;
      for (let i = 1; i <= w.days; i++) {
        const prev = addDays(date, -i);
        if (isAttackDay(prev)) contaminated = true;
        const x = X(def, prev);
        if (x == null) allAnswered = false; else if (x) any = true;
      }
      if (contaminated) continue;
      const xv = any ? 1 : (allAnswered ? 0 : null);
      if (xv == null) continue;
      if (xv) { if (out) { r.a++; r.exposedAttackDates.push(date); } else r.b++; }
      else if (out) r.c++; else r.d++;
    }
    finishResult(r, gates);
    results[r.key] = r;
  }

  // Reverse causation on lag 0: were early-warning signs logged on most exposed-and-attack days?
  const lag0 = results.lag0;
  let earlySymptom = false, earlySymptomShare = null;
  if (lag0.a > 0) {
    const withProdrome = lag0.exposedAttackDates.filter(date => { const d = dayMap.get(date); return d && d.prodrome && d.prodrome.length > 0; }).length;
    earlySymptomShare = withProdrome / lag0.a;
    earlySymptom = earlySymptomShare >= 0.5;
  }
  lag0.earlySymptom = earlySymptom;

  // Pick the strongest result: lowest p among sufficient results with more attacks after exposure; lags before windows on ties.
  const ordered = [...LAGS.map(l => results[`lag${l}`]), ...WINDOWS.map(w => results[w.key])];
  let strongest = null;
  for (const r of ordered) {
    if (!r.sufficient) continue;
    if (!strongest || r.p < strongest.p - 1e-12 || (Math.abs(r.p - strongest.p) <= 1e-12 && r.lift > strongest.lift)) strongest = r;
  }
  const anySufficient = ordered.some(r => r.sufficient);

  let verdict, direction = null, needed = null;
  if (!gates.ok) {
    verdict = 'insufficient';
    needed = { message: gates.messages[0] };
  } else if (!anySufficient) {
    verdict = 'insufficient';
    // Count what is missing at the single lags only: a window counts each exposure two or three times, which would understate the need.
    const lagsOnly = LAGS.map(l => results[`lag${l}`]);
    const best = lagsOnly.reduce((m, r) => (r.needExposed + r.needUnexposed < m.needExposed + m.needUnexposed ? r : m), lagsOnly[0]);
    needed = { exposed: best.needExposed, unexposed: best.needUnexposed, message: neededMessage(best) };
  } else {
    // Strongest "higher" result decides; if none is higher, look at "lower" ones.
    const higher = ordered.filter(r => r.sufficient && r.riskDiff > 0);
    const lower = ordered.filter(r => r.sufficient && r.riskDiff < 0);
    const bestHigher = higher.length ? higher.reduce((m, r) => (r.p < m.p ? r : m)) : null;
    const bestLower = lower.length ? lower.reduce((m, r) => (r.p < m.p ? r : m)) : null;
    if (bestHigher && bestHigher.p < P_POSSIBLE && (!bestLower || bestHigher.p <= bestLower.p)) {
      strongest = bestHigher;
      direction = 'higher';
      verdict = bestHigher.p < P_CLEAR ? 'clear' : 'possible';
    } else if (bestLower && bestLower.p < P_POSSIBLE) {
      strongest = bestLower;
      direction = 'lower';
      verdict = 'lower';
    } else {
      verdict = 'none';
      direction = strongest ? (strongest.riskDiff > 0 ? 'higher' : 'lower') : null;
    }
  }

  const exposedTotal = Math.max(...ordered.map(r => r.a + r.b));
  const e = {
    def,
    key: def.key, label: def.label, kind: def.kind, group: def.group,
    results, strongest, strongestKey: strongest ? strongest.key : null,
    verdict, direction, needed,
    earlySymptom: !!(strongest && strongest.key === 'lag0' && earlySymptom),
    earlySymptomShare,
    exposedTotal,
    baselineRate,
  };
  e.headline = headline(e);
  return e;
}

function finishResult(r, gates) {
  r.nExp = r.a + r.b;
  r.nUnexp = r.c + r.d;
  r.rateExp = r.nExp ? r.a / r.nExp : null;
  r.rateUnexp = r.nUnexp ? r.c / r.nUnexp : null;
  r.riskDiff = (r.rateExp != null && r.rateUnexp != null) ? r.rateExp - r.rateUnexp : null;
  r.lift = (r.rateExp != null && r.rateUnexp) ? r.rateExp / r.rateUnexp : (r.rateExp > 0 ? Infinity : null);
  r.p = fisherExact(r.a, r.b, r.c, r.d);
  r.needExposed = Math.max(0, GATES.minExposed - r.nExp);
  r.needUnexposed = Math.max(0, GATES.minUnexposed - r.nUnexp);
  r.sufficient = gates.ok && r.needExposed === 0 && r.needUnexposed === 0;
  r.label = LAG_SHORT[r.key];
  return r;
}

function neededMessage(r) {
  if (r.needExposed > 0) return `Not enough data yet – ${r.needExposed} more exposure ${r.needExposed === 1 ? 'day' : 'days'} needed.`;
  return `Not enough data yet – ${r.needUnexposed} more ${r.needUnexposed === 1 ? 'day' : 'days'} without it needed.`;
}

function pct(x) { return x == null ? '–' : `${Math.round(x * 100)}%`; }

function headline(e) {
  if (e.verdict === 'insufficient') return `${e.label}: ${e.needed.message}`;
  const s = e.strongest;
  const base = `${e.label}: attacks followed on ${s.a} of ${s.nExp} exposed days (${pct(s.rateExp)}) versus ${s.c} of ${s.nUnexp} other days (${pct(s.rateUnexp)}), strongest ${LAG_WORDS[s.key]}.`;
  let tail;
  if (e.verdict === 'clear') tail = s.nExp < 20 ? ` Clear signal, but based on ${s.nExp} exposures – keep logging.` : ' Clear signal.';
  else if (e.verdict === 'possible') tail = ' Possible signal – could still be chance; keep logging.';
  else if (e.verdict === 'lower') tail = ' Fewer attacks than usual followed – possibly protective, possibly chance.';
  else tail = ' No signal so far.';
  if (e.earlySymptom) tail += ' May be an early symptom, not a trigger: early-warning signs were logged on most of these days.';
  return base + tail;
}

const VERDICT_SCORE = { clear: 5, possible: 4, lower: 3, none: 2, insufficient: 1 };

function rankExposures(exposures) {
  const score = e => {
    let s = VERDICT_SCORE[e.verdict] || 0;
    if (e.earlySymptom && (e.verdict === 'clear' || e.verdict === 'possible')) s -= 0.5;   // rank below lag 1-3 findings
    return s;
  };
  exposures.sort((x, y) => {
    const d = score(y) - score(x);
    if (d !== 0) return d;
    const px = x.strongest ? x.strongest.p : 1, py = y.strongest ? y.strongest.p : 1;
    if (px !== py) return px - py;
    return (y.exposedTotal || 0) - (x.exposedTotal || 0);
  });
  exposures.forEach((e, i) => { e.rank = i + 1; });
}

/* ---------- Confound helpers ---------- */

function cooccurrence(e, exposures, dates, X) {
  const exposedDates = dates.filter(date => X(e.def, date) === 1);
  if (exposedDates.length < 3) return [];
  const out = [];
  for (const other of exposures) {
    if (other.key === e.key) continue;
    const def = other.def;
    let yes = 0, answered = 0;
    for (const date of exposedDates) {
      const v = X(def, date);
      if (v == null) continue;
      answered++;
      if (v) yes++;
    }
    if (answered >= 3 && yes / answered >= 0.3) out.push({ key: other.key, label: other.label, share: yes / answered, n: answered, yes });
  }
  out.sort((a, b) => b.share - a.share);
  return out.slice(0, 3);
}

/* ---------- Hormonal cycle ---------- */

function phaseOf(day) {
  if (!day) return null;
  const ex = day.exposures || {};
  if (ex.hormonal === 'period') return 'period';
  if (ex.hormonal === 'ovulation') return 'ovulation';
  if (ex.cycleDay != null) {
    const c = Number(ex.cycleDay);
    if (c >= 1 && c <= 5) return 'period';
    if (c >= 12 && c <= 16) return 'ovulation';
    return 'other';
  }
  if (ex.hormonal === 'none') return 'other';
  return null;
}

function hormonalSummary(dayList, outcome) {
  const phases = { period: { days: 0, onsets: 0 }, ovulation: { days: 0, onsets: 0 }, other: { days: 0, onsets: 0 } };
  let any = false;
  for (const day of dayList) {
    const ph = phaseOf(day);
    if (!ph) continue;
    any = true;
    const o = outcome(day.date);
    if (o == null) continue;
    phases[ph].days++;
    if (o) phases[ph].onsets++;
  }
  if (!any) return null;
  for (const k of Object.keys(phases)) phases[k].rate = phases[k].days ? phases[k].onsets / phases[k].days : null;
  return phases;
}

function hormonalNoteFor(e, dayMap, hormonal) {
  if (!hormonal || !e.strongest) return null;
  const counts = { period: 0, ovulation: 0, other: 0 };
  let total = 0;
  for (const date of e.strongest.exposedAttackDates) {
    const outcomeDate = e.strongest.lag != null ? addDays(date, e.strongest.lag) : date;
    const ph = phaseOf(dayMap.get(outcomeDate));
    if (!ph) continue;
    counts[ph]++; total++;
  }
  if (total < 3) return null;
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (n / total >= 0.7 && top !== 'other') {
    return `${Math.round(n / total * 100)}% of these attacks fell around your ${top === 'period' ? 'period' : 'ovulation'}, which may explain the pattern better than the exposure does.`;
  }
  return null;
}

/* ---------- Whole-diary summaries ---------- */

export function monthlySummary(dayList, today) {
  if (!dayList.length) return [];
  const byMonth = new Map();
  for (const day of dayList) {
    const m = monthKey(day.date);
    if (!byMonth.has(m)) byMonth.set(m, { month: m, migraineDays: 0, onsets: 0, loggedDays: 0, daysInMonth: daysInMonth(day.date) });
    const s = byMonth.get(m);
    s.loggedDays++;
    if (isMigraineDay(day)) s.migraineDays++;
    if (day.attacks.length) s.onsets++;
  }
  // Fill months with no records between first and last so gaps show.
  const first = dayList[0].date, last = today || dayList[dayList.length - 1].date;
  const out = [];
  for (let m = monthKey(first); m <= monthKey(last); m = monthKey(addDays(`${m}-01`, 32))) {
    const s = byMonth.get(m) || { month: m, migraineDays: 0, onsets: 0, loggedDays: 0, daysInMonth: daysInMonth(`${m}-01`) };
    const M = s.migraineDays;
    const sd = Math.sqrt(M);
    s.band = [Math.max(0, M - 2 * sd), M + 2 * sd];
    s.partial = today ? monthKey(today) === m : false;
    out.push(s);
  }
  return out;
}

export function medicationSummary(dayList, dayMap, settings, today) {
  if (!dayList.length || !today) return { rolling: [], acuteDays30: 0, triptanDays30: 0, level: 'ok', text: null };
  const first = dayList[0].date;
  const from = diffDays(first, today) > 120 ? addDays(today, -120) : first;
  const rolling = [];
  const medDay = date => acuteMedDay(dayMap.get(date), settings);
  for (const date of dateRange(from, today)) {
    let acute = 0, triptan = 0;
    for (let i = 0; i < 30; i++) {
      const m = medDay(addDays(date, -i));
      if (m.any) acute++;
      if (m.triptan) triptan++;
    }
    rolling.push({ date, acuteDays: acute, triptanDays: triptan });
  }
  const now = rolling[rolling.length - 1];
  const acuteDays30 = now.acuteDays, triptanDays30 = now.triptanDays;
  let level = 'ok', text = null;
  const overTriptanLine = triptanDays30 > 0 && acuteDays30 > 10;
  const overSimpleLine = acuteDays30 > 15;
  if (overTriptanLine || overSimpleLine) {
    level = 'over';
    text = `You have used attack medicines on ${acuteDays30} of the last 30 days` +
      (triptanDays30 ? `, including a triptan or combination painkiller on ${triptanDays30}` : '') +
      '. Above 10 days a month for triptans or combination painkillers, or 15 for simple painkillers, risks medication-overuse headache. Worth raising with your GP.';
  } else if ((triptanDays30 > 0 && acuteDays30 >= 8) || acuteDays30 >= 12) {
    level = 'near';
    text = `You have used attack medicines on ${acuteDays30} of the last 30 days. The medication-overuse line is 10 days a month for triptans or combination painkillers and 15 for simple painkillers.`;
  }
  return { rolling, acuteDays30, triptanDays30, level, text };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function attackProfile(dayList) {
  const attacks = dayList.flatMap(d => d.attacks);
  const sev = attacks.map(a => a.peakSeverity).filter(x => x != null);
  const dur = attacks.filter(a => !a.ongoing).map(a => hoursBetween(a.start, a.end)).filter(x => x != null);
  const treated = attacks.filter(a => a.acuteMeds.length > 0);
  const answered = treated.filter(a => a.workedWithin2h && a.workedWithin2h !== 'unknown');
  return {
    count: attacks.length,
    medianSeverity: median(sev),
    medianDurationHours: median(dur),
    durationKnown: dur.length,
    auraShare: attacks.length ? attacks.filter(a => a.aura).length / attacks.length : null,
    treatedShare: attacks.length ? treated.length / attacks.length : null,
    workedShare: answered.length ? answered.filter(a => a.workedWithin2h === 'yes').length / answered.length : null,
    workedAnswered: answered.length,
    lostDayShare: attacks.length ? attacks.filter(a => a.lostDay).length / attacks.length : null,
  };
}

export function completeness(dayMap, today) {
  if (!today) return { logged30: 0, logged90: 0, share30: 0, share90: 0 };
  let l30 = 0, l90 = 0;
  for (let i = 0; i < 90; i++) {
    if (dayMap.has(addDays(today, -i))) { l90++; if (i < 30) l30++; }
  }
  return { logged30: l30, logged90: l90, share30: l30 / 30, share90: l90 / 90 };
}

/* ---------- Challenge tests ---------- */

export function challengeSummary(challenges, dayMap, dayList, baselineRate) {
  const byExposure = new Map();
  for (const c of challenges) {
    const d0 = dayMap.get(c.date), d1 = dayMap.get(addDays(c.date, 1));
    let result;
    if (!d0 && !d1) result = 'unlogged';
    else if ((d0 && d0.attacks.length) || (d1 && d1.attacks.length)) result = 'attack';
    else if (d0 && d1) result = 'none';
    else result = 'partial';    // one of the two days not logged yet
    const item = { ...c, result };
    if (!byExposure.has(c.exposure)) byExposure.set(c.exposure, { exposure: c.exposure, items: [], done: 0, attacks: 0 });
    const g = byExposure.get(c.exposure);
    g.items.push(item);
    if (result === 'attack' || result === 'none') g.done++;
    if (result === 'attack') g.attacks++;
  }
  const out = [];
  for (const g of byExposure.values()) {
    g.items.sort((a, b) => (a.date < b.date ? -1 : 1));
    g.rate = g.done ? g.attacks / g.done : null;
    // Baseline over a 2-day window is roughly 1 - (1 - r)^2 for a daily onset rate r.
    g.baseline2day = baselineRate == null ? null : 1 - Math.pow(1 - baselineRate, 2);
    out.push(g);
  }
  return out;
}
