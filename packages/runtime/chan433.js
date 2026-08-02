// microspec runtime — the 433 MHz channel grids and how they land on an FFT.
//
// Two license-free voice plans plus the ISM device band they share. `homin` tunes ONCE, to the middle of
// LPD433, and never retunes: the plan is 1.700 MHz wide and the RTL's 2.4 MS/s window is 2.4 MHz, so every
// channel and every device burst is in view simultaneously. See docs/research/homin-433.md.
//
// Pure + unit-tested. The Hz live here, never in a view — the UI renders channel NUMBERS and names.
//
// NOTE ON THE FFT: a radix-2 FFT can never put channel edges on integer bins, because
// 25 kHz / (2.4 MHz / 2^k) = 2^k / 96 and 96 = 2^5·3. So channel power is integrated with FRACTIONAL edge
// weights. That is exact enough to say "this channel is active" (the analogue channel filter is not a brick
// wall either); the one channel we actually demodulate goes through an NCO + decimating FIR, which is exact
// by construction and does not use this mapping at all.

// ---- the plans ----
// [S] Secondary sources only (see the research note): the primary authority is CEPT/ECC Rec 70-03 and the
// national table. The arithmetic below is self-consistent, which proves transcription, not legality.

export const LPD433 = { id: "lpd433", count: 69, firstHz: 433_075_000, stepHz: 25_000 };
export const PMR446 = { id: "pmr446", count: 16, firstHz: 446_006_250, stepHz: 12_500 };

// The ISM device band (car remotes, doorbells, TPMS, weather stations) that LPD433 sits inside.
export const ISM433 = { loHz: 433_050_000, hiHz: 434_790_000 };

// The single tune `homin` uses: the midpoint of LPD433. It is ALSO exactly channel 35, which is why the DC
// artifact must be offset away from centre — see rtlsdr.js `dcBin`.
export const TUNE_HZ = 433_925_000;

export const planSpanHz = (p) => (p.count - 1) * p.stepHz;

// Channel numbers are 1-based, the way the radios print them.
export function channelCentre(plan, n) {
  if (!Number.isInteger(n) || n < 1 || n > plan.count) return null;
  return plan.firstHz + (n - 1) * plan.stepHz;
}

// Nearest channel to a frequency, or null when it falls outside the plan (further than half a step from
// the first or last channel).
export function channelAt(plan, hz) {
  const n = Math.round((hz - plan.firstHz) / plan.stepHz) + 1;
  if (n < 1 || n > plan.count) return null;
  return n;
}

// ---- FFT mapping ----
// `power` is expected SHIFTED: index 0 is the lowest frequency of the window, index fftSize-1 the highest.

// Fractional bin coordinate of an absolute frequency, in shifted-FFT index space.
export function binOf(hz, { fftSize, sampleRate, centreHz }) {
  return (hz - centreHz) * fftSize / sampleRate + fftSize / 2;
}

// Per-channel [lo, hi) fractional bin span, one entry per channel in the plan. `inWindow` is false when the
// channel is not fully inside the FFT window — the caller must not report power for it.
export function channelBins(plan, geom) {
  const out = [];
  for (let n = 1; n <= plan.count; n++) {
    const c = channelCentre(plan, n);
    const lo = binOf(c - plan.stepHz / 2, geom);
    const hi = binOf(c + plan.stepHz / 2, geom);
    out.push({ n, centreHz: c, lo, hi, inWindow: lo >= 0 && hi <= geom.fftSize });
  }
  return out;
}

// Integrate a shifted power spectrum into one value per channel, weighting the partial bins at each edge.
// Returns mean power per channel (not a sum), so channels of different widths stay comparable.
export function integrateChannels(power, bins) {
  const out = new Float32Array(bins.length);
  for (let i = 0; i < bins.length; i++) {
    const { lo, hi, inWindow } = bins[i];
    if (!inWindow) { out[i] = 0; continue; }
    let acc = 0;
    const first = Math.floor(lo), last = Math.ceil(hi) - 1;
    for (let b = first; b <= last; b++) {
      const left = Math.max(lo, b), right = Math.min(hi, b + 1);
      const w = right - left;                       // fraction of bin b that lies inside the channel
      if (w > 0) acc += power[b] * w;
    }
    out[i] = acc / (hi - lo);
  }
  return out;
}
