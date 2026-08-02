// microspec runtime — telling an OOK BURST apart from FM VOICE on the same channel.
//
// This is the discriminator `homin` needs and a scanner normally lacks. The 433 band carries both a doorbell
// (on/off keyed, a few milliseconds) and a handheld radio (frequency modulated, seconds), and a level squelch
// — demod.js `squelchOpen`, which is correct for what it does — opens on BOTH, because they can carry
// identical power. Opening the audio on every garage remote is what would make this app feel like a toy.
//
// The physical difference is the axis to measure: OOK modulates AMPLITUDE and leaves the carrier frequency
// alone; NFM modulates FREQUENCY and holds amplitude roughly constant. So classify on instantaneous-frequency
// activity and envelope keying, and use level only as the gate that says "something is here at all".
//
// Pure + unit-tested. Thresholds are exported and MUST be re-tuned against real captures — the defaults are
// derived from synthetic signals (docs/research/homin-433.md §3 lists them as UNKNOWN on hardware).

const TAU = 2 * Math.PI;

// Instantaneous frequency, in radians/sample: arg(x[n] · conj(x[n-1])). Length n-1.
export function instantFreq(re, im) {
  const n = Math.min(re.length, im.length), out = new Float32Array(Math.max(0, n - 1));
  for (let i = 1; i < n; i++) {
    const pr = re[i] * re[i - 1] + im[i] * im[i - 1];      // real part of x[i]·conj(x[i-1])
    const pi = im[i] * re[i - 1] - re[i] * im[i - 1];      // imaginary part
    out[i - 1] = Math.atan2(pi, pr);
  }
  return out;
}

export function magnitude(re, im) {
  const n = Math.min(re.length, im.length), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

// How much the carrier's frequency actually moves, as a magnitude-WEIGHTED standard deviation of the
// instantaneous frequency.
//
// The weighting is not a refinement, it is the whole trick: during an OOK gap the amplitude is ~0 and the
// phase is undefined, so the discriminator emits noise across the full ±π. Measured as a plain unweighted
// standard deviation, a silent gap looks like violent frequency modulation and every burst is classified as
// speech — by a factor of several hundred, which a unit test pins.
//
// The suppression comes from weighting each sample by its POWER: a gap at m≈0 contributes m² ≈ 0 while a
// pulse at m≈1 contributes 1, so the gaps drop out by orders of magnitude on their own. The `floor` cut is
// belt-and-braces on top of that, for the case where the "gap" is not near-zero but a weak interferer — then
// power weighting alone would still let it in.
export function fmActivity(re, im, { floor = 0.25 } = {}) {
  const f = instantFreq(re, im), mag = magnitude(re, im);
  let peak = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > peak) peak = mag[i];
  if (peak <= 0 || f.length === 0) return 0;
  const cut = peak * floor;
  let w = 0, sum = 0, sumSq = 0;
  for (let i = 0; i < f.length; i++) {
    const m = Math.min(mag[i], mag[i + 1]);                // both endpoints must be real signal
    if (m < cut) continue;
    const p = m * m;
    w += p; sum += p * f[i]; sumSq += p * f[i] * f[i];
  }
  if (w <= 0) return 0;
  const mean = sum / w;
  return Math.sqrt(Math.max(0, sumSq / w - mean * mean)) / TAU;   // cycles/sample, so it is scale-free
}

// Count envelope on/off edges with hysteresis — OOK keying produces many, speech produces almost none.
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

// Defaults derived from synthetic signals only — retune on real captures before trusting them.
export const CLASSIFY = { voiceMs: 200, fmVoice: 0.01, fmBurst: 0.004, burstEdges: 4 };

// "voice" · "burst" · "unknown". Deliberately refuses to guess: an event that matches neither profile is
// reported as unknown rather than forced into the class that happens to be nearer.
export function classifyEvent({ durationMs, fmActivity: fm, transitions }, opts = {}) {
  const o = { ...CLASSIFY, ...opts };
  if (fm >= o.fmVoice && durationMs >= o.voiceMs) return "voice";
  if (fm < o.fmBurst && transitions >= o.burstEdges) return "burst";
  return "unknown";
}
