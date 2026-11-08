/**
 * # runtime/geomag.js — the Earth's magnetic field from the World Magnetic Model, proven against NOAA's test points
 *
 * A phone's compass points at MAGNETIC north. True north is somewhere else — in Ukraine by about +7°, in
 * parts of Alaska by 20° — and the difference is not a constant you can hardcode: it depends on where you
 * are, and it drifts every year. Every compass app that draws "N" from the raw magnetometer is wrong,
 * quietly, by a bearing error that matters the moment you use it for anything. This module is WMM2025: a
 * degree-12 spherical-harmonic model of the core field, 90 Gauss coefficient rows plus their secular
 * variation, issued by the US NGA and the UK DGC (NOAA NCEI / BGS), epoch 2025.0, valid to the end of 2029;
 * the coefficients are the official WMM2025.COF, unrounded and untouched. The point is not that the model
 * is famous — it is that NOAA ships 100 official test points with it, so this file's correctness is a
 * MEASUREMENT, not a claim: every one of those points is asserted in the unit gate, and a sign error or a
 * botched Legendre recursion cannot survive it. Same standard as groove.js (bjorklund(3,8) IS the
 * tresillo) — implement the rule, then prove it against the authority.
 *
 * ![The geomag map: a geodetic point and a decimal year in, the Gauss coefficients and Legendre recursion, the field vector and the declination a compass adds](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-geomag.svg)
 *
 * ## Import
 * ```js
 * import { declination, decimalYear, inRange, trueFrom } from "/_rt/geomag.js";                    // an app's page: the import map resolves /_rt/
 * import { field, declination, decimalYear, inRange } from "@microspec/core/runtime/geomag.js";     // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link field} — `field(latDeg, lonDeg, altKm = 0, year = EPOCH)` → `{ X, Y, Z, H, F, declination, inclination }`: north/east/down components, horizontal and total intensity in nT, angles in degrees.
 * - {@link declination} — `declination(lat, lon, altKm = 0, year = EPOCH)`: the one number a compass needs, east-positive; ADD it to a magnetic bearing for a true one.
 * - {@link trueFrom} — `trueFrom(magneticDeg, dec)`: the magnetic heading plus the declination, normalised to 0..360; a null/undefined `dec` leaves the heading magnetic.
 * - {@link decimalYear} — a Date (default now) → the decimal year the model takes (UTC, fraction of the year elapsed).
 * - {@link inRange} — whether a decimal year (default now) satisfies `EPOCH ≤ year < VALID_UNTIL`.
 * - {@link EPOCH} — `2025.0`, the model epoch; secular variation is applied relative to it.
 * - {@link VALID_UNTIL} — `2030.0`, the end of validity (exclusive); beyond it the coefficients are extrapolation.
 *
 * ## In practice
 * ```js
 * // sensors.js — the runtime's compass loads the model lazily, once a position is known
 * wmm = wmm || await import("./geomag.js");
 * const y = wmm.decimalYear();
 * // Outside the model's window an extrapolated declination is a guess wearing a decimal point.
 * dec = wmm.inRange(y) ? wmm.declination(p.lat, p.lng, (p.altitude || 0) / 1000, y) : null;
 *
 * // compass — the app discloses the declination it is working with (and when there is none)
 * import { declination, decimalYear, inRange } from "/_rt/geomag.js";
 * const year = decimalYear();
 * const stale = !inRange(year);                                   // WMM2025 is only valid 2025.0–2030.0
 * const seed = stale ? null : declination(SAMPLE.lat, SAMPLE.lng, 0, year);
 * ```
 *
 * ## How it fits
 * No imports — pure arithmetic over an embedded coefficient table, so it runs in a page and in the Deno
 * unit gate alike (`tests/geomag_test.js` asserts all 100 NOAA test values). Inside the runtime,
 * `sensors.js` dynamic-imports it from the compass capability when true north is requested and a position
 * arrives, so the apps that only take `haptic` from sensors never pay for the ~2 KB of coefficients. In the
 * farm one app imports it directly: compass; the apps that call `compass.start` with the default
 * `trueNorth: true` (sun, homin, …) reach it through `sensors.js`. The product rt/ names it as the reference
 * shape for a domain module (synastry.js: "depth lives here with unit tests, like astro.js / geomag.js").
 *
 * ## Invariants and pitfalls
 * - Units: lat/lon in degrees, altitude in KILOMETRES above the WGS84 ellipsoid, time as a decimal year. `sensors.js` divides the geolocation altitude in metres by 1000.
 * - Declination is east-positive and ADDS: `true = magnetic + declination`. Spread across apps this is one addition each can get backwards or never do — which is why `trueFrom` exists in one place.
 * - The model is a function of time, not a snapshot; pass `decimalYear()`, never `EPOCH`, for a live compass — a compass that ignores this is stale by design.
 * - `inRange` guards the window 2025.0–2030.0. Outside it the coefficients are extrapolation; say so rather than quietly keep drawing an arrow (the compass app labels the bearing).
 * - Geodetic → geocentric conversion is worth tenths of a degree of declination — small, and exactly the kind of small a test point catches and a demo does not.
 * - The sectoral Legendre recursion is only valid from n=2; Schmidt fixes P(1,1) = sinθ exactly. Starting it at n=1 scales every sectoral term by √½ and reads as a field of almost the right STRENGTH in the wrong DIRECTION.
 * - The north component accumulates with `+=`: θ is the geocentric colatitude, so dP/dθ already points south. Negating it again leaves |X|, H, F and inclination exact and only the declination reversed — every scalar check passes and the one thing a compass is for is upside down.
 * - The sign of the geodetic rotation term `sa` was solved out of the reference data, not chosen; it is ~3e-3 and getting it backwards costs ~80 nT — invisible in a demo.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/geomag.js — edit the JSDoc there, never this file.
/**
 * Evaluates the WMM2025 field at a geodetic point.
 * @param latDeg geodetic latitude in degrees
 * @param lonDeg longitude in degrees
 * @param altKm altitude in kilometres above the WGS84 ellipsoid
 * @param year decimal year (see `decimalYear`)
 * @returns `{ X, Y, Z, H, F, declination, inclination }` — components in nT, angles in degrees
 *   (declination positive when magnetic north lies east of true north)
 */
