// microspec runtime — sweep unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { SWEEP_REQUEST, MODE_RX_SWEEP, BYTES_PER_BLOCK, SWEEP_STYLE, TUNE_STEP_HZ, SWEEP_OFFSET, initSweepTransfer, planRange, bytesPerSweep, sweepBlocks, blockSpectrum, binFrequencyLow, noiseFloor, peaks, strongestBin } from "../sweep.js";

// ================= HackRF wideband SWEEP (sweep.js) =================
// The device byte-layout is pinned literally (it is the contract firmware enforces), and the block→spectrum
// maths is proven the same way the FM chain is: synth a tone at a KNOWN fft bin, demod, assert it lands at the
// expected absolute frequency. Recipe + cited lines: apps/ether/RESEARCH.md.

Deno.test("initSweepTransfer: constants + LE byte layout match hackrf_init_sweep", () => {
  assertEquals([SWEEP_REQUEST, MODE_RX_SWEEP], [26, 5]);
  const t = initSweepTransfer({ ranges: [[88, 108], [430, 450]], numBytes: BYTES_PER_BLOCK });
  assertEquals(t.request, 26);
  assertEquals(t.value, BYTES_PER_BLOCK & 0xffff);         // num_bytes low16 → value
  assertEquals(t.index, (BYTES_PER_BLOCK >>> 16) & 0xffff); // num_bytes high16 → index
  const v = new DataView(t.data);
  assertEquals(v.getUint32(0, true), TUNE_STEP_HZ);        // step_width Hz LE
  assertEquals(v.getUint32(4, true), SWEEP_OFFSET);        // offset Hz LE
  assertEquals(v.getUint8(8), SWEEP_STYLE.INTERLEAVED);
  assertEquals(v.getUint16(9, true), 88);                  // range0 start MHz LE
  assertEquals(v.getUint16(11, true), 108);                // range0 stop MHz LE
  assertEquals(v.getUint16(13, true), 430);                // range1 start MHz LE
  assertEquals(v.byteLength, 9 + 2 * 4);                   // 9 + num_ranges pairs
});

Deno.test("initSweepTransfer: mirrors host-side validation (+ interleave-clean step)", () => {
  assertThrows(() => initSweepTransfer({ ranges: [] }));                              // < 1 range
  assertThrows(() => initSweepTransfer({ ranges: Array(11).fill([1, 2]) }));          // > 10 ranges
  assertThrows(() => initSweepTransfer({ ranges: [[1, 2]], numBytes: 16384 + 1 }));   // not a block multiple
  assertThrows(() => initSweepTransfer({ ranges: [[1, 2]], numBytes: 0 }));           // below one block
  assertThrows(() => initSweepTransfer({ ranges: [[1, 2]], stepWidthHz: 3, style: SWEEP_STYLE.INTERLEAVED })); // 3 % 4 ≠ 0
});

Deno.test("planRange: stop rounds up to a whole number of 20 MHz hops (min 1)", () => {
  assertEquals(planRange(88, 108), { startMHz: 88, stopMHz: 108, steps: 1 });   // exactly one step
  assertEquals(planRange(100, 105), { startMHz: 100, stopMHz: 120, steps: 1 }); // rounds up to 1 step
  assertEquals(planRange(100, 141), { startMHz: 100, stopMHz: 160, steps: 3 }); // 41 MHz → 3 hops
});

Deno.test("bytesPerSweep: full 1M–6G ≈ 9.83 MB per pass (interleaved)", () => {
  const bytes = bytesPerSweep([[1, 6000]]);
  assertEquals(bytes, 300 * 2 * BYTES_PER_BLOCK);   // 300 hops · 2 blocks · 16384
  assert(Math.abs(bytes - 9.83e6) < 0.02e6);
});

// Build a 16384-byte sweep block: magic + u64-LE header freq + a complex tone at fft bin `bin` in the tail.
function sweepBlockWithTone(headerHz, bin, N, amp = 100) {
  const blk = new Uint8Array(BYTES_PER_BLOCK);
  blk[0] = 0x7f; blk[1] = 0x7f;
  const hv = new DataView(blk.buffer);
  hv.setBigUint64(2, BigInt(headerHz), true);           // sweep_freq, u64 LE at byte 2
  const s = BYTES_PER_BLOCK - 2 * N;                     // the last 2N bytes are what blockSpectrum reads
  for (let n = 0; n < N; n++) {
    const ph = (2 * Math.PI * bin * n) / N;
    const I = Math.round(amp * Math.cos(ph)), Q = Math.round(amp * Math.sin(ph));
    blk[s + n * 2] = I & 0xff;                           // int8 stored as byte
    blk[s + n * 2 + 1] = Q & 0xff;
  }
  return blk;
}

Deno.test("sweepBlocks: reads magic + u64-LE header, skips bad magic, drops a partial tail", () => {
  const N = 16;
  const a = sweepBlockWithTone(100_000_000, 13, N);
  const b = sweepBlockWithTone(120_000_000, 13, N);
  const bad = new Uint8Array(BYTES_PER_BLOCK);           // no magic → skipped
  const partial = new Uint8Array(5000);                  // < one block → dropped
  const stream = new Uint8Array(a.length + bad.length + b.length + partial.length);
  stream.set(a, 0); stream.set(bad, a.length); stream.set(b, a.length + bad.length);
  stream.set(partial, a.length + bad.length + b.length);
  const got = [...sweepBlocks(stream)];
  assertEquals(got.length, 2);                           // bad magic skipped, partial dropped
  assertEquals(got.map((g) => g.headerHz), [100_000_000, 120_000_000]);
  assertEquals(got[0].iq.length, BYTES_PER_BLOCK - 10);  // post-header region
});

Deno.test("blockSpectrum: a tone at a known bin lands at the expected absolute frequency", () => {
  const N = 16, bin = 13, header = 100_000_000;          // bin 13 = low-slice index 2 (1 + 5N/8 + 2)
  const [{ headerHz, iq }] = [...sweepBlocks(sweepBlockWithTone(header, bin, N))];
  const { hz, db } = blockSpectrum(iq, N);
  let at = 0; for (let i = 1; i < db.length; i++) if (db[i] > db[at]) at = i;
  assertEquals(at, 2);                                   // peak is low-slice index 2
  const abs = headerHz + hz[at];
  assertEquals(abs, header + binFrequencyLow(0, 2, 20_000_000, N)); // 100 MHz + 3·1.25 MHz = 103.75 MHz
  assertEquals(abs, 103_750_000);
  assert(db[at] > noiseFloor(db) + 12);                  // the carrier stands well clear of the floor
});

Deno.test("peaks / strongestBin: a lone carrier is one peak; a quiet band tunes to nothing", () => {
  const freqs = Float64Array.from({ length: 8 }, (_, i) => 100e6 + i * 1e6);
  const quiet = new Float32Array([-80, -81, -79, -80, -82, -80, -81, -80]);
  const withTone = quiet.slice(); withTone[4] = -40;
  const p = peaks(freqs, withTone, { marginDb: 6 });
  assertEquals(p.length, 1);
  assertEquals(p[0].hz, 104e6);
  assertEquals(strongestBin(freqs, withTone).hz, 104e6);
  assertEquals(strongestBin(freqs, quiet), null);        // nothing stands above the floor → no channel
});
