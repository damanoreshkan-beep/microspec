// microspec runtime — audio-reactive visual DSP + geometry math. NO browser, NO WebGL: it takes a Uint8Array
// FFT frame (0..255, from an AnalyserNode) and produces perceptual band levels, a bass/mid/treble split, a
// spectral-centroid hue, an asymmetric attack/release envelope, a scrolling height-field for the "audio
// terrain", and smoothed/clamped device-tilt parallax. The app's three.js AND its Canvas2D fallback both
// consume THIS — the farm rule is that the maths lives in a unit-tested runtime module, not the app. So the
// visual is verified by `deno test` even though WebGL only runs in CI. Refs: audioMotion-analyzer (fractional
// -octave log bands), Codrops 3D visualizer (uniform-driven displacement), MDN AnalyserNode.

export const DEFAULTS = { fMin: 32, fMax: 16000, bars: 28, sr: 44100, fftSize: 2048 };

// Geometric (log) band edges as FFT-bin indices. Hearing is ~logarithmic, so linear bins leave the whole
// top half of a bar chart dead; equal ratios per band (≈1/6-octave at bars=28) read as a real spectrum.
// binHz(i) = i * sr/fftSize. Returns bars+1 monotonic indices in [1, bins-1].
export function logBandEdges(bars = DEFAULTS.bars, fMin = DEFAULTS.fMin, fMax = DEFAULTS.fMax, sr = DEFAULTS.sr, fftSize = DEFAULTS.fftSize) {
  const bins = fftSize / 2, hzPerBin = sr / fftSize, edges = [];
  for (let i = 0; i <= bars; i++) {
    const f = fMin * Math.pow(fMax / fMin, i / bars);
    edges.push(Math.min(bins - 1, Math.max(1, Math.round(f / hzPerBin))));
  }
  return edges;
}

// Mean magnitude within each band → 0..1. Guarantees ≥1 bin per band even where edges collapse at the low end.
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

// bass / mid / treble energy, 0..1 — 20-150 / 250-2000 / 2000-16000 Hz. Drives the harmonious mapping:
// bass → radial pulse, mid → vertical drive, treble → rotation/sparkle.
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

// Energy-weighted mean frequency (Hz) → hue. This is what makes the visual "depend on the song": a dub track
// sits warm/violet, a bright acid line pushes toward cyan. Mapped over the farm's signal palette (280..190).
export function spectralCentroid(u8, sr = DEFAULTS.sr, fftSize = DEFAULTS.fftSize) {
  const hzPerBin = sr / fftSize;
  let num = 0, den = 0;
  for (let i = 1; i < u8.length; i++) { const m = u8[i]; num += i * hzPerBin * m; den += m; }
  const hz = den ? num / den : 0;
  const t = Math.max(0, Math.min(1, Math.log2((hz || 80) / 80) / Math.log2(6000 / 80)));
  return { hz, hue: 280 - t * 90, t };
}

// Asymmetric envelope: rise fast (attack), fall slow (release) — the classic VU/spectrum motion that a raw
// AnalyserNode smoothing constant can't give you. Stateful; `update` mutates + returns its own buffer.
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

// Scrolling height-field for the "audio terrain": push existing rows back (with a gentle decay so ridges
// fade as they recede), inject the current band levels as the front row (nearest the camera). `grid` is a
// caller-owned Float32Array(rows*cols), row-major, row 0 = front. Pure so it is unit-tested.
export function advanceTerrain(grid, rows, cols, front) {
  for (let r = rows - 1; r > 0; r--) for (let c = 0; c < cols; c++) grid[r * cols + c] = grid[(r - 1) * cols + c] * 0.985;
  for (let c = 0; c < cols; c++) grid[c] = front[Math.min(front.length - 1, Math.floor((c / cols) * front.length))] || 0;
  return grid;
}

// Smoothed, clamped device-tilt → parallax offset in -1..1. EMA low-pass (α small) because raw β/γ on a
// hand-held phone is jittery and fast near-field parallax induces eye-fatigue/sickness. `reduced` (from
// prefers-reduced-motion) or null readings ⇒ eases back to centre, never a hard jump.
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

// ---- geometry helpers for the 3D visualiser gallery (pure, unit-tested; the app's ten three.js scenes
// and their Canvas2D fallbacks all read these, so the layout maths is verified by `deno test`) ----

// Sample the band-level array at a 0..1 fraction — the canonical "distribute the 28 log-octave bands across
// this geometry" lookup (bar i of K reads sampleBand(levels, i/(K-1))). Clamped, so callers never index OOB.
export function sampleBand(levels, frac) {
  const n = levels.length; if (!n) return 0;
  const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  return levels[Math.min(n - 1, Math.round(f * (n - 1)))] || 0;
}

// Idle "breath" so a scene is never a dead flatline when the beat is silent: floor + amp·sin(phase·2). The
// research pitfall #1 — every scale/opacity term multiplies by an always-on pulse in [floor-amp, floor+amp].
export function idle(phase, floor = 0.85, amp = 0.15) { return floor + amp * Math.sin(phase * 2); }

// Even point distribution on a unit sphere via the Fibonacci lattice — no pole clumping (a UV-sphere bunches
// spikes/particles at the poles, the #1 urchin/nebula tell). Returns [x,y,z] on the unit sphere for point i of n.
export function fib(i, n) {
  const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;           // -1..1, evenly spaced rings
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963229728653;                        // golden angle (rad)
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

// Base positions for a spiral galaxy disc (Bruno Simon's generator, params scaled for mobile): n points over
// `branches` arms of `radius`, twisted by `spin`, jittered by pow(rng,power)·randomness·r so the arms stay
// crisp near the core and fuzz at the rim. `rng` is a caller-owned 0..1 source (deterministic → testable).
// Returns a Float32Array(n*3); the app breathes the cloud by MULTIPLYING these (stable, returns to rest) —
// never by integrating velocity (drifts, blows up). y is squashed to a thin disc.
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

// Deterministic seeded FFT frame — a plausible bass-heavy descending curve with a little ripple — so the
// headless gate shot and the Canvas2D fallback are never dead flatlines. `phase` animates it without any
// AudioContext (the gate has none). No Math.random: the gate must be deterministic.
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
