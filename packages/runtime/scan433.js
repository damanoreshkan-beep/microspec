
import { fft, firLowpass } from "./fmradio.js";
import { LPD433, TUNE_HZ, channelBins, integrateChannels } from "./chan433.js";
import { fmActivity, envelopeTransitions, magnitude, classifyEvent } from "./burst.js";

const TAU = 2 * Math.PI;
const s8 = (b) => (b > 127 ? b - 256 : b);          

export const DEFAULT_GEOM = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ, hop: 1024 };

export const CROWDED_CHANNEL = 35;

export function hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(TAU * i / (n - 1)));
  return w;
}

export function powerFrame(bytes, start, geom, scratch) {
  const N = geom.fftSize;
  const { re, im, win, pw } = scratch;
  for (let i = 0; i < N; i++) {
    const j = (start + i) * 2;
    re[i] = s8(bytes[j]) * win[i] / 128;
    im[i] = s8(bytes[j + 1]) * win[i] / 128;
  }
  fft(re, im);
  for (let i = 0; i < N; i++) pw[(i + N / 2) % N] = re[i] * re[i] + im[i] * im[i];   
  return pw;
}

export function newScratch(geom) {
  const N = geom.fftSize;
  return { re: new Float32Array(N), im: new Float32Array(N), pw: new Float32Array(N), win: hannWindow(N) };
}

export function channelPowers(bytes, geom = DEFAULT_GEOM, plan = LPD433) {
  const bins = channelBins(plan, geom);
  const scratch = newScratch(geom);
  const total = Math.floor(bytes.length / 2);
  const frames = [];
  for (let s = 0; s + geom.fftSize <= total; s += geom.hop) {
    frames.push(integrateChannels(powerFrame(bytes, s, geom, scratch), bins));
  }
  return { frames, channels: bins.length, frameMs: geom.hop * 1000 / geom.sampleRate };
}

export function channelFloor(powers) {
  const v = Float32Array.from(powers).sort();
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

export function findRuns(series, { floor, riseRatio = 8, fallRatio = 4, minFrames = 1 } = {}) {
  const hi = floor * riseRatio, lo = floor * fallRatio;
  const runs = [];
  let start = -1;
  for (let i = 0; i < series.length; i++) {
    if (start < 0 && series[i] >= hi) start = i;
    else if (start >= 0 && series[i] < lo) {
      if (i - start >= minFrames) runs.push({ start, end: i });
      start = -1;
    }
  }
  if (start >= 0 && series.length - start >= minFrames) runs.push({ start, end: series.length });
  return runs;
}

export function extractChannel(bytes, { deltaHz, sampleRate = 2_400_000, decim = 48, taps = 1024, channelHz = 25_000, cutoffHz } = {}) {
  const n = Math.floor(bytes.length / 2);
  const h = firLowpass(taps, cutoffHz ?? channelHz / 2, sampleRate);
  const mr = new Float32Array(n), mi = new Float32Array(n);
  const wr = Math.cos(-TAU * deltaHz / sampleRate), wi = Math.sin(-TAU * deltaHz / sampleRate);
  let cr = 1, ci = 0;
  for (let i = 0; i < n; i++) {
    const xr = s8(bytes[i * 2]) / 128, xi = s8(bytes[i * 2 + 1]) / 128;
    mr[i] = xr * cr - xi * ci;
    mi[i] = xr * ci + xi * cr;
    const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
    if ((i & 1023) === 1023) { const m = Math.hypot(cr, ci) || 1; cr /= m; ci /= m; }   
  }
  const outN = Math.max(0, Math.floor((n - taps) / decim));
  const re = new Float32Array(outN), im = new Float32Array(outN);
  for (let k = 0; k < outN; k++) {
    const base = k * decim + taps - 1;
    let ar = 0, ai = 0;
    for (let t = 0; t < taps; t++) { const idx = base - t; ar += h[t] * mr[idx]; ai += h[t] * mi[idx]; }
    re[k] = ar; im[k] = ai;
  }
  return { re, im, sampleRate: sampleRate / decim };
}

export function classifyChannel(bytes, { channelHz, centreHz = TUNE_HZ, durationMs, ...opts }) {
  const ch = extractChannel(bytes, { deltaHz: channelHz - centreHz, ...opts });
  const ev = {
    durationMs,
    fmActivity: fmActivity(ch.re, ch.im),
    transitions: envelopeTransitions(magnitude(ch.re, ch.im)),
  };
  return { ...ev, kind: classifyEvent(ev), sampleRate: ch.sampleRate };
}
