// microspec runtime — broadband-FM DSP for the HackRF group. PURE math (no DOM, no WebUSB, no AudioContext),
// so it mounts in the linkedom preflight, runs in a Web Worker, and is unit-tested headless. The device I/O
// lives in hackrf.js; the worker (apps/fmradio/dsp.worker.js) glues the two. Recipe + sources:
// docs/research/hackrf-webusb-fm.md (google/radioreceiver formulas, jtarrio/signals).
//
// Chain, per USB block of interleaved int8 IQ at 2 Msps:
//   int8→float → digital shift (offset-tuning, station off the DC spike) → complex FIR decimate 2M→250k IF
//   → polar FM discriminator → 50µs de-emphasis → fractional FIR resample 250k→48k mono audio.
// A separate 1024-pt FFT of the IF gives the spectrum/waterfall the UI draws.

export const IN_RATE = 2_000_000;   // HackRF's minimum complex sample rate — cannot go lower, must decimate in SW
export const IF_RATE = 250_000;     // intermediate rate after ÷8 — comfortably passes the ~200 kHz FM channel
export const OUT_RATE = 48_000;     // audio
export const MAX_DEV = 75_000;      // FM peak deviation (broadcast) — sets the discriminator's amplitude scale
export const OFFSET_HZ = IN_RATE / 8; // 250 kHz — offset-tune this far below the station, shift back digitally.
//   A clean ÷8 of the sample rate → the shift NCO has an exact 8-sample period (no phase drift, no table error).

const TAU = Math.PI * 2;

// ---- int8 IQ → float, interleaved I,Q,I,Q… → { i:Float32, q:Float32 }. HackRF's MAX5864 is an 8-bit ADC;
// a raw byte is a signed int8 (0→0, 64→0.5, 128→−1.0, 192→−0.5), scaled to ±1. ----
export function iqFromBytes(bytes) {
  const n = bytes.length >> 1, i = new Float32Array(n), q = new Float32Array(n);
  for (let k = 0, j = 0; k < n; k++) {
    let bi = bytes[j++], bq = bytes[j++];
    if (bi > 127) bi -= 256; if (bq > 127) bq -= 256;
    i[k] = bi / 128; q[k] = bq / 128;
  }
  return { i, q };
}

// ---- Hamming-windowed sinc low-pass FIR. Center tap = 2·f (f = cutoff/fs normalized); other taps are the
// sinc sin(2π f (k−c))/(π(k−c)) × Hamming, then normalized so the taps sum to 1 (unity DC gain). ----
export function firLowpass(numTaps, cutoffHz, fs) {
  const f = cutoffHz / fs, c = (numTaps - 1) / 2, taps = new Float32Array(numTaps);
  let sum = 0;
  for (let k = 0; k < numTaps; k++) {
    const x = k - c;
    const sinc = x === 0 ? 2 * f : Math.sin(TAU * f * x) / (Math.PI * x);
    const win = 0.54 - 0.46 * Math.cos(TAU * k / (numTaps - 1));
    taps[k] = sinc * win; sum += taps[k];
  }
  for (let k = 0; k < numTaps; k++) taps[k] /= sum;
  return taps;
}

// De-emphasis one-pole RC IIR coefficient: y += alpha·(x−y). tc = 50 µs (EU/UA) or 75 µs (US/KR).
export const deemphasisAlpha = (fs, tcUs) => 1 / (1 + (fs * tcUs) / 1e6);

// ---- iterative radix-2 Cooley–Tukey FFT, in place (re/im mutated). size must be a power of two. ----
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {           // bit-reversal permutation
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {        // Danielson–Lanczos butterflies
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + (len >> 1)] * cr - im[i + k + (len >> 1)] * ci;
        const vi = re[i + k + (len >> 1)] * ci + im[i + k + (len >> 1)] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + (len >> 1)] = ur - vr; im[i + k + (len >> 1)] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// Power spectrum of complex IQ (already at baseband), returned in dB and fft-shifted so DC is centered — the
// natural x-axis for a tuned SDR ("station in the middle"). `out` bins are downsampled to `bins` for the UI.
export function powerSpectrum(i, q, size, bins) {
  const re = new Float32Array(size), im = new Float32Array(size);
  const win = (k) => 0.5 - 0.5 * Math.cos(TAU * k / (size - 1));   // Hann to tame FFT leakage
  const m = Math.min(size, i.length);
  for (let k = 0; k < m; k++) { const w = win(k); re[k] = i[k] * w; im[k] = q[k] * w; }
  fft(re, im);
  const half = size >> 1, mag = new Float32Array(size);
  for (let k = 0; k < size; k++) {
    const s = (k + half) % size;                                    // fftshift
    const p = re[s] * re[s] + im[s] * im[s];
    mag[k] = 10 * Math.log10(p + 1e-12);
  }
  if (!bins || bins >= size) return mag;
  const out = new Float32Array(bins), step = size / bins;           // peak-hold downsample to display width
  for (let b = 0; b < bins; b++) {
    let peak = -Infinity; const s0 = Math.floor(b * step), s1 = Math.floor((b + 1) * step);
    for (let s = s0; s < s1; s++) if (mag[s] > peak) peak = mag[s];
    out[b] = peak;
  }
  return out;
}

