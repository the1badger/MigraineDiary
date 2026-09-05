// The Today screen: date navigation, migraine status, early-warning signs,
// the exposure checklist, daily flags and a note. Every change saves itself.

import { state, getDay, updateDay, on } from '../state.js';
import { h, p, tickRow, segmented, countControl, stepper, slider, chips, fieldRow, replaceChildren, toast, confirmDialog, plural } from '../ui.js';
import { FIELDS, GROUPS, DAY_FLAGS, PRODROME, severityWord, isMigraineDay } from '../fields.js';
import { todayISO, addDays, formatLong, describeRelative, timeOf } from '../dates.js';

const STEPPER_START = { sleepHours: 7, waterLitres: 1.5, screenHours: 4, exerciseMinutes: 30, cycleDay: 1 };

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function renderToday({ date }) {
  const today = todayISO();
  if (date > today) date = today;

  const root = h('section', { class: 'view today', 'aria-label': 'Daily entry' });
  root.appendChild(dayNav(date, today));
  if (date === today) {
    const prompt = missedPrompt(today);
    if (prompt) root.appendChild(prompt);
  }
  const statusEl = h('div', { class: 'status' });
  renderStatus(statusEl, date, today);
  root.appendChild(statusEl);
  root.appendChild(prodromeSection(date));
  root.appendChild(exposureGroups(date));
  root.appendChild(flagsAndNote(date));

  root.cleanup = on('daychange', e => {
    if (e.detail.date === date || e.detail.date == null) renderStatus(statusEl, date, today);
  });
  return root;
}

/* ---------- Header ---------- */

function dayNav(date, today) {
  const rel = describeRelative(date, today);
  const picker = h('input', { type: 'date', max: today, value: date, 'aria-label': 'Choose a date',
    onchange: () => { if (picker.value && picker.value <= today) location.hash = `#/day/${picker.value}`; } });
  return h('div', { class: 'day-nav' },
    h('a', { class: 'btn icon', href: `#/day/${addDays(date, -1)}`, 'aria-label': 'Previous day' }, '‹'),
    h('div', { class: 'day-title' }, formatLong(date), h('small', null, rel === 'today' ? 'Today' : (rel === 'yesterday' ? 'Yesterday' : 'Tap to pick a date')), picker),
    date < today
      ? h('a', { class: 'btn icon', href: `#/day/${addDays(date, 1)}`, 'aria-label': 'Next day' }, '›')
      : h('button', { class: 'btn icon', type: 'button', disabled: true, 'aria-label': 'Next day (not available)' }, '›'));
}

/* ---------- Missed days ---------- */

function missedDays(today) {
  // Only days after the diary began count as missed, so a fresh install is not nagged.
  let earliest = null;
  for (const d of state.days.keys()) if (earliest == null || d < earliest) earliest = d;
  if (earliest == null) return [];
  const out = [];
  for (let i = 1; i <= 7; i++) { const d = addDays(today, -i); if (d >= earliest && !getDay(d)) out.push(d); }
  return out;
}

export function quickFill(date) {
  updateDay(date, d => {
    d.attacks = [];
    d.ongoingAttack = false;
    if (d.exposures.mealsSkipped == null) d.exposures.mealsSkipped = 0;
    if (d.exposures.alcoholDrinks == null) d.exposures.alcoholDrinks = 0;
    d.quickFill = true;
  });
}

function missedPrompt(today) {
  const missed = missedDays(today);
  if (!missed.length) return null;
  const first = missed[0];
  const name = describeRelative(first, today);
  const others = missed.length - 1;
  const wrap = h('div', { class: 'prompt', role: 'region', 'aria-label': 'Missed days' });
  wrap.append(
    p(`You didn't log ${name}${others ? ` (or ${plural(others, 'other day')} this week)` : ''} – quick fill?`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        quickFill(first);
        toast(`${cap(name)} saved as a normal day`);
        const next = missedPrompt(today);
        if (next) wrap.replaceWith(next); else wrap.remove();
      } }, 'Nothing unusual, no migraine'),
      h('a', { class: 'btn', href: `#/day/${first}` }, `Open ${name}`)));
  return wrap;
}

