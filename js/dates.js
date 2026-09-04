// Date helpers. Everything keys off the calendar date in the user's local
// time zone, written as YYYY-MM-DD. No Date objects leak out of this module
// except where explicitly documented.

const DAY_MS = 86400000;

function pad(n) { return String(n).padStart(2, '0'); }

/** Local calendar date of a Date object as YYYY-MM-DD. */
export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayISO() { return toISODate(new Date()); }

/** Parse YYYY-MM-DD into a local-midnight Date. */
export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add n calendar days (n may be negative). */
export function addDays(iso, n) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function ymd(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

/** Whole days from a to b (b - a). DST-safe because it uses UTC arithmetic. */
export function diffDays(a, b) {
  return Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / DAY_MS);
}

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = fromISODate(s);
  return toISODate(d) === s;
}

/** YYYY-MM for grouping. */
export function monthKey(iso) { return iso.slice(0, 7); }

/** First day of the month containing iso. */
export function startOfMonth(iso) { return iso.slice(0, 7) + '-01'; }

export function daysInMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1 + n, 1));
}

/** 0 = Monday ... 6 = Sunday (British weeks start on Monday). */
export function weekdayMondayFirst(iso) {
  return (fromISODate(iso).getDay() + 6) % 7;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayName(iso) { return DAY_NAMES[weekdayMondayFirst(iso)]; }
export function dayShort(iso) { return DAY_SHORT[weekdayMondayFirst(iso)]; }
export function monthName(iso) { return MONTH_NAMES[Number(iso.slice(5, 7)) - 1]; }
export function monthShort(iso) { return MONTH_SHORT[Number(iso.slice(5, 7)) - 1]; }

/** "Thursday 4 September 2026" */
export function formatLong(iso) {
  return `${dayName(iso)} ${Number(iso.slice(8, 10))} ${monthName(iso)} ${iso.slice(0, 4)}`;
}

/** "Thu 4 Sep" */
export function formatShort(iso) {
  return `${dayShort(iso)} ${Number(iso.slice(8, 10))} ${monthShort(iso)}`;
}

/** "4 Sep 2026" */
export function formatMedium(iso) {
  return `${Number(iso.slice(8, 10))} ${monthShort(iso)} ${iso.slice(0, 4)}`;
}

/** "September 2026" */
export function formatMonth(iso) { return `${monthName(iso)} ${iso.slice(0, 4)}`; }

/** Relative wording used in prompts: "today", "yesterday", "Wednesday", "Thu 28 Aug". */
export function describeRelative(iso, today = todayISO()) {
  const diff = diffDays(iso, today);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff > 1 && diff < 7) return dayName(iso);
  return formatShort(iso);
}

/** Local date-time at minute precision: YYYY-MM-DDTHH:MM (for datetime-local inputs). */
export function nowLocalMinute() {
  const d = new Date();
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO timestamp with the local UTC offset, e.g. 2026-09-04T21:14:00+10:00. */
export function nowWithOffset() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** Parse a local minute string (YYYY-MM-DDTHH:MM) to epoch ms; null if absent or invalid. */
export function localMinuteToMs(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** "06:30" from a local minute string. */
export function timeOf(s) {
  const m = s && s.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

/** Hours between two local minute strings; null if either missing or end is before start. */
export function hoursBetween(startStr, endStr) {
  const a = localMinuteToMs(startStr), b = localMinuteToMs(endStr);
  if (a == null || b == null || b < a) return null;
  return (b - a) / 3600000;
}

/** Inclusive list of ISO dates from `from` to `to`. */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Human duration like "9 h 30 min". */
export function formatHours(h) {
  if (h == null) return '';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (whole === 0) return `${mins} min`;
  if (mins === 0) return `${whole} h`;
  return `${whole} h ${mins} min`;
}

/** Minutes since midnight of "HH:MM". */
export function minutesOfTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
