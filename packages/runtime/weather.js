/* @ts-self-types="./weather.d.ts" */
/**
 * Weather numbers, dependency-free on purpose: WMO 4677 code tables (`wmoIcon`, `wmoKey`, `isSnowCode`,
 * `isStormCode`), low-precision solar position and moon phase (`solarPosition`, `moonPhase`), the mapping
 * from raw readings to the live-sky shader's channels (`skyVary`, `skyInk`), and the hourly temperature
 * spline (`curvePath`). Nothing here touches the DOM or the network, so every function is unit-tested.
 * @module
 */

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

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

/**
 * Sun altitude and azimuth for a place and instant.
 * @param lat degrees north · @param lng degrees east · @param ms epoch milliseconds (UTC)
 * @returns {{alt: number, az: number}} altitude in degrees above the horizon, azimuth 0=N clockwise
 */
export function solarPosition(lat, lng, ms) {
  const n = ms / 86400000 - 10957.5;                       
  const L = (280.460 + 0.9856474 * n) % 360;               
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;       
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;   
  const eps = (23.439 - 0.0000004 * n) * D2R;              
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;               
  const h = ((gmst * 15 + lng) * D2R) - ra;                
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
  const NEW_MOON = 947182440000;                            
  const SYNODIC = 29.530588853 * 86400000;
  return ((ms - NEW_MOON) % SYNODIC + SYNODIC) % SYNODIC / SYNODIC;
}


/**
 * vary = [sun altitude, cloud, wet, wind].
 * Altitude is normalised so -1 is civil twilight's floor (-12°) rather than the nadir: below that the sky
 * stops changing and spending range there would waste the whole night on one flat value.
 */
export function skyVary({ alt = 0, cloudPct = 0, precipMm = 0, precipProb = 0, windKmh = 0 }) {
  const a = alt >= 0 ? Math.min(1, alt / 60) : Math.max(-1, alt / 12);
  const wet = Math.max(Math.sqrt(clamp01(precipMm / 8)), clamp01(precipProb / 100) * 0.22);
  return [a, clamp01(cloudPct / 100), wet, clamp01(windKmh / 45)];
}

/**
 * ink = [snow, haze, storm, lightX].
 * `lightX` is the sun's azimuth flattened to a screen position: sunrise (90°) at the left edge, noon (180°,
 * due south) centred, sunset (270°) at the right.
 * in Kyiv, and a south-facing convention is the one that matches what is out of the window.
 */
export function skyInk({ code = 0, visibilityM = 40000, az = 180 }) {
  const haze = 1 - clamp01((visibilityM - 1000) / 14000);
  return [isSnowCode(code) ? 1 : 0, haze, isStormCode(code) ? 1 : 0, clamp01((az - 90) / 180)];
}

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
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    line += `C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  const area = `${line}L${pts[pts.length - 1].x.toFixed(2)},${h}L${pts[0].x.toFixed(2)},${h}Z`;
  return { line, area, points: pts, min, max };
}
