
const TAU = 2 * Math.PI;

export function instantFreq(re, im) {
  const n = Math.min(re.length, im.length), out = new Float32Array(Math.max(0, n - 1));
  for (let i = 1; i < n; i++) {
    const pr = re[i] * re[i - 1] + im[i] * im[i - 1];      
    const pi = im[i] * re[i - 1] - re[i] * im[i - 1];      
    out[i - 1] = Math.atan2(pi, pr);
  }
  return out;
}

export function magnitude(re, im) {
  const n = Math.min(re.length, im.length), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

export function fmActivity(re, im, { floor = 0.25 } = {}) {
  const f = instantFreq(re, im), mag = magnitude(re, im);
  let peak = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > peak) peak = mag[i];
  if (peak <= 0 || f.length === 0) return 0;
  const cut = peak * floor;
  const vals = [], wts = [];
  for (let i = 0; i < f.length; i++) {
    const m = Math.min(mag[i], mag[i + 1]);                
    if (m < cut) continue;
    vals.push(f[i]); wts.push(m * m);                      
  }
  if (!vals.length) return 0;
  const med = weightedMedian(vals, wts);
  const mad = weightedMedian(vals.map((v) => Math.abs(v - med)), wts);
  return 1.4826 * mad / TAU;                               
}

export function weightedMedian(values, weights) {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let acc = 0;
  for (const i of idx) {
    acc += weights[i];
    if (acc >= total / 2) return values[i];
  }
  return values[idx[idx.length - 1]];
}

export function envelopeTransitions(mag, { hi = 0.6, lo = 0.3 } = {}) {
  let peak = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > peak) peak = mag[i];
  if (peak <= 0) return 0;
  const hiT = peak * hi, loT = peak * lo;
  let on = mag[0] >= hiT, edges = 0;
  for (let i = 1; i < mag.length; i++) {
    if (!on && mag[i] >= hiT) { on = true; edges++; }
    else if (on && mag[i] <= loT) { on = false; edges++; }
  }
  return edges;
}

export const CLASSIFY = { voiceMs: 200, fmVoice: 0.01, fmBurst: 0.004, burstEdges: 4 };

export function classifyEvent({ durationMs, fmActivity: fm, transitions }, opts = {}) {
  const o = { ...CLASSIFY, ...opts };
  if (fm >= o.fmVoice && durationMs >= o.voiceMs) return "voice";
  if (fm < o.fmBurst && transitions >= o.burstEdges) return "burst";
  return "unknown";
}
