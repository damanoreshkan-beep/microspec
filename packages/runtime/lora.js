// microspec runtime — LoRa (CSS) dechirp + preamble detection for the HackRF watcher (app lorawatch). PURE
// (no DOM/USB), unit-tested by a synthetic round-trip. It DETECTS LoRa activity (the 8-up-chirp preamble) and
// estimates the symbol, and reuses fmradio's FFT — it does NOT decode the payload (Gray/deinterleave/dewhiten/
// Hamming/CRC = gr-lora scale, no JS decoder exists, deferred). Verified vs gr-lora_sdr / jkadbear/LoRaPHY.
// See docs/research/lora-detect.md.
import { fft } from "./fmradio.js";

// Meshtastic EU_868 presets (all BW 250 kHz @ 869.525 MHz) + a couple LoRaWAN 125 kHz channels.
export const LORA_PRESETS = [
  { key: "longfast", label: "LongFast", sf: 11, bw: 250_000, freq: 869_525_000 },
  { key: "mediumfast", label: "MediumFast", sf: 9, bw: 250_000, freq: 869_525_000 },
  { key: "shortfast", label: "ShortFast", sf: 7, bw: 250_000, freq: 869_525_000 },
  { key: "lorawan1", label: "LoRaWAN 868.1", sf: 7, bw: 125_000, freq: 868_100_000 },
];

// reference down-chirp d[n] = exp(-jπn²/N), N = 2^SF (power of two → exactly N-periodic)
export function refDownchirp(N) {
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 0; n < N; n++) { const ph = -Math.PI * n * n / N; re[n] = Math.cos(ph); im[n] = Math.sin(ph); }
  return { re, im };
}
// a base up-chirp cyclically shifted by symbol value s (for tests / demo): exp(+jπ((n+s)%N)²/N)
export function makeUpSymbol(N, s) {
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 0; n < N; n++) { const m = (n + s) % N, ph = Math.PI * m * m / N; re[n] = Math.cos(ph); im[n] = Math.sin(ph); }
  return { re, im };
}

// dechirp one N-sample window (multiply by conj-downchirp) → FFT → { bin: argmax, pr: peakAmp/rmsFloor }.
// pr ≈ √N for a clean tone, ~few for noise. re/im may be views (subarray) of length ≥ N.
export function dechirpArgmax(re, im, d, N) {
  const pr = new Float32Array(N), pi = new Float32Array(N);
  for (let n = 0; n < N; n++) { pr[n] = re[n] * d.re[n] - im[n] * d.im[n]; pi[n] = re[n] * d.im[n] + im[n] * d.re[n]; }
  fft(pr, pi);
  let best = 0, peak = -1, sum = 0;
  for (let k = 0; k < N; k++) { const p = pr[k] * pr[k] + pi[k] * pi[k]; sum += p; if (p > peak) { peak = p; best = k; } }
  return { bin: best, pr: Math.sqrt(peak / (sum / N + 1e-12)) };
}

// Detect the LoRa preamble in a complex stream at a given SF: the 8 identical up-chirps make the dechirp argmax
// land on the SAME bin for many consecutive windows. Returns the longest such run.
export function detectPreamble(re, im, sf, { prThresh = 4, runMin = 6, hop } = {}) {
  const N = 1 << sf, d = refDownchirp(N); hop = hop || N;
  let run = 0, best = 0, prevBin = -99, bestBin = 0, bestPr = 0;
  for (let off = 0; off + N <= re.length; off += hop) {
    const { bin, pr } = dechirpArgmax(re.subarray(off, off + N), im.subarray(off, off + N), d, N);
    if (pr >= prThresh && Math.abs(bin - prevBin) <= 1) run++; else run = 1;
    prevBin = bin;
    if (run > best) { best = run; bestBin = bin; bestPr = pr; }
  }
  return { found: best >= runMin, sf, run: best, bin: bestBin, pr: bestPr };
}

// ============================================================================
// LoRa FRAME SYNC + CFO/STO front-end (pure JS). Ports the up/down argmax alignment
// trick from FutureSDR frame_sync.rs / gr-lora_sdr frame_sync_impl.cc, then feeds the
// aligned+CFO-corrected symbols to loraDecode below. Batch (whole-buffer) decoder at
// Fs = BW (os_factor 1, N = 2^SF samples/symbol). Frame layout it expects:
//   8 up-chirp preamble | 2 sync-word up-chirps | 2.25 down-chirp SFD | payload up-chirps
// so the payload (data) starts 8+2+2.25 = 12.25 symbols after the preamble start.
// Validated by a synthetic CFO/STO round-trip in runtime_test.js.

