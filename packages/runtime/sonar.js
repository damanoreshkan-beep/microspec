// microspec runtime — ultrasonic Doppler motion sensing. NO browser, NO AudioContext: it takes a Float32Array
// of dB values (exactly what AnalyserNode.getFloatFrequencyData writes) plus {sampleRate, fftSize}, and returns
// a motion reading. The app owns the oscillator, the microphone and the analyser; every number the UI shows is
// computed HERE, so `deno test` verifies the sensor even though the gate has no speaker and no microphone.
//
// The physics, in one line: a tone reflected off something moving radially at u comes back shifted by
// Δf = 2·f₀·u/(c−u). Motion therefore appears as energy in SIDEBANDS beside an otherwise pure carrier.
//
// The one thing that makes this work at all — measured, not assumed (apps/sonar/RESEARCH.md §0): the carrier
// must sit on an EXACT FFT bin centre. A carrier at a round 19000 Hz lands a third of a bin off, and Blackman's
// −58 dB sidelobes then sit right where a slow hand's sideband would be (−60 dB at +4 bins). Snapped to a bin,
// the same measurement reads −187 dB — the leakage is gone, not merely small, because a whole number of cycles
// fits the analysis window. That is ~125 dB of headroom for one rounding, and it is why an AnalyserNode is
// enough here and no AudioWorklet is needed. `snapCarrier` is not a nicety; it is the design.

// ---- defaults (every one is an engineering starting point, named so a device pass can move it) ----
export const DEFAULTS = {
  carrierHz: 19000,      // audible to some young ears; 18k is safer acoustically, 20k risks Nyquist at 44.1k
  fftSize: 32768,        // the spec maximum. 1.46 Hz bins @48k, a 683 ms window — a 0.05 m/s hand is 3.8 bins
  bandHz: 250,           // sideband half-width: covers ≈2.2 m/s radial at 19 kHz
  trackHz: 150,          // how far the carrier may drift before we call it lost
  guardBins: 3,          // Blackman's main lobe is ±2 bins; 3 keeps one bin of margin
  guardHz: 4.5,          // …and a floor in Hz, so a small fftSize cannot collapse the guard
  trimFrac: 0.2,         // drop the loudest 20% of a sideband before taking its floor
  carrierSnrDb: 10,      // below this the carrier is not usable and the app must say so
  onMad: 6,              // motion ON at median + 6·MAD of a calibrated still room
  offMad: 3,             // …and OFF at 3·MAD — hysteresis, so a reading cannot chatter on the threshold
  attackMs: 100,
  releaseMs: 500,
  directionMin: 0.25,    // |D| below this is "moving", with no direction claimed — multipath lights both sides
};

// Speed of sound in dry air, NPL's approximation. Only ever used to LABEL a shift, never to claim a distance.
export const speedOfSound = (tempC = 20) => 331.3 * Math.sqrt(1 + tempC / 273.15);
// Exact two-way Doppler for a co-located emitter+receiver; u is the RADIAL component (u = v·cos θ).
export const dopplerHz = (u, carrierHz = DEFAULTS.carrierHz, c = speedOfSound()) => (2 * carrierHz * u) / (c - u);
// The inverse, for diagnostics only. It yields v·cos θ, never v — see RESEARCH.md §4 on why no m/s is shown.
export const radialFromHz = (hz, carrierHz = DEFAULTS.carrierHz, c = speedOfSound()) => (hz * c) / (2 * carrierHz + hz);

// ---- bin geometry ----
export const binWidth = (sampleRate, fftSize) => sampleRate / fftSize;
export const binOf = (hz, sampleRate, fftSize) => Math.round((hz * fftSize) / sampleRate);
export const hzOfBin = (bin, sampleRate, fftSize) => (bin * sampleRate) / fftSize;
/** THE critical call: the nearest exact bin centre to `wantHz`. Give this to the oscillator, not a round number. */
export const snapCarrier = (wantHz, sampleRate, fftSize) => hzOfBin(binOf(wantHz, sampleRate, fftSize), sampleRate, fftSize);

