// Weather and air quality for a day and location, from Open-Meteo (free, no
// key, no account). The only network call the app ever makes, and only when
// the user taps the button. What leaves the device: latitude and longitude
// rounded to two decimals (about 1 km) and the date.
//
// The pure parts (buildRequests, normaliseWeather, describeWeather) are unit
// tested with fixture JSON; the browser parts are at the bottom.

import { addDays, nowWithOffset } from './dates.js';

export const WEATHER_SOURCE = 'open-meteo';
export const MAX_PAST_DAYS = 90;

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const POLLEN_TYPES = ['grass', 'birch', 'alder', 'mugwort', 'olive', 'ragweed'];

/** Round a coordinate to about 1 km so the request carries no more than needed. */
export function roundCoord(x) { return Math.round(Number(x) * 100) / 100; }

/** The two request URLs for a date (the day before is included for the pressure change). */
export function buildRequests({ lat, lon, date }) {
  const from = addDays(date, -1);
  const common = `latitude=${roundCoord(lat)}&longitude=${roundCoord(lon)}&timezone=auto&start_date=${from}&end_date=${date}`;
  return {
    forecast: `${FORECAST_URL}?${common}&hourly=pressure_msl,relative_humidity_2m,temperature_2m,precipitation&daily=sunshine_duration,temperature_2m_max,temperature_2m_min,precipitation_sum`,
    air: `${AIR_URL}?${common}&hourly=pm2_5,${POLLEN_TYPES.map(t => `${t}_pollen`).join(',')}`,
  };
}

function nums(arr) { return (arr || []).filter(v => typeof v === 'number' && Number.isFinite(v)); }
function r1(v) { if (v == null) return null; const r = Math.round(v * 10) / 10; return r === 0 ? 0 : r; }
function minOf(a) { const n = nums(a); return n.length ? Math.min(...n) : null; }
function maxOf(a) { const n = nums(a); return n.length ? Math.max(...n) : null; }
function meanOf(a) { const n = nums(a); return n.length ? n.reduce((s, v) => s + v, 0) / n.length : null; }
function sumOf(a) { const n = nums(a); return n.length ? n.reduce((s, v) => s + v, 0) : null; }

/** Pick the hourly values whose timestamp falls on `date`. */
function hoursOn(hourly, key, date) {
  if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly[key])) return [];
  const out = [];
  hourly.time.forEach((t, i) => { if (typeof t === 'string' && t.startsWith(date)) out.push(hourly[key][i]); });
  return out;
}