const FRAME_PRE = 8;        // preamble up-chirps
const FRAME_SYNC = 2;       // sync-word (net-id) up-chirps
const FRAME_DATA_OFF = 12.25; // symbols from preamble start to first payload symbol (8 + 2 + 2.25)

// integer mode (majority value) of a small int array — robust k_hat over the preamble.
function modeInt(arr) {
  const m = new Map(); let best = arr[0], bestC = 0;
  for (const v of arr) { const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bestC) { bestC = c; best = v; } }
  return best;
}

/**
 * Full LoRa receiver front-end: locate the preamble, estimate integer CFO/STO via the
 * up-chirp/down-chirp argmax trick, align the symbol grid, undo the CFO/STO bin offset on
 * every payload symbol, and hand the symbols to loraDecode. Pure — no DOM/USB.
 *
 * At Fs = BW the payload up-chirps and the preamble up-chirps share the SAME integer bin
 * offset k_up (= CFO once the grid is time-aligned to the symbol boundary), so recovering a
 * payload symbol is simply argmax(dechirp) - k_up (mod 2^SF). The 2.25-down-chirp SFD gives
 * the second measurement k_down (dechirp with the UP reference); with a time-aligned grid
 * k_up == k_down == integer CFO, and the time alignment itself is the integer STO. Fractional
 * CFO/STO are DEFERRED (integer-only) — the synth round-trip exercises integer offsets.
 *
 * @param {Float32Array|number[]} re I (real) samples
 * @param {Float32Array|number[]} im Q (imag) samples
 * @param {{sf:number, cr?:number, crc?:boolean, hasHeader?:boolean, len?:number}} opts
 * @returns {{found:boolean, sf:number, cfo:number, sto:number, symbols:number[], bytes:number[], crcOk:?boolean, header?:object}}
 */
export function decodeLoraSignal(re, im, { sf, cr = 1, crc = false, hasHeader = true, len } = {}) {
  const N = 1 << sf, d = refDownchirp(N), up = makeUpSymbol(N, 0);
  const R = ArrayBuffer.isView(re) ? re : Float32Array.from(re);
  const I = ArrayBuffer.isView(im) ? im : Float32Array.from(im);
  const win = (o) => dechirpArgmax(R.subarray(o, o + N), I.subarray(o, o + N), d, N);
  const winUp = (o) => dechirpArgmax(R.subarray(o, o + N), I.subarray(o, o + N), up, N);

  // --- 1. Coarse preamble detection: slide by N, find the longest constant-bin run. ---
  let runStart = -1, run = 0, bestRun = 0, bestStart = -1, prevBin = -99;
  for (let o = 0; o + N <= R.length; o += N) {
    const { bin, pr } = win(o);
    if (pr >= 4 && Math.abs(((bin - prevBin + N + N / 2) % N) - N / 2) <= 1) { if (run === 0) runStart = o - N; run++; }
    else { run = 1; runStart = o; }
    prevBin = bin;
    if (run > bestRun) { bestRun = run; bestStart = runStart; }
  }
  if (bestRun < 6 || bestStart < 0) return { found: false, sf, cfo: 0, sto: 0, symbols: [], bytes: [], crcOk: null };

  // --- 2. Fine time-align to the up-chirp symbol boundary (integer STO). ---
  // The preamble up-chirps are identical, so their dechirp is phase-flat; instead maximise the
  // energy concentration of the DISTINCT symbols — the 2 sync words and the first payload
  // up-chirps — which is sharply peaked only when the window grid sits on true boundaries.
  const dataOff = Math.round(FRAME_DATA_OFF * N); // 12.25*N — always integer (N/4 exact for SF>=2)
  const nProbe = 3;
  let bestP = bestStart, bestScore = -Infinity;
  const lo = Math.max(0, bestStart - N), hi = bestStart + N;
  for (let p = lo; p <= hi; p++) {
    if (p + dataOff + nProbe * N > R.length) break;
    let score = 0;
    for (let s = 0; s < FRAME_SYNC; s++) score += win(p + (FRAME_PRE + s) * N).pr;
    for (let i = 0; i < nProbe; i++) score += win(p + dataOff + i * N).pr;
    if (score > bestScore) { bestScore = score; bestP = p; }
  }
  const p = bestP;

  // --- 3. Integer CFO/STO estimate. k_up = mode of the aligned preamble bins; k_down from the
  // SFD down-chirps dechirped with the UP reference. With the grid aligned, k_up == integer CFO. ---
  const preBins = [];
  for (let k = 0; k < FRAME_PRE; k++) preBins.push(win(p + k * N).bin);
  const kUp = modeInt(preBins);
  // two full SFD down-chirps sit at symbols 10 and 11 (after 8 preamble + 2 sync).
  const dnA = winUp(p + 10 * N).bin, dnB = winUp(p + 11 * N).bin;
  const kDown = modeInt([dnA, dnB]);
  // integer CFO/STO via the up/down split (kept for reporting; on an aligned grid kUp==kDown).
  const wrap = (x) => { x %= N; if (x > N / 2) x -= N; if (x <= -N / 2) x += N; return x; };
  const cfo = wrap(kUp);
  const sto = p; // packet start in samples = the recovered integer sample-timing offset.

  // --- 4. Payload extraction: dechirp each window, subtract k_up (mod N) to undo CFO/STO. ---
  const symbols = [];
  for (let o = p + dataOff; o + N <= R.length; o += N) {
    const raw = win(o).bin;
    symbols.push(((raw - kUp) % N + N) % N);
  }

  // --- 5. Codec: symbols -> bytes (+ header parse + CRC). ---
  const dec = loraDecode(symbols, { sf, cr, crc, hasHeader, len });
  return { found: true, sf, cfo, sto, kUp, kDown, symbols, bytes: dec.bytes, crcOk: dec.crcOk, header: dec.header };
}

