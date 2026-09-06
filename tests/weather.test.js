// Weather module tests with fixture responses (no network). Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequests, normaliseWeather, describeWeather, roundCoord } from '../js/weather.js';
import { analyse, exposureDefinitions, exposureValue } from '../js/analysis.js';
import { defaultSettings, normaliseDay, WEATHER_FIELDS } from '../js/fields.js';
import { addDays } from '../js/dates.js';

function hours(date, values) {
  return values.map((v, i) => [`${date}T${String(i).padStart(2, '0')}:00`, v]);
}

function fixture({ date = '2026-09-06', prevPressure = 1020, pressures = null, pollen = false } = {}) {
  const prev = addDays(date, -1);
  const p = pressures || Array.from({ length: 24 }, (_, i) => 1015 - i * 0.5);        // falls 11.5 hPa across the day, mean ~1009.25
  const rows = [...hours(prev, Array(24).fill(prevPressure)), ...hours(date, p)];
  const forecast = {
    hourly: {
      time: rows.map(r => r[0]),
      pressure_msl: rows.map(r => r[1]),
      relative_humidity_2m: rows.map((_, i) => (i < 24 ? 60 : 70 + (i % 4) * 5)),   // day mean 77.5, max 85
      temperature_2m: rows.map((_, i) => 15 + (i % 24) / 2),
      precipitation: rows.map((_, i) => (i >= 24 && i % 6 === 0 ? 1.5 : 0)),
    },
    daily: { time: [prev, date], sunshine_duration: [30000, 23400], temperature_2m_max: [22, 26.4], temperature_2m_min: [12, 14.1], precipitation_sum: [0, 6] },
  };
  const air = {
    hourly: {
      time: rows.map(r => r[0]),
      pm2_5: rows.map((_, i) => (i < 24 ? 5 : 8 + (i % 24))),                          // day max 31, mean 19.5
      grass_pollen: rows.map((_, i) => (pollen ? (i < 24 ? 10 : 20 + (i % 24) * 2) : null)),
      birch_pollen: rows.map(() => (pollen ? 3 : null)),
      alder_pollen: rows.map(() => null), mugwort_pollen: rows.map(() => null), olive_pollen: rows.map(() => null), ragweed_pollen: rows.map(() => null),
    },
  };
  return { forecast, air };
}

test('requests carry a rounded location, the date and the day before', () => {
  const r = buildRequests({ lat: -28.6389, lon: 153.6127, date: '2026-09-06' });
  assert.match(r.forecast, /latitude=-28\.64&longitude=153\.61/);
  assert.match(r.forecast, /start_date=2026-09-05&end_date=2026-09-06/);
  assert.match(r.forecast, /pressure_msl/);
  assert.match(r.air, /pm2_5/);
  assert.match(r.air, /grass_pollen/);
  assert.equal(roundCoord(-28.6389), -28.64);
});

test('normalises hourly values into daily figures and the pressure change', () => {
  const { forecast, air } = fixture();
  const w = normaliseWeather({ forecast, air, date: '2026-09-06', lat: -28.64, lon: 153.61, fetchedAt: 'x' });
  assert.equal(w.pressureMax, 1015);
  assert.equal(w.pressureMin, 1003.5);
  assert.ok(Math.abs(w.pressureChange - (-10.75)) <= 0.06);   // mean 1009.25 - 1020, rounded to 0.1 (either neighbour)
  assert.equal(w.humidityMean, 77.5);
  assert.equal(w.humidityMax, 85);
  assert.equal(w.sunshineHours, 6.5);
  assert.equal(w.tempMax, 26.4);
  assert.equal(w.tempMin, 14.1);
  assert.equal(w.rainMm, 6);
  assert.equal(w.pm25Max, 31);
  assert.equal(w.pm25Mean, 19.5);
  assert.equal(w.pollen, null);
  assert.equal(w.pollenMax, null);
  assert.equal(w.airQualityAvailable, true);
  assert.equal(w.hasWeather, true);
  const lines = describeWeather(w);
  assert.ok(lines.some(l => /down 10\.[78] hPa/.test(l)));
  assert.ok(lines.some(l => /Pollen: not available/.test(l)));
  assert.ok(lines.some(l => /PM2\.5 up to 31.*poor air/.test(l)));
});

