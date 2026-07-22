
export const DEFAULTS = { fMin: 32, fMax: 16000, bars: 28, sr: 44100, fftSize: 2048 };

export function logBandEdges(bars = DEFAULTS.bars, fMin = DEFAULTS.fMin, fMax = DEFAULTS.fMax, sr = DEFAULTS.sr, fftSize = DEFAULTS.fftSize) {
  const bins = fftSize / 2, hzPerBin = sr / fftSize, edges = [];
  for (let i = 0; i <= bars; i++) {
    const f = fMin * Math.pow(fMax / fMin, i / bars);
    edges.push(Math.min(bins - 1, Math.max(1, Math.round(f / hzPerBin))));
  }
  return edges;
}

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

export function spectralCentroid(u8, sr = DEFAULTS.sr, fftSize = DEFAULTS.fftSize) {
  const hzPerBin = sr / fftSize;
  let num = 0, den = 0;
  for (let i = 1; i < u8.length; i++) { const m = u8[i]; num += i * hzPerBin * m; den += m; }
  const hz = den ? num / den : 0;
  const t = Math.max(0, Math.min(1, Math.log2((hz || 80) / 80) / Math.log2(6000 / 80)));
  return { hz, hue: 280 - t * 90, t };
}

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

export function advanceTerrain(grid, rows, cols, front) {
  for (let r = rows - 1; r > 0; r--) for (let c = 0; c < cols; c++) grid[r * cols + c] = grid[(r - 1) * cols + c] * 0.985;
  for (let c = 0; c < cols; c++) grid[c] = front[Math.min(front.length - 1, Math.floor((c / cols) * front.length))] || 0;
  return grid;
}

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