export function field(latDeg: any, lonDeg: any, altKm?: number, year?: number): {
    X: number;
    Y: number;
    Z: number;
    H: number;
    F: number;
    declination: number;
    inclination: number;
};
/**
 * # runtime/geomag.js — the Earth's magnetic field from the World Magnetic Model, proven against NOAA's test points
 *
 * A phone's compass points at MAGNETIC north. True north is somewhere else — in Ukraine by about +7°, in
 * parts of Alaska by 20° — and the difference is not a constant you can hardcode: it depends on where you
 * are, and it drifts every year. Every compass app that draws "N" from the raw magnetometer is wrong,
 * quietly, by a bearing error that matters the moment you use it for anything. This module is WMM2025: a
 * degree-12 spherical-harmonic model of the core field, 90 Gauss coefficient rows plus their secular
 * variation, issued by the US NGA and the UK DGC (NOAA NCEI / BGS), epoch 2025.0, valid to the end of 2029;
 * the coefficients are the official WMM2025.COF, unrounded and untouched. The point is not that the model
 * is famous — it is that NOAA ships 100 official test points with it, so this file's correctness is a
 * MEASUREMENT, not a claim: every one of those points is asserted in the unit gate, and a sign error or a
 * botched Legendre recursion cannot survive it. Same standard as groove.js (bjorklund(3,8) IS the
 * tresillo) — implement the rule, then prove it against the authority.
 *
 * ![The geomag map: a geodetic point and a decimal year in, the Gauss coefficients and Legendre recursion, the field vector and the declination a compass adds](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-geomag.svg)
 *
 * ## Import
 * ```js
 * import { declination, decimalYear, inRange, trueFrom } from "/_rt/geomag.js";                    // an app's page: the import map resolves /_rt/
 * import { field, declination, decimalYear, inRange } from "@microspec/core/runtime/geomag.js";     // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link field} — `field(latDeg, lonDeg, altKm = 0, year = EPOCH)` → `{ X, Y, Z, H, F, declination, inclination }`: north/east/down components, horizontal and total intensity in nT, angles in degrees.
 * - {@link declination} — `declination(lat, lon, altKm = 0, year = EPOCH)`: the one number a compass needs, east-positive; ADD it to a magnetic bearing for a true one.
 * - {@link trueFrom} — `trueFrom(magneticDeg, dec)`: the magnetic heading plus the declination, normalised to 0..360; a null/undefined `dec` leaves the heading magnetic.
 * - {@link decimalYear} — a Date (default now) → the decimal year the model takes (UTC, fraction of the year elapsed).
 * - {@link inRange} — whether a decimal year (default now) satisfies `EPOCH ≤ year < VALID_UNTIL`.
 * - {@link EPOCH} — `2025.0`, the model epoch; secular variation is applied relative to it.
 * - {@link VALID_UNTIL} — `2030.0`, the end of validity (exclusive); beyond it the coefficients are extrapolation.
 *
 * ## In practice
 * ```js
 * // sensors.js — the runtime's compass loads the model lazily, once a position is known
 * wmm = wmm || await import("./geomag.js");
 * const y = wmm.decimalYear();
 * // Outside the model's window an extrapolated declination is a guess wearing a decimal point.
 * dec = wmm.inRange(y) ? wmm.declination(p.lat, p.lng, (p.altitude || 0) / 1000, y) : null;
 *
 * // compass — the app discloses the declination it is working with (and when there is none)
 * import { declination, decimalYear, inRange } from "/_rt/geomag.js";
 * const year = decimalYear();
 * const stale = !inRange(year);                                   // WMM2025 is only valid 2025.0–2030.0
 * const seed = stale ? null : declination(SAMPLE.lat, SAMPLE.lng, 0, year);
 * ```
 *
 * ## How it fits
 * No imports — pure arithmetic over an embedded coefficient table, so it runs in a page and in the Deno
 * unit gate alike (`tests/geomag_test.js` asserts all 100 NOAA test values). Inside the runtime,
 * `sensors.js` dynamic-imports it from the compass capability when true north is requested and a position
 * arrives, so the apps that only take `haptic` from sensors never pay for the ~2 KB of coefficients. In the
 * farm one app imports it directly: compass; the apps that call `compass.start` with the default
 * `trueNorth: true` (sun, homin, …) reach it through `sensors.js`. The product rt/ names it as the reference
 * shape for a domain module (synastry.js: "depth lives here with unit tests, like astro.js / geomag.js").
 *
 * ## Invariants and pitfalls
 * - Units: lat/lon in degrees, altitude in KILOMETRES above the WGS84 ellipsoid, time as a decimal year. `sensors.js` divides the geolocation altitude in metres by 1000.
 * - Declination is east-positive and ADDS: `true = magnetic + declination`. Spread across apps this is one addition each can get backwards or never do — which is why `trueFrom` exists in one place.
 * - The model is a function of time, not a snapshot; pass `decimalYear()`, never `EPOCH`, for a live compass — a compass that ignores this is stale by design.
 * - `inRange` guards the window 2025.0–2030.0. Outside it the coefficients are extrapolation; say so rather than quietly keep drawing an arrow (the compass app labels the bearing).
 * - Geodetic → geocentric conversion is worth tenths of a degree of declination — small, and exactly the kind of small a test point catches and a demo does not.
 * - The sectoral Legendre recursion is only valid from n=2; Schmidt fixes P(1,1) = sinθ exactly. Starting it at n=1 scales every sectoral term by √½ and reads as a field of almost the right STRENGTH in the wrong DIRECTION.
 * - The north component accumulates with `+=`: θ is the geocentric colatitude, so dP/dθ already points south. Negating it again leaves |X|, H, F and inclination exact and only the declination reversed — every scalar check passes and the one thing a compass is for is upside down.
 * - The sign of the geodetic rotation term `sa` was solved out of the reference data, not chosen; it is ~3e-3 and getting it backwards costs ~80 nT — invisible in a demo.
 * @module
 */