test('pollen is kept when the provider returns it; a missing air-quality response is tolerated', () => {
  const { forecast, air } = fixture({ pollen: true });
  const w = normaliseWeather({ forecast, air, date: '2026-09-06', lat: 52.52, lon: 13.41 });
  assert.equal(w.pollen.grass, 66);
  assert.equal(w.pollen.birch, 3);
  assert.equal(w.pollenMax, 66);
  assert.ok(describeWeather(w).some(l => /Pollen up to 66 grains\/m³ \(grass\), high/.test(l)));
  const w2 = normaliseWeather({ forecast, air: null, date: '2026-09-06', lat: 1, lon: 2 });
  assert.equal(w2.pm25Max, null);
  assert.equal(w2.airQualityAvailable, false);
  assert.equal(w2.hasWeather, true);
  assert.ok(describeWeather(w2).some(l => /Air quality: not retrieved/.test(l)));
  const w3 = normaliseWeather({ forecast: { hourly: { time: [], pressure_msl: [] } }, air: null, date: '2026-09-06', lat: 1, lon: 2 });
  assert.equal(w3.hasWeather, false);
});

test('weather figures become analysed exposures with editable cut-offs; days without weather are excluded', () => {
  const settings = defaultSettings();
  const defs = exposureDefinitions(settings);
  for (const f of WEATHER_FIELDS) assert.ok(defs.find(d => d.key === f.key), `${f.key} analysed`);
  assert.equal(settings.thresholds.wxPressureDrop, 5);
  const { forecast, air } = fixture();
  const w = normaliseWeather({ forecast, air, date: '2026-09-06', lat: 0, lon: 0 });
  const day = normaliseDay({ date: '2026-09-06', weather: w });
  const get = k => exposureValue(day, defs.find(d => d.key === k));
  assert.equal(get('wxPressureDrop'), 1);      // fell 10.8 >= 5
  assert.equal(get('wxPressureSwing'), 1);     // 11.5 >= 8
  assert.equal(get('wxHumid'), 0);             // 77.5 < 80
  assert.equal(get('wxLowSun'), 0);            // 6.5 h
  assert.equal(get('wxHot'), 0);               // 26.4 < 30
  assert.equal(get('wxRain'), 1);              // 6 mm >= 5
  assert.equal(get('wxPm25'), 1);              // 31 >= 25
  assert.equal(get('wxPollen'), null);         // no pollen data here
  assert.equal(exposureValue(normaliseDay({ date: '2026-09-07' }), defs.find(d => d.key === 'wxPressureDrop')), null);
  settings.thresholds.wxHumid = 70;
  assert.equal(exposureValue(day, exposureDefinitions(settings).find(d => d.key === 'wxHumid')), 1);
  assert.match(exposureDefinitions(settings).find(d => d.key === 'wxHumid').label, /70%/);
});

test('a planted pressure-drop trigger is found by the engine', () => {
  const settings = defaultSettings();
  const days = [];
  const start = '2026-01-01';
  for (let i = 0; i < 150; i++) {
    const date = addDays(start, i);
    const drop = i % 5 === 0;
    const attack = i % 10 === 1;             // attack the day after every second drop
    const day = normaliseDay({ date, weather: { source: 'open-meteo', pressureMean: 1015, pressureChange: drop ? -7 : 1, humidityMean: 60, sunshineHours: 8, tempMax: 24, rainMm: 0, pm25Max: 8, pollenMax: null, hasWeather: true } });
    if (attack) day.attacks.push({ id: `a${i}`, start: `${date}T09:00`, peakSeverity: 6 });
    days.push(day);
  }
  const report = analyse(days, settings, { today: addDays(start, 149) });
  const e = report.exposures.find(x => x.key === 'wxPressureDrop');
  assert.equal(e.verdict, 'clear');
  assert.equal(e.strongestKey, 'lag1');
  assert.match(e.headline, /Pressure drop/);
});
