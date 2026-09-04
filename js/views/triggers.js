// Triggers: the ranked lag analysis, one plain-English verdict per exposure,
// expandable numbers and lag chart, and the "What to test next" panel that
// records challenge tests.

import { state, allDays, saveSettings } from '../state.js';
import { h, p, formatPct, plural, toast, confirmDialog } from '../ui.js';
import { analyse, LAGS, WINDOWS, LAG_SHORT, GATES } from '../analysis.js';
import { lagChart } from '../charts.js';
import { todayISO, addDays, formatShort, formatMedium } from '../dates.js';
import { uuid } from '../fields.js';

const VERDICT_LABEL = { clear: 'Clear signal', possible: 'Possible', lower: 'Fewer attacks', none: 'No signal', insufficient: 'Not enough data' };

export function renderTriggers() {
  const today = todayISO();
  const report = analyse(allDays(), state.settings, { today });
  const root = h('section', { class: 'view triggers', 'aria-label': 'Triggers' });
  root.appendChild(h('h2', null, 'Triggers'));

  root.appendChild(h('div', { class: 'callout' },
    'This finds patterns in your own diary; it cannot prove cause. Things that often happen together (a late night and a glass of wine) will both look guilty. Early symptoms of an attack (cravings, yawning, neck stiffness) can look like triggers. Treat a “clear” result as a hypothesis to test with a planned challenge, not as a rule.'));

  if (report.loggedDays === 0) {
    root.appendChild(h('div', { class: 'empty-state' },
      p('No diary yet. The analysis starts once 28 days and 5 attacks are logged.'),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn primary', href: '#/today' }, 'Log today'), h('a', { class: 'btn', href: '#/settings' }, 'Load demo data'))));
    return root;
  }

  if (!report.gates.ok) {
    root.appendChild(h('div', { class: 'warning', role: 'status' },
      h('strong', null, 'Not enough data yet. '),
      report.gates.messages.join(' '),
      ` So far: ${plural(report.loggedDays, 'day')} logged, ${plural(report.primaryOnsets, 'attack')}.`));
  } else {
    const nTests = LAGS.length + WINDOWS.length;
    root.appendChild(p(`${plural(report.exposures.length, 'exposure')} tested at ${nTests} lags each, over ${plural(report.loggedDays, 'logged day')} with ${plural(report.primaryOnsets, 'attack')} (${report.secondaryOnsets ? `${report.secondaryOnsets} more within 48 h of another were counted as the same episode; ` : ''}usual chance of an attack starting on any day: ${formatPct(report.baselineRate)}). With this many tests, one or two “possible” results are expected by chance alone.`, 'explain'));
  }

  // What to test next
  if (report.suggestions.length || report.challenges.length) root.appendChild(testNextPanel(report, today));

  // Ranked list
  root.appendChild(h('h3', null, 'Ranked exposures'));
  const list = h('ol', { class: 'trigger-list' });
  for (const e of report.exposures) list.appendChild(triggerItem(e, report));
  root.appendChild(list);
  root.appendChild(p('“Clear” means the pattern would arise by chance less than 1 time in 100 (allowing for the several lags tested); “possible” between 1 in 100 and 1 in 10. Exposures need at least 5 days with and 5 without before they are judged.', 'explain'));
  return root;
}

function triggerItem(e, report) {
  const badge = h('span', { class: `verdict ${e.verdict}` }, VERDICT_LABEL[e.verdict]);
  const summary = h('summary', null,
    h('span', { class: 'rank' }, `${e.rank}.`),
    h('span', { class: 'body' }, h('span', { class: 'name' }, e.label), badge, h('div', { class: 'headline muted' }, e.headline.replace(`${e.label}: `, ''))),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
  const detail = h('div', { class: 'detail' });
  const item = h('details', { class: 'trigger' }, summary, detail);
  let built = false;
  item.addEventListener('toggle', () => {
    if (!item.open || built) return;
    built = true;
    buildDetail(detail, e, report);
  });
  return item;
}

function buildDetail(detail, e, report) {
  const r = e.results;
  const lagBars = LAGS.map(l => {
    const x = r[`lag${l}`];
    return { label: l === 0 ? 'same day' : `${l} day${l > 1 ? 's' : ''} later`, rate: x.nExp ? x.rateExp : null, n: x.nExp, sufficient: x.sufficient };
  });
  detail.appendChild(lagChart({ title: `Attack rate after ${e.label} at each lag`, bars: lagBars, baseline: report.baselineRate }));
  detail.appendChild(p('Bars show how often an attack started that many days after a day with this exposure; the dashed line is your usual daily rate. n is the number of exposure days behind each bar; pale bars have too few to judge.', 'chart-caption'));

  const table = h('table', null,
    h('thead', null, h('tr', null, h('th', null, 'Lag'), h('th', null, 'After exposure'), h('th', null, 'Otherwise'), h('th', null, 'Fluke chance'))),
    h('tbody', null, ...[...LAGS.map(l => r[`lag${l}`]), ...WINDOWS.map(w => r[w.key])].map(x => h('tr', { class: e.strongest && x.key === e.strongest.key ? 'strongest' : null },
      h('td', null, LAG_SHORT[x.key], e.strongest && x.key === e.strongest.key ? ' ★' : ''),
      h('td', { class: 'num' }, `${x.a} of ${x.nExp}${x.nExp ? ` (${formatPct(x.rateExp)})` : ''}`),
      h('td', { class: 'num' }, `${x.c} of ${x.nUnexp}${x.nUnexp ? ` (${formatPct(x.rateUnexp)})` : ''}`),
      h('td', { class: 'num' }, x.sufficient ? flukeWords(x.p) : needWords(x))))));
  detail.appendChild(table);

  if (e.earlySymptom) detail.appendChild(h('div', { class: 'flag' }, `Early-warning signs were logged on ${formatPct(e.earlySymptomShare)} of the days this exposure coincided with an attack. Cravings, painkillers, extra coffee and sleeping in are often responses to an attack that has already begun, so a same-day link is weak evidence of a trigger.`));
  if (e.cooccurring && e.cooccurring.length) {
    detail.appendChild(h('div', { class: 'flag' }, 'Often together with: ',
      e.cooccurring.map(c => `${c.label} (${formatPct(c.share)} of these days)`).join(', '),
      '. Any of these could be the real factor, or they could act together.'));
  }
  if (e.hormonalNote) detail.appendChild(h('div', { class: 'flag' }, e.hormonalNote));
  if (e.verdict === 'insufficient' && e.needed && e.needed.exposed != null) {
    detail.appendChild(p(`Needs at least ${GATES.minExposed} days with and ${GATES.minUnexposed} without this exposure, each followed by a logged day.`, 'explain'));
  }
}

function flukeWords(pv) {
  if (pv >= 0.5) return 'likely a fluke';
  const odds = Math.round(1 / pv);
  if (odds >= 1000) return 'under 1 in 1000';
  if (odds >= 100) return `about 1 in ${Math.round(odds / 10) * 10}`;
  return `about 1 in ${odds}`;
}

function needWords(x) {
  if (x.needExposed > 0) return `need ${x.needExposed} more with`;
  if (x.needUnexposed > 0) return `need ${x.needUnexposed} more without`;
  return 'not judged';
}

/* ---------- Challenge tests ---------- */

function testNextPanel(report, today) {
  const panel = h('div', { class: 'group' }, h('h3', null, 'What to test next'));
  if (report.suggestions.length) {
    panel.appendChild(p('A planned challenge is the only way to turn a pattern into an answer. For each suspect below: pick a morning with no early-warning signs, take a normal portion (or a normal dose of the exposure), and note any attack within 24 hours. Repeat 5–6 times, at least 4 days apart. Skip this for anything that would be unsafe to test on purpose.', 'explain'));
    for (const e of report.suggestions) panel.appendChild(planRow(e.label, today));
  }
  for (const g of report.challenges) {
    const box = h('div', { class: 'callout' });
    box.appendChild(h('strong', null, `${g.exposure}: `));
    if (g.done === 0) box.appendChild(h('span', null, `${plural(g.items.length, 'challenge')} planned, none complete yet (both the day and the day after need logging).`));
    else box.appendChild(h('span', null, `attacks followed ${g.attacks} of ${g.done} completed challenge ${g.done === 1 ? 'day' : 'days'} (${formatPct(g.rate)}), against a usual two-day rate of ${formatPct(g.baseline2day)}.${g.done < 5 ? ` ${5 - g.done} more to go for a fair test.` : ' Enough for a fair comparison.'}`));
    const ul = h('ul', { class: 'plain small' });
    for (const it of g.items) {
      ul.appendChild(h('li', null,
        h('span', null, `${formatMedium(it.date)} – ${resultWords(it.result)}`),
        ' ',
        h('button', { class: 'btn quiet', type: 'button', 'aria-label': `Remove challenge on ${formatMedium(it.date)}`, onclick: async () => {
          const ok = await confirmDialog({ title: 'Remove this challenge?', body: 'The diary entry for that day is kept.', confirmLabel: 'Remove', danger: true });
          if (!ok) return;
          await saveSettings({ challenges: state.settings.challenges.filter(c => c.id !== it.id) });
          window.dispatchEvent(new Event('app:rerender'));
        } }, 'Remove')));
    }
    box.appendChild(ul);
    if (!report.suggestions.find(e => e.label === g.exposure)) box.appendChild(planRow(g.exposure, today));
    panel.appendChild(box);
  }
  return panel;
}

function resultWords(r) {
  return { attack: 'attack followed', none: 'no attack', unlogged: 'not logged yet', partial: 'day after not logged yet' }[r] || r;
}

function planRow(exposure, today) {
  const date = h('input', { type: 'date', value: addDays(today, 1), 'aria-label': `Challenge date for ${exposure}` });
  return h('div', { class: 'add-row' }, date,
    h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!date.value) return;
      const challenges = [...state.settings.challenges, { id: uuid(), exposure, date: date.value, cleanMorning: true }];
      await saveSettings({ challenges });
      toast(`Challenge with ${exposure} planned for ${formatShort(date.value)}`);
      window.dispatchEvent(new Event('app:rerender'));
    } }, `Plan ${exposure} challenge`));
}
