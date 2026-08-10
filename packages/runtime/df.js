// microspec runtime — the hunt-mode polar accumulator (radio direction finding by hand).
//
// One antenna cannot give a bearing, so `homin`'s main dial maps angle to FREQUENCY and never claims a
// direction. Hunt mode is the one place a real bearing exists: the user sweeps the phone (with a Yagi or a
// loop) while this accumulates measured signal strength against the magnetometer heading.
//
// The honesty is structural, not a caption. With the stock telescopic whip the antenna is omnidirectional,
// so the accumulated petal comes out CIRCULAR and `r` stays near zero — the user sees a flat circle and
// understands the antenna gives no bearing. Attach a directional antenna and the circle squeezes into a
// lobe. The instrument shows its own limit by its shape.
//
// Pure + unit-tested. Circular statistics, because headings wrap: samples at 350 deg and 10 deg average to
// 0 deg, not to 180 deg.

const TAU = 2 * Math.PI;
const rad = (deg) => deg * Math.PI / 180;
const deg = (r) => ((r * 180 / Math.PI) % 360 + 360) % 360;

// `tau` (ms) opts a rose into TIME DECAY: every accumulated bin fades by e^(−Δt/τ) as samples arrive, so
// the rose remembers roughly the last τ of the walk and the bearing follows the user instead of being
// anchored to where they stood a minute ago. A hand-held hunt needs this — the whole point is to MOVE.
// Without `tau` the behaviour is exactly the old one (integer counts, nothing fades): homin's fox-hunt
// rose accumulates a deliberate stationary sweep and must keep doing so.
export function newRose(bins = 72, tau = 0) {
  return {
    bins, tau, at: 0, n: 0,
    peak: new Float32Array(bins), sum: new Float32Array(bins),
    count: tau ? new Float32Array(bins) : new Uint32Array(bins),
  };
}

// A decayed bin never reaches exactly zero, so "visited" needs a floor; integers pass it untouched.
const VISITED = 0.05;
const seen = (c) => c > VISITED || (Number.isInteger(c) && c > 0);

// Record one measurement. `strength` is whatever linear scale the caller uses (0..1 is convenient); the
// statistics below are scale-free, so the units never leave the caller. `now` only matters for a decaying
// rose; it is a parameter so the tests (and the gate) stay deterministic.
export function addSample(rose, headingDeg, strength, now = Date.now()) {
  if (!Number.isFinite(headingDeg) || !Number.isFinite(strength) || strength < 0) return rose;
  if (rose.tau) {
    if (rose.at) {
      const f = Math.min(1, Math.exp(-(now - rose.at) / rose.tau));
      if (f < 0.9995) {
        for (let b = 0; b < rose.bins; b++) { rose.sum[b] *= f; rose.count[b] *= f; rose.peak[b] *= f; }
      }
    }
    rose.at = now;
  }
  const h = ((headingDeg % 360) + 360) % 360;
  const b = Math.min(rose.bins - 1, Math.floor(h * rose.bins / 360));
  if (strength > rose.peak[b]) rose.peak[b] = strength;
  rose.sum[b] += strength;
  rose.count[b]++;
  rose.n++;
  return rose;
}

export const binHeading = (rose, b) => (b + 0.5) * 360 / rose.bins;

// The shape the view draws, and the per-bin weight the statistics use. Bins never visited read as 0, which
// is visually distinct from "visited and quiet" and must stay that way: an unswept arc is not a null.
// A plain rose reports the MEAN per bin (sampling-rate independent — lingering somewhere must not weigh
// it up). A decaying rose reports the decayed MASS instead: strength × recency, so a stale lobe literally
// evaporates from the picture and the resultant follows what the walk is measuring NOW.
export function petal(rose) {
  const out = new Float32Array(rose.bins);
  for (let b = 0; b < rose.bins; b++) {
    out[b] = seen(rose.count[b]) ? (rose.tau ? rose.sum[b] : rose.sum[b] / rose.count[b]) : 0;
  }
  return out;
}

// Strength-weighted circular statistics.
//   r        0..1 concentration. ~0 = the petal is a circle (omnidirectional antenna, or no signal) and NO
//            bearing may be shown. Toward 1 = a real lobe.
//   bearing  the resultant direction, meaningful only once r is high enough to have earned it.
//   coverage fraction of bins actually swept — a lobe measured over a third of the circle is not a bearing,
//            it is an unfinished sweep, and the UI must be able to tell the difference.
export function roseStats(rose) {
  const p = petal(rose);
  let x = 0, y = 0, total = 0, visited = 0;
  for (let b = 0; b < rose.bins; b++) {
    if (seen(rose.count[b])) visited++;
    const w = p[b];
    if (w <= 0) continue;
    const a = rad(binHeading(rose, b));
    x += w * Math.cos(a); y += w * Math.sin(a); total += w;
  }
  if (total <= 0) return { r: 0, bearingDeg: null, coverage: visited / rose.bins, samples: rose.n };
  const r = Math.hypot(x, y) / total;
  return { r, bearingDeg: deg(Math.atan2(y, x)), coverage: visited / rose.bins, samples: rose.n };
}

// Below this the petal is a circle and the app must not draw an arrow. Tuned on hardware with a real Yagi;
// the default is deliberately conservative — showing no bearing is always safer than showing a wrong one.
export const BEARING_MIN_R = 0.15;
export const BEARING_MIN_COVERAGE = 0.75;

export function hasBearing(stats) {
  return stats.r >= BEARING_MIN_R && stats.coverage >= BEARING_MIN_COVERAGE && stats.bearingDeg !== null;
}