function dailyOn(daily, key, date) {
  if (!daily || !Array.isArray(daily.time) || !Array.isArray(daily[key])) return null;
  const i = daily.time.indexOf(date);
  const v = i >= 0 ? daily[key][i] : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Turn the two Open-Meteo responses into the record stored on the day.
 * Either response may be null (for example the air-quality call failed).
 */
export function normaliseWeather({ forecast, air, date, lat, lon, fetchedAt = nowWithOffset() }) {
  const prev = addDays(date, -1);
  const h = forecast && forecast.hourly;
  const d = forecast && forecast.daily;
  const pressures = hoursOn(h, 'pressure_msl', date);
  const prevMean = meanOf(hoursOn(h, 'pressure_msl', prev));
  const mean = meanOf(pressures);
  const sunshineSeconds = dailyOn(d, 'sunshine_duration', date);
  const temps = hoursOn(h, 'temperature_2m', date);
  const rainDaily = dailyOn(d, 'precipitation_sum', date);

  const ah = air && air.hourly;
  const pm = hoursOn(ah, 'pm2_5', date);
  const pollen = {};
  let anyPollen = false;
  for (const t of POLLEN_TYPES) {
    const m = maxOf(hoursOn(ah, `${t}_pollen`, date));
    pollen[t] = r1(m);
    if (m != null) anyPollen = true;
  }

  const w = {
    source: WEATHER_SOURCE,
    fetchedAt,
    lat: roundCoord(lat), lon: roundCoord(lon),
    pressureMin: r1(minOf(pressures)),
    pressureMax: r1(maxOf(pressures)),
    pressureMean: r1(mean),
    pressureChange: mean != null && prevMean != null ? r1(mean - prevMean) : null,
    humidityMean: r1(meanOf(hoursOn(h, 'relative_humidity_2m', date))),
    humidityMax: r1(maxOf(hoursOn(h, 'relative_humidity_2m', date))),
    sunshineHours: sunshineSeconds == null ? null : r1(sunshineSeconds / 3600),
    tempMax: r1(dailyOn(d, 'temperature_2m_max', date) ?? maxOf(temps)),
    tempMin: r1(dailyOn(d, 'temperature_2m_min', date) ?? minOf(temps)),
    rainMm: r1(rainDaily ?? sumOf(hoursOn(h, 'precipitation', date))),
    pm25Max: r1(maxOf(pm)),
    pm25Mean: r1(meanOf(pm)),
    pollen: anyPollen ? pollen : null,
    pollenMax: anyPollen ? r1(Math.max(...Object.values(pollen).filter(v => v != null))) : null,
    airQualityAvailable: !!(air && air.hourly),
  };
  w.hasWeather = w.pressureMean != null || w.tempMax != null || w.humidityMean != null;
  return w;
}

/** Plain-English lines for the day's weather card. */
export function describeWeather(w) {
  if (!w) return [];
  const lines = [];
  if (w.pressureMin != null && w.pressureMax != null) {
    let s = `Pressure ${fmt(w.pressureMin)}–${fmt(w.pressureMax)} hPa`;
    if (w.pressureChange != null) {
      const c = w.pressureChange;
      s += Math.abs(c) < 0.5 ? ', steady since the day before' : `, ${c < 0 ? 'down' : 'up'} ${fmt(Math.abs(c))} hPa since the day before`;
    }
    lines.push(s);
  }
  if (w.humidityMean != null) lines.push(`Humidity ${Math.round(w.humidityMean)}% average${w.humidityMax != null ? `, ${Math.round(w.humidityMax)}% at most` : ''}`);
  if (w.sunshineHours != null) lines.push(`Sunshine ${fmt(w.sunshineHours)} h`);
  if (w.tempMin != null && w.tempMax != null) lines.push(`Temperature ${fmt(w.tempMin)}–${fmt(w.tempMax)} °C`);
  if (w.rainMm != null) lines.push(w.rainMm === 0 ? 'No rain' : `Rain ${fmt(w.rainMm)} mm`);
  if (w.pm25Max != null) lines.push(`PM2.5 up to ${fmt(w.pm25Max)} µg/m³${w.pm25Max >= 25 ? ' (poor air)' : w.pm25Max >= 15 ? ' (moderate)' : ' (good air)'}`);
  else if (w.airQualityAvailable === false) lines.push('Air quality: not retrieved');
  if (w.pollenMax != null) {
    const top = Object.entries(w.pollen).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])[0];
    lines.push(`Pollen up to ${fmt(w.pollenMax)} grains/m³ (${top[0]})${w.pollenMax >= 50 ? ', high' : w.pollenMax >= 20 ? ', moderate' : ', low'}`);
  } else if (w.airQualityAvailable) lines.push('Pollen: not available for this location');
  return lines;
}

function fmt(v) { return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10); }

/* ---------- Browser side ---------- */

/** Current position, rounded; falls back to the last saved location. */
export function getLocation(settings) {
  return new Promise((resolve, reject) => {
    const saved = settings && settings.lastLocation;
    const fallback = () => (saved ? resolve({ ...saved, fromSaved: true }) : reject(new Error('Location is needed to look up the weather. Allow location access when asked, or try again outdoors.')));
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), at: nowWithOffset(), fromSaved: false }),
      () => fallback(),
      { timeout: 10000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false });
  });
}

async function getJSON(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`The weather service answered ${res.status}.`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/** Fetch and normalise the weather for a date and place. Air quality failing is not fatal. */
export async function fetchWeather({ lat, lon, date }) {
  const urls = buildRequests({ lat, lon, date });
  const [forecast, air] = await Promise.all([
    getJSON(urls.forecast),
    getJSON(urls.air).catch(() => null),
  ]);
  if (forecast && forecast.error) throw new Error(forecast.reason || 'The weather service rejected the request.');
  const w = normaliseWeather({ forecast, air, date, lat, lon });
  if (!w.hasWeather) throw new Error('The weather service had no data for that day.');
  return w;
}