// ============================================================================
// LoRa PHY CODEC — pure-JS port of jkadbear/LoRaPHY (MIT), the coding chain that
// sits AFTER dechirp→argmax. Encode: whiten → hamming_encode → diag_interleave →
// gray_decoding (+header, +CRC). Decode reverses it. All integer/typed-array math,
// no DOM/USB — imported by the worker and by runtime_test.js. Bit orderings mirror
// the MATLAB exactly (de2bi left-msb = MSB-first, right-msb = LSB-first). Validated
// by a self-consistent round-trip unit test. See docs/research/lora-detect.md.

// 255-byte LoRa whitening sequence, copied VERBATIM from LoRaPHY.m (line ~93). It is
// the LFSR (x^8+x^6+x^5+x^4+1, seed 0xFF) output; XORed byte-wise into the payload.
export const WHITENING = new Uint8Array([
  0xff, 0xfe, 0xfc, 0xf8, 0xf0, 0xe1, 0xc2, 0x85, 0x0b, 0x17, 0x2f, 0x5e, 0xbc, 0x78, 0xf1, 0xe3,
  0xc6, 0x8d, 0x1a, 0x34, 0x68, 0xd0, 0xa0, 0x40, 0x80, 0x01, 0x02, 0x04, 0x08, 0x11, 0x23, 0x47,
  0x8e, 0x1c, 0x38, 0x71, 0xe2, 0xc4, 0x89, 0x12, 0x25, 0x4b, 0x97, 0x2e, 0x5c, 0xb8, 0x70, 0xe0,
  0xc0, 0x81, 0x03, 0x06, 0x0c, 0x19, 0x32, 0x64, 0xc9, 0x92, 0x24, 0x49, 0x93, 0x26, 0x4d, 0x9b,
  0x37, 0x6e, 0xdc, 0xb9, 0x72, 0xe4, 0xc8, 0x90, 0x20, 0x41, 0x82, 0x05, 0x0a, 0x15, 0x2b, 0x56,
  0xad, 0x5b, 0xb6, 0x6d, 0xda, 0xb5, 0x6b, 0xd6, 0xac, 0x59, 0xb2, 0x65, 0xcb, 0x96, 0x2c, 0x58,
  0xb0, 0x61, 0xc3, 0x87, 0x0f, 0x1f, 0x3e, 0x7d, 0xfb, 0xf6, 0xed, 0xdb, 0xb7, 0x6f, 0xde, 0xbd,
  0x7a, 0xf5, 0xeb, 0xd7, 0xae, 0x5d, 0xba, 0x74, 0xe8, 0xd1, 0xa2, 0x44, 0x88, 0x10, 0x21, 0x43,
  0x86, 0x0d, 0x1b, 0x36, 0x6c, 0xd8, 0xb1, 0x63, 0xc7, 0x8f, 0x1e, 0x3c, 0x79, 0xf3, 0xe7, 0xce,
  0x9c, 0x39, 0x73, 0xe6, 0xcc, 0x98, 0x31, 0x62, 0xc5, 0x8b, 0x16, 0x2d, 0x5a, 0xb4, 0x69, 0xd2,
  0xa4, 0x48, 0x91, 0x22, 0x45, 0x8a, 0x14, 0x29, 0x52, 0xa5, 0x4a, 0x95, 0x2a, 0x54, 0xa9, 0x53,
  0xa7, 0x4e, 0x9d, 0x3b, 0x77, 0xee, 0xdd, 0xbb, 0x76, 0xec, 0xd9, 0xb3, 0x67, 0xcf, 0x9e, 0x3d,
  0x7b, 0xf7, 0xef, 0xdf, 0xbf, 0x7e, 0xfd, 0xfa, 0xf4, 0xe9, 0xd3, 0xa6, 0x4c, 0x99, 0x33, 0x66,
  0xcd, 0x9a, 0x35, 0x6a, 0xd4, 0xa8, 0x51, 0xa3, 0x46, 0x8c, 0x18, 0x30, 0x60, 0xc1, 0x83, 0x07,
  0x0e, 0x1d, 0x3a, 0x75, 0xea, 0xd5, 0xaa, 0x55, 0xab, 0x57, 0xaf, 0x5f, 0xbe, 0x7c, 0xf9, 0xf2,
  0xe5, 0xca, 0x94, 0x28, 0x50, 0xa1, 0x42, 0x84, 0x09, 0x13, 0x27, 0x4f, 0x9f, 0x3f, 0x7f,
]);

