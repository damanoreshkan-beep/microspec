/* @ts-self-types="./weather.d.ts" */
/**
 * Weather numbers, dependency-free on purpose: WMO 4677 code tables (`wmoIcon`, `wmoKey`, `isSnowCode`,
 * `isStormCode`), low-precision solar position and moon phase (`solarPosition`, `moonPhase`), the mapping
 * from raw readings to the live-sky shader's channels (`skyVary`, `skyInk`), and the hourly temperature
 * spline (`curvePath`). Nothing here touches the DOM or the network, so every function is unit-tested.
 * @module
 */
// microspec runtime — weather: WMO code tables, solar position, and the numbers a live sky is driven by.
//
// DEPENDENCY-FREE ON PURPOSE. `astro.js` already wraps SunCalc and astronomy-engine, and it would have
// answered "where is the sun" in one line — but it pulls two ESM packages and `htm/preact`, so importing it
// into a weather adapter loads a natal-chart engine to place a glow, and the unit test would need the
// network. The solar position below is the standard low-precision NOAA/Almanac series, ~0.01° on altitude,
// which is four orders of magnitude better than "where should this gradient sit". Same reason natal.js and
// aspects.js are separate from astro.js.
//
// Nothing here touches the DOM or the network, so every function is unit-tested in
// packages/runtime/tests/weather_test.js.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── WMO 4677 present-weather codes ────────────────────────────────────────────────────────────────────
// Open-Meteo returns these for current, hourly and daily. The daily one is the day's most SEVERE code, not
// its midday one — a single 03:00 shower labels the whole row rain. That is the useful reading for a
// forecast, but it is not the same question as "what is it doing now".
/**
 * Lucide icon name for a WMO 4677 present-weather code.
 * @param c the WMO code (0..99)
 * @returns an `lucide:*` icon id
 */
export const wmoIcon = (c) =>
  c === 0 ? "lucide:sun"
    : c <= 2 ? "lucide:cloud-sun"
    : c === 3 ? "lucide:cloud"
    : c <= 48 ? "lucide:cloud-fog"
    : c <= 57 ? "lucide:cloud-drizzle"
    : c <= 67 ? "lucide:cloud-rain"
    : c <= 77 ? "lucide:snowflake"
    : c <= 82 ? "lucide:cloud-rain-wind"
    : c <= 86 ? "lucide:cloud-snow"
    : "lucide:cloud-lightning";

/** i18n key for the condition in words. The app owns the strings; this owns the mapping. */
export const wmoKey = (c) =>
  c === 0 ? "wClear"
    : c <= 2 ? "wPartly"
    : c === 3 ? "wOvercast"
    : c <= 48 ? "wFog"
    : c <= 57 ? "wDrizzle"
    : c <= 67 ? "wRain"
    : c <= 77 ? "wSnow"
    : c <= 82 ? "wShowers"
    : c <= 86 ? "wSnowShowers"
    : "wThunder";

/** Frozen precipitation: snowfall 71-77, snow grains included, and snow showers 85-86. */
export const isSnowCode = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
/** Thunderstorm, with or without hail. */
export const isStormCode = (c) => c >= 95;

// ── solar position ────────────────────────────────────────────────────────────────────────────────────
/**
 * Sun altitude and azimuth for a place and instant.
 * @param lat degrees north · @param lng degrees east · @param ms epoch milliseconds (UTC)
 * @returns {{alt: number, az: number}} altitude in degrees above the horizon, azimuth 0=N clockwise
 */
export function solarPosition(lat, lng, ms) {
  const n = ms / 86400000 - 10957.5;                       // days from J2000.0 (2000-01-01T12:00Z)
  const L = (280.460 + 0.9856474 * n) % 360;               // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;       // mean anomaly
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;   // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * D2R;              // obliquity
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;               // hours
  const h = ((gmst * 15 + lng) * D2R) - ra;                // local hour angle
  const sinAlt = Math.sin(lat * D2R) * Math.sin(dec) + Math.cos(lat * D2R) * Math.cos(dec) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * R2D;
  const az = (Math.atan2(-Math.sin(h) * Math.cos(dec),
    Math.cos(lat * D2R) * Math.sin(dec) - Math.sin(lat * D2R) * Math.cos(dec) * Math.cos(h)) * R2D + 360) % 360;
  return { alt, az };
}

