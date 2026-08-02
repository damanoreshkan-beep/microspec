// microspec runtime — CTCSS (sub-audible squelch tone) detection.
//
// Two groups can share one LPD/PMR channel and never hear each other, because each radio transmits a
// continuous tone below the voice band and only opens its speaker for its own. Reading that tone is what lets
// `homin` show them as separate things on one channel instead of one confused blur.
//
// Pure + unit-tested. Reuses fmradio.js `goertzelPower` (a resonator at an arbitrary frequency, so tones need
// not land on FFT bins) and `firLowpass` — voice sits at 300–3000 Hz and would otherwise leak into every tone.

import { goertzelPower, firLowpass } from "./fmradio.js";

// [S] The 38 standard tones (EIA/TIA-603), Hz. Secondary source — see docs/research/homin-433.md §4.
export const CTCSS_TONES = [
  67.0, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8,
  97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8,
  136.5, 141.3, 146.2, 151.4, 156.7, 162.2, 167.9, 173.8, 179.9, 186.2,
  192.8, 203.5, 210.7, 218.1, 225.7, 233.6, 241.8, 250.3,
];

export const VOICE_FLOOR_HZ = 300;      // everything above this is speech, not signalling

// The tightest pair in the table decides the whole design: you cannot resolve two tones closer than
// 1/T apart, so the integration window follows from the plan, it is not a taste choice.
export function minToneGap(tones = CTCSS_TONES) {
  let min = Infinity;
  for (let i = 1; i < tones.length; i++) min = Math.min(min, tones[i] - tones[i - 1]);
  return min;
}

// Samples needed to resolve adjacent tones, with `margin` of headroom. This is why a tone is never identified
// instantly — the UI must not pretend otherwise.
export function windowSamples(sampleRate, { gapHz = minToneGap(), margin = 1.25 } = {}) {
  return Math.ceil(sampleRate * margin / gapHz);
}

function convolve(x, taps) {
  const n = x.length, m = taps.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    const kMax = Math.min(m, i + 1);
    for (let k = 0; k < kMax; k++) acc += taps[k] * x[i - k];
    out[i] = acc;
  }
  return out;
}

// Detect the transmitted tone in a block of demodulated audio. Returns null when nothing stands far enough
// above the rest — refusing to name a tone is a valid answer and much better than naming the wrong group.
export function detectCtcss(audio, sampleRate, { tones = CTCSS_TONES, marginDb = 6, taps = 101 } = {}) {
  const need = windowSamples(sampleRate);
  if (audio.length < need) return null;                    // too short to be resolvable — say so, do not guess
  const lp = convolve(audio, firLowpass(taps, VOICE_FLOOR_HZ, sampleRate));
  const powers = tones.map((hz) => goertzelPower(lp, 2 * Math.cos(2 * Math.PI * hz / sampleRate)));
  let best = 0;
  for (let i = 1; i < powers.length; i++) if (powers[i] > powers[best]) best = i;
  let sum = 0;
  for (let i = 0; i < powers.length; i++) if (i !== best) sum += powers[i];
  const mean = sum / (powers.length - 1);
  if (mean <= 0) return null;
  const snrDb = 10 * Math.log10(powers[best] / mean);
  if (snrDb < marginDb) return null;
  return { index: best, toneHz: tones[best], snrDb, windowSamples: need };
}
