// microspec runtime — granular synthesis math. Pure and DOM-free: the app owns the Web Audio nodes, this
// file owns every number that decides how they are scheduled, so the same plan drives the live instrument
// and the offline export bit-for-bit. Recipe + sources: apps/grain/RESEARCH.md.
import { mulberry32 } from "./groove.js";

// ---- grain envelope ----
// Hann, exactly zero at both ends — that is the whole reason a grain cannot click. 128 points is the render
// quantum and, spread over a >=40 ms grain, a linear segment every >=0.3 ms: inaudible faceting.
// setValueCurveAtTime interpolates LINEARLY between the points (MDN), so more points buy nothing.
export const HANN_N = 128;
export function hannCurve(n = HANN_N) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

// ---- the overlap identity: O = rate * duration ----
export const grainRate = (durSec, overlap) => overlap / Math.max(1e-4, durSec);
export const overlapOf = (durSec, rate) => rate * durSec;
// Decorrelated grains sum in POWER, so 1/sqrt(O) holds the level. 1/O is safe and audibly gutless.
export const cloudGain = (peak, overlap) => peak / Math.sqrt(Math.max(1, overlap));

export const semisToRate = (s) => Math.pow(2, s / 12);      // playbackRate only — detune is deliberately unused
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// planGrains — the deterministic score for one voice. Everything random comes from `seed`, so the export
// replays what was heard; Math.random() here would silently break that (unit-tested for equality).
//
// `advance` is the read-head speed and is NEVER multiplied by `rate`: doing so couples pitch back into
// time-stretch, which is the classic granular bug — two pitches must read the same source positions.
export function planGrains({
  span = 1, grainMs = 70, overlap = 4, sprayMs = 0, pos = 0, advance = 0,
  semis = 0, sampleDur = 2, seed = 1, peak = 1, maxGrains = 512,
} = {}) {
  const dur = Math.max(0.005, grainMs / 1000), rate = semisToRate(semis);
  const gps = grainRate(dur, overlap), step = 1 / gps, rng = mulberry32(seed >>> 0);
  const gain = cloudGain(peak, overlap), spray = Math.max(0, sprayMs / 1000);
  const span_ = Math.max(0, Math.min(sampleDur, span));       // a grain may not read past the sample's end
  const out = [];
  for (let t = 0, i = 0; t < span_ && i < maxGrains; t += step, i++) {
    const centre = pos + advance * t + (rng() * 2 - 1) * spray;
    const read = Math.max(0, sampleDur - dur * rate);          // source seconds consumed = dur * rate
    out.push({ t, offset: wrap(centre, read), dur, rate, gain });
  }
  return out;
}
// wrap, not clamp: clamping piles every sprayed grain onto the last frame and the cloud goes mono-tonal.
function wrap(v, hi) { if (hi <= 0) return 0; const m = v % hi; return m < 0 ? m + hi : m; }

// ================= capture conditioning =================
// Order is fixed: mono -> DC -> trim -> fades -> normalise. Normalising before the trim scales the loudest
// thing in the room, which is usually the hand that pressed record.
export function monoMix(channels) {
  const n = channels[0]?.length || 0, out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  const g = 1 / Math.max(1, channels.length);
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}
export function dcOffset(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; return x.length ? s / x.length : 0; }
export function removeDC(x) { const m = dcOffset(x); if (Math.abs(m) < 1e-6) return x; for (let i = 0; i < x.length; i++) x[i] -= m; return x; }
export const peakOf = (x) => { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; };
export const rms = (x, from = 0, to = x.length) => { let s = 0; const n = Math.max(1, to - from); for (let i = from; i < to; i++) s += x[i] * x[i]; return Math.sqrt(s / n); };
export const clipRatio = (x) => { let n = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 0.995) n++; return x.length ? n / x.length : 0; };

// trimBounds — RMS activity gate. MIN_KEEP exists because a steady rain take is quiet everywhere: with a
// pure threshold it reads as silence end to end and the app throws the recording away.
export const MIN_KEEP = 0.5, TRIM_WIN = 0.02, TRIM_HOP = 0.01, TRIM_MARGIN = 0.03, RUN = 3;
export function trimBounds(x, sr) {
  const win = Math.max(1, Math.round(sr * TRIM_WIN)), hop = Math.max(1, Math.round(sr * TRIM_HOP));
  const frames = [];
  for (let i = 0; i + win <= x.length; i += hop) frames.push(rms(x, i, i + win));
  if (!frames.length) return [0, x.length];
  const floor = frames.slice().sort((a, b) => a - b)[Math.floor(frames.length * 0.1)] || 0;
  const thr = Math.max(10 ** (-48 / 20), floor * 3.98);        // max(-48 dBFS, noise floor + 12 dB)
  const active = frames.map((v) => v >= thr);
  const first = runStart(active, RUN), last = runStart([...active].reverse(), RUN);
  if (first < 0 || last < 0) return [0, x.length];             // nothing passed — keep the take, let the user judge
  const m = Math.round(sr * TRIM_MARGIN);
  let a = Math.max(0, first * hop - m), b = Math.min(x.length, x.length - last * hop + m);
  const minLen = Math.min(x.length, Math.round(sr * MIN_KEEP));
  if (b - a < minLen) { const grow = Math.ceil((minLen - (b - a)) / 2); a = Math.max(0, a - grow); b = Math.min(x.length, a + minLen); }
  return [a, b];
}
function runStart(flags, run) { let n = 0; for (let i = 0; i < flags.length; i++) { n = flags[i] ? n + 1 : 0; if (n >= run) return i - run + 1; } return -1; }

