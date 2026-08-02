// microspec runtime — the 433 MHz scan pipeline: raw IQ bytes in, classified events out.
//
// Two tiers, because they have very different costs:
//   DETECT   an overlapped FFT over the whole 2.4 MHz window → power per LPD channel → runs above the floor.
//            Cheap enough to watch all 69 channels plus the device traffic continuously (19.2% of one core,
//            measured — docs/research/homin-433.md §2).
//   CLASSIFY only for a channel that actually lit up, pull its complex baseband out with an NCO + decimating
//            FIR and ask burst.js whether it is a device or a person. Costly per channel, so it runs on
//            candidates, never on all 69.
//
// The gate and the radio share this file. A fixture supplies BYTES (fixture433.js) and everything downstream
// is the same code — the predecessor app mocked ROWS, so its real path was never exercised until it reached
// hardware, and that is precisely how it shipped broken.
//
// Pure + unit-tested. No navigator, no worker, no WebUSB.

import { fft, firLowpass } from "./fmradio.js";
import { LPD433, TUNE_HZ, channelBins, integrateChannels } from "./chan433.js";
import { fmActivity, envelopeTransitions, magnitude, classifyEvent } from "./burst.js";

const TAU = 2 * Math.PI;
const s8 = (b) => (b > 127 ? b - 256 : b);          // signed-in-uint8, the farm's IQ layout

export const DEFAULT_GEOM = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ, hop: 1024 };

// Channel 35 is the tune centre AND where essentially every ISM device transmits (433.92 MHz lands 5 kHz off
// its centre) AND a legitimate voice channel. It will read as permanently busy, the DC artifact sits on it,
// and it must never be presented as voice on power alone. See the research note.
export const CROWDED_CHANNEL = 35;

export function hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(TAU * i / (n - 1)));
  return w;
}

// One shifted power spectrum from `bytes` starting at complex sample `start`. `out` is reused across frames.
export function powerFrame(bytes, start, geom, scratch) {
  const N = geom.fftSize;
  const { re, im, win, pw } = scratch;
  for (let i = 0; i < N; i++) {
    const j = (start + i) * 2;
    re[i] = s8(bytes[j]) * win[i] / 128;
    im[i] = s8(bytes[j + 1]) * win[i] / 128;
  }
  fft(re, im);
  for (let i = 0; i < N; i++) pw[(i + N / 2) % N] = re[i] * re[i] + im[i] * im[i];   // fftshift
  return pw;
}

export function newScratch(geom) {
  const N = geom.fftSize;
  return { re: new Float32Array(N), im: new Float32Array(N), pw: new Float32Array(N), win: hannWindow(N) };
}

// Per-channel power for every frame in `bytes`. Returns { frames, channels, at(frame) -> Float32Array }.
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

// Robust noise floor: the median across channels of a frame is dominated by the quiet majority, so a few
// loud channels cannot drag it up the way a mean would.
//
// Deliberately NOT called `noiseFloor` — sweep.js exports one of those and it takes a dB array, while this
// takes linear power. Same name, different units is a trap someone eventually falls into.
export function channelFloor(powers) {
  const v = Float32Array.from(powers).sort();
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

// Contiguous stretches where a channel sits above `floor * riseRatio`, with hysteresis so a fading signal
// does not shatter into a burst of fake events.
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

// ---- tier 2: pull one channel's complex baseband out of the wideband bytes ----
// NCO mix to baseband + polyphase-decimating FIR. Used on CANDIDATES only. `taps` buys adjacent-channel
// rejection; the unit test measures what a given count actually delivers rather than trusting a rule of
// thumb. For continuous audio a CIC front-end is the cheaper chain — this one is sized for the short
// classification window.
// The cutoff must be HALF THE CHANNEL SPACING, not the decimation Nyquist. Defaulting it to
// sampleRate/(2·decim) = 25 kHz put the adjacent channel's centre exactly on the cutoff, where a filter is
// by definition 6 dB down — and measured rejection was 6.0 dB at every tap count, which is the fingerprint
// of a cutoff in the wrong place rather than a filter that is too short.
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
    if ((i & 1023) === 1023) { const m = Math.hypot(cr, ci) || 1; cr /= m; ci /= m; }   // stop phasor drift
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

// The whole chain for one candidate: extract, measure, classify.
export function classifyChannel(bytes, { channelHz, centreHz = TUNE_HZ, durationMs, ...opts }) {
  const ch = extractChannel(bytes, { deltaHz: channelHz - centreHz, ...opts });
  const ev = {
    durationMs,
    fmActivity: fmActivity(ch.re, ch.im),
    transitions: envelopeTransitions(magnitude(ch.re, ch.im)),
  };
  return { ...ev, kind: classifyEvent(ev), sampleRate: ch.sampleRate };
}
