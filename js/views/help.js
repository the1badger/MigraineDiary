// Help: one short page on how the analysis works, what it cannot do, and
// how the app keeps data safe.

import { h, p } from '../ui.js';

export function renderHelp() {
  const li = (...c) => h('li', null, ...c);
  return h('section', { class: 'view help', 'aria-label': 'Help' },
    h('h2', null, 'How this diary works'),
    p('Each day you tick what happened. Over weeks the Triggers screen compares the days that followed an exposure with the days that did not, and says in plain words whether attacks followed more often than chance would explain.'),

    h('h2', null, 'Why it looks one, two and three days back'),
    p('Most attacks begin well before the pain: the early phase can start up to 48 hours earlier, and something eaten or done the day before yesterday can matter more than yesterday. So each exposure is tested at four lags (the same day, one, two and three days later) and over the previous 48 and 72 hours, and the strongest lag is named.'),

    h('h2', null, 'What the words mean'),
    h('ul', null,
      li(h('strong', null, 'Clear signal. '), 'Attacks followed the exposure more often than usual, and a pattern this strong would arise by chance less than once in a hundred times, even allowing for the several lags tested. Treat it as a hypothesis worth a planned challenge, not a verdict.'),
      li(h('strong', null, 'Possible. '), 'Between one in a hundred and one in ten. With about twenty exposures tested at six lags each, one or two of these are expected by luck alone.'),
      li(h('strong', null, 'No signal. '), 'Nothing beyond chance so far.'),
      li(h('strong', null, 'Fewer attacks. '), 'Attacks were less common after the exposure. Possibly protective, possibly chance.'),
      li(h('strong', null, 'Not enough data. '), 'The analysis needs 28 logged days, 5 attacks, and at least 5 days with and 5 without the exposure. It tells you how many more are needed.')),

    h('h2', null, 'What it allows for'),
    h('ul', null,
      li(h('strong', null, 'Early symptoms that look like triggers. '), 'Cravings, yawning, neck stiffness and mood changes are often the first stage of an attack. If an exposure only matches attacks on the same day and early-warning signs were logged on most of those days, it is flagged as a likely symptom rather than a cause and ranked below findings at one to three days.'),
      li(h('strong', null, 'Behaviour changing while unwell. '), 'People drink more coffee, take painkillers and skip meals during an attack. Attack days are left out of the exposure count when looking one to three days ahead.'),
      li(h('strong', null, 'Attacks close together. '), 'An attack starting within 48 hours of the previous one is counted as part of the same episode.'),
      li(h('strong', null, 'Things that travel together. '), 'For a clear finding the app lists the exposures that most often shared those days, so a late night and a glass of wine are not each blamed on their own.'),
      li(h('strong', null, 'Hormonal cycle. '), 'If cycle day or phase is logged, attack rates are reported by phase and a finding that mostly falls in one phase says so.')),

    h('h2', null, 'What it cannot do'),
    h('ul', null,
      li('It cannot prove cause. Only a planned challenge, repeated five or six times at least four days apart, can turn a pattern into an answer, and the Triggers screen records those for you.'),
      li('It cannot see days you did not log, and people log bad days more carefully than quiet ones. The completeness figure on Trends and the empty days on the Calendar exist to keep this honest.'),
      li('It cannot handle small numbers well. With four attacks a month even a real two-day trigger can take three to six months to show. The gates are deliberately strict.'),
      li('It does not model several factors at once. Each exposure is tested on its own.')),

    h('h2', null, 'Weather and air'),
    p('Tap "Fetch today\'s weather" on the Today screen to save the day\'s air pressure (lowest, highest, and the change since the day before), humidity, sunshine hours, temperature, rain, PM2.5 and, in Europe, pollen. Each becomes a yes/no trigger at a cut-off you can change in Settings, so "pressure fell 5 hPa or more since yesterday" is tested at the same lags as everything else. It works for any day in the last 90 days, so a day filled in late still gets its weather.'),

    h('h2', null, 'Monthly counts and the noise band'),
    p('Month-to-month, the number of migraine days wobbles by roughly the square root of the count just by chance. The shaded band on Trends shows that range. Only a change bigger than the band in a single month, or a smaller change that lasts two or three months, is likely to be real. A single good month, on a new medicine or a new diet, proves nothing yet.'),

    h('h2', null, 'Attack medicines'),
    p('Taking attack medicines on more than 10 days a month (triptans, or painkillers combined with codeine or caffeine) or 15 days a month (simple painkillers such as ibuprofen or paracetamol) for three months can itself cause daily headache. Trends counts the days and warns when you are near or over the line. That is a conversation to have with your GP, not a reason to stop treating attacks.'),

    h('h2', null, 'Privacy and safety of your data'),
    h('ul', null,
      li('Everything is stored on this device, in the browser’s own database. There is no account, no server and no analytics. After the first load the app makes no network requests except one you trigger yourself: the "Fetch weather" button sends your location (rounded to about 1 km) and the date to Open-Meteo, a free weather service. Everything else works in airplane mode.'),
      li('That also means there is no copy anywhere else. Export a backup (Settings) every couple of weeks and keep it in Files, Drive or an email to yourself.'),
      li('On an iPhone, Safari can delete a website’s stored data after 7 days without use unless the app is added to the Home Screen. Add it. The app reminds you once, and nags for a backup after 14 days.'),
      li('The export is not encrypted. Anyone who can open the file can read it.')),

    h('h2', null, 'Where the rules come from'),
    p('The analysis follows the evidence summarised in the two companion reports this app was built from, “Diet and migraine” and “Migraine: treatment and long-term risks”: triggers are individual, most attacks start up to 48 hours before the pain, cravings and neck pain are often early symptoms rather than causes, and a single good month proves nothing.'),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/settings' }, 'Back to Settings')));
}