export function edgeFade(x, sr, ms = 8) {
  const n = Math.min(Math.floor(x.length / 2), Math.round((sr * ms) / 1000));
  for (let i = 0; i < n; i++) { const g = i / n; x[i] *= g; x[x.length - 1 - i] *= g; }
  return x;
}
// Peak, never RMS: granulation overlaps windows, and RMS-normalising a noisy take pushes its transients
// into clip. +18 dB (x8) is the ceiling — past that the take is noise and deserves a retake, not a gain.
export const TARGET_PEAK = 0.89125, MAX_BOOST = 8;            // -1 dBFS
export function normalizePeak(x, target = TARGET_PEAK) {
  const p = peakOf(x); if (p < 1e-6) return { gain: 1, quiet: true };
  const g = Math.min(MAX_BOOST, target / p);
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return { gain: g, quiet: g >= MAX_BOOST };
}

// conditionSample — the whole pipeline over decoded channel data. Returns the playable PCM plus the
// diagnostics the view needs to be honest about a bad take (too quiet / clipped).
export function conditionSample(channels, sr) {
  const mono = removeDC(monoMix(channels));
  const dc = dcOffset(monoMix(channels));
  const clipped = clipRatio(mono) >= 0.005;
  const [a, b] = trimBounds(mono, sr);
  const cut = mono.slice(a, b);
  edgeFade(cut, sr, 8);
  const { gain, quiet } = normalizePeak(cut);
  return { pcm: cut, sr, dur: cut.length / sr, gain, quiet, clipped, dc, trimmed: (mono.length - cut.length) / sr };
}

// ================= pitch (YIN) =================
// de Cheveigné & Kawahara 2002: difference function -> cumulative mean normalised difference -> absolute
// threshold -> parabolic interpolation. ~40 lines beats vendoring a package for one call.
export const YIN_FRAME = 2048, YIN_HOP = 512, YIN_THRESH = 0.15, F0_MIN = 80, F0_MAX = 1000;
export function yinFrame(x, sr, from = 0, { frame = YIN_FRAME, threshold = YIN_THRESH, fmin = F0_MIN, fmax = F0_MAX } = {}) {
  const N = Math.min(frame, x.length - from); if (N < 128) return { hz: 0, conf: 0 };
  const tauMin = Math.max(2, Math.floor(sr / fmax)), tauMax = Math.min(Math.floor(N / 2), Math.floor(sr / fmin));
  if (tauMax <= tauMin) return { hz: 0, conf: 0 };
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) { let s = 0; for (let i = 0; i + tau < N; i++) { const dv = x[from + i] - x[from + i + tau]; s += dv * dv; } d[tau] = s; }
  const cm = new Float32Array(tauMax + 1); let run = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = run === 0 ? 1 : (d[tau] * (tau - tauMin + 1)) / run; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) if (cm[t] < threshold) { while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++; tau = t; break; }
  if (tau < 0) { let best = tauMin; for (let t = tauMin; t <= tauMax; t++) if (cm[t] < cm[best]) best = t; tau = best; if (cm[tau] > 0.5) return { hz: 0, conf: 0 }; }
  const y0 = cm[tau - 1] ?? cm[tau], y1 = cm[tau], y2 = cm[tau + 1] ?? cm[tau];      // parabolic: integer lags
  const denom = 2 * (2 * y1 - y0 - y2);                                              // are several cents apart at 440 Hz
  const shift = denom === 0 ? 0 : (y2 - y0) / denom;
  return { hz: sr / (tau + clamp(shift, -1, 1)), conf: clamp(1 - cm[tau], 0, 1) };
}

export const CENTS = (a, b) => 1200 * Math.log2(a / b);
// detectPitch — a sample is PITCHED only if several frames independently agree. A door slam must come back
// unpitched: naming it "F#3" is the tell that the app was never tried on real material.
export function detectPitch(x, sr, { minFrames = 3, agreeCents = 50, minConf = 0.8, rmsGate = 10 ** (-45 / 20) } = {}) {
  const hits = [];
  for (let i = 0; i + YIN_FRAME <= x.length; i += YIN_HOP) {
    if (rms(x, i, i + YIN_FRAME) < rmsGate) continue;
    const { hz, conf } = yinFrame(x, sr, i);
    if (hz > 0 && conf >= minConf) hits.push(hz);
  }
  if (hits.length < minFrames) return { hz: 0, conf: 0, pitched: false };
  const sorted = hits.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  const agree = hits.filter((h) => Math.abs(CENTS(h, med)) <= agreeCents);
  if (agree.length < minFrames) return { hz: 0, conf: 0, pitched: false };
  return { hz: med, conf: agree.length / hits.length, pitched: true };
}

// ================= WAV =================
// The canonical 44-byte 16-bit PCM header — same layout the runtime already writes in mediasession.js.
export function encodeWav(channels, sr) {
  const ch = channels.length, n = channels[0]?.length || 0, dataLen = n * ch * 2;
  const buf = new ArrayBuffer(44 + dataLen), v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = clamp(channels[c][i], -1, 1); v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true); o += 2; }
  return new Uint8Array(buf);
}

// ================= gate fixture =================
// The headless gate has no microphone, so it gets a deterministic struck-bowl sample: pitched at 220 Hz so
// detectPitch resolves a real note and the view renders its WIDEST state (a note name), never "waiting".
export function syntheticSample(sr = 48000, seconds = 1.6, hz = 220) {
  const n = Math.round(sr * seconds), x = new Float32Array(n), rng = mulberry32(7);
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = Math.exp(-t * 2.4);
    x[i] = env * (0.6 * Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(4 * Math.PI * hz * t) + 0.12 * Math.sin(6 * Math.PI * hz * t))
      + Math.exp(-t * 60) * (rng() * 2 - 1) * 0.25;            // the mallet's chiff, gone in ~50 ms
  }
  return x;
}
