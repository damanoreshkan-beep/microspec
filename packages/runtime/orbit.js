/* @ts-self-types="./orbit.d.ts" */
/**
 * # runtime/orbit.js — fetch a TLE once, propagate the satellite locally forever
 *
 * Satellite orbit propagation: wraps the vendored SGP4 propagator (./satellite.js, the canonical Vallado
 * port) into the small surface the farm needs — TLE → sub-satellite point (lat/lon/alt), ground speed, and a
 * physically-correct sunlit/eclipsed test. The point is resilience: orbital elements change slowly (~daily),
 * so a tracker fetches a TLE once and propagates the live position locally every second with zero further
 * network — it no longer dies when a live-position API's certificate or uptime does. A baked ISS TLE means
 * first paint, offline and the headless gate all get a plausible position before any fetch. Refs: satellite.js
 * (SGP4) · low-precision solar position (Astronomical Almanac) · cylindrical shadow model.
 *
 * ![orbit.js: TLE lines into a satrec, propagated to a sub-satellite point, ground speed and a sunlit test against the Earth's shadow cylinder](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-orbit.svg)
 *
 * ## Import
 * ```js
 * import { subpoint, makeSat, FALLBACK_TLE } from "/_rt/orbit.js";                       // an app's page: the import map resolves /_rt/
 * import { makeSat, parseTleText, subpoint, isSunlit } from "@microspec/core/runtime/orbit.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link makeSat} — `makeSat(l1, l2)` → the SGP4 `satrec` for two TLE lines (whitespace-tolerant).
 * - {@link parseTleText} — `parseTleText(txt)` → `{ line1, line2 }` from a 2-line or 3-line (name header) block,
 *   or null when either line is missing.
 * - {@link subpoint} — `subpoint(rec, date)` → `{ lat, lon, altKm, velocityKmh, eci, sunlit }`, or null if the
 *   propagator diverges (a decayed or garbage TLE).
 * - {@link isSunlit} — `isSunlit(eci, date)` → true when sunlit, false when eclipsed, by the cylindrical
 *   Earth-shadow model (WGS84 equatorial radius).
 * - {@link sunEciUnit} — `sunEciUnit(date)` → the Sun's direction as a unit vector in the propagator's
 *   ECI-equatorial frame, accurate to ~0.01°.
 * - {@link FALLBACK_TLE} — a recent ISS TLE `{ name, line1, line2 }` for offline, first paint and the gate.
 * - {@link sat} — the vendored satellite.js namespace (`twoline2satrec`, `propagate`, `gstime`,
 *   `eciToGeodetic`, …) for callers that need the raw API; typed as a plain record on purpose.
 *
 * ## In practice
 * The ISS tracker in globe: a satrec from the cache or the baked fallback, one fetch, then a local tick.
 * ```js
 * import { subpoint, makeSat, FALLBACK_TLE } from "/_rt/orbit.js";   // apps/globe/track.js
 *
 * // a satrec from cache or the baked fallback, so first paint (and offline / the gate) already has a position
 * function initialSat() {
 *   try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c && c.line1 && c.line2) return makeSat(c.line1, c.line2); } catch { }
 *   return makeSat(FALLBACK_TLE.line1, FALLBACK_TLE.line2);
 * }
 *
 * // propagate the current TLE locally every second — the dot moves with zero network per frame
 * const id = setInterval(() => { const r = recRef.current; if (r) { const p = subpoint(r, new Date()); if (p) setPos(p); } }, 1000);
 *
 * // fetch a fresh TLE once (refresh every few hours) and cache it; on failure keep propagating what we have
 * const j = await (await fetch(TLE_URL)).json();
 * recRef.current = makeSat(j.line1, j.line2);
 * ```
 *
 * ## How it fits
 * Imports the whole of satellite.js (`import * as satlib`) and re-exports it as `sat`; satellite.js is used
 * only through this module. No other runtime module imports it; tests/orbit_test.js verifies the propagator
 * against the standard SGP4 reference vector (TLE 00005, t=0) and the shadow test. 1 farm app imports it —
 * globe (the ISS tracker).
 *
 * ## Invariants and pitfalls
 * - `subpoint` returns null when the propagator diverges: a decayed or garbage TLE. Keep the last good
 *   position and the last good satrec; never let a null overwrite them.
 * - A fetched TLE REPLACES the baked one only after it loads; until then, and on any failed fetch, keep
 *   propagating what you have — the position stays live, just from slightly older elements.
 * - The ECI position from `subpoint` and the vector from `sunEciUnit` are in the same TEME/ECI-equatorial
 *   frame; `isSunlit` assumes that, so feed it `eci` from `subpoint`, not a geodetic point.
 * - `sunEciUnit` reads the date as UTC (`getUTC*`), so pass a real `Date` for the instant, not a local
 *   wall-clock reconstruction.
 * - `parseTleText` is whitespace-tolerant and finds lines by their `1 ` / `2 ` prefixes; a block with a name
 *   header parses, a block with only one line returns null.
 * - `sat` is a vendored library exposed as a plain record; its internals are not this package's API.
 * @module
 */
