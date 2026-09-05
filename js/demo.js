// Synthetic diary generator. Used by "Load demo data" in Settings and by the
// unit tests. Plants one real trigger at a chosen lag and one decoy with no
// effect, on top of a realistic-looking background. Deterministic per seed.

import { defaultSettings, normaliseDay } from './fields.js';
import { addDays, hoursBetween } from './dates.js';

/** Small seeded PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

export const DEMO_TRIGGER = 'dark chocolate';
export const DEMO_DECOY = 'aged cheese';
// The seed used by "Load demo data". Any null exposure lands on a chance "possible"
// result about a third of the time (six tests per exposure at p < 0.10), so the seed
// was chosen so that the decoy reads "no signal" and the trigger is clearly strongest
// two days later. Other seeds are exercised by the tests.
export const DEMO_SEED = 1;

/**
 * generateDemo(options) -> { days, settings }
 * options: days (count), seed, endDate (ISO), trigger, decoy, lag, pExposure,
 *          pAttackGivenTrigger, baseline, missingRate
 */
export function generateDemo({
  days = 180, seed = DEMO_SEED, endDate = '2026-09-03',
  trigger = DEMO_TRIGGER, decoy = DEMO_DECOY, lag = 2,
  pExposure = 0.25, pAttackGivenTrigger = 0.5, baseline = 0.12, missingRate = 0.05,
} = {}) {
  const rnd = mulberry32(seed);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const chance = p => rnd() < p;

  const settings = defaultSettings();
  settings.customExposures = [
    { name: trigger, group: 'food', hidden: false },
    { name: decoy, group: 'food', hidden: false },
    { name: 'red wine', group: 'food', hidden: false },
  ];
  settings.firstRunAt = `${addDays(endDate, -(days - 1))}T08:00:00+00:00`;

  const startDate = addDays(endDate, -(days - 1));
  const records = [];
  const triggerOn = [];   // triggerOn[i] = 1 if trigger exposure on day i
  let prevAttackEnd = null;   // local minute string of the last attack's end
  let prevAttackEndMs = null;
  let lastAttackIndex = -10;  // for the refractory period after an attack

  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const trig = chance(pExposure) ? 1 : 0;
    triggerOn.push(trig);
    const dec = chance(pExposure) ? 1 : 0;

    const exposedEarlier = i - lag >= 0 && triggerOn[i - lag] === 1;
    // Two quiet days follow an attack (the recovery phase), as in most diaries.
    const refractory = i - lastAttackIndex <= 2;
    const pAttack = refractory ? 0 : (exposedEarlier ? pAttackGivenTrigger : baseline);
    const attackToday = chance(pAttack);
    if (attackToday) lastAttackIndex = i;

    // Background exposures, mildly realistic.
    const alcohol = chance(0.2) ? pick([1, 2, 3, 3]) : 0;
    const exposures = {
      sleepHours: Math.round((5.5 + rnd() * 3.5) * 2) / 2,
      sleepQuality: pick([2, 3, 3, 4, 4, 5]),
      wakeTimeShift: chance(0.12),
      stress: Math.min(10, Math.max(0, Math.round(3 + rnd() * 5 + (chance(0.15) ? 3 : 0)))),
      exerciseMinutes: pick([0, 0, 30, 30, 45, 60]),
      exerciseLight: chance(0.35),
      exerciseSport: chance(0.1),
      exerciseResistance: chance(0.15),
      exerciseHIIT: chance(0.08),
      exerciseHard: false,
      ateOutThai: chance(0.05),
      ateOutVietnamese: chance(0.04),
      ateOutIndian: chance(0.04),
      ateOutPizza: chance(0.06),
      ateOutOther: chance(0.08),
      glutenContamination: chance(0.05),
      suppMagnesium: chance(0.7),
      suppMultivitamin: chance(0.5),
      suppOmega3: chance(0.4),
      mealsSkipped: chance(0.18) ? 1 : 0,
      caffeineServings: pick([1, 2, 2, 3]),
      alcoholDrinks: alcohol,
      waterLitres: Math.round((1 + rnd() * 2) * 4) / 4,
      screenHours: pick([3, 4, 5, 6, 7, 8, 9]),
      neckLoad: chance(0.15),
      odours: chance(0.08),
      smokeHaze: chance(0.05),
      mouldSmell: chance(0.06),
      weatherChange: chance(0.15),
      brightLight: chance(0.2),
      custom: { [trigger]: !!trig, [decoy]: !!dec, 'red wine': alcohol >= 2 && chance(0.6) },
    };

    const day = normaliseDay({ date, exposures, prodrome: [], attacks: [], note: '' });
    if (chance(0.06)) day.prodrome = [pick(['yawning', 'fatigue', 'mood change'])];

    // An attack that ran past midnight continues into this day.
    if (prevAttackEndMs != null && prevAttackEnd && prevAttackEnd.slice(0, 10) === date && !attackToday) {
      day.ongoingAttack = true;
    }

    if (attackToday) {
      const startHour = 5 + Math.floor(rnd() * 10);
      const startMin = pick([0, 15, 30, 45]);
      const start = `${date}T${pad(startHour)}:${pad(startMin)}`;
      const durationH = 4 + Math.floor(rnd() * 26);
      const endMs = new Date(`${start}:00`).getTime() + durationH * 3600000;
      const endD = new Date(endMs);
      const end = `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}T${pad(endD.getHours())}:${pad(endD.getMinutes())}`;
      const severity = Math.min(10, Math.max(2, Math.round(3 + rnd() * 6)));
      const meds = [];
      if (chance(0.7)) meds.push({ name: 'sumatriptan 50 mg', doses: chance(0.3) ? 2 : 1 });
      if (chance(0.4)) meds.push({ name: 'ibuprofen 400 mg', doses: 1 });
      const worked = meds.length ? pick(['yes', 'yes', 'partly', 'no']) : 'unknown';
      day.attacks.push({
        id: `demo-${date}`,
        start, end, ongoing: false,
        peakSeverity: severity,
        aura: chance(0.3),
        side: pick(['left', 'right', 'both', 'unknown']),
        nausea: chance(0.5), lightSensitivity: chance(0.7), soundSensitivity: chance(0.4), neckPain: chance(0.4),
        acuteMeds: meds,
        workedWithin2h: worked,
        lostDay: severity >= 7 && chance(0.7),
      });
      if (chance(0.5)) {
        const signs = ['yawning', 'cravings', 'neck stiffness', 'mood change', 'fatigue', 'light sensitivity'];
        day.prodrome = [pick(signs), pick(signs)].filter((v, idx, arr) => arr.indexOf(v) === idx);
        // Cravings the day before an attack: the classic early symptom that looks like a trigger.
        const prev = records[records.length - 1];
        if (prev && prev.date === addDays(date, -1) && chance(0.4) && !prev.prodrome.includes('cravings')) prev.prodrome.push('cravings');
      }
      prevAttackEnd = end;
      prevAttackEndMs = endMs;
    }

    day.updatedAt = `${date}T21:00:00+00:00`;
    if (chance(0.3)) day.note = pick(['Long day.', 'Late night.', 'Slept badly.', 'Busy at work.', 'Quiet day.', 'Drove to the coast.']);

    // Some days go unlogged, except the first and last so the range is stable.
    if (i !== 0 && i !== days - 1 && chance(missingRate)) continue;
    records.push(day);
  }

  return { days: records, settings, trigger, decoy, lag };
}
