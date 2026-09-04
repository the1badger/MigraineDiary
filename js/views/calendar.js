// Month grid coloured by peak severity. Unlogged days are visibly empty so
// gaps in logging are obvious.

import { getDay, state } from '../state.js';
import { h, p, plural } from '../ui.js';
import { maxSeverity, severityStep, isMigraineDay } from '../fields.js';
import { todayISO, monthKey, addMonths, daysInMonth, weekdayMondayFirst, formatMonth, dateRange } from '../dates.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function renderCalendar({ month }) {
  const today = todayISO();
  month = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(today);
  const first = `${month}-01`;
  const n = daysInMonth(first);
  const last = `${month}-${String(n).padStart(2, '0')}`;
  const root = h('section', { class: 'view calendar', 'aria-label': 'Calendar' });

  root.appendChild(h('div', { class: 'cal-nav' },
    h('a', { class: 'btn icon', href: `#/calendar/${monthKey(addMonths(first, -1))}`, 'aria-label': 'Previous month' }, '‹'),
    h('h2', null, formatMonth(first)),
    month < monthKey(today)
      ? h('a', { class: 'btn icon', href: `#/calendar/${monthKey(addMonths(first, 1))}`, 'aria-label': 'Next month' }, '›')
      : h('button', { class: 'btn icon', type: 'button', disabled: true, 'aria-label': 'Next month (not available)' }, '›')));

  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': formatMonth(first) });
  for (const d of DOW) grid.appendChild(h('div', { class: 'dow', role: 'columnheader' }, d));
  const lead = weekdayMondayFirst(first);
  for (let i = 0; i < lead; i++) grid.appendChild(h('div', { class: 'cal-cell empty', 'aria-hidden': 'true' }));

  let migraineDays = 0, attacks = 0, logged = 0, elapsed = 0;
  for (const date of dateRange(first, last)) {
    const day = getDay(date);
    const future = date > today;
    if (!future) elapsed++;
    const classes = ['cal-cell'];
    let desc = 'not logged';
    if (day) {
      logged++;
      classes.push('logged');
      const sev = maxSeverity(day);
      if (day.attacks.length) {
        migraineDays++; attacks += day.attacks.length;
        classes.push(`sev${severityStep(sev == null ? 5 : sev)}`);
        desc = `${plural(day.attacks.length, 'attack')}${sev != null ? `, severity ${sev}` : ''}`;
      } else if (day.ongoingAttack) {
        migraineDays++;
        classes.push('ongoing');
        desc = 'attack continued from the day before';
      } else desc = 'no migraine';
    }
    if (date === today) classes.push('today');
    if (future) classes.push('future');
    const cell = h('button', { type: 'button', class: classes.join(' '), role: 'gridcell', disabled: future,
      'aria-label': `${Number(date.slice(8, 10))}: ${future ? 'future' : desc}`,
      onclick: () => { if (!future) location.hash = `#/day/${date}`; } },
      String(Number(date.slice(8, 10))),
      day && day.attacks.length > 1 ? h('span', { class: 'marks' }, `×${day.attacks.length}`) : null,
      day && !day.attacks.length && day.ongoingAttack ? h('span', { class: 'marks' }, '…') : null);
    grid.appendChild(cell);
  }
  root.appendChild(grid);

  root.appendChild(h('div', { class: 'cal-legend', 'aria-hidden': 'true' },
    h('span', null, h('i', { class: 'swatch dashed' }), 'not logged'),
    h('span', null, h('i', { class: 'swatch', style: { background: 'var(--bg-raised)' } }), 'no migraine'),
    h('span', null, h('i', { class: 'swatch', style: { background: 'var(--sev1)' } }), 'mild'),
    h('span', null, h('i', { class: 'swatch', style: { background: 'var(--sev3)' } }), 'moderate'),
    h('span', null, h('i', { class: 'swatch', style: { background: 'var(--sev5)' } }), 'severe'),
    h('span', null, h('i', { class: 'swatch', style: { background: 'var(--ongoing)' } }), 'continued')));

  if (elapsed > 0) {
    root.appendChild(p(`${formatMonth(first).split(' ')[0]} so far: ${plural(migraineDays, 'migraine day')}, ${plural(attacks, 'attack')}, ${logged} of ${elapsed} days logged.`, 'muted'));
    if (logged < elapsed) root.appendChild(p('Tap an empty day to fill it in. Gaps weaken the trigger analysis.', 'inline-note'));
  }
  return root;
}
