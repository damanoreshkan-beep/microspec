
import { fft } from "./fmradio.js";

export const SWEEP_REQUEST = 26;            
export const HW_SYNC_REQUEST = 29;          
export const MODE_RX_SWEEP = 5;             
export const BYTES_PER_BLOCK = 16384;       
export const BLOCKS_PER_TRANSFER = 16;      
export const HEADER_LEN = 10;               
export const SWEEP_MAGIC = 0x7f;
export const MAX_SWEEP_RANGES = 10;         
export const SWEEP_STYLE = { LINEAR: 0, INTERLEAVED: 1 };

export const DEFAULT_SAMPLE_RATE = 20_000_000;
export const DEFAULT_BB_FILTER = 15_000_000;
export const TUNE_STEP_HZ = 20_000_000;     
export const TUNE_STEP_MHZ = TUNE_STEP_HZ / 1_000_000;
export const SWEEP_OFFSET = 7_500_000;      

export const isPow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

export function planRange(startMHz, stopMHz) {
  if (!(stopMHz > startMHz)) throw new Error("range stop must exceed start");
  const steps = 1 + Math.floor((stopMHz - startMHz - 1) / TUNE_STEP_MHZ);
  return { startMHz, stopMHz: startMHz + steps * TUNE_STEP_MHZ, steps };
}

export function bytesPerSweep(ranges, style = SWEEP_STYLE.INTERLEAVED) {
  const perHop = (style === SWEEP_STYLE.INTERLEAVED ? 2 : 1) * BYTES_PER_BLOCK;
  return ranges.reduce((sum, [a, b]) => sum + planRange(a, b).steps * perHop, 0);
}

export function initSweepTransfer({
  ranges,
  numBytes = BYTES_PER_BLOCK,
  stepWidthHz = TUNE_STEP_HZ,
  offsetHz = SWEEP_OFFSET,
  style = SWEEP_STYLE.INTERLEAVED,
} = {}) {
  if (!Array.isArray(ranges) || ranges.length < 1 || ranges.length > MAX_SWEEP_RANGES) {
    throw new Error(`ranges must be 1..${MAX_SWEEP_RANGES}`);
  }
  if (numBytes % BYTES_PER_BLOCK !== 0 || numBytes < BYTES_PER_BLOCK) {
    throw new Error("numBytes must be a positive multiple of 16384");
  }
  if (!(stepWidthHz >= 1)) throw new Error("stepWidth must be ≥ 1 Hz");
  if (style !== SWEEP_STYLE.LINEAR && style !== SWEEP_STYLE.INTERLEAVED) throw new Error("bad style");
  if (style === SWEEP_STYLE.INTERLEAVED && stepWidthHz % 4 !== 0) {
    throw new Error("interleaved stepWidth must be a multiple of 4 Hz");
  }
  const data = new DataView(new ArrayBuffer(9 + ranges.length * 4));
  data.setUint32(0, stepWidthHz >>> 0, true);
  data.setUint32(4, offsetHz >>> 0, true);
  data.setUint8(8, style);
  ranges.forEach(([startMHz, stopMHz], r) => {
    data.setUint16(9 + r * 4, startMHz & 0xffff, true);
    data.setUint16(11 + r * 4, stopMHz & 0xffff, true);
  });
  return {
    request: SWEEP_REQUEST,
    value: numBytes & 0xffff,
    index: (numBytes >>> 16) & 0xffff,
    data: data.buffer,
  };
}

export function* sweepBlocks(bytes) {
  const n = Math.floor(bytes.byteLength / BYTES_PER_BLOCK);
  for (let j = 0; j < n; j++) {
    const off = j * BYTES_PER_BLOCK;
    if (bytes[off] !== SWEEP_MAGIC || bytes[off + 1] !== SWEEP_MAGIC) continue;
    let headerHz = 0;                                       
    for (let k = 7; k >= 0; k--) headerHz = headerHz * 256 + bytes[off + 2 + k];
    yield { headerHz, iq: bytes.subarray(off + HEADER_LEN, off + BYTES_PER_BLOCK) };
  }
}

export const binFrequencyLow = (headerHz, i, sampleRate = DEFAULT_SAMPLE_RATE, fftSize) =>
  headerHz + ((i + 1) * sampleRate) / fftSize;
export const binFrequencyHigh = (headerHz, i, sampleRate = DEFAULT_SAMPLE_RATE, fftSize) =>
  headerHz + sampleRate / 2 + ((i + 1) * sampleRate) / fftSize;

export function blockSpectrum(iq, fftSize, { sampleRate = DEFAULT_SAMPLE_RATE } = {}) {
  const N = fftSize;
  if (!isPow2(N)) throw new Error("fftSize must be a power of 2");
  if (iq.length < 2 * N) throw new Error("block too short for fftSize");
  const re = new Float32Array(N), im = new Float32Array(N);
  const s = iq.length - 2 * N;                              
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    let I = iq[s + i * 2], Q = iq[s + i * 2 + 1];
    if (I > 127) I -= 256;                                  
    if (Q > 127) Q -= 256;
    re[i] = (I * w) / 128;
    im[i] = (Q * w) / 128;
  }
  fft(re, im);
  const db = (k) => {                                       
    const r = re[k] / N, m = im[k] / N;
    return 10 * Math.log10(r * r + m * m + 1e-20);          
  };
  const q = N >> 2, out = new Float32Array(N >> 1), hz = new Float64Array(N >> 1);
  for (let i = 0; i < q; i++) {                             
    out[i] = db(1 + ((N * 5) >> 3) + i);
    hz[i] = binFrequencyLow(0, i, sampleRate, N);           
  }
  for (let i = 0; i < q; i++) {                             
    out[q + i] = db(1 + (N >> 3) + i);
    hz[q + i] = binFrequencyHigh(0, i, sampleRate, N);
  }
  return { hz, db: out };
}

export function noiseFloor(db) {
  if (!db.length) return -Infinity;
  const a = Array.prototype.slice.call(db).sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function peaks(freqs, db, { marginDb = 6, floorDb = noiseFloor(db) } = {}) {
  const found = [];
  for (let i = 0; i < db.length; i++) {
    if (db[i] < floorDb + marginDb) continue;
    if (i > 0 && db[i] < db[i - 1]) continue;
    if (i < db.length - 1 && db[i] < db[i + 1]) continue;
    found.push({ hz: freqs[i], db: db[i] });
  }
  return found.sort((a, b) => b.db - a.db);
}

export function strongestBin(freqs, db, { minMarginDb = 4, floorDb = noiseFloor(db) } = {}) {
  let best = -Infinity, at = -1;
  for (let i = 0; i < db.length; i++) if (db[i] > best) { best = db[i]; at = i; }
  if (at < 0 || best < floorDb + minMarginDb) return null;
  return { hz: freqs[at], db: best };
}
