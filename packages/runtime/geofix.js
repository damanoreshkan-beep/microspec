/* @ts-self-types="./geofix.d.ts" */
/**
 * Squeezing real accuracy out of W3C Geolocation fixes by statistics, honestly: averaging a stationary
 * tail of fixes shrinks the random error by √N but never the bias, so `meanFix` measures the scatter and
 * keeps a conservative floor under what it cannot observe. Exports `stationaryTail`, `meanFix`, the
 * `segErr`/`totalErr` quadrature helpers, the `usableFix` vertex filter and the `BIAS_FRAC`/`ACC_LIMIT`
 * constants. Every accuracy in and out is a 95% radius in metres.
 * @module
 */

/** Fraction of a fix's reported accuracy treated as unremovable bias — the floor `meanFix` never claims below. */
export const BIAS_FRAC = 0.5;
const R95 = 2.4477;
const MPD_LAT = 110540;                                   
const mpdLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

const offs = (o, p) => ({ x: (p.lng - o.lng) * mpdLng(o.lat), y: (p.lat - o.lat) * MPD_LAT });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

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

  const o = { lat, lng };
  const q = ss.map((p) => offs(o, p));
  const vx = q.reduce((s, p) => s + p.x * p.x, 0) / (n - 1);   
  const vy = q.reduce((s, p) => s + p.y * p.y, 0) / (n - 1);
  const sem95 = R95 * Math.sqrt((vx + vy) / 2 / n);            
  const floor = BIAS_FRAC * medA;                             
  mean.accuracy = medA ? Math.min(medA, Math.hypot(sem95, floor)) : sem95;
  return mean;
}

/**
 * 95% error of one measured segment: both endpoints' accuracies added in quadrature.
 * @param a first endpoint fix
 * @param b second endpoint fix
 * @returns the segment error in metres
 */
export const segErr = (a, b) => Math.hypot(a?.accuracy || 0, b?.accuracy || 0);

/**
 * 95% error of a total distance: the segment errors added in quadrature.
 * @param errs per-segment errors in metres
 * @returns the total error in metres
 */
export const totalErr = (errs) => Math.sqrt(errs.reduce((s, e) => s + e * e, 0));

/** Default accuracy ceiling in metres for a fix to be accepted as a vertex. */
export const ACC_LIMIT = 30;
/**
 * Whether a fix is precise enough to be a vertex of a measured line.
 * @param p the fix
 * @param limit accuracy ceiling in metres
 * @returns true when the fix has a positive accuracy at or under the limit
 */
export const usableFix = (p, limit = ACC_LIMIT) => !!p && typeof p.accuracy === "number" && p.accuracy > 0 && p.accuracy <= limit;
