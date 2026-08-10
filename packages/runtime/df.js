
const TAU = 2 * Math.PI;
const rad = (deg) => deg * Math.PI / 180;
const deg = (r) => ((r * 180 / Math.PI) % 360 + 360) % 360;

export function newRose(bins = 72, tau = 0) {
  return {
    bins, tau, at: 0, n: 0,
    peak: new Float32Array(bins), sum: new Float32Array(bins),
    count: tau ? new Float32Array(bins) : new Uint32Array(bins),
  };
}

const VISITED = 0.05;
const seen = (c) => c > VISITED || (Number.isInteger(c) && c > 0);

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

export function petal(rose) {
  const out = new Float32Array(rose.bins);
  for (let b = 0; b < rose.bins; b++) {
    out[b] = seen(rose.count[b]) ? (rose.tau ? rose.sum[b] : rose.sum[b] / rose.count[b]) : 0;
  }
  return out;
}

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

export const BEARING_MIN_R = 0.15;
export const BEARING_MIN_COVERAGE = 0.75;

export function hasBearing(stats) {
  return stats.r >= BEARING_MIN_R && stats.coverage >= BEARING_MIN_COVERAGE && stats.bearingDeg !== null;
}
