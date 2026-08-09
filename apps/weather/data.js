// Weather adapter — Open-Meteo (no key, CORS *), one request for everything the screen and the sky need.
//
// The sky in hero.wgsl is driven from THIS file: the shader never sees a millimetre or a kilometre per
// hour, only the 0..1 channels /_rt/weather.js maps them to. spec.json's `stage.vary` / `stage.ink` name
// the meta fields, so the three files are one contract — see RESEARCH.md for the captured API response.
import { fetchJson } from "/_rt/feed.js";
import { geo } from "/_rt/sensors.js";
import { gate } from "/_rt/gate.js";
import { wmoIcon, wmoKey, solarPosition, moonPhase, skyVary, skyInk } from "/_rt/weather.js";

const KYIV = { lat: 50.4501, lng: 30.5234, place: null };      // fallback — place null → the "place" i18n key
const LAST = "ms-weather-fix";

// Reverse geocoding, keyless and CORS-open, in the active language. Its policy allows exactly one use —
// the CALLING device's freshly obtained coordinates — which is what geo.once() returns, and it is already
// the geocoder apps/air uses. Never for a stored or typed coordinate. (Open-Meteo's own geocoder is
// forward-only, and Photon rejects lang=uk outright; see RESEARCH.md.)
async function placeName(lat, lng, loc) {
  try {
    const g = await fetchJson(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=${loc}`,
    );
    return g.city || g.locality || g.principalSubdivision || null;
  } catch { return null; }
}

// Gate fixture. The old adapter fetched LIVE here, so one Open-Meteo hiccup could red a run for an
// unrelated commit — and headless has no GPS, so the geolocated branch was never the one being measured.
// This seeds the GRANTED branch (a named place, so [data-live] mounts) and the WIDEST strings: a negative
// two-digit temperature, a three-digit gust, 100% probability. A fair-weather fixture measures nothing.
const FIXTURE = {
  place: "Kyiv",
  cur: { temperature_2m: -15, apparent_temperature: -21, relative_humidity_2m: 93, weather_code: 73,
    wind_speed_10m: 42, wind_direction_10m: 310, wind_gusts_10m: 108, cloud_cover: 96, precipitation: 1.8,
    precipitation_probability: 100, is_day: 1, visibility: 3200, uv_index: 0, time: "2026-01-14T13:15" },
  hourly: [-15, -14, -14, -13, -13, -12, -12, -13, -14, -15, -16, -17],
  daily: [[-11, -18, 73, 100], [-8, -15, 71, 80], [-3, -9, 3, 20], [1, -4, 61, 60], [2, -1, 3, 0]],
};

export async function load() {
  const loc = (typeof document !== "undefined" && document.documentElement.lang) || "en";
  if (gate) return shape(FIXTURE.place, KYIV.lat, KYIV.lng, gateResponse(), loc);

  // Last known fix first, so a second launch is not held behind a permission dialog; the fresh fix then
  // overwrites it for the next one. A denied or ignored prompt therefore costs the timeout once, ever.
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LAST) || "null"); } catch { /* private mode */ }
  let fix = null;
  try { fix = await geo.once({ timeout: 6000, maximumAge: 600000 }); } catch { /* denied / no signal */ }
  if (fix) {
    try { localStorage.setItem(LAST, JSON.stringify({ lat: fix.lat, lng: fix.lng })); } catch { /* private mode */ }
  }
  const at = fix || saved || KYIV;
  const place = fix ? await placeName(at.lat, at.lng, loc) : (saved ? await placeName(at.lat, at.lng, loc) : null);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${at.lat.toFixed(4)}&longitude=${at.lng.toFixed(4)}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m," +
    "wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,precipitation_probability,is_day,visibility,uv_index" +
    "&hourly=temperature_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=auto&forecast_days=5";
  return shape(place, at.lat, at.lng, await fetchJson(url), loc);
}

/** The fixture in the wire's own shape, so everything below stays under test rather than being bypassed. */
function gateResponse() {
  const day = (i) => `2026-01-${String(14 + i).padStart(2, "0")}`;
  return {
    utc_offset_seconds: 7200,
    current: FIXTURE.cur,
    hourly: {
      time: FIXTURE.hourly.map((_, i) => `2026-01-14T${String(13 + i).padStart(2, "0")}:00`),
      temperature_2m: FIXTURE.hourly,
      weather_code: FIXTURE.hourly.map(() => 73),
    },
    daily: {
      time: FIXTURE.daily.map((_, i) => day(i)),
      temperature_2m_max: FIXTURE.daily.map((d) => d[0]),
      temperature_2m_min: FIXTURE.daily.map((d) => d[1]),
      weather_code: FIXTURE.daily.map((d) => d[2]),
      precipitation_probability_max: FIXTURE.daily.map((d) => d[3]),
    },
  };
}

function shape(place, lat, lng, d, loc) {
  const now = d.current;
  // timezone=auto returns LOCAL wall-clock strings with no offset, so new Date(now.time) would parse them
  // in the DEVICE's zone — a sun placed by a phone that is roaming. Rebuild the instant from the offset the
  // response itself carries. (Under the gate this pins the sky to a fixed January afternoon.)
  const ms = Date.parse(now.time + "Z") - (d.utc_offset_seconds || 0) * 1000;
  const sun = solarPosition(lat, lng, ms);

  // hourly.time is on the hour and current.time is quarter-hourly, so these never match exactly: compare
  // the 13-character "YYYY-MM-DDTHH" prefix instead of the whole string.
  const hourKey = now.time.slice(0, 13);
  const start = Math.max(0, d.hourly.time.findIndex((t) => t.slice(0, 13) >= hourKey));
  const hourly = d.hourly.time.slice(start, start + 12).map((t, i) => ({
    // The HOUR only. "13:00" is 5 mono characters and the strip's column is 48px, so a full clock ran the
    // labels together into "13:0014:0015:00" — one unreadable string across the whole strip.
    time: t.slice(11, 13),
    temp: Math.round(d.hourly.temperature_2m[start + i]),
    wicon: wmoIcon(d.hourly.weather_code[start + i]),
  }));

  const items = d.daily.time.map((t, i) => ({
    day: t,                                      // raw ISO — the weekday is rendered locale-aware upstream
    hi: Math.round(d.daily.temperature_2m_max[i]),
    lo: Math.round(d.daily.temperature_2m_min[i]),
    prob: d.daily.precipitation_probability_max[i] ?? 0,
    wicon: wmoIcon(d.daily.weather_code[i]),
  }));

  // `sky*` prefixes are not decoration: the sky's wind is a 0..1 channel and the metric's wind is km/h, and
  // an unprefixed `wind` on both silently made the readout show 0.06 — one object literal, last key wins.
  const [skyAlt, skyCloud, skyWet, skyWind] = skyVary({
    alt: sun.alt, cloudPct: now.cloud_cover, precipMm: now.precipitation,
    precipProb: now.precipitation_probability, windKmh: now.wind_speed_10m,
  });
  const [skySnow, skyHaze, skyStorm, skyLight] = skyInk({
    code: now.weather_code, visibilityM: now.visibility, az: sun.az,
  });

  return {
    items,
    meta: {
      place: place || "place",                   // a real name, or the i18n key the dashboard localises
      temp: Math.round(now.temperature_2m),
      cond: wmoKey(now.weather_code),            // an i18n key — the caption goes through T()
      wicon: wmoIcon(now.weather_code),
      feels: Math.round(now.apparent_temperature),
      humidity: now.relative_humidity_2m,
      wind: Math.round(now.wind_speed_10m),
      gust: Math.round(now.wind_gusts_10m),
      rain: now.precipitation_probability ?? 0,
      hourly,
      skyAlt, skyCloud, skyWet, skyWind, skySnow, skyHaze, skyStorm, skyLight,   // see spec.stage
      moon: moonPhase(ms),
    },
  };
}
