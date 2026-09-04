// The attack sheet. Opened from Today for a new attack or to edit one.
// Changes save as they are made once the first change is made; "Save attack"
// also records an untouched new attack so a two-tap log still counts.

import { state, getDay, updateDay, saveSettings } from '../state.js';
import { h, p, tickRow, segmented, slider, replaceChildren, toast, confirmDialog, plural } from '../ui.js';
import { normaliseAttack, SIDES, WORKED, medClass } from '../fields.js';
import { todayISO, nowLocalMinute, formatShort, describeRelative } from '../dates.js';

export function renderAttack({ date, id }) {
  const today = todayISO();
  const day = getDay(date);
  const existing = id !== 'new' && day ? day.attacks.find(a => a.id === id) : null;
  if (id !== 'new' && !existing) {
    return h('section', null, h('h2', null, 'Attack not found'), p('That attack is no longer in the diary.'),
      h('a', { class: 'btn', href: `#/day/${date}` }, 'Back to the day'));
  }
  const draft = existing ? structuredClone(existing) : normaliseAttack({ start: date === today ? nowLocalMinute() : `${date}T08:00`, ongoing: date === today });
  let committed = !!existing;

  function commit() {
    updateDay(date, d => {
      const i = d.attacks.findIndex(a => a.id === draft.id);
      const copy = structuredClone(draft);
      if (i >= 0) d.attacks[i] = copy; else d.attacks.push(copy);
    });
    committed = true;
  }
  const change = fn => { fn(draft); commit(); };

  const rel = describeRelative(date, today);
  const root = h('section', { class: 'view attack', 'aria-label': 'Attack details' });
  root.appendChild(h('div', { class: 'sheet-header' },
    h('a', { class: 'btn icon', href: `#/day/${date}`, 'aria-label': 'Back to the day' }, '‹'),
    h('h2', null, existing ? 'Edit attack' : 'New attack', h('small', { class: 'muted' }, ` ${rel === 'today' ? 'today' : rel === 'yesterday' ? 'yesterday' : 'on ' + formatShort(date)}`))));

  // Severity
  root.appendChild(h('div', { class: 'group' },
    slider({ value: draft.peakSeverity, ariaLabel: 'Peak severity', words: ['0 none', '3 mild', '6 moderate', '9 severe'], emptyText: 'Not rated',
      onChange: v => change(a => { a.peakSeverity = v; }) })));

  // Times
  const startInput = h('input', { type: 'datetime-local', value: draft.start || '', 'aria-label': 'Start time',
    onchange: () => change(a => { a.start = startInput.value || null; }) });
  const endInput = h('input', { type: 'datetime-local', value: draft.end || '', 'aria-label': 'End time', disabled: draft.ongoing,
    onchange: () => change(a => { a.end = endInput.value || null; }) });
  const ongoingTick = tickRow({ label: 'Still going', hint: 'Untick and set an end time once it has passed.', checked: draft.ongoing,
    onChange: v => change(a => { a.ongoing = v; if (v) { a.end = null; endInput.value = ''; } endInput.disabled = v; }) });
  const timeGroup = h('div', { class: 'group' }, h('h2', null, 'When'),
    h('label', { class: 'stacked' }, h('span', null, 'Started'),
      h('div', { class: 'add-row' }, startInput, date === today ? h('button', { class: 'btn', type: 'button', onclick: () => { startInput.value = nowLocalMinute(); change(a => { a.start = startInput.value; }); } }, 'Now') : null)),
    h('label', { class: 'stacked' }, h('span', null, 'Ended'), endInput),
    ongoingTick);
  root.appendChild(timeGroup);

  // Features
  root.appendChild(h('div', { class: 'group' }, h('h2', null, 'What it was like'),
    tickRow({ label: 'Aura', hint: 'Visual disturbance, tingling or speech trouble before the pain', checked: draft.aura, onChange: v => change(a => { a.aura = v; }) }),
    h('div', { class: 'field' }, h('div', { class: 'label' }, 'Side'),
      segmented({ options: SIDES, value: draft.side, allowClear: false, ariaLabel: 'Side of head', onChange: v => change(a => { a.side = v; }) })),
    tickRow({ label: 'Nausea or vomiting', checked: draft.nausea, onChange: v => change(a => { a.nausea = v; }) }),
    tickRow({ label: 'Light bothered me', checked: draft.lightSensitivity, onChange: v => change(a => { a.lightSensitivity = v; }) }),
    tickRow({ label: 'Sound bothered me', checked: draft.soundSensitivity, onChange: v => change(a => { a.soundSensitivity = v; }) }),
    tickRow({ label: 'Neck pain', checked: draft.neckPain, onChange: v => change(a => { a.neckPain = v; }) })));

  // Medicines
  const medList = h('ul', { class: 'med-list' });
  function renderMeds() {
    const names = [...state.settings.acuteMedNames];
    for (const m of draft.acuteMeds) if (!names.includes(m.name)) names.push(m.name);
    replaceChildren(medList, ...names.map(name => {
      const entry = draft.acuteMeds.find(m => m.name === name);
      const doses = entry ? entry.doses : 0;
      return h('li', null,
        h('span', { class: 'name' }, name, h('span', { class: 'hint small muted' }, medClass(name, state.settings) === 'triptan' ? ' · triptan or combination' : '')),
        h('span', { class: 'doses' }, doses ? plural(doses, 'dose') : h('span', { class: 'muted' }, 'none')),
        h('button', { class: 'btn icon', type: 'button', disabled: !doses, 'aria-label': `One fewer dose of ${name}`, onclick: () => { setDose(name, doses - 1); } }, '−'),
        h('button', { class: 'btn', type: 'button', onclick: () => { setDose(name, doses + 1); } }, '+1 dose'));
    }));
  }
  function setDose(name, doses) {
    change(a => {
      a.acuteMeds = a.acuteMeds.filter(m => m.name !== name);
      if (doses > 0) a.acuteMeds.push({ name, doses });
    });
    renderMeds();
  }
  renderMeds();
  const newMed = h('input', { type: 'text', placeholder: 'Another medicine, e.g. naproxen 500 mg', 'aria-label': 'Another medicine', autocomplete: 'off' });
  const addMed = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const name = newMed.value.trim();
    if (!name) return;
    if (!state.settings.acuteMedNames.includes(name)) await saveSettings({ acuteMedNames: [...state.settings.acuteMedNames, name] });
    newMed.value = '';
    setDose(name, 1);
    toast(`${name} added to your medicines`);
  } }, 'Add');
  newMed.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMed.click(); } });
  root.appendChild(h('div', { class: 'group' }, h('h2', null, 'Attack medicines'),
    p('Tap +1 dose each time you take something. This feeds the medication-overuse check on the Trends screen.', 'explain'),
    medList, h('div', { class: 'add-row' }, newMed, addMed),
    h('div', { class: 'field' }, h('div', { class: 'label' }, 'Did it work within 2 hours?'),
      segmented({ options: WORKED, value: draft.workedWithin2h, allowClear: false, ariaLabel: 'Did the medicine work within two hours', onChange: v => change(a => { a.workedWithin2h = v; }) })),
    tickRow({ label: 'Lost the day', hint: 'Could not do usual activities', checked: draft.lostDay, onChange: v => change(a => { a.lostDay = v; }) })));

  // Actions
  const saveBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => {
    commit();
    toast('Attack saved');
    location.hash = `#/day/${date}`;
  } }, 'Save attack');
  const actions = h('div', { class: 'group' }, saveBtn);
  if (existing) {
    actions.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      const ok = await confirmDialog({ title: 'Delete this attack?', body: 'The rest of the day is kept.', confirmLabel: 'Delete attack', danger: true });
      if (!ok) return;
      updateDay(date, d => { d.attacks = d.attacks.filter(a => a.id !== draft.id); });
      toast('Attack deleted');
      location.hash = `#/day/${date}`;
    } }, 'Delete attack')));
  }
  root.appendChild(actions);
  root.cleanup = () => { if (!committed) { /* untouched new attack: nothing to save */ } };
  return root;
}