// ---- robust statistics (a mean would be dragged by the very reflection we are trying to see) ----
export function median(values) {
  const a = Array.prototype.slice.call(values).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** Median absolute deviation — a spread that a single outlier cannot inflate. */
export function mad(values) {
  const med = median(values);
  return median(Array.prototype.slice.call(values).filter(Number.isFinite).map((v) => Math.abs(v - med)));
}

// dB → linear power. AnalyserNode writes 20·log₁₀|X|, so 10^(D/10) is |X|² — a power, which is what sums.
const powerOf = (db) => (Number.isFinite(db) ? Math.pow(10, db / 10) : 0);

/**
 * Find the carrier as the strongest bin within ±trackHz of where we asked for it. The sidebands are always
 * measured from the FOUND peak, never the nominal one: clock drift, resampling and heat all move it, and a
 * band anchored to a stale frequency slides its guard over live signal.
 * → { bin, hz, db, snrDb, lost }
 */
export function trackCarrier(db, { sampleRate, fftSize, carrierHz = DEFAULTS.carrierHz, trackHz = DEFAULTS.trackHz, carrierSnrDb = DEFAULTS.carrierSnrDb } = {}) {
  const span = Math.max(1, Math.round((trackHz * fftSize) / sampleRate));
  const centre = binOf(carrierHz, sampleRate, fftSize);
  const lo = Math.max(0, centre - span), hi = Math.min(db.length - 1, centre + span);
  let bin = -1, best = -Infinity;
  for (let i = lo; i <= hi; i++) if (Number.isFinite(db[i]) && db[i] > best) { best = db[i]; bin = i; }
  // The floor is taken OUTSIDE the tracking window, so the carrier cannot raise the very number it is
  // measured against — the same trap `noiseFloor()` avoids in sweep.js.
  const outside = [];
  for (let i = 0; i < db.length; i++) if ((i < lo || i > hi) && Number.isFinite(db[i])) outside.push(db[i]);
  const floorDb = outside.length ? median(outside) : -Infinity;
  const snrDb = bin < 0 || !Number.isFinite(floorDb) ? 0 : best - floorDb;
  return { bin, hz: bin < 0 ? 0 : hzOfBin(bin, sampleRate, fftSize), db: bin < 0 ? -Infinity : best, floorDb, snrDb, lost: bin < 0 || snrDb < carrierSnrDb };
}

// One side of the carrier: total power in excess of that side's own floor. The floor is a TRIMMED median —
// discarding the loudest fifth first, so a strong reflection raises `excess` instead of hiding inside `floor`.
function sideband(db, from, to, trimFrac) {
  const bins = [];
  for (let i = from; i <= to; i++) if (Number.isFinite(db[i])) bins.push(powerOf(db[i]));
  if (!bins.length) return { excess: 0, floor: 0, bins: 0, peakBin: -1, peakPower: 0 };
  const sorted = bins.slice().sort((a, b) => a - b);
  const keep = Math.max(1, Math.floor(sorted.length * (1 - trimFrac)));
  const floor = median(sorted.slice(0, keep));
  let excess = 0, peakPower = 0, peakBin = -1;
  for (let i = from; i <= to; i++) {
    if (!Number.isFinite(db[i])) continue;
    const p = powerOf(db[i]);
    if (p > floor) excess += p - floor;
    if (p > peakPower) { peakPower = p; peakBin = i; }
  }
  return { excess, floor, bins: bins.length, peakBin, peakPower };
}

/**
 * Analyse one spectrum frame.
 * → { ok, carrier, lower, upper, motionDb, direction, dominantHz }
 *
 *   motionDb   sideband excess over the sidebands' own noise floor, in dB. Dimensionless and RELATIVE —
 *              it is not an energy, not a distance, and not a speed (RESEARCH.md §4).
 *   direction  (U−L)/(U+L) in −1..1; positive = approaching. Only meaningful past DEFAULTS.directionMin.
 */
export function analyzeFrame(db, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { sampleRate, fftSize } = o;
  const carrier = trackCarrier(db, o);
  if (carrier.lost) return { ok: false, carrier, lower: null, upper: null, motionDb: 0, direction: 0, dominantHz: 0 };

  const w = binWidth(sampleRate, fftSize);
  const guard = Math.max(o.guardBins, Math.ceil(o.guardHz / w));
  const span = Math.max(guard + 1, Math.round(o.bandHz / w));
  const lo0 = Math.max(0, carrier.bin - span), lo1 = carrier.bin - guard;
  const hi0 = carrier.bin + guard, hi1 = Math.min(db.length - 1, carrier.bin + span);
  const lower = sideband(db, lo0, lo1, o.trimFrac);
  const upper = sideband(db, hi0, hi1, o.trimFrac);

  const eps = 1e-30;
  const signal = lower.excess + upper.excess;
  const floor = lower.floor * lower.bins + upper.floor * upper.bins;
  const motionDb = 10 * Math.log10((signal + eps) / (floor + eps));
  const direction = signal > 0 ? (upper.excess - lower.excess) / (signal + eps) : 0;
  // The loudest sideband bin — reported as a SHIFT in Hz, which is honest, rather than converted to m/s.
  const strongest = upper.peakPower >= lower.peakPower ? upper : lower;
  const dominantHz = strongest.peakBin < 0 ? 0 : Math.abs(hzOfBin(strongest.peakBin, sampleRate, fftSize) - carrier.hz);
  return { ok: true, carrier, lower, upper, motionDb, direction, dominantHz };
}

/**
 * Calibration — learn what a STILL room scores, so the threshold is the room's own, not a number we invented.
 * Feed it motionDb while nothing moves; it yields on/off thresholds from median + k·MAD.
 */
export function Calibration({ minFrames = 30, onMad = DEFAULTS.onMad, offMad = DEFAULTS.offMad } = {}) {
  const samples = [];
  return {
    push(motionDb) { if (Number.isFinite(motionDb)) samples.push(motionDb); return samples.length; },
    get frames() { return samples.length; },
    get ready() { return samples.length >= minFrames; },
    reset() { samples.length = 0; },
    thresholds() {
      if (!samples.length) return null;
      const med = median(samples), spread = mad(samples);
      // A perfectly steady room gives MAD 0; without a floor the detector would then trip on rounding noise.
      const unit = Math.max(spread, 0.25);
      return { median: med, mad: spread, on: med + onMad * unit, off: med + offMad * unit, frames: samples.length };
    },
  };
}

/**
 * Hysteresis detector with attack/release in MILLISECONDS (not frames — the analyser's callback rate is not
 * specified and varies with rAF). `update` is fed the elapsed time so the behaviour is identical at any rate.
 */
export function Detector({ on, off, attackMs = DEFAULTS.attackMs, releaseMs = DEFAULTS.releaseMs } = {}) {
  let active = false, above = 0, below = 0;
  return {
    get active() { return active; },
    reset() { active = false; above = 0; below = 0; },
    update(motionDb, dtMs = 16) {
      if (motionDb >= on) { above += dtMs; below = 0; } else if (motionDb <= off) { below += dtMs; above = 0; } else { above = 0; below = 0; }
      if (!active && above >= attackMs) { active = true; above = 0; }
      else if (active && below >= releaseMs) { active = false; below = 0; }
      return active;
    },
  };
}

/**
 * A deterministic synthetic spectrum — the ONLY sonar signal the headless gate ever sees, and the fixture every
 * unit test is built from. Emits a carrier (snapped, as the app does) plus optional sidebands over a noise
 * floor, in dB, exactly as getFloatFrequencyData would. No Math.random: the gate must be reproducible.
 *
 *   synthSpectrum({ sampleRate, fftSize, carrierHz, carrierDb, floorDb, moves: [{hz, db}], seed })
 *   moves[].hz > 0 → approaching (upper sideband); < 0 → receding.
 */
export function synthSpectrum({ sampleRate = 48000, fftSize = DEFAULTS.fftSize, carrierHz = DEFAULTS.carrierHz, carrierDb = -12, floorDb = -110, moves = [], ripple = 3, seed = 1 } = {}) {
  const bins = fftSize >> 1;
  const db = new Float32Array(bins);
  // A gently textured floor, so a test cannot pass by assuming a flat one. Deterministic in `seed`.
  for (let i = 0; i < bins; i++) db[i] = floorDb + ripple * Math.sin((i * 0.017 + seed) * 1.7) * 0.5;
  if (carrierHz > 0) {
    const cb = binOf(snapCarrier(carrierHz, sampleRate, fftSize), sampleRate, fftSize);
    if (cb >= 0 && cb < bins) {
      db[cb] = carrierDb;
      // The measured on-bin skirt is below float32 resolution, but the main lobe is real: ±2 bins.
      if (cb - 1 >= 0) db[cb - 1] = carrierDb - 31;
      if (cb + 1 < bins) db[cb + 1] = carrierDb - 31;
      if (cb - 2 >= 0) db[cb - 2] = carrierDb - 68;
      if (cb + 2 < bins) db[cb + 2] = carrierDb - 68;
      for (const m of moves) {
        const b = binOf(hzOfBin(cb, sampleRate, fftSize) + m.hz, sampleRate, fftSize);
        // A real reflection is spread over a few bins by the target's velocity spread, never a single spike.
        for (let k = -1; k <= 1; k++) {
          const i = b + k;
          if (i >= 0 && i < bins) db[i] = Math.max(db[i], m.db - Math.abs(k) * 4);
        }
      }
    }
  }
  return db;
}
