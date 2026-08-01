// microspec runtime — HackRF wideband SWEEP: the PURE half (payload builder, range planner, block parser,
// bin→frequency mapping, dB spectrum, peak/floor helpers). Verbatim from greatscottgadgets/hackrf `hackrf_sweep`
// (host + firmware); see apps/ether/RESEARCH.md for every cited line. WebUSB I/O stays in the app worker.
//
// Why these live here and not in the app: the byte layout is the contract the device enforces, and the
// bin→frequency maths is exactly what a headless unit test can pin without hardware. `num_fft_bins` is a
// HOST choice (the device always streams 16384-byte blocks), so we pick a power of 2 — the farm's radix-2
// `fft` (fmradio.js) needs it, and N/8 · 5N/8 land on integer bin boundaries for the two kept slices.

import { fft } from "./fmradio.js";

// ---- protocol constants (hackrf.c) ----
export const SWEEP_REQUEST = 26;            // HACKRF_VENDOR_REQUEST_INIT_SWEEP     (hackrf.c:88)
export const HW_SYNC_REQUEST = 29;          // HACKRF_VENDOR_REQUEST_SET_HW_SYNC_MODE (hackrf.c:91)
export const MODE_RX_SWEEP = 5;             // TRANSCEIVER_MODE_RX_SWEEP            (hackrf.c:137)
export const BYTES_PER_BLOCK = 16384;       // hackrf.h:517
export const BLOCKS_PER_TRANSFER = 16;      // hackrf_sweep.c:98 (262144 / 16384)
export const HEADER_LEN = 10;               // 0x7f 0x7f + u64 LE sweep_freq
export const SWEEP_MAGIC = 0x7f;
export const MAX_SWEEP_RANGES = 10;         // hackrf.h:523
export const SWEEP_STYLE = { LINEAR: 0, INTERLEAVED: 1 };

// ---- CLI defaults (hackrf_sweep.c:92-98) ----
export const DEFAULT_SAMPLE_RATE = 20_000_000;
export const DEFAULT_BB_FILTER = 15_000_000;
export const TUNE_STEP_HZ = 20_000_000;     // step_width — one 20 MHz hop per interleave pair
export const TUNE_STEP_MHZ = TUNE_STEP_HZ / 1_000_000;
export const SWEEP_OFFSET = 7_500_000;      // OFFSET — RF centre sits this far above the header frequency

export const isPow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

// Round a [startMHz, stopMHz] range up to a whole number of TUNE_STEP hops, minimum one (hackrf_sweep.c:801-806).
// Returns the aligned pair the firmware will actually sweep, plus the hop count.
export function planRange(startMHz, stopMHz) {
  if (!(stopMHz > startMHz)) throw new Error("range stop must exceed start");
  const steps = 1 + Math.floor((stopMHz - startMHz - 1) / TUNE_STEP_MHZ);
  return { startMHz, stopMHz: startMHz + steps * TUNE_STEP_MHZ, steps };
}

// Bytes the host must consume for one full pass over the given aligned ranges, INTERLEAVED
// (two 16384-byte blocks per hop). Drives the throughput budget in RESEARCH.md §4.
export function bytesPerSweep(ranges, style = SWEEP_STYLE.INTERLEAVED) {
  const perHop = (style === SWEEP_STYLE.INTERLEAVED ? 2 : 1) * BYTES_PER_BLOCK;
  return ranges.reduce((sum, [a, b]) => sum + planRange(a, b).steps * perHop, 0);
}

// Build the INIT_SWEEP control transfer. `ranges` is [[startMHz, stopMHz], …] (1..10). Mirrors the host-side
// validation (hackrf.c:2714-2732) rather than trusting the firmware to STALL, and additionally requires an
// interleave-clean step (step % 4 == 0), which upstream omits and which otherwise drifts the grid by 1 Hz
// per sub-step pair (RESEARCH.md §1, usb_api_sweep.c:242-249).
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