/** The model epoch as a decimal year; secular variation is applied relative to it. */
export const EPOCH: 2025;
/** End of the model's validity as a decimal year (exclusive); beyond it the coefficients are extrapolation. */
export const VALID_UNTIL: 2030;
/**
 * Magnetic declination at a point, in degrees (east-positive).
 * @param lat geodetic latitude in degrees
 * @param lon longitude in degrees
 * @param altKm altitude in kilometres above the WGS84 ellipsoid
 * @param year decimal year
 * @returns the declination to ADD to a magnetic bearing for a true one
 */
export function declination(lat: any, lon: any, altKm?: number, year?: number): number;
/**
 * Converts a Date to the decimal year the model takes (UTC, fraction of the year elapsed).
 * @param d the date; defaults to now
 * @returns the decimal year
 */
export function decimalYear(d?: Date): number;
/**
 * Whether a decimal year falls inside the model's validity window.
 * @param year decimal year; defaults to now
 * @returns true for EPOCH ≤ year < VALID_UNTIL
 */
export function inRange(year?: number): boolean;
/**
 * Composes a magnetic heading with the local declination into a true heading, normalised to 0..360.
 * @param magneticDeg magnetic heading in degrees
 * @param dec declination in degrees, or null/undefined to leave the heading magnetic
 * @returns the true heading in degrees
 */
export function trueFrom(magneticDeg: any, dec: any): number;