// 5×12 GF(2) header checksum matrix (LoRaPHY.m ~line 95). Maps the 12 bits of the
// first three header nibbles (payload-len hi/lo, cr/crc) to a 5-bit checksum.
const HEADER_CHECKSUM_MATRIX = [
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1],
  [0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0],
  [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1],
  [0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1],
];

// --- bit helpers (mirror MATLAB de2bi / bi2de / bitget) --------------------
// bitget(w, p): 1-indexed bit, p=1 is the LSB.
const bitget = (w, p) => (w >>> (p - 1)) & 1;
// XOR-fold the bits of w at 1-indexed positions `pos` (LoRaPHY bit_reduce(@bitxor,…)).
const bitReduceXor = (w, pos) => { let b = bitget(w, pos[0]); for (let i = 1; i < pos.length; i++) b ^= bitget(w, pos[i]); return b; };
// de2bi(x, n, 'left-msb') → n bits, index 0 = MSB (bit n-1).
const de2biLeft = (x, n) => { const a = new Array(n); for (let j = 0; j < n; j++) a[j] = (x >>> (n - 1 - j)) & 1; return a; };
// bi2de(bits, 'left-msb') → index 0 = MSB.
const bi2deLeft = (bits) => { let v = 0; const n = bits.length; for (let j = 0; j < n; j++) v |= bits[j] << (n - 1 - j); return v; };

// --- whitening -------------------------------------------------------------
// XOR the first `len` bytes with the whitening sequence. In-place on `out`.
function whitenInto(out, len) { for (let i = 0; i < len; i++) out[i] ^= WHITENING[i]; return out; }