// Walk the complete 16384-byte blocks in a transfer. Skips any block whose 0x7f 0x7f magic is missing
// (hackrf_sweep.c:240-253) and ignores a trailing partial block — a short WebUSB transfer must not fabricate
// a block (RESEARCH.md §2). Yields { headerHz, iq } where iq is the post-header int8 IQ region.
export function* sweepBlocks(bytes) {
  const n = Math.floor(bytes.byteLength / BYTES_PER_BLOCK);
  for (let j = 0; j < n; j++) {
    const off = j * BYTES_PER_BLOCK;
    if (bytes[off] !== SWEEP_MAGIC || bytes[off + 1] !== SWEEP_MAGIC) continue;
    let headerHz = 0;                                       // u64 LE, byte off+2 = LSB; real freq < 2^33, exact
    for (let k = 7; k >= 0; k--) headerHz = headerHz * 256 + bytes[off + 2 + k];
    yield { headerHz, iq: bytes.subarray(off + HEADER_LEN, off + BYTES_PER_BLOCK) };
  }
}

// Absolute frequency of kept-slice bin i (i = 0 .. N/4-1). The grid starts one Δf above the header, not at it
// (RESEARCH.md §3). Low slice sits just above the header; high slice half a sample-rate above.
export const binFrequencyLow = (headerHz, i, sampleRate = DEFAULT_SAMPLE_RATE, fftSize) =>
  headerHz + ((i + 1) * sampleRate) / fftSize;
export const binFrequencyHigh = (headerHz, i, sampleRate = DEFAULT_SAMPLE_RATE, fftSize) =>
  headerHz + sampleRate / 2 + ((i + 1) * sampleRate) / fftSize;

// One block → the two N/4-bin slices hackrf_sweep keeps, as absolute {hz, db}. Reproduces the CLI maths
// literally (hackrf_sweep.c:298-330, logPower :203-209, Hann :698-700): windowed int8/128, forward FFT,
// dB = 10·log10(|X/N|²). `fftSize` must be a power of 2 (farm fft is radix-2). Returns Float64 freqs +
// Float32 dB, length N/2, low slice then high slice — contiguous frequency order.
export function blockSpectrum(iq, fftSize, { sampleRate = DEFAULT_SAMPLE_RATE } = {}) {
  const N = fftSize;
  if (!isPow2(N)) throw new Error("fftSize must be a power of 2");
  if (iq.length < 2 * N) throw new Error("block too short for fftSize");
  const re = new Float32Array(N), im = new Float32Array(N);
  const s = iq.length - 2 * N;                              // the LAST 2N bytes of the block (hackrf_sweep.c:298)
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    let I = iq[s + i * 2], Q = iq[s + i * 2 + 1];
    if (I > 127) I -= 256;                                  // int8 (works for Uint8Array subarray or Int8Array)
    if (Q > 127) Q -= 256;
    re[i] = (I * w) / 128;
    im[i] = (Q * w) / 128;
  }
  fft(re, im);
  const db = (k) => {                                       // logPower with scale 1/N
    const r = re[k] / N, m = im[k] / N;
    return 10 * Math.log10(r * r + m * m + 1e-20);          // +ε: upstream lets zero power be -Inf; we clamp
  };
  const q = N >> 2, out = new Float32Array(N >> 1), hz = new Float64Array(N >> 1);
  for (let i = 0; i < q; i++) {                             // low slice: bins 1 + 5N/8 + i
    out[i] = db(1 + ((N * 5) >> 3) + i);
    hz[i] = binFrequencyLow(0, i, sampleRate, N);           // header added by caller
  }
  for (let i = 0; i < q; i++) {                             // high slice: bins 1 + N/8 + i
    out[q + i] = db(1 + (N >> 3) + i);
    hz[q + i] = binFrequencyHigh(0, i, sampleRate, N);
  }
  return { hz, db: out };
}

// Median dB — a robust noise floor for peak detection (a few strong carriers don't drag it like a mean would).
export function noiseFloor(db) {
  if (!db.length) return -Infinity;
  const a = Array.prototype.slice.call(db).sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Peaks that stand `marginDb` above the floor, as {hz, db} sorted strongest first. `freqs`/`db` are parallel
// (absolute Hz). Local-maximum + margin so a single carrier isn't reported as a cluster of adjacent bins.
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

// The single strongest bin above the floor — the LISTEN channel finder's tune target, or null if the band is
// quiet. `minMarginDb` guards against locking onto noise when nothing is transmitting.
export function strongestBin(freqs, db, { minMarginDb = 4, floorDb = noiseFloor(db) } = {}) {
  let best = -Infinity, at = -1;
  for (let i = 0; i < db.length; i++) if (db[i] > best) { best = db[i]; at = i; }
  if (at < 0 || best < floorDb + minMarginDb) return null;
  return { hz: freqs[at], db: best };
}
