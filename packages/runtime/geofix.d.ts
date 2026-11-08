/**
 * # runtime/geofix.js — real accuracy out of W3C Geolocation fixes, by statistics, honestly
 *
 * The browser hands a view seven numbers per fix (lat/lng/accuracy plus optional altitude, altitudeAccuracy,
 * heading, speed) and nothing else: no satellite count, no fix type, no HDOP, no raw GNSS. Centimetre work
 * needs carrier-phase measurements and an RTK stream, which live behind Android's native GnssMeasurement API
 * and never reach a page — so the honest ceiling is metres, and the only lever left is statistics over the
 * fixes we do get. The lever works because GPS error is two errors wearing one coat: a random part (receiver
 * noise, multipath — different on every fix, averaging N fixes shrinks it by √N) and a bias (ionosphere,
 * ephemeris, satellite clock — drifts over minutes, so it is nearly identical on fixes seconds apart, and
 * averaging does not touch it at all). Standing still and averaging is real surveying technique (static
 * occupation), but it converges to the bias, not to zero; a ruler that averaged 400 fixes and announced
 * ±0.4 m would be lying with a square root. So this module measures the random part (the scatter of the
 * samples IS the observable) and keeps a conservative floor under the bias it cannot observe. Every accuracy
 * in and out is a 95% confidence radius in metres, as the spec defines `accuracy`.
 *
 * ![The geofix map: a rolling fix buffer, its stationary tail, the mean fix with its earned accuracy, and the quadrature of segment errors into a total](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-geofix.svg)
 *
 * ## Import
 * ```js
 * import { stationaryTail, meanFix, segErr, totalErr, usableFix } from "/_rt/geofix.js";                    // an app's page: the import map resolves /_rt/
 * import { stationaryTail, meanFix, segErr, totalErr, usableFix } from "@microspec/core/runtime/geofix.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link stationaryTail} — the tail of a fix buffer that represents standing still at one spot, walked back from the newest fix until one is too old (`maxAgeMs`, default 25 s) or too far (`radiusM`, default 1.5× the newest fix's accuracy, min 3 m); oldest first.
 * - {@link meanFix} — one fix out of N fixes of one spot: mean lat/lng (and altitude when present), `accuracy` = the measured 95% standard error of the mean floored by `BIAS_FRAC` and never better than a single fix, `n` = the sample count; null for no samples.
 * - {@link segErr} — 95% error of one measured segment: both endpoints' accuracies in quadrature.
 * - {@link totalErr} — 95% error of a total: the per-segment errors in quadrature.
 * - {@link usableFix} — whether a fix is precise enough to be a vertex (positive accuracy at or under the limit).
 * - {@link BIAS_FRAC} — `0.5`, the fraction of a fix's reported accuracy treated as unremovable bias.
 * - {@link ACC_LIMIT} — `30`, the default accuracy ceiling in metres for `usableFix`.
 *
 * ## In practice
 * ```js
 * // ruler — every vertex is the mean of the fixes taken while you stood at THAT spot
 * import { stationaryTail, meanFix, segErr, totalErr, usableFix } from "/_rt/geofix.js";
 *
 * const buf = useRef([]);                                  // rolling buffer of { lat, lng, accuracy, t }
 * const add = () => {
 *   if (!usableFix(cur)) return;                           // a ±60 m point is a wrong vertex, not a coarse one
 *   const tail = stationaryTail(buf.current, { now: Date.now() });
 *   setPts((p) => [...p, tail.length >= 2 ? meanFix(tail) : { ...cur, n: 1 }]);
 * };
 * const tErr = pts.length >= 2 ? totalErr(pts.slice(1).map((p, i) => segErr(pts[i], p))) : null;
 * ```
 *
 * ## How it fits
 * Pure arithmetic with no imports — it runs identically in a page and in the Deno unit gate
 * (`tests/geofix_test.js`). Inside the runtime, `sensors.js` mentions it beside the geolocation watch that
 * produces the fixes it consumes. In the farm one app imports it: ruler, the measuring tape whose every
 * vertex is a `meanFix` and whose total carries a `totalErr`.
 *
 * ## Invariants and pitfalls
 * - Every accuracy in and out is a 95% radius in metres; the spec's `accuracy` already is one, so nothing is rescaled.
 * - Averaging shrinks only the random error. `meanFix` never claims below `BIAS_FRAC × median accuracy`, and never better than a single fix — a wild scatter means the samples disagree, which is information, not something to average away.
 * - Average only samples of the same place: fold in fixes from while you were still walking and the mean lands somewhere you never stood. `stationaryTail` infers "standing still" geometrically because `speed` is null on most stationary fixes, by spec.
 * - The "same spot" radius scales with the fixes' accuracy: two ±10 m fixes 6 m apart are one position, two ±2 m fixes 6 m apart are not. A fixed metre threshold would be wrong at both ends.
 * - `stationaryTail` uses `now` (or the newest fix's `t`) — pass the real clock when the buffer's timestamps come from live fixes, as ruler does.
 * - `segErr` is conservative on purpose: part of each endpoint's bias is common to both and really does cancel over a short baseline. Overstating a ruler's error is a much cheaper mistake than understating it.
 * - Drop vague fixes before they become vertices (`usableFix`): a ±60 m point in a polyline is a wrong measurement the total inherits forever, with no way to tell later.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/geofix.js — edit the JSDoc there, never this file.
/**
 * Returns the tail of a fix buffer that represents standing still at one spot, walking back from the
 * newest fix until one is too old or too far away.
 * @param buf fixes in arrival order (`{ lat, lng, accuracy, t }`)
 * @param {object} [opts] options
 * @param [opts.now] reference time in ms; defaults to the newest fix's `t`
 * @param [opts.maxAgeMs] oldest a fix may be, relative to `now`, to still count
 * @param [opts.radiusM] "same spot" radius in metres; defaults to 1.5× the newest fix's accuracy (min 3 m)
 * @returns the stationary fixes, oldest first (empty for an empty buffer)
 */
