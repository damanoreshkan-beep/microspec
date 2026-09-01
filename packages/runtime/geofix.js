/* @ts-self-types="./geofix.d.ts" */
/**
 * Squeezing real accuracy out of W3C Geolocation fixes by statistics, honestly: averaging a stationary
 * tail of fixes shrinks the random error by √N but never the bias, so `meanFix` measures the scatter and
 * keeps a conservative floor under what it cannot observe. Exports `stationaryTail`, `meanFix`, the
 * `segErr`/`totalErr` quadrature helpers, the `usableFix` vertex filter and the `BIAS_FRAC`/`ACC_LIMIT`
 * constants. Every accuracy in and out is a 95% radius in metres.
 * @module
 */
// geofix — squeezing real accuracy out of the only thing the web gives us.
//
// The browser hands a view seven numbers (W3C Geolocation: lat/lng/accuracy + optional altitude/
// altitudeAccuracy/heading/speed) and nothing else. There is no satellite count, no fix type, no HDOP,
// no raw GNSS. Centimetre work needs carrier-phase measurements plus an RTK correction stream; that
// lives behind Android's native GnssMeasurement API and is not reachable from a page. So the honest
// ceiling here is metres, and the only lever left is statistics over the fixes we do get.
//
// The lever works because GPS error is two errors wearing one coat:
//
//   random  — receiver noise, multipath. Different on every fix. Averaging N fixes shrinks it by √N.
//   bias    — ionosphere, ephemeris, satellite clock. Drifts over MINUTES, so it is nearly identical
//             on fixes taken seconds apart. Averaging does not touch it. At all.
//
// That asymmetry is the whole design. Standing still and averaging is real surveying technique (static
// occupation) and it genuinely helps — but it converges to the bias, not to zero. A ruler that averaged
// 400 fixes and announced ±0.4 m would be lying with a square root. So we measure the random part
// instead of assuming it (the scatter of the samples IS the observable) and keep a conservative floor
// under the bias, which we cannot observe at all.
//
// `accuracy` from the spec is a 95% confidence radius, so every number in and out of this module is 95%.

// Fraction of a fix's reported accuracy assumed to be time-correlated bias that averaging cannot remove.
// Not measurable from inside a browser — it is a deliberate floor, chosen so the app under-promises.
/** Fraction of a fix's reported accuracy treated as unremovable bias — the floor `meanFix` never claims below. */
export const BIAS_FRAC = 0.5;
// 2D Gaussian: the radius containing 95% of a Rayleigh distribution is ≈2.45σ (σ = per-axis).
const R95 = 2.4477;
const MPD_LAT = 110540;                                   // metres per degree of latitude
const mpdLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

// Local planar offsets in metres from an origin. Small-area equirectangular — exact enough over the
// few metres a stationary receiver scatters across.
const offs = (o, p) => ({ x: (p.lng - o.lng) * mpdLng(o.lat), y: (p.lat - o.lat) * MPD_LAT });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// The tail of a rolling fix buffer that represents STANDING STILL at one spot.
//
// Averaging is only valid over samples of the same place: fold in the fixes from while you were still
// walking and the mean lands somewhere you never stood. We cannot ask the receiver "am I stationary?"
// (`speed` is null on most stationary fixes, by spec), so we infer it geometrically — walk backwards
// from the newest fix and stop at the first one that is too old or too far from it to be the same spot.
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
export function stationaryTail(buf, { now, maxAgeMs = 25000, radiusM = null } = {}) {
  if (!buf?.length) return [];
  const last = buf[buf.length - 1];
  const t = now ?? last.t ?? 0;
  // "Same spot" scales with how good the fixes are: two ±10 m fixes 6 m apart are consistent with one
  // position; two ±2 m fixes 6 m apart are not. A fixed metre threshold would be wrong at both ends.
  const r = radiusM ?? Math.max(3, (last.accuracy || 10) * 1.5);
  const out = [];
  for (let i = buf.length - 1; i >= 0; i--) {
    const p = buf[i];
    if (t - (p.t ?? 0) > maxAgeMs) break;
    const d = offs(last, p);
    if (Math.hypot(d.x, d.y) > r) break;
    out.push(p);
  }
  return out.reverse();
}

// Mean of N fixes of one spot → one fix, with an accuracy that is earned rather than asserted.
/**
 * Averages fixes of one spot into a single fix whose accuracy is the measured standard error of the mean
 * (95%), floored by the bias fraction and never better than a single fix.
 * @param ss fixes of the same spot, as returned by `stationaryTail`
 * @returns `{ lat, lng, accuracy, n, altitude? }`, or null for no samples
 */
export function meanFix(ss) {
  if (!ss?.length) return null;
  const n = ss.length;
  const lat = ss.reduce((s, p) => s + p.lat, 0) / n;
  const lng = ss.reduce((s, p) => s + p.lng, 0) / n;
  const accs = ss.map((p) => p.accuracy || 0).filter((a) => a > 0);
  const medA = accs.length ? median(accs) : 0;
  const mean = { lat, lng, accuracy: medA, n };

  const alts = ss.map((p) => p.altitude).filter((a) => typeof a === "number" && isFinite(a));
  if (alts.length) mean.altitude = alts.reduce((s, a) => s + a, 0) / alts.length;
  if (n < 2) return mean;

  // Observed scatter about the mean, per axis. This is the random component, measured.
  const o = { lat, lng };
  const q = ss.map((p) => offs(o, p));
  const vx = q.reduce((s, p) => s + p.x * p.x, 0) / (n - 1);   // Bessel: we estimated the mean from these
  const vy = q.reduce((s, p) => s + p.y * p.y, 0) / (n - 1);
  const sem95 = R95 * Math.sqrt((vx + vy) / 2 / n);            // standard error of the mean, at 95%
  const floor = BIAS_FRAC * medA;                             // what averaging can never remove
  // Never claim better than the floor, and never claim better than a single fix would (a wild scatter
  // means the samples disagree — that is information, not something to average away).
  mean.accuracy = medA ? Math.min(medA, Math.hypot(sem95, floor)) : sem95;
  return mean;
}

// Error of one measured segment. Two endpoints, each a 95% radius; independent → add in quadrature.
// Conservative on purpose: part of each endpoint's bias is common to both and really does cancel over a
// short baseline, so the true segment error is somewhat better than this. Overstating a ruler's error is
// a much cheaper mistake than understating it.
/**
 * 95% error of one measured segment: both endpoints' accuracies added in quadrature.
 * @param a first endpoint fix
 * @param b second endpoint fix
 * @returns the segment error in metres
 */
export const segErr = (a, b) => Math.hypot(a?.accuracy || 0, b?.accuracy || 0);

// Error of a total: the segments' errors in quadrature.
/**
 * 95% error of a total distance: the segment errors added in quadrature.
 * @param errs per-segment errors in metres
 * @returns the total error in metres
 */
export const totalErr = (errs) => Math.sqrt(errs.reduce((s, e) => s + e * e, 0));

// A fix too vague to be a vertex. Dropping a ±60 m point into a polyline does not add a coarse
// measurement, it adds a wrong one — and the total inherits it forever with no way to tell later.
/** Default accuracy ceiling in metres for a fix to be accepted as a vertex. */
export const ACC_LIMIT = 30;
/**
 * Whether a fix is precise enough to be a vertex of a measured line.
 * @param p the fix
 * @param limit accuracy ceiling in metres
 * @returns true when the fix has a positive accuracy at or under the limit
 */
export const usableFix = (p, limit = ACC_LIMIT) => !!p && typeof p.accuracy === "number" && p.accuracy > 0 && p.accuracy <= limit;