/* ---------- Migraine status ---------- */

function renderStatus(el, date, today) {
  const day = getDay(date);
  const rel = describeRelative(date, today);
  const relOn = rel === 'today' || rel === 'yesterday' ? rel : `on ${rel}`;
  const hasAttacks = !!day && day.attacks.length > 0;
  const noMigraine = !!day && !hasAttacks && !day.ongoingAttack;
  const yesterday = getDay(addDays(date, -1));

  const noBtn = h('button', { class: 'btn big', type: 'button', 'aria-pressed': String(noMigraine), onclick: async () => {
    if (hasAttacks) {
      const ok = await confirmDialog({ title: 'Remove the attack?', body: `This deletes the ${plural(day.attacks.length, 'attack')} logged ${relOn}.`, confirmLabel: 'Remove attack', danger: true });
      if (!ok) return;
    }
    updateDay(date, d => { d.attacks = []; d.ongoingAttack = false; });
  } }, `No migraine ${relOn}`);

  const attackBtn = h('a', { class: 'btn big primary', href: `#/attack/${date}/new` },
    hasAttacks ? 'Add another attack' : (rel === 'today' ? 'I had or have an attack' : 'I had an attack'));

  const list = hasAttacks ? h('ul', { class: 'attack-list' }, ...day.attacks.map(a => h('li', null,
    h('span', null,
      h('span', { class: 'sev-dot', style: { background: `var(--sev${sevStep(a.peakSeverity)})` }, 'aria-hidden': 'true' }),
      describeAttack(a)),
    h('a', { class: 'btn', href: `#/attack/${date}/${a.id}` }, 'Edit')))) : null;

  const showOngoing = (yesterday && isMigraineDay(yesterday)) || (day && day.ongoingAttack);
  const ongoing = showOngoing ? tickRow({
    label: rel === 'today' ? "Yesterday's attack continued into today" : "The previous day's attack continued into this day",
    hint: 'Not a new attack. Counts as a migraine day but not as a new onset.',
    checked: !!(day && day.ongoingAttack),
    onChange: v => updateDay(date, d => { d.ongoingAttack = v; }),
  }) : null;

  replaceChildren(el, noBtn, attackBtn, list, ongoing);
}

function sevStep(s) { if (s == null) return 3; if (s <= 0) return 0; if (s <= 2) return 1; if (s <= 4) return 2; if (s <= 6) return 3; if (s <= 8) return 4; return 5; }

function describeAttack(a) {
  const parts = [];
  parts.push(timeOf(a.start) ? `From ${timeOf(a.start)}` : 'Attack');
  if (a.ongoing) parts.push('still going');
  else if (timeOf(a.end)) parts.push(`to ${timeOf(a.end)}${a.end.slice(0, 10) !== a.start?.slice(0, 10) ? ' next day' : ''}`);
  if (a.peakSeverity != null) parts.push(`severity ${a.peakSeverity} (${severityWord(a.peakSeverity)})`);
  if (a.aura) parts.push('aura');
  if (a.acuteMeds.length) parts.push(a.acuteMeds.map(m => `${m.name}${m.doses > 1 ? ` ×${m.doses}` : ''}`).join(', '));
  return parts.join(' · ');
}

/* ---------- Early-warning signs ---------- */

function prodromeSection(date) {
  const day = getDay(date);
  const selected = new Set(day ? day.prodrome : []);
  return h('div', { class: 'group' },
    h('h2', null, 'Early-warning signs today?'),
    p('Yawning, cravings, neck stiffness and mood changes are often the start of an attack, not a trigger. Logging them lets the app allow for this.', 'explain'),
    chips({ options: PRODROME, selected, onToggle: (opt, isOn) => updateDay(date, d => {
      const s = new Set(d.prodrome);
      if (isOn) s.add(opt); else s.delete(opt);
      d.prodrome = [...s];
    }) }));
}