// ---- FmReceiver — the stateful chain, stepped per USB block. Keeps FIR histories, the shift NCO phase, the
// discriminator's previous sample and the de-emphasis accumulator across blocks so there are no seams. ----
export class FmReceiver {
  constructor({ tcUs = 50 } = {}) {
    // stage-1 decimating complex FIR: cutoff 100 kHz < IF Nyquist (125 kHz), ÷8. Only kept outputs are summed.
    this.decim = IN_RATE / IF_RATE;                                 // 8
    this.h1 = firLowpass(48, 100_000, IN_RATE);
    this.hi = new Float32Array(this.h1.length); this.hq = new Float32Array(this.h1.length); // ring history (I,Q)
    this.hp = 0;                                                    // history write pointer
    this.phase = 0;                                                 // shift NCO phase index (mod decim → period 8)
    this.cosT = new Float32Array(this.decim); this.sinT = new Float32Array(this.decim);
    for (let n = 0; n < this.decim; n++) { const a = -TAU * OFFSET_HZ * n / IN_RATE; this.cosT[n] = Math.cos(a); this.sinT[n] = Math.sin(a); }
    this.pI = 1; this.pQ = 0;                                       // discriminator previous sample
    this.ampl = OUT_RATE / (TAU * MAX_DEV);                         // deviation → ±1 audio (scaled at OUT_RATE)
    this.setDeemphasis(tcUs);
    // stage-2 fractional resampler IF→OUT (windowed-sinc, polyphase pick)
    this.h2 = firLowpass(64, 15_000, IF_RATE);                     // audio cutoff ~15 kHz
    this.a2 = new Float32Array(this.h2.length); this.ap = 0;
    this.rateMul = IF_RATE / OUT_RATE; this.readFrom = 0;
    this.deemY = 0;
  }
  setDeemphasis(tcUs) { this.tcUs = tcUs; this.deemA = deemphasisAlpha(IF_RATE, tcUs); }

  // process one USB block (interleaved int8 IQ) → { audio: Float32(≈block/decim/rateMul), if: {i,q} at IF }.
  process(bytes) {
    const { i, q } = iqFromBytes(bytes);
    const N = i.length, dec = this.decim, hlen = this.h1.length;
    // --- digital shift + decimating complex FIR → IF ---
    const outN = Math.floor(N / dec), ifI = new Float32Array(outN), ifQ = new Float32Array(outN);
    let oi = 0;
    for (let n = 0; n < N; n++) {
      const c = this.cosT[this.phase], s = this.sinT[this.phase];   // e^{-j2π·OFFSET·n/fs}
      const si = i[n] * c - q[n] * s, sq = i[n] * s + q[n] * c;     // shifted sample
      this.hi[this.hp] = si; this.hq[this.hp] = sq;
      this.hp = (this.hp + 1) % hlen;
      this.phase = (this.phase + 1) % dec;
      if (n % dec === dec - 1 && oi < outN) {                       // keep every dec-th → run the FIR here only
        let ai = 0, aq = 0, p = this.hp;
        for (let k = 0; k < hlen; k++) { p = (p - 1 + hlen) % hlen; const t = this.h1[k]; ai += this.hi[p] * t; aq += this.hq[p] * t; }
        ifI[oi] = ai; ifQ[oi] = aq; oi++;
      }
    }
    // --- polar FM discriminator → de-emphasis → IF-rate demodulated audio ---
    const dem = new Float32Array(outN);
    for (let n = 0; n < outN; n++) {
      const I = ifI[n], Q = ifQ[n];
      const real = this.pI * I + this.pQ * Q, imag = this.pI * Q - I * this.pQ;
      this.pI = I; this.pQ = Q;
      const d = Math.atan2(imag, real) * this.ampl;
      this.deemY += this.deemA * (d - this.deemY);
      dem[n] = this.deemY;
    }
    // --- fractional resample IF→OUT ---
    const audio = this.resample(dem);
    return { audio, if: { i: ifI, q: ifQ } };
  }

  resample(x) {
    const hlen = this.h2.length, out = [];
    for (let n = 0; n < x.length; n++) {
      this.a2[this.ap] = x[n]; this.ap = (this.ap + 1) % hlen;
      // emit every output sample whose read position now lies within the samples consumed
      while (this.readFrom < n + 1) {
        let acc = 0, p = this.ap;
        for (let k = 0; k < hlen; k++) { p = (p - 1 + hlen) % hlen; acc += this.a2[p] * this.h2[k]; }
        out.push(acc);
        this.readFrom += this.rateMul;
      }
    }
    this.readFrom -= x.length;                                      // carry the fractional remainder to next block
    return Float32Array.from(out);
  }
}

// ---- gate/preview synthetic spectrum. Deterministic (no Math.random) so shoots and e2e are stable: a shaped
// noise floor plus a station peak in the middle, gently animated by an integer `phase`. Returned in the same
// dB-ish range the real powerSpectrum produces so the UI's normalization is identical on real signal + demo. ----
export function seedSpectrum(bins, phase = 0) {
  const out = new Float32Array(bins), mid = bins / 2;
  for (let b = 0; b < bins; b++) {
    const d = (b - mid) / bins;
    const floor = -70 + 6 * Math.sin(b * 0.21 + phase * 0.05) + 4 * Math.sin(b * 0.07 - phase * 0.03);
    const station = 34 * Math.exp(-(d * d) / 0.0016);              // the tuned carrier, centered
    const side = 10 * Math.exp(-((Math.abs(d) - 0.06) ** 2) / 0.0009); // stereo/pilot shoulders
    out[b] = floor + station + side;
  }
  return out;
}