// --- CRC16 (LoRaPHY calc_crc) ----------------------------------------------
// CRC-16/CCITT-FALSE mechanics but init 0 (comm.CRCGenerator 'X^16+X^12+X^5+1',
// non-reflected, MSB-first) = CRC-16/XMODEM. Then the checksum bytes are XOR-masked
// with the LAST TWO data bytes (calc_crc quirk): b1 = crcLo ^ data[n-1], b2 = crcHi ^
// data[n-2]; CRC is computed over data[0..n-3] only. Returns [b1, b2].
function calcCrc(data) {
  const n = data.length;
  if (n === 0) return [0, 0];
  if (n === 1) return [data[0], 0];
  if (n === 2) return [data[1], data[0]];
  let crc = 0;
  for (let i = 0; i < n - 2; i++) {
    crc ^= data[i] << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return [(crc & 0xff) ^ data[n - 1], ((crc >>> 8) & 0xff) ^ data[n - 2]];
}

// --- Hamming (LoRaPHY hamming_encode / hamming_decode) ---------------------
// Encode one 4-bit nibble to an rdd-bit (rdd = cr+4, 5..8) codeword. Parity bits per
// LoRaPHY: p1=b1^b3^b4, p2=b1^b2^b4, p3=b1^b2^b3, p4=b1^b2^b3^b4, p5=b2^b3^b4 (1-indexed).
function hammingEncodeNibble(nibble, cr) {
  const p1 = bitReduceXor(nibble, [1, 3, 4]);
  const p2 = bitReduceXor(nibble, [1, 2, 4]);
  const p3 = bitReduceXor(nibble, [1, 2, 3]);
  const p4 = bitReduceXor(nibble, [1, 2, 3, 4]);
  const p5 = bitReduceXor(nibble, [2, 3, 4]);
  switch (cr) {
    case 1: return (p4 << 4) | nibble;
    case 2: return (p5 << 5) | (p3 << 4) | nibble;
    case 3: return (p2 << 6) | (p5 << 5) | (p3 << 4) | nibble;
    case 4: return (p1 << 7) | (p2 << 6) | (p5 << 5) | (p3 << 4) | nibble;
    default: throw new Error("Invalid Code Rate");
  }
}
// Decode one codeword back to a nibble. For rdd 7/8 apply single-bit correction via
// the parity syndrome (parity_fix table); rdd 5/6 have no correction (just mask low 4).
function hammingDecodeCodeword(cw, rdd) {
  if (rdd >= 7) {
    const p2 = bitReduceXor(cw, [7, 4, 2, 1]);
    const p3 = bitReduceXor(cw, [5, 3, 2, 1]);
    const p5 = bitReduceXor(cw, [6, 4, 3, 2]);
    const parity = (p2 << 2) | (p3 << 1) | p5;
    let pf = 0;
    if (parity === 3) pf = 4; else if (parity === 5) pf = 8; else if (parity === 6) pf = 1; else if (parity === 7) pf = 2;
    cw ^= pf;
  }
  return cw & 0xf;
}

// --- Diagonal interleave / deinterleave (LoRaPHY diag_interleave / diag_deinterleave)
// Encode: `ncw` codewords (rdd bits each, right-msb) → `rdd` symbols. Column x of the
// bit matrix is circularly shifted by (1-x); mirrors circshift + bi2de(right-msb).
function diagInterleave(codewords, rdd) {
  const ncw = codewords.length, out = new Array(rdd);
  for (let k = 0; k < rdd; k++) {
    let v = 0;
    for (let i = 0; i < ncw; i++) v |= ((codewords[(i + k) % ncw] >>> k) & 1) << i;
    out[k] = v;
  }
  return out;
}
// Decode: `nsym` symbols (ppm bits each, left-msb) → `ppm` codewords. Inverse of the
// above (circshift b(x,:) by [1 1-x], bi2de right-msb, then flipud).
function diagDeinterleave(symbols, ppm) {
  const nsym = symbols.length, raw = new Array(ppm);
  for (let k = 0; k < ppm; k++) {
    let v = 0;
    for (let i = 0; i < nsym; i++) v |= ((symbols[i] >>> (ppm - 1 - ((k + i) % ppm))) & 1) << i;
    raw[k] = v;
  }
  return raw.reverse(); // flipud
}

// --- Gray coding (names per LoRaPHY: gray_decoding = encode-side, gray_coding = decode)
// Encode-side: interleaved symbol → transmitted symbol. Undo Gray (num = gray→binary),
// then apply the offset: first 8 symbols (header) and every symbol under LDRO use
// (num*4+1) mod 2^sf; other data symbols use (num+1) mod 2^sf.
function grayDecoding(symbolsI, sf, ldr) {
  const N = 1 << sf, out = new Array(symbolsI.length);
  for (let i = 0; i < symbolsI.length; i++) {
    let num = symbolsI[i] & 0xffff, mask = num >>> 1;
    while (mask !== 0) { num ^= mask; mask >>>= 1; }
    out[i] = (i < 8 || ldr) ? (num * 4 + 1) % N : (num + 1) % N;
  }
  return out;
}
// Decode-side: transmitted symbol → interleaved symbol. Reverse the offset (floor/÷4
// for header+LDRO, (x-1) mod 2^sf otherwise), then binary→Gray (x ^ x>>1).
function grayCoding(din, sf, ldr) {
  const N = 1 << sf, out = new Array(din.length);
  for (let i = 0; i < din.length; i++) {
    let v = (i < 8 || ldr) ? Math.floor(din[i] / 4) : ((din[i] - 1 + N) % N);
    out[i] = (v ^ (v >>> 1)) & 0xffff;
  }
  return out;
}

// --- header (LoRaPHY gen_header / parse_header) ----------------------------
// 5-bit GF(2) checksum of the first three header nibbles' 12 bits (each nibble MSB-first).
function headerChecksum(nib0, nib1, nib2) {
  const vec = [...de2biLeft(nib0, 4), ...de2biLeft(nib1, 4), ...de2biLeft(nib2, 4)];
  const c = new Array(5);
  for (let r = 0; r < 5; r++) { let s = 0; for (let j = 0; j < 12; j++) s ^= HEADER_CHECKSUM_MATRIX[r][j] & vec[j]; c[r] = s; }
  return c;
}
// Build the 5 header nibbles for a payload of length `plen` with the given cr/crc.
function genHeader(plen, cr, crc) {
  const n0 = plen >>> 4, n1 = plen & 0xf, n2 = ((cr << 1) | crc) & 0xf;
  const c = headerChecksum(n0, n1, n2);
  const n3 = c[0];
  const n4 = (c[1] << 3) | (c[2] << 2) | (c[3] << 1) | c[4];
  return [n0, n1, n2, n3, n4];
}

// --- symbol/length arithmetic (LoRaPHY calc_sym_num / calc_payload_len) ----
function calcSymNum(plen, sf, cr, crc, hasHeader, ldr) {
  const ppm = sf - 2 * (ldr ? 1 : 0);
  const num = 2 * plen - sf + 7 + 4 * (crc ? 1 : 0) - 5 * (hasHeader ? 0 : 1);
  return 8 + Math.max((4 + cr) * Math.ceil(num / ppm), 0);
}
function calcPayloadLen(slen, sf, cr, hasHeader, ldr) {
  const f = (sf - 2) / 2 - 2.5 * (hasHeader ? 1 : 0) + (sf - (ldr ? 1 : 0) * 2) / 2 * Math.ceil((slen - 8) / (cr + 4));
  return Math.floor(f);
}

/**
 * Encode a LoRa PHY payload to a symbol vector (the full TX coding chain, post-modulation
 * being makeUpSymbol on each). Pure — mirrors LoRaPHY.encode.
 * @param {Uint8Array|number[]} payloadBytes payload (0..255 per byte)
 * @param {{sf:number, cr:number, crc?:boolean, hasHeader?:boolean, ldr?:boolean}} opts
 *   sf ∈ 7..12, cr ∈ 1..4 (4/5..4/8), crc = append CRC16, hasHeader = explicit header,
 *   ldr = low-data-rate optimize ((2^sf/bw) > 16ms — caller supplies the flag).
 * @returns {number[]} symbol values, each 0..2^sf-1
 */
export function loraEncode(payloadBytes, { sf, cr, crc = false, hasHeader = true, ldr = false } = {}) {
  const payload = Array.from(payloadBytes);
  const plen = payload.length;
  const ldrN = ldr ? 1 : 0;
  // data = payload (+ 2 CRC bytes). The CRC covers payload[0..plen-3], masked by the last 2 bytes.
  const data = crc ? [...payload, ...calcCrc(payload)] : payload.slice();

  const symNum = calcSymNum(plen, sf, cr, crc, hasHeader, ldr);
  const nibbleNum = (sf - 2) + (symNum - 8) / (cr + 4) * (sf - 2 * ldrN);
  // pad with 0xFF up to nibbleNum nibbles; whiten ONLY the first plen (payload) bytes.
  const dataW = data.slice();
  const padBytes = Math.ceil((nibbleNum - 2 * data.length) / 2);
  for (let i = 0; i < padBytes; i++) dataW.push(0xff);
  whitenInto(dataW, plen);

  // bytes → nibbles, low nibble first (MATLAB: odd i = low, even i = high).
  const dataNibbles = new Array(nibbleNum);
  for (let i = 1; i <= nibbleNum; i++) {
    const idx = Math.ceil(i / 2) - 1;
    dataNibbles[i - 1] = (i % 2 === 1) ? (dataW[idx] & 0xf) : (dataW[idx] >>> 4);
  }
  const headerNibbles = hasHeader ? genHeader(plen, cr, crc) : [];
  const nibbles = [...headerNibbles, ...dataNibbles];

  // Hamming: the first sf-2 nibbles (the header block) always use CR=4/8; the rest use cr.
  const codewords = nibbles.map((nb, i) => hammingEncodeNibble(nb, i < sf - 2 ? 4 : cr));

  // Interleave: first block = sf-2 codewords @ rdd 8; then ppm codewords per block @ rdd cr+4.
  const ppm = sf - 2 * ldrN, rdd = cr + 4;
  let symbolsI = diagInterleave(codewords.slice(0, sf - 2), 8);
  for (let i = sf - 1; i <= codewords.length - ppm + 1; i += ppm) {
    symbolsI = symbolsI.concat(diagInterleave(codewords.slice(i - 1, i - 1 + ppm), rdd));
  }
  return grayDecoding(symbolsI, sf, ldr);
}

/**
 * Decode a LoRa PHY symbol vector back to payload bytes (the full RX coding chain, post
 * dechirp→argmax). Pure — mirrors LoRaPHY.decode + parse_header.
 * @param {number[]} symbols symbol values (0..2^sf-1)
 * @param {{sf:number, cr:number, crc?:boolean, hasHeader?:boolean, ldr?:boolean, len?:number}} opts
 *   When hasHeader, cr/crc/len are read from the header (opts values are the defaults used
 *   only for the header block itself). When !hasHeader, `len` (payload length) is required
 *   to locate the CRC / strip padding; falls back to calcPayloadLen if omitted.
 * @returns {{bytes:number[], header:?{payloadLen:number,cr:number,crc:number,checksumOk:boolean}, crcOk:?boolean}}
 */
export function loraDecode(symbols, { sf, cr, crc = false, hasHeader = true, ldr = false, len } = {}) {
  const ldrN = ldr ? 1 : 0;
  const symbolsG = grayCoding(symbols, sf, ldr);

  // First block: sf-2 codewords @ rdd 8 (always CR=4/8), Hamming-decoded.
  const firstCw = diagDeinterleave(symbolsG.slice(0, 8), sf - 2);
  const firstNibbles = firstCw.map((c) => hammingDecodeCodeword(c, 8));

  let header = null, nibbles;
  if (hasHeader) {
    const payloadLen = firstNibbles[0] * 16 + firstNibbles[1];
    crc = firstNibbles[2] & 1;
    cr = firstNibbles[2] >>> 1;
    const rxSum = [firstNibbles[3] & 1, ...de2biLeft(firstNibbles[4], 4)];
    const calcSum = headerChecksum(firstNibbles[0], firstNibbles[1], firstNibbles[2]);
    const checksumOk = rxSum.every((b, i) => b === calcSum[i]);
    header = { payloadLen, cr, crc, checksumOk };
    len = payloadLen;
    nibbles = firstNibbles.slice(5); // drop the 5 header nibbles
  } else {
    nibbles = firstNibbles.slice();
    if (len === undefined) len = calcPayloadLen(symbols.length, sf, cr, hasHeader, ldr);
  }

  // Data blocks: rdd (=cr+4) symbols each → ppm (=sf-2ldr) codewords, Hamming-decoded.
  const ppm = sf - 2 * ldrN, rdd = cr + 4;
  for (let ii = 8; ii <= symbolsG.length - rdd; ii += rdd) {
    const cwds = diagDeinterleave(symbolsG.slice(ii, ii + rdd), ppm);
    for (const c of cwds) nibbles.push(hammingDecodeCodeword(c, rdd));
  }

  // nibbles → bytes (low nibble first), then dewhiten the payload region.
  const nbytes = Math.min(255, Math.floor(nibbles.length / 2));
  const bytesAll = new Array(nbytes);
  for (let i = 0; i < nbytes; i++) bytesAll[i] = (nibbles[2 * i] & 0xf) | ((nibbles[2 * i + 1] & 0xf) << 4);

  const payload = bytesAll.slice(0, len);
  whitenInto(payload, len); // dewhiten = same XOR
  let crcOk = null;
  if (crc) {
    const rxCrc = [bytesAll[len], bytesAll[len + 1]];
    const calc = calcCrc(payload);
    crcOk = calc[0] === rxCrc[0] && calc[1] === rxCrc[1];
  }
  return { bytes: payload, header, crcOk };
}