// microspec runtime — satellite orbit propagation. Wraps the vendored SGP4 propagator (./satellite.js, the
// canonical Vallado port) into the small surface the farm needs: TLE → sub-satellite point (lat/lon/alt),
// ground speed, and a physically-correct sunlit/eclipsed test. The point is resilience: fetch a TLE once
// (orbital elements change slowly, ~daily) and propagate the live position locally every second with zero
// further network — so the tracker no longer dies when a live-position API's certificate or uptime does.
// Refs: satellite.js (SGP4) · low-precision solar position (Astronomical Almanac) · cylindrical shadow model.
import * as satlib from "./satellite.js";
/**
 * The vendored SGP4 propagator (satellite.js), exposed for callers that need the raw API. Typed as a plain
 * record on purpose: it is a vendored library, and its eighteen internals are not this package's API.
 * @type {Record<string, any>}
 */
export const sat = satlib;

const R_EARTH = 6378.137;   // WGS84 equatorial radius (km) — the umbra cylinder radius for the shadow test

// A recent ISS TLE baked in as a fallback: first paint, offline, the headless gate, or a failed fetch all
// still get a plausible position by propagating this. A fresh TLE from the network replaces it when it loads.
/** A recent ISS TLE (`{ name, line1, line2 }`) baked in as the offline / first-paint / gate fallback. */
export const FALLBACK_TLE = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   26200.83077020  .00004561  00000+0  90718-4 0  9991",
  line2: "2 25544  51.6315 138.5480 0006793 315.6343  44.4100 15.49054454576813",
};

/**
 * Build a satellite record from two TLE lines (whitespace-tolerant).
 * @param l1 TLE line 1
 * @param l2 TLE line 2
 * @returns the SGP4 `satrec` to pass to `subpoint`
 */
export const makeSat = (l1, l2) => sat.twoline2satrec(l1.trim(), l2.trim());

// pull line1/line2 out of a TLE block (2-line, or 3-line with a name header) — tolerant of extra whitespace
/**
 * Pull line1/line2 out of a TLE text block (2-line, or 3-line with a name header).
 * @param txt the raw TLE text
 * @returns `{ line1, line2 }`, or null when either line is missing
 */
export function parseTleText(txt) {
  const lines = String(txt).split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
  const l1 = lines.find((l) => /^1 /.test(l)), l2 = lines.find((l) => /^2 /.test(l));
  return l1 && l2 ? { line1: l1, line2: l2 } : null;
}

// sub-satellite point + telemetry at `date`. Returns null if the propagator diverges (decayed/garbage TLE).
/**
 * Propagate a satellite record to `date` and return the sub-satellite point plus telemetry.
 * @param rec a `satrec` from `makeSat`
 * @param date the instant to propagate to
 * @returns `{ lat, lon, altKm, velocityKmh, eci, sunlit }`, or null if the propagator diverges
 */
export function subpoint(rec, date) {
  const pv = sat.propagate(rec, date);
  if (!pv || !pv.position || !Number.isFinite(pv.position.x)) return null;
  const geo = sat.eciToGeodetic(pv.position, sat.gstime(date));
  const v = pv.velocity;
  return {
    lat: sat.degreesLat(geo.latitude),
    lon: sat.degreesLong(geo.longitude),
    altKm: geo.height,
    velocityKmh: v ? Math.hypot(v.x, v.y, v.z) * 3600 : 0,
    eci: pv.position,
    sunlit: isSunlit(pv.position, date),
  };
}

// low-precision solar position → unit vector in the same (TEME/ECI-equatorial) frame as the propagator output.
// Accurate to ~0.01°, which is far finer than the shadow test needs. Refs: USNO low-precision sun formulae.
/**
 * Low-precision solar direction as a unit vector in the propagator's ECI-equatorial frame.
 * @param date the instant (UTC)
 * @returns `{ x, y, z }` unit vector toward the Sun
 */
export function sunEciUnit(date) {
  const jd = sat.jday(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
  const n = jd - 2451545.0;                                   // days since J2000.0
  const g = ((357.529 + 0.98560028 * n) % 360) * Math.PI / 180;
  const L = (280.459 + 0.98564736 * n) % 360;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;   // ecliptic longitude
  const eps = (23.439 - 3.6e-7 * n) * Math.PI / 180;          // obliquity of the ecliptic
  return { x: Math.cos(lambda), y: Math.cos(eps) * Math.sin(lambda), z: Math.sin(eps) * Math.sin(lambda) };
}

// is the satellite in sunlight? Sun-facing hemisphere is always lit; on the night side it is lit unless it
// falls inside Earth's cylindrical shadow (perpendicular distance from the anti-sun axis < Earth's radius).
/**
 * Whether a satellite at ECI position `eci` is in sunlight at `date` (cylindrical Earth-shadow model).
 * @param eci position `{ x, y, z }` in km, same frame as the propagator output
 * @param date the instant (UTC)
 * @returns true when sunlit, false when eclipsed
 */
export function isSunlit(eci, date) {
  const s = sunEciUnit(date), dot = eci.x * s.x + eci.y * s.y + eci.z * s.z;
  if (dot >= 0) return true;
  const px = eci.x - dot * s.x, py = eci.y - dot * s.y, pz = eci.z - dot * s.z;
  return Math.hypot(px, py, pz) > R_EARTH;
}
