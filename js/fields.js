// Definitions of the built-in daily fields. Shared by the Today form, the
// analysis engine, the export and the settings screen so that all four agree.
//
// type:      'bool' | 'count' (0/1/2/3+) | 'number' (stepper) | 'scale5' | 'scale10' | 'enum'
// group:     'sleep' (Sleep and body) | 'food' (Food and drink) | 'env' (Environment and neck)
// threshold: how a numeric field becomes yes/no for analysis. op is applied as
//            value <op> threshold. The threshold value is editable in Settings.
// analysisLabel(t): plain-English name of the yes/no exposure at threshold t.

export const GROUPS = [
  { key: 'sleep', label: 'Sleep and body' },
  { key: 'food', label: 'Food and drink' },
  { key: 'env', label: 'Environment and neck' },
];

export const FIELDS = [
  // Sleep and body
  { key: 'sleepHours', label: 'Sleep', hint: 'hours', group: 'sleep', type: 'number', min: 0, max: 16, step: 0.5, unit: 'h',
    threshold: { op: '<', default: 6 }, analysisLabel: t => `Short sleep (under ${t} h)` },
  { key: 'sleepQuality', label: 'Sleep quality', group: 'sleep', type: 'scale5',
    words: ['very poor', 'poor', 'fair', 'good', 'very good'],
    threshold: { op: '<=', default: 2 }, analysisLabel: t => `Poor sleep (quality ${t} or less)` },
  { key: 'wakeTimeShift', label: 'Woke over an hour earlier or later than usual', group: 'sleep', type: 'bool',
    analysisLabel: () => 'Unusual wake time' },
  { key: 'stress', label: 'Stress', group: 'sleep', type: 'scale10',
    threshold: { op: '>=', default: 7 }, analysisLabel: t => `High stress (${t}+ out of 10)` },
  { key: 'exerciseMinutes', label: 'Exercise', hint: 'minutes', group: 'sleep', type: 'number', min: 0, max: 600, step: 15, unit: 'min',
    threshold: { op: '>=', default: 60 }, analysisLabel: t => `Long exercise (${t}+ min)` },
  { key: 'exerciseLight', label: 'Light or moderate exercise', hint: 'walk, easy cycle, yoga', group: 'sleep', type: 'bool', subgroup: 'Exercise type',
    analysisLabel: () => 'Light or moderate exercise' },
  { key: 'exerciseSport', label: 'Sport', hint: 'a game or match', group: 'sleep', type: 'bool', subgroup: 'Exercise type',
    analysisLabel: () => 'Sport' },
  { key: 'exerciseResistance', label: 'Resistance training', hint: 'weights, gym', group: 'sleep', type: 'bool', subgroup: 'Exercise type',
    analysisLabel: () => 'Resistance training' },
  { key: 'exerciseHIIT', label: 'HIIT', hint: 'high-intensity intervals', group: 'sleep', type: 'bool', subgroup: 'Exercise type',
    analysisLabel: () => 'HIIT' },
  { key: 'exerciseHard', label: 'Hard or unusual exercise', group: 'sleep', type: 'bool', subgroup: 'Exercise type',
    hiddenByDefault: true, analysisLabel: () => 'Hard exercise' },
  { key: 'cycleDay', label: 'Cycle day', hint: 'day 1 = first day of period', group: 'sleep', type: 'number', min: 1, max: 60, step: 1, unit: '',
    hiddenByDefault: true, noAnalysis: true },
  { key: 'hormonal', label: 'Hormonal', group: 'sleep', type: 'enum', options: [['none', 'None'], ['period', 'Period'], ['ovulation', 'Ovulation']],
    hiddenByDefault: true, noAnalysis: true },

  // Food and drink
  { key: 'mealsSkipped', label: 'Meals skipped', group: 'food', type: 'count',
    threshold: { op: '>=', default: 1 }, analysisLabel: t => t <= 1 ? 'Skipped a meal' : `Skipped ${t}+ meals` },
  { key: 'caffeineServings', label: 'Caffeine', hint: 'coffees, teas, energy drinks', group: 'food', type: 'count',
    threshold: { op: '>=', default: 3 }, analysisLabel: t => `Caffeine (${t}+ servings)` },
  { key: 'alcoholDrinks', label: 'Alcohol', hint: 'standard drinks', group: 'food', type: 'count',
    threshold: { op: '>=', default: 3 }, analysisLabel: t => `Alcohol (${t}+ drinks)` },
  { key: 'waterLitres', label: 'Water', hint: 'litres', group: 'food', type: 'number', min: 0, max: 6, step: 0.25, unit: 'L',
    threshold: { op: '<', default: 1 }, analysisLabel: t => `Low water (under ${t} L)` },
  { key: 'ateOutThai', label: 'Thai', group: 'food', type: 'bool', subgroup: 'Ate out', analysisLabel: () => 'Ate out: Thai' },
  { key: 'ateOutVietnamese', label: 'Vietnamese', group: 'food', type: 'bool', subgroup: 'Ate out', analysisLabel: () => 'Ate out: Vietnamese' },
  { key: 'ateOutIndian', label: 'Indian', group: 'food', type: 'bool', subgroup: 'Ate out', analysisLabel: () => 'Ate out: Indian' },
  { key: 'ateOutPizza', label: 'Pizza', group: 'food', type: 'bool', subgroup: 'Ate out', analysisLabel: () => 'Ate out: pizza' },
  { key: 'ateOutOther', label: 'Other restaurant or takeaway', group: 'food', type: 'bool', subgroup: 'Ate out', analysisLabel: () => 'Ate out: other' },
  { key: 'glutenContamination', label: 'Possible gluten contamination', hint: 'shared kitchen, unclear ingredients', group: 'food', type: 'bool', subgroup: 'Ate out',
    analysisLabel: () => 'Possible gluten contamination' },

  // Environment and neck
  { key: 'screenHours', label: 'Screen time', hint: 'hours', group: 'env', type: 'number', min: 0, max: 18, step: 1, unit: 'h',
    threshold: { op: '>=', default: 8 }, analysisLabel: t => `Long screen time (${t}+ h)` },
  { key: 'neckLoad', label: 'Neck strain', hint: 'long drive, screen posture, heavy bag', group: 'env', type: 'bool',
    analysisLabel: () => 'Neck strain' },
  { key: 'odours', label: 'Strong smells or perfume', group: 'env', type: 'bool', analysisLabel: () => 'Strong smells' },
  { key: 'smokeHaze', label: 'Smoke or haze', group: 'env', type: 'bool', analysisLabel: () => 'Smoke or haze' },
  { key: 'mouldSmell', label: 'Musty or mouldy smell', group: 'env', type: 'bool', analysisLabel: () => 'Mould smell' },
  { key: 'weatherChange', label: 'Weather change', hint: 'storm, pressure drop, heat', group: 'env', type: 'bool',
    analysisLabel: () => 'Weather change' },

  // Supplements (shown under Medicines and notes; analysed like any other exposure, so a
  // protective effect shows up as "fewer attacks")
  { key: 'suppMagnesium', label: 'Magnesium', group: 'meds', type: 'bool', subgroup: 'Supplements', analysisLabel: () => 'Magnesium supplement' },
  { key: 'suppMultivitamin', label: 'Multivitamin', group: 'meds', type: 'bool', subgroup: 'Supplements', analysisLabel: () => 'Multivitamin' },
  { key: 'suppOmega3', label: 'Omega 3', group: 'meds', type: 'bool', subgroup: 'Supplements', analysisLabel: () => 'Omega 3 supplement' },
];