/**
 * Moon phase 0..1 — 0 and 1 new, 0.5 full. Mean synodic month from a known new moon; good to about half a
 * day, which is a crescent one pixel off and nobody's evening ruined.
 */
export function moonPhase(ms) {
  const NEW_MOON = 947182440000;                            // 2000-01-06T18:14Z, a reference new moon
  const SYNODIC = 29.530588853 * 86400000;
  return ((ms - NEW_MOON) % SYNODIC + SYNODIC) % SYNODIC / SYNODIC;
}

// ── the sky's channels ────────────────────────────────────────────────────────────────────────────────
// These are the ONLY place the raw readings become scene parameters, so the shader never has to know what
// a millimetre or a kilometre per hour is, and the mapping is testable. apps/weather/hero.wgsl documents
// what each slot means; the two files are a contract and must move together.

/**
 * vary = [sun altitude, cloud, wet, wind].
 * Altitude is normalised so -1 is civil twilight's floor (-12°) rather than the nadir: below that the sky
 * stops changing and spending range there would waste the whole night on one flat value.
 */
export function skyVary({ alt = 0, cloudPct = 0, precipMm = 0, precipProb = 0, windKmh = 0 }) {
  const a = alt >= 0 ? Math.min(1, alt / 60) : Math.max(-1, alt / 12);
  // Precipitation is dominated by its low end: 0.5 mm/h is visible rain and 8 mm/h is a downpour, so a
  // linear map would render every ordinary shower as nothing. sqrt keeps the bottom of the range readable.
  // Probability alone can wet the sky a little — "it is about to rain" is a real state of the sky.
  const wet = Math.max(Math.sqrt(clamp01(precipMm / 8)), clamp01(precipProb / 100) * 0.22);
  return [a, clamp01(cloudPct / 100), wet, clamp01(windKmh / 45)];
}

/**
 * ink = [snow, haze, storm, lightX].
 * `lightX` is the sun's azimuth flattened to a screen position: sunrise (90°) at the left edge, noon (180°,
 * due south) centred, sunset (270°) at the right. Northern hemisphere framing, deliberately — the owner is
 * in Kyiv, and a south-facing convention is the one that matches what is out of the window.
 */
export function skyInk({ code = 0, visibilityM = 40000, az = 180 }) {
  const haze = 1 - clamp01((visibilityM - 1000) / 14000);
  return [isSnowCode(code) ? 1 : 0, haze, isStormCode(code) ? 1 : 0, clamp01((az - 90) / 180)];
}

// ── the hourly curve ──────────────────────────────────────────────────────────────────────────────────
/**
 * A smooth path through evenly spaced values, as an SVG `d` plus the same path closed into an area.
 * Catmull-Rom converted to cubic Béziers: a polyline reads as a chart of a sensor, a spline reads as
 * temperature, which is the thing being drawn.
 *
 * @returns {{line: string, area: string, points: {x: number, y: number}[], min: number, max: number}}
 *          Empty strings when there is nothing to draw — callers must not have to guard.
 */
export function curvePath(values, w, h, pad = 0) {
  const vals = (values || []).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return { line: "", area: "", points: [], min: 0, max: 0 };
  const min = Math.min(...vals), max = Math.max(...vals);
  // A flat twelve hours is a real forecast, and it must not divide by zero. Substituting a nominal span is
  // not enough on its own: (v - min) is then 0 for every point and the whole line pins to the BOTTOM of the
  // band, which reads as a cold snap. Flat data belongs on the centre line.
  const flat = max === min;
  const span = flat ? 1 : max - min;
  const inner = Math.max(1, h - pad * 2);
  const pts = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * w,
    y: pad + (flat ? 0.5 : 1 - (v - min) / span) * inner,
  }));
  let line = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    // Tension 1/6 is the Catmull-Rom → Bézier identity; anything larger overshoots, and an overshooting
    // temperature curve invents a peak the data does not have.
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    line += `C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  const area = `${line}L${pts[pts.length - 1].x.toFixed(2)},${h}L${pts[0].x.toFixed(2)},${h}Z`;
  return { line, area, points: pts, min, max };
}
