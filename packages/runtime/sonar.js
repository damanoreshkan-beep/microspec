
export const DEFAULTS = {
  carrierHz: 19000,      
  fftSize: 32768,        
  bandHz: 250,           
  trackHz: 150,          
  guardBins: 3,          
  guardHz: 4.5,          
  trimFrac: 0.2,         
  carrierSnrDb: 10,      
  onMad: 6,              
  offMad: 3,             
  attackMs: 100,
  releaseMs: 500,
  directionMin: 0.25,    
};

export const speedOfSound = (tempC = 20) => 331.3 * Math.sqrt(1 + tempC / 273.15);
export const dopplerHz = (u, carrierHz = DEFAULTS.carrierHz, c = speedOfSound()) => (2 * carrierHz * u) / (c - u);
export const radialFromHz = (hz, carrierHz = DEFAULTS.carrierHz, c = speedOfSound()) => (hz * c) / (2 * carrierHz + hz);

export const binWidth = (sampleRate, fftSize) => sampleRate / fftSize;
export const binOf = (hz, sampleRate, fftSize) => Math.round((hz * fftSize) / sampleRate);
export const hzOfBin = (bin, sampleRate, fftSize) => (bin * sampleRate) / fftSize;
/** THE critical call: the nearest exact bin centre to `wantHz`. Give this to the oscillator, not a round number. */
export const snapCarrier = (wantHz, sampleRate, fftSize) => hzOfBin(binOf(wantHz, sampleRate, fftSize), sampleRate, fftSize);

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
  const outside = [];
  for (let i = 0; i < db.length; i++) if ((i < lo || i > hi) && Number.isFinite(db[i])) outside.push(db[i]);
  const floorDb = outside.length ? median(outside) : -Infinity;
  const snrDb = bin < 0 || !Number.isFinite(floorDb) ? 0 : best - floorDb;
  return { bin, hz: bin < 0 ? 0 : hzOfBin(bin, sampleRate, fftSize), db: bin < 0 ? -Infinity : best, floorDb, snrDb, lost: bin < 0 || snrDb < carrierSnrDb };
}

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
  for (let i = 0; i < bins; i++) db[i] = floorDb + ripple * Math.sin((i * 0.017 + seed) * 1.7) * 0.5;
  if (carrierHz > 0) {
    const cb = binOf(snapCarrier(carrierHz, sampleRate, fftSize), sampleRate, fftSize);
    if (cb >= 0 && cb < bins) {
      db[cb] = carrierDb;
      if (cb - 1 >= 0) db[cb - 1] = carrierDb - 31;
      if (cb + 1 < bins) db[cb + 1] = carrierDb - 31;
      if (cb - 2 >= 0) db[cb - 2] = carrierDb - 68;
      if (cb + 2 < bins) db[cb + 2] = carrierDb - 68;
      for (const m of moves) {
        const b = binOf(hzOfBin(cb, sampleRate, fftSize) + m.hz, sampleRate, fftSize);
        const spread = Math.max(1, m.spread || 4);
        for (let k = -spread; k <= spread; k++) {
          const i = b + k;
          if (i >= 0 && i < bins) db[i] = Math.max(db[i], m.db - (Math.abs(k) / spread) ** 2 * 26);
        }
      }
    }
  }
  return db;
}
