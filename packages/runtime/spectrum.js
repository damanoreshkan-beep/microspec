/* @ts-self-types="./spectrum.d.ts" */
/**
 * Audio-reactive visual DSP and geometry maths, with no browser and no WebGL: a Uint8Array FFT frame in,
 * perceptual log band levels, a bass/mid/treble split, a spectral-centroid hue, an attack/release Envelope,
 * a scrolling terrain height-field and smoothed tilt Parallax out — plus the pure geometry helpers
 * (sampleBand, idle, fib, galaxyDisc, frameFit) the 3D scenes and their Canvas2D fallbacks share, and a
 * deterministic seedFrame for the gate. The maths lives here so `deno test` verifies it.
 * @module
 */

/** Default analysis parameters: frequency range, bar count, sample rate and FFT size. */
export const DEFAULTS = { fMin: 32, fMax: 16000, bars: 28, sr: 44100, fftSize: 2048 };

/**
 * Geometric (log-spaced) band edges as FFT-bin indices, so the bar chart reads as a real spectrum.
 * @param bars number of bands
 * @param fMin lowest frequency (Hz)
 * @param fMax highest frequency (Hz)
 * @param sr sample rate
 * @param fftSize the AnalyserNode fftSize
 * @returns bars+1 monotonic bin indices in [1, bins-1]
 */
export function logBandEdges(bars = DEFAULTS.bars, fMin = DEFAULTS.fMin, fMax = DEFAULTS.fMax, sr = DEFAULTS.sr, fftSize = DEFAULTS.fftSize) {
  const bins = fftSize / 2, hzPerBin = sr / fftSize, edges = [];
  for (let i = 0; i <= bars; i++) {
    const f = fMin * Math.pow(fMax / fMin, i / bars);
    edges.push(Math.min(bins - 1, Math.max(1, Math.round(f / hzPerBin))));
  }
  return edges;
}

/**
 * Mean magnitude within each band, normalised to 0..1.
 * @param u8 the FFT frame (Uint8Array, 0..255)
 * @param edges bin indices from logBandEdges
 * @returns one level per band
 */
export function bandLevels(u8, edges) {
  const out = new Array(edges.length - 1);
  for (let b = 0; b < out.length; b++) {
    const lo = edges[b], hi = Math.max(edges[b] + 1, edges[b + 1]);
    let sum = 0, n = 0;
    for (let i = lo; i < hi && i < u8.length; i++) { sum += u8[i]; n++; }
    out[b] = n ? sum / n / 255 : 0;
  }
  return out;
}

/**
 * Bass / mid / treble energy (20-150 / 250-2000 / 2000-16000 Hz), each 0..1.
 * @param u8 the FFT frame
 * @param sr sample rate
 * @param fftSize the AnalyserNode fftSize
 * @returns `{ bass, mid, treble }`
 */
export function splitBands(u8, sr = DEFAULTS.sr, fftSize = DEFAULTS.fftSize) {
  const hzPerBin = sr / fftSize, bins = u8.length;
  const band = (f0, f1) => {
    const lo = Math.max(1, Math.round(f0 / hzPerBin)), hi = Math.min(bins - 1, Math.round(f1 / hzPerBin));
    let s = 0, n = 0;
    for (let i = lo; i <= hi; i++) { s += u8[i]; n++; }
    return n ? s / n / 255 : 0;
  };
  return { bass: band(20, 150), mid: band(250, 2000), treble: band(2000, 16000) };
}

/**
 * Energy-weighted mean frequency of the frame, mapped to a hue so the visual depends on the song.
 * @param u8 the FFT frame
 * @param sr sample rate
 * @param fftSize the AnalyserNode fftSize
 * @returns { hz, hue (280..190), t (0..1 log position between 80 Hz and 6 kHz) }
 */
export function spectralCentroid(u8, sr = DEFAULTS.sr, fftSize = DEFAULTS.fftSize) {
  const hzPerBin = sr / fftSize;
  let num = 0, den = 0;
  for (let i = 1; i < u8.length; i++) { const m = u8[i]; num += i * hzPerBin * m; den += m; }
  const hz = den ? num / den : 0;
  const t = Math.max(0, Math.min(1, Math.log2((hz || 80) / 80) / Math.log2(6000 / 80)));
  return { hz, hue: 280 - t * 90, t };
}

/**
 * A stateful asymmetric envelope follower: fast attack, slow release, per band.
 * @param attack rise coefficient per update (0..1)
 * @param release fall coefficient per update (0..1)
 * @param n number of bands
 * @returns { v, update(targets) } — `update` mutates and returns the Float32Array `v`
 */
export function Envelope(attack = 0.6, release = 0.12, n = DEFAULTS.bars) {
  const v = new Float32Array(n);
  return {
    v,
    update(targets) {
      for (let i = 0; i < n; i++) { const t = targets[i] ?? 0; v[i] += (t > v[i] ? attack : release) * (t - v[i]); }
      return v;
    },
  };
}

/**
 * Scroll the audio-terrain height-field back one row (with decay) and inject the current levels as the front row.
 * @param grid caller-owned Float32Array(rows*cols), row-major, row 0 = front
 * @param rows grid rows
 * @param cols grid columns
 * @param front the current band levels
 * @returns the same grid, mutated
 */