/* ---------- Exposures ---------- */

function exposureGroups(date) {
  const day = getDay(date);
  const ex = day ? day.exposures : { custom: {} };
  const hidden = new Set(state.settings.hiddenBuiltins || []);
  const set = (key, v) => updateDay(date, d => { d.exposures[key] = v; });
  const setCustom = (name, v) => updateDay(date, d => { d.exposures.custom[name] = v; });
  const frag = document.createDocumentFragment();

  for (const g of GROUPS) {
    const fields = FIELDS.filter(f => f.group === g.key && !hidden.has(f.key));
    const customs = state.settings.customExposures.filter(c => c.group === g.key && !c.hidden);
    if (!fields.length && !customs.length) continue;
    const sec = h('div', { class: 'group' }, h('h2', null, g.label));
    let sub = null;
    for (const f of fields) {
      if (f.subgroup && f.subgroup !== sub) sec.appendChild(h('h3', { class: 'subgroup' }, f.subgroup));
      sub = f.subgroup || null;
      sec.appendChild(control(f, ex[f.key], v => set(f.key, v)));
    }
    for (const c of customs) sec.appendChild(tickRow({ label: c.name, checked: !!ex.custom[c.name], onChange: v => setCustom(c.name, v) }));
    frag.appendChild(sec);
  }
  return frag;
}

function control(f, value, onChange) {
  const v = value == null ? null : value;
  switch (f.type) {
    case 'bool':
      return tickRow({ label: f.label, hint: f.hint, checked: !!v, onChange });
    case 'count':
      return fieldRow(f.label, f.hint, countControl({ value: v, onChange, ariaLabel: f.label }));
    case 'number':
      return fieldRow(f.label, f.hint, stepper({ value: v, min: f.min, max: f.max, step: f.step, unit: f.unit, start: STEPPER_START[f.key] ?? f.min, onChange, ariaLabel: f.label }));
    case 'scale5':
      return fieldRow(f.label, `1 = ${f.words[0]}, 5 = ${f.words[4]}`, segmented({ options: [1, 2, 3, 4, 5].map(n => [n, String(n)]), value: v, onChange, ariaLabel: f.label }));
    case 'scale10':
      return fieldRow(null, null, slider({ value: v, words: ['0 calm', '5', '10 extreme'], onChange, ariaLabel: f.label }), { stack: true });
    case 'enum':
      return fieldRow(f.label, f.hint, segmented({ options: f.options, value: v, onChange, ariaLabel: f.label }));
    default:
      return h('div', null, f.label);
  }
}

/* ---------- Flags and note ---------- */

function flagsAndNote(date) {
  const day = getDay(date);
  const hidden = new Set(state.settings.hiddenBuiltins || []);
  const sec = h('div', { class: 'group' }, h('h2', null, 'Medicines and notes'));
  for (const flag of DAY_FLAGS) {
    if (hidden.has(flag.key)) continue;
    sec.appendChild(tickRow({ label: flag.label, checked: !!(day && day[flag.key]), onChange: v => updateDay(date, d => { d[flag.key] = v; }) }));
  }
  const ex = day ? day.exposures : {};
  let sub = null;
  for (const f of FIELDS.filter(f => f.group === 'meds' && !hidden.has(f.key))) {
    if (f.subgroup && f.subgroup !== sub) sec.appendChild(h('h3', { class: 'subgroup' }, f.subgroup));
    sub = f.subgroup || null;
    sec.appendChild(control(f, ex[f.key], v => updateDay(date, d => { d.exposures[f.key] = v; })));
  }
  const note = h('textarea', { rows: 2, placeholder: 'Anything unusual? One line is plenty.', 'aria-label': 'Note', maxlength: 2000 });
  note.value = day ? day.note : '';
  note.addEventListener('input', () => updateDay(date, d => { d.note = note.value; }));
  sec.appendChild(h('label', { class: 'stacked' }, h('span', null, 'Note'), note));
  return sec;
}
