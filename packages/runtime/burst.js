
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
  let w = 0, sum = 0, sumSq = 0;
  for (let i = 0; i < f.length; i++) {
    const m = Math.min(mag[i], mag[i + 1]);                
    if (m < cut) continue;
    const p = m * m;
    w += p; sum += p * f[i]; sumSq += p * f[i] * f[i];
  }
  if (w <= 0) return 0;
  const mean = sum / w;
  return Math.sqrt(Math.max(0, sumSq / w - mean * mean)) / TAU;   
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