/**
 * Composite exposures: "any of" several tick boxes. They give the analysis enough
 * exposure days when the individual boxes are ticked only now and then.
 */
export const DERIVED = [
  { key: 'ateOutAny', label: 'Ate out (any)', of: ['ateOutThai', 'ateOutVietnamese', 'ateOutIndian', 'ateOutPizza', 'ateOutOther'], group: 'food' },
  { key: 'exerciseAny', label: 'Exercise (any type)', of: ['exerciseLight', 'exerciseSport', 'exerciseResistance', 'exerciseHIIT', 'exerciseHard'], group: 'sleep' },
];

/** Labels for every group, including the one rendered under Medicines and notes. */
export const GROUP_LABELS = { sleep: 'Sleep and body', food: 'Food and drink', env: 'Environment and neck', meds: 'Medicines and notes' };

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f]));

/** Extra per-day tick boxes that are not exposures. */
export const DAY_FLAGS = [
  { key: 'preventiveTaken', label: 'Took daily preventive medicine' },
  { key: 'acuteMedsOtherHeadache', label: 'Took a painkiller for a non-migraine headache' },
];

export const PRODROME = ['yawning', 'cravings', 'neck stiffness', 'mood change', 'fatigue', 'light sensitivity'];

export const SIDES = [['left', 'Left'], ['right', 'Right'], ['both', 'Both'], ['unknown', 'Not sure']];
export const WORKED = [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No'], ['unknown', 'Not sure']];

export function severityWord(s) {
  if (s == null) return '';
  if (s === 0) return 'none';
  if (s <= 3) return 'mild';
  if (s <= 6) return 'moderate';
  return 'severe';
}

/** Default settings record. Kept here so tests, demo and app agree. */
export function defaultSettings() {
  const thresholds = {};
  for (const f of FIELDS) if (f.threshold) thresholds[f.key] = f.threshold.default;
  return {
    id: 'settings',
    customExposures: [],                    // [{ name, group, hidden }]
    hiddenBuiltins: FIELDS.filter(f => f.hiddenByDefault).map(f => f.key),
    thresholds,
    acuteMedNames: ['sumatriptan 50 mg', 'ibuprofen 400 mg', 'paracetamol 1 g'],
    acuteMedClasses: {},                    // name -> 'triptan' | 'simple' (override of auto-detection)
    theme: 'auto',
    reminderTime: '20:30',
    reminderEnabled: false,
    lastBackupAt: null,
    challenges: [],                         // [{ id, exposure, date, cleanMorning }]
    iosBannerDismissed: false,
    firstRunAt: null,
    persisted: null,
  };
}

/** Normalise settings loaded from storage or import into the current shape. */
export function normaliseSettings(raw) {
  const s = { ...defaultSettings(), ...(raw || {}) };
  s.id = 'settings';
  s.customExposures = (Array.isArray(s.customExposures) ? s.customExposures : []).map(c =>
    typeof c === 'string'
      ? { name: c, group: 'food', hidden: false }
      : { name: String(c.name || ''), group: c.group || 'food', hidden: !!c.hidden })
    .filter(c => c.name.trim());
  s.thresholds = { ...defaultSettings().thresholds, ...(s.thresholds || {}) };
  s.hiddenBuiltins = Array.isArray(s.hiddenBuiltins) ? s.hiddenBuiltins : [];
  s.acuteMedNames = Array.isArray(s.acuteMedNames) ? s.acuteMedNames.filter(n => typeof n === 'string' && n.trim()) : [];
  s.acuteMedClasses = s.acuteMedClasses && typeof s.acuteMedClasses === 'object' ? s.acuteMedClasses : {};
  s.challenges = (Array.isArray(s.challenges) ? s.challenges : [])
    .filter(c => c && c.exposure && c.date)
    .map(c => ({ id: c.id || uuid(), exposure: c.exposure, date: c.date, cleanMorning: c.cleanMorning !== false, note: c.note || '' }));
  return s;
}

/** Medicines that count against the 10-day line: triptans and combination painkillers. */
const TRIPTAN_WORDS = ['triptan', 'imigran', 'maxalt', 'zomig', 'relpax', 'naramig', 'codeine', 'nurofen plus',
  'panadeine', 'mersyndol', 'co-codamol', 'solpadeine', 'combination', 'opioid', 'tramadol', 'ergot', 'cafergot', 'gepant', 'ubrelvy', 'nurtec'];

export function medClass(name, settings) {
  const override = settings && settings.acuteMedClasses && settings.acuteMedClasses[name];
  if (override === 'triptan' || override === 'simple') return override;
  const n = String(name).toLowerCase();
  return TRIPTAN_WORDS.some(w => n.includes(w)) ? 'triptan' : 'simple';
}

/** A blank DayRecord for a date. */
export function emptyDay(date) {
  return {
    date,
    updatedAt: null,
    attacks: [],
    ongoingAttack: false,
    prodrome: [],
    exposures: { custom: {} },
    preventiveTaken: false,
    acuteMedsOtherHeadache: false,
    note: '',
  };
}

/** Bring a stored or imported day into the current shape without losing anything. */
export function normaliseDay(raw) {
  const d = { ...emptyDay(raw.date), ...raw };
  d.attacks = Array.isArray(d.attacks) ? d.attacks.map(normaliseAttack) : [];
  d.prodrome = Array.isArray(d.prodrome) ? d.prodrome.filter(p => typeof p === 'string') : [];
  d.exposures = d.exposures && typeof d.exposures === 'object' ? { ...d.exposures } : {};
  d.exposures.custom = d.exposures.custom && typeof d.exposures.custom === 'object' ? { ...d.exposures.custom } : {};
  d.ongoingAttack = !!d.ongoingAttack;
  d.preventiveTaken = !!d.preventiveTaken;
  d.acuteMedsOtherHeadache = !!d.acuteMedsOtherHeadache;
  d.note = typeof d.note === 'string' ? d.note : '';
  return d;
}

export function normaliseAttack(a) {
  a = a || {};
  return {
    id: a.id || uuid(),
    start: a.start || null,
    end: a.end || null,
    ongoing: !!a.ongoing,
    peakSeverity: a.peakSeverity == null ? null : Number(a.peakSeverity),
    aura: !!a.aura,
    side: a.side || 'unknown',
    nausea: !!a.nausea,
    lightSensitivity: !!a.lightSensitivity,
    soundSensitivity: !!a.soundSensitivity,
    neckPain: !!a.neckPain,
    acuteMeds: Array.isArray(a.acuteMeds)
      ? a.acuteMeds.filter(m => m && m.name && Number(m.doses) > 0).map(m => ({ name: String(m.name), doses: Number(m.doses) }))
      : [],
    workedWithin2h: a.workedWithin2h || 'unknown',
    lostDay: !!a.lostDay,
  };
}

export function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

/** Attack severity 0-10 mapped to the five-step calendar scale (0 = none). */
export function severityStep(s) {
  if (s == null || s <= 0) return 0;
  if (s <= 2) return 1;
  if (s <= 4) return 2;
  if (s <= 6) return 3;
  if (s <= 8) return 4;
  return 5;
}

/** Highest severity of attacks that started that day; null if none. */
export function maxSeverity(day) {
  if (!day || !day.attacks.length) return null;
  return Math.max(...day.attacks.map(a => a.peakSeverity == null ? 5 : a.peakSeverity));
}

/** Is this day a "migraine day" (attack started, or an earlier attack continued)? */
export function isMigraineDay(day) {
  return !!day && (day.attacks.length > 0 || day.ongoingAttack);
}

/** Does this day count as an acute-medication day, and does it include a triptan/combination? */
export function acuteMedDay(day, settings) {
  if (!day) return { any: false, triptan: false };
  let any = !!day.acuteMedsOtherHeadache, triptan = false;
  for (const a of day.attacks) for (const m of a.acuteMeds) {
    any = true;
    if (medClass(m.name, settings) === 'triptan') triptan = true;
  }
  return { any, triptan };
}