export function advanceTerrain(grid, rows, cols, front) {
  for (let r = rows - 1; r > 0; r--) for (let c = 0; c < cols; c++) grid[r * cols + c] = grid[(r - 1) * cols + c] * 0.985;
  for (let c = 0; c < cols; c++) grid[c] = front[Math.min(front.length - 1, Math.floor((c / cols) * front.length))] || 0;
  return grid;
}

/**
 * Smoothed, clamped device-tilt to parallax offset in -1..1; eases back to centre when reduced or unread.
 * @param opts `alpha` (EMA factor), `maxDeg` (tilt that maps to full offset), `gain`, `reduced` (prefers-reduced-motion)
 * @returns { x, y, update(beta, gamma) } — `update` feeds a DeviceOrientation reading and returns { x, y }
 */
export function Parallax({ alpha = 0.1, maxDeg = 20, gain = 1, reduced = false } = {}) {
  let x = 0, y = 0;
  const clamp = (d) => Math.max(-maxDeg, Math.min(maxDeg, d)) / maxDeg;
  return {
    get x() { return x; },
    get y() { return y; },
    update(beta, gamma) {
      const tx = (reduced || gamma == null) ? 0 : clamp(gamma) * gain;
      const ty = (reduced || beta == null) ? 0 : clamp(beta) * gain;
      x += (tx - x) * alpha; y += (ty - y) * alpha;
      return { x, y };
    },
  };
}


/**
 * Sample the band-level array at a 0..1 fraction, clamped.
 * @param levels band levels
 * @param frac position across the bands, 0..1
 * @returns the nearest band's level, 0 for an empty array
 */
export function sampleBand(levels, frac) {
  const n = levels.length; if (!n) return 0;
  const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  return levels[Math.min(n - 1, Math.round(f * (n - 1)))] || 0;
}

/**
 * Idle "breath" pulse so a silent scene is never a dead flatline.
 * @param phase animation phase (radians)
 * @param floor centre of the pulse
 * @param amp amplitude around the floor
 * @returns floor + amp·sin(2·phase)
 */
export function idle(phase, floor = 0.85, amp = 0.15) { return floor + amp * Math.sin(phase * 2); }

/**
 * Point i of n on a unit sphere via the Fibonacci lattice — even, no pole clumping.
 * @param i point index
 * @param n total points
 * @returns [x, y, z] on the unit sphere
 */
export function fib(i, n) {
  const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;           
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963229728653;                        
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

/**
 * Base positions for a spiral galaxy disc: n points over spun, jittered arms.
 * @param n number of points
 * @param opts `radius`, `branches`, `spin`, `randomness`, `power`, `thin` (y squash)
 * @param rng caller-owned 0..1 source (deterministic → testable)
 * @returns Float32Array(n*3) of xyz triples
 */
export function galaxyDisc(n, { radius = 5, branches = 5, spin = 1, randomness = 0.4, power = 3, thin = 0.5 } = {}, rng = Math.random) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rng() * radius;
    const branch = ((i % branches) / branches) * Math.PI * 2;
    const spun = r * spin;
    const jit = () => Math.pow(rng(), power) * (rng() < 0.5 ? 1 : -1) * randomness * r;
    out[i * 3] = Math.cos(branch + spun) * r + jit();
    out[i * 3 + 1] = jit() * thin;
    out[i * 3 + 2] = Math.sin(branch + spun) * r + jit();
  }
  return out;
}

/**
 * Camera distance that frames a subject in a perspective camera on BOTH axes, so a portrait viewport never clips it.
 * @param halfW the subject's projected half-width in world units
 * @param halfH the subject's projected half-height in world units
 * @param fovYDeg the camera's vertical field of view (degrees)
 * @param aspect viewport width / height
 * @param opts `margin` (air around the subject, 1 = rim-hugging), `lift` (push up the frame, fraction of height)
 * @returns { dist, drop } — place the camera `dist` away and aim at (0, -drop, 0)
 */
export function frameFit(halfW, halfH, fovYDeg, aspect, { margin = 1.12, lift = 0 } = {}) {
  const ty = Math.tan((fovYDeg * Math.PI) / 180 / 2);
  const a = aspect > 0 ? aspect : 1;
  const dist = Math.max((halfH * margin) / ty, (halfW * margin) / (ty * a));
  return { dist, drop: lift * 2 * dist * ty };
}

/**
 * A deterministic seeded FFT frame — a bass-heavy descending curve with ripple — for the gate and the Canvas2D fallback.
 * @param bins frame length
 * @param phase animates the ripple without an AudioContext
 * @returns Uint8Array(bins) of 0..255 magnitudes
 */
export function seedFrame(bins = 1024, phase = 0) {
  const u = new Uint8Array(bins);
  for (let i = 0; i < bins; i++) {
    const f = i / bins;
    const base = Math.pow(1 - f, 1.7);
    const ripple = 0.14 * (Math.sin(f * 26 + phase) * 0.5 + 0.5);
    u[i] = Math.round(Math.min(1, base * 0.92 + ripple) * 235);
  }
  return u;
}