export function stationaryTail(buf: any, { now, maxAgeMs, radiusM }?: {
    now?: any;
    maxAgeMs?: any;
    radiusM?: any;
}): any[];
/**
 * Averages fixes of one spot into a single fix whose accuracy is the measured standard error of the mean
 * (95%), floored by the bias fraction and never better than a single fix.
 * @param ss fixes of the same spot, as returned by `stationaryTail`
 * @returns `{ lat, lng, accuracy, n, altitude? }`, or null for no samples
 */
export function meanFix(ss: any): {
    lat: number;
    lng: number;
    accuracy: any;
    n: any;
};
/**
 * # runtime/geofix.js — real accuracy out of W3C Geolocation fixes, by statistics, honestly
 *
 * The browser hands a view seven numbers per fix (lat/lng/accuracy plus optional altitude, altitudeAccuracy,
 * heading, speed) and nothing else: no satellite count, no fix type, no HDOP, no raw GNSS. Centimetre work
 * needs carrier-phase measurements and an RTK stream, which live behind Android's native GnssMeasurement API
 * and never reach a page — so the honest ceiling is metres, and the only lever left is statistics over the
 * fixes we do get. The lever works because GPS error is two errors wearing one coat: a random part (receiver
 * noise, multipath — different on every fix, averaging N fixes shrinks it by √N) and a bias (ionosphere,
 * ephemeris, satellite clock — drifts over minutes, so it is nearly identical on fixes seconds apart, and
 * averaging does not touch it at all). Standing still and averaging is real surveying technique (static
 * occupation), but it converges to the bias, not to zero; a ruler that averaged 400 fixes and announced
 * ±0.4 m would be lying with a square root. So this module measures the random part (the scatter of the
 * samples IS the observable) and keeps a conservative floor under the bias it cannot observe. Every accuracy
 * in and out is a 95% confidence radius in metres, as the spec defines `accuracy`.
 *
 * ![The geofix map: a rolling fix buffer, its stationary tail, the mean fix with its earned accuracy, and the quadrature of segment errors into a total](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-geofix.svg)
 *
 * ## Import
 * ```js
 * import { stationaryTail, meanFix, segErr, totalErr, usableFix } from "/_rt/geofix.js";                    // an app's page: the import map resolves /_rt/
 * import { stationaryTail, meanFix, segErr, totalErr, usableFix } from "@microspec/core/runtime/geofix.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link stationaryTail} — the tail of a fix buffer that represents standing still at one spot, walked back from the newest fix until one is too old (`maxAgeMs`, default 25 s) or too far (`radiusM`, default 1.5× the newest fix's accuracy, min 3 m); oldest first.
 * - {@link meanFix} — one fix out of N fixes of one spot: mean lat/lng (and altitude when present), `accuracy` = the measured 95% standard error of the mean floored by `BIAS_FRAC` and never better than a single fix, `n` = the sample count; null for no samples.
 * - {@link segErr} — 95% error of one measured segment: both endpoints' accuracies in quadrature.
 * - {@link totalErr} — 95% error of a total: the per-segment errors in quadrature.
 * - {@link usableFix} — whether a fix is precise enough to be a vertex (positive accuracy at or under the limit).
 * - {@link BIAS_FRAC} — `0.5`, the fraction of a fix's reported accuracy treated as unremovable bias.
 * - {@link ACC_LIMIT} — `30`, the default accuracy ceiling in metres for `usableFix`.
 *
 * ## In practice
 * ```js
 * // ruler — every vertex is the mean of the fixes taken while you stood at THAT spot
 * import { stationaryTail, meanFix, segErr, totalErr, usableFix } from "/_rt/geofix.js";
 *
 * const buf = useRef([]);                                  // rolling buffer of { lat, lng, accuracy, t }
 * const add = () => {
 *   if (!usableFix(cur)) return;                           // a ±60 m point is a wrong vertex, not a coarse one
 *   const tail = stationaryTail(buf.current, { now: Date.now() });
 *   setPts((p) => [...p, tail.length >= 2 ? meanFix(tail) : { ...cur, n: 1 }]);
 * };
 * const tErr = pts.length >= 2 ? totalErr(pts.slice(1).map((p, i) => segErr(pts[i], p))) : null;
 * ```
 *
 * ## How it fits
 * Pure arithmetic with no imports — it runs identically in a page and in the Deno unit gate
 * (`tests/geofix_test.js`). Inside the runtime, `sensors.js` mentions it beside the geolocation watch that
 * produces the fixes it consumes. In the farm one app imports it: ruler, the measuring tape whose every
 * vertex is a `meanFix` and whose total carries a `totalErr`.
 *
 * ## Invariants and pitfalls
 * - Every accuracy in and out is a 95% radius in metres; the spec's `accuracy` already is one, so nothing is rescaled.
 * - Averaging shrinks only the random error. `meanFix` never claims below `BIAS_FRAC × median accuracy`, and never better than a single fix — a wild scatter means the samples disagree, which is information, not something to average away.
 * - Average only samples of the same place: fold in fixes from while you were still walking and the mean lands somewhere you never stood. `stationaryTail` infers "standing still" geometrically because `speed` is null on most stationary fixes, by spec.
 * - The "same spot" radius scales with the fixes' accuracy: two ±10 m fixes 6 m apart are one position, two ±2 m fixes 6 m apart are not. A fixed metre threshold would be wrong at both ends.
 * - `stationaryTail` uses `now` (or the newest fix's `t`) — pass the real clock when the buffer's timestamps come from live fixes, as ruler does.
 * - `segErr` is conservative on purpose: part of each endpoint's bias is common to both and really does cancel over a short baseline. Overstating a ruler's error is a much cheaper mistake than understating it.
 * - Drop vague fixes before they become vertices (`usableFix`): a ±60 m point in a polyline is a wrong measurement the total inherits forever, with no way to tell later.
 * @module
 */
/** Fraction of a fix's reported accuracy treated as unremovable bias — the floor `meanFix` never claims below. */
export const BIAS_FRAC: 0.5;
/**
 * 95% error of one measured segment: both endpoints' accuracies added in quadrature.
 * @param a first endpoint fix
 * @param b second endpoint fix
 * @returns the segment error in metres
 */
export function segErr(a: any, b: any): number;
/**
 * 95% error of a total distance: the segment errors added in quadrature.
 * @param errs per-segment errors in metres
 * @returns the total error in metres
 */
export function totalErr(errs: any): number;
/** Default accuracy ceiling in metres for a fix to be accepted as a vertex. */
export const ACC_LIMIT: 30;
/**
 * Whether a fix is precise enough to be a vertex of a measured line.
 * @param p the fix
 * @param limit accuracy ceiling in metres
 * @returns true when the fix has a positive accuracy at or under the limit
 */
export function usableFix(p: any, limit?: number): boolean;
