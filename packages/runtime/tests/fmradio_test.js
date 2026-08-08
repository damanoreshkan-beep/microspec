// microspec runtime — fmradio unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { iqFromBytes, firLowpass, deemphasisAlpha, fft, powerSpectrum, seedSpectrum, FmReceiver, IN_RATE, OUT_RATE, OFFSET_HZ } from "../fmradio.js";

// ================= HackRF FM DSP (fmradio.js) =================

Deno.test("iqFromBytes: signed int8 → ±1 float, interleaved I,Q", () => {
  const { i, q } = iqFromBytes(new Uint8Array([0, 64, 128, 192]));
  assertEquals(i[0], 0);            // byte 0 → 0
  assertEquals(q[0], 0.5);          // byte 64 → +0.5
  assertEquals(i[1], -1);           // byte 128 = int8 -128 → -1.0
  assertEquals(q[1], -0.5);         // byte 192 = int8 -64 → -0.5
});

Deno.test("firLowpass: symmetric, unity DC gain, correct length", () => {
  const h = firLowpass(33, 10_000, 250_000);
  assertEquals(h.length, 33);
  let sum = 0; for (const t of h) sum += t;
  assert(Math.abs(sum - 1) < 1e-6, "taps sum to 1 (0 dB at DC)");
  for (let k = 0; k < 16; k++) assert(Math.abs(h[k] - h[32 - k]) < 1e-9, "linear-phase symmetric");
});

Deno.test("deemphasisAlpha: matches 1/(1+fs·tc/1e6), in (0,1), larger tc → smaller alpha", () => {
  assertEquals(deemphasisAlpha(250_000, 50), 1 / (1 + (250_000 * 50) / 1e6));
  const a = deemphasisAlpha(250_000, 50);
  assert(a > 0 && a < 1);
  assert(deemphasisAlpha(250_000, 75) < a, "75µs rolls off more → smaller alpha");
});

Deno.test("fft: matches a naive DFT within eps; single-bin sine lands in its bin", () => {
  const n = 16, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 0; k < n; k++) re[k] = Math.cos(2 * Math.PI * 3 * k / n);   // pure bin-3 real tone
  const dftMag = (b) => { let r = 0, i = 0; for (let k = 0; k < n; k++) { const a = -2 * Math.PI * b * k / n; r += re[k] * Math.cos(a); i += re[k] * Math.sin(a); } return Math.hypot(r, i); };
  const expect = [...Array(n)].map((_, b) => dftMag(b));
  fft(re, im);
  for (let b = 0; b < n; b++) assert(Math.abs(Math.hypot(re[b], im[b]) - expect[b]) < 1e-3, `bin ${b} matches DFT`);
  // energy at bins 3 and n-3 (real tone → symmetric), negligible elsewhere
  assert(Math.hypot(re[3], im[3]) > 5 && Math.hypot(re[13], im[13]) > 5);
  assert(Math.hypot(re[7], im[7]) < 1e-2);
});

Deno.test("powerSpectrum: fftshift puts a baseband (DC) tone in the centre bin", () => {
  const n = 256, i = new Float32Array(n), q = new Float32Array(n);
  for (let k = 0; k < n; k++) { i[k] = 1; q[k] = 0; }               // DC → all energy at 0 Hz
  const mag = powerSpectrum(i, q, n, n);
  let peak = 0; for (let b = 1; b < n; b++) if (mag[b] > mag[peak]) peak = b;
  assertEquals(peak, n / 2, "DC lands in the centre after fftshift");
});

Deno.test("FmReceiver: an FM tone demodulates to that audio tone (end-to-end DSP)", () => {
  // Synthesize a HackRF-style int8 IQ block: carrier at the OFFSET (so the receiver's digital shift brings it
  // to baseband), FM-modulated by a 1 kHz tone. Then assert the demodulated audio's dominant bin ≈ 1 kHz.
  const fAudio = 1000, dev = 40_000, blocks = 4, per = 65536;
  const rx = new FmReceiver({ tcUs: 50 });
  let phase = 0, ph2 = 0, nAll = 0;
  const audioAll = [];
  for (let bidx = 0; bidx < blocks; bidx++) {
    const bytes = new Uint8Array(per * 2);
    for (let n = 0; n < per; n++, nAll++) {
      const msg = Math.sin(2 * Math.PI * fAudio * nAll / IN_RATE);
      phase += 2 * Math.PI * (OFFSET_HZ + dev * msg) / IN_RATE;      // instantaneous carrier phase
      const I = Math.cos(phase), Q = Math.sin(phase);
      bytes[2 * n] = (Math.max(-127, Math.min(127, Math.round(I * 120))) + 256) & 0xff;
      bytes[2 * n + 1] = (Math.max(-127, Math.min(127, Math.round(Q * 120))) + 256) & 0xff;
    }
    const { audio } = rx.process(bytes);
    for (const s of audio) audioAll.push(s);
  }
  // FFT the (settled) tail of the audio and find the dominant frequency
  const a = audioAll.slice(-8192);
  const size = 4096, re = new Float32Array(size), im = new Float32Array(size);
  for (let k = 0; k < size; k++) re[k] = a[a.length - size + k] || 0;
  fft(re, im);
  let peak = 1; for (let b = 2; b < size / 2; b++) if (Math.hypot(re[b], im[b]) > Math.hypot(re[peak], im[peak])) peak = b;
  const detected = peak * OUT_RATE / size;
  assert(Math.abs(detected - fAudio) < 80, `demodulated tone ${detected.toFixed(0)} Hz ≈ ${fAudio} Hz`);
});

Deno.test("seedSpectrum: deterministic, finite, station peak in the centre", () => {
  const a = seedSpectrum(256, 10), b = seedSpectrum(256, 10);
  assertEquals([...a], [...b], "no Math.random → stable for shoots/e2e");
  for (const v of a) assert(Number.isFinite(v));
  const mid = a[128];
  assert(mid > a[10] && mid > a[240], "tuned carrier sits mid-band");
});
