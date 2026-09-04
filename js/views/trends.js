// Trends: monthly migraine days with the noise band, rolling acute-medication
// days against the overuse lines, severity over time, attack profile and
// logging completeness.

import { state, allDays } from '../state.js';
import { h, p, formatPct, plural } from '../ui.js';
import { analyse } from '../analysis.js';
import { monthlyBarChart, lineChart, severityChart } from '../charts.js';
import { todayISO, monthShort, formatHours, diffDays, formatShort, monthName } from '../dates.js';

export function renderTrends() {
  const today = todayISO();
  const report = analyse(allDays(), state.settings, { today });
  const root = h('section', { class: 'view trends', 'aria-label': 'Trends' });
  root.appendChild(h('h2', null, 'Trends'));

  if (report.loggedDays === 0) {
    root.appendChild(h('div', { class: 'empty-state' },
      p('Nothing to show yet. Log a few days and the charts appear here.'),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn primary', href: '#/today' }, 'Log today'), h('a', { class: 'btn', href: '#/settings' }, 'Load demo data'))));
    return root;
  }

  // Monthly migraine days
  const months = report.monthly.slice(-12);
  root.appendChild(h('h3', null, 'Migraine days per month'));
  root.appendChild(monthlyBarChart({
    title: 'Migraine days per month with the expected variation band',
    bars: months.map(m => ({
      label: monthShort(`${m.month}-01`),
      value: m.migraineDays, band: m.band, muted: m.partial,
      sub: m.partial ? 'so far' : (m.loggedDays < m.daysInMonth ? `${Math.round(m.loggedDays / m.daysInMonth * 100)}%` : null),
    })),
  }));
  const span = months.length > 1 ? `${monthName(`${months[0].month}-01`)} ${months[0].month.slice(0, 4)} to ${monthName(`${months[months.length - 1].month}-01`)} ${months[months.length - 1].month.slice(0, 4)}. ` : '';
  root.appendChild(p(`${span}${monthlyWords(months)}${months.some(m => !m.partial && m.loggedDays < m.daysInMonth) ? ' A percentage under a month is the share of its days that were logged.' : ''}`, 'chart-caption'));
  root.appendChild(p('The shaded band around each bar is the month-to-month variation you would expect by chance alone (about two times the square root of the count). Only a month that falls outside the band of the months before it, or a smaller change that lasts two or three months, is likely to be real. One good month proves nothing.', 'chart-caption'));

  // Acute medication
  root.appendChild(h('h3', null, 'Attack medicines, days in the last 30'));
  const med = report.medication;
  if (med.text) root.appendChild(h('div', { class: `warning${med.level === 'over' ? ' danger' : ''}`, role: 'status' }, med.text));
  const roll = med.rolling.slice(-90);
  const labels = [];
  if (roll.length > 1) {
    labels.push({ index: 0, label: formatShort(roll[0].date), anchor: 'start' });
    labels.push({ index: roll.length - 1, label: formatShort(roll[roll.length - 1].date), anchor: 'end' });
    if (roll.length > 40) labels.push({ index: Math.floor(roll.length / 2), label: formatShort(roll[Math.floor(roll.length / 2)].date) });
  }
  root.appendChild(lineChart({
    title: 'Days with attack medicines in the previous 30 days',
    points: roll.map(r => ({ x: r.date, y: r.acuteDays })),
    thresholds: [{ y: 10, label: '10: triptans or combination painkillers' }, { y: 15, label: '15: simple painkillers' }],
    xLabels: labels, yMax: 30,
  }));
  root.appendChild(p(`Right now: attack medicines on ${med.acuteDays30} of the last 30 days${med.triptanDays30 ? `, including a triptan or combination painkiller on ${med.triptanDays30}` : ''}. Taking attack medicines on more than 10 days a month (triptans, combination painkillers) or 15 days (simple painkillers) for three months can itself cause daily headache.`, 'chart-caption'));

  // Severity over time
  const attacks = [];
  for (const d of allDays()) for (const a of d.attacks) if (a.peakSeverity != null) attacks.push({ date: d.date, y: a.peakSeverity });
  if (attacks.length) {
    const from = diffDays(attacks[0].date, today) > 180 ? attacks.find(a => diffDays(a.date, today) <= 180).date : attacks[0].date;
    const span = Math.max(1, diffDays(from, today));
    const pts = attacks.filter(a => a.date >= from).map(a => ({ t: diffDays(from, a.date) / span, y: a.y }));
    root.appendChild(h('h3', null, 'Attack severity over time'));
    root.appendChild(severityChart({ title: 'Peak severity of each attack', points: pts, xLabels: [{ t: 0, label: formatShort(from), anchor: 'start' }, { t: 1, label: 'today', anchor: 'end' }] }));
    root.appendChild(p(`Each dot is one attack (0 = none, 10 = worst imaginable), ${pts.length === attacks.length ? 'all attacks' : 'last six months'}.`, 'chart-caption'));
  }

  // Attack profile
  const pr = report.profile;
  root.appendChild(h('h3', null, 'Your attacks so far'));
  root.appendChild(h('div', { class: 'stat-grid' },
    stat(pr.count, 'attacks logged'),
    stat(pr.medianSeverity == null ? '–' : pr.medianSeverity, 'typical peak severity (median)'),
    stat(pr.medianDurationHours == null ? '–' : formatHours(pr.medianDurationHours), `typical length (${pr.durationKnown} with end times)`),
    stat(formatPct(pr.auraShare), 'with aura'),
    stat(formatPct(pr.treatedShare), 'treated with attack medicine'),
    stat(pr.workedShare == null ? '–' : formatPct(pr.workedShare), `medicine worked within 2 h (of ${pr.workedAnswered} answered)`),
    stat(formatPct(pr.lostDayShare), 'lost the day')));

  // Completeness
  const c = report.completeness;
  root.appendChild(h('h3', null, 'Logging completeness'));
  root.appendChild(h('div', { class: 'stat-grid' },
    stat(`${c.logged30} of 30`, `days logged in the last 30 (${formatPct(c.share30)})`),
    stat(`${c.logged90} of 90`, `days logged in the last 90 (${formatPct(c.share90)})`)));
  root.appendChild(p(c.share30 < 0.7
    ? 'Under 70% of recent days are logged. The trigger analysis only sees the days you log, and people tend to log bad days more carefully than quiet ones, so gaps make triggers look stronger than they are. The Calendar shows which days are missing.'
    : 'The analysis is only as good as this. Quiet days matter as much as bad ones because they are the comparison.', 'chart-caption'));

  return root;
}

function stat(n, l) { return h('div', { class: 'stat' }, h('div', { class: 'n' }, String(n)), h('div', { class: 'l' }, l)); }

function monthlyWords(months) {
  const complete = months.filter(m => !m.partial);
  if (complete.length < 2) return 'Fewer than two complete months so far – the band will mean more as months accumulate.';
  const last = complete[complete.length - 1];
  const prev = complete.slice(0, -1).slice(-3);
  const avg = prev.reduce((s, m) => s + m.migraineDays, 0) / prev.length;
  const sd = Math.sqrt(Math.max(avg, 1));
  const diff = last.migraineDays - avg;
  const name = monthName(`${last.month}-01`);
  const base = `${name}: ${plural(last.migraineDays, 'migraine day')}, against an average of ${avg.toFixed(1)} over the ${prev.length === 1 ? 'month' : `${prev.length} months`} before.`;
  if (Math.abs(diff) <= 2 * sd) return `${base} That is within the range chance alone would produce.`;
  return diff < 0
    ? `${base} That is more of a drop than chance usually gives – encouraging, but wait for another month or two before calling it real.`
    : `${base} That is a bigger rise than chance usually gives. Worth a look at what changed, and at the Triggers screen.`;
}
