// microspec runtime — lora unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { refDownchirp, makeUpSymbol, dechirpArgmax, detectPreamble, LORA_PRESETS, WHITENING, loraEncode, loraDecode, decodeLoraSignal } from "../lora.js";

// ================= LoRa CSS detect (lora.js) =================

Deno.test("LoRa dechirp round-trip: makeUpSymbol(s) → dechirpArgmax recovers s exactly", () => {
  for (const sf of [7, 9]) {
    const N = 1 << sf, d = refDownchirp(N);
    for (const s of [0, 1, 42, N - 1]) {
      const sym = makeUpSymbol(N, s);
      assertEquals(dechirpArgmax(sym.re, sym.im, d, N).bin, s, `SF${sf} s=${s}`);
    }
  }
});

Deno.test("LoRa preamble detection: 8 up-chirps → run found; noise → not found", () => {
  const sf = 7, N = 1 << sf, K = 8;
  // preamble = K identical base up-chirps (s=0), concatenated
  const re = new Float32Array(K * N), im = new Float32Array(K * N);
  for (let k = 0; k < K; k++) { const s = makeUpSymbol(N, 0); re.set(s.re, k * N); im.set(s.im, k * N); }
  const det = detectPreamble(re, im, sf);
  assert(det.found, `preamble not found (run ${det.run})`);
  assert(det.run >= 6, "run too short");
  assert(Math.abs(det.bin) <= 1, "preamble should peak near bin 0");
  assert(det.pr > 8, "clean tone PR should be high");
  // deterministic pseudo-noise → no preamble
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const nr = new Float32Array(K * N), ni = new Float32Array(K * N);
  for (let i = 0; i < nr.length; i++) { nr[i] = rnd(); ni[i] = rnd(); }
  assert(!detectPreamble(nr, ni, sf).found, "noise falsely detected as LoRa");
});

Deno.test("LoRa presets: Meshtastic EU LongFast = SF11/BW250 @ 869.525 MHz", () => {
  const lf = LORA_PRESETS.find((p) => p.key === "longfast");
  assertEquals([lf.sf, lf.bw, lf.freq], [11, 250_000, 869_525_000]);
});

Deno.test("LoRa whitening table: 255 bytes, seed 0xFF", () => {
  assertEquals(WHITENING.length, 255);
  assertEquals(WHITENING[0], 0xff);
});

Deno.test("LoRa PHY codec: encode → decode round-trip recovers exact payload (SF×CR×CRC×header)", () => {
  const payloads = [
    [0x48, 0x65, 0x6c, 0x6c, 0x6f],                     // "Hello"
    [0x00, 0xff, 0x01, 0xfe, 0x80, 0x7f, 0x2a],         // edge bytes
    [0x11, 0x22, 0x33],                                  // short (>2 so CRC uses full path)
    Array.from({ length: 16 }, (_, i) => (i * 37 + 5) & 0xff), // longer, multi-block
  ];
  for (const sf of [7, 9]) {
    for (const cr of [1, 2, 3, 4]) {
      for (const crc of [false, true]) {
        for (const hasHeader of [false, true]) {
          for (const payload of payloads) {
            const label = `SF${sf} CR4/${cr + 4} crc=${crc} hdr=${hasHeader} len=${payload.length}`;
            const symbols = loraEncode(payload, { sf, cr, crc, hasHeader });
            for (const s of symbols) assert(s >= 0 && s < (1 << sf), `symbol out of range: ${label}`);
            const out = loraDecode(symbols, { sf, cr, crc, hasHeader, len: payload.length });
            assertEquals(out.bytes, payload, `payload mismatch: ${label}`);
            if (crc) assert(out.crcOk === true, `crc failed: ${label}`);
            if (hasHeader) {
              assert(out.header.checksumOk, `header checksum bad: ${label}`);
              assertEquals(out.header.payloadLen, payload.length, `header len: ${label}`);
              assertEquals(out.header.cr, cr, `header cr: ${label}`);
              assertEquals(out.header.crc, crc ? 1 : 0, `header crc flag: ${label}`);
            }
          }
        }
      }
    }
  }
});

Deno.test("LoRa PHY codec: header carries cr/crc/len so decode needs no side channel", () => {
  const payload = [0xde, 0xad, 0xbe, 0xef, 0x42];
  const symbols = loraEncode(payload, { sf: 9, cr: 3, crc: true, hasHeader: true });
  // decode WITHOUT telling it cr/crc/len — must be read from the header block
  const out = loraDecode(symbols, { sf: 9, hasHeader: true });
  assertEquals(out.bytes, payload);
  assert(out.crcOk === true);
  assertEquals(out.header.cr, 3);
  assertEquals(out.header.crc, 1);
  assertEquals(out.header.payloadLen, 5);
});

// --- Full-packet synthesizer (TEST-ONLY, not shipped) -----------------------
// Build a complex-baseband LoRa frame at Fs = BW (N = 2^SF samples/symbol):
//   8 preamble up-chirps | 2 sync-word up-chirps | 2.25 down-chirp SFD | payload up-chirps.
// A global carrier-frequency offset of `cfoBins` bins is applied as exp(+j2π·cfoBins·n/N)
// across the WHOLE packet (so it shifts up-chirp and down-chirp bins in OPPOSITE senses — the
// physics the up/down argmax trick exploits). A sample-timing offset of `stoSamples` is a
// leading integer shift (pre-roll of the periodic preamble up-chirp). Deterministic complex
// Gaussian noise (Box-Muller over an LCG — no Math.random) is added when noise>0.
const SYNTH_SYNC = [8, 16];
function synthLoraSignal(payload, { sf, cr = 1, crc = false, hasHeader = true, cfoBins = 0, stoSamples = 0, noise = 0 } = {}) {
  const N = 1 << sf;
  const parts = [];
  for (let i = 0; i < 8; i++) parts.push(makeUpSymbol(N, 0));            // preamble
  parts.push(makeUpSymbol(N, SYNTH_SYNC[0] % N));                       // sync word 1
  parts.push(makeUpSymbol(N, SYNTH_SYNC[1] % N));                       // sync word 2
  parts.push(refDownchirp(N)); parts.push(refDownchirp(N));             // 2 full SFD down-chirps
  const dq = refDownchirp(N);
  parts.push({ re: dq.re.subarray(0, N >> 2), im: dq.im.subarray(0, N >> 2) }); // + quarter
  const symbols = loraEncode(payload, { sf, cr, crc, hasHeader });
  for (const s of symbols) parts.push(makeUpSymbol(N, s % N));          // payload up-chirps
  // concat
  let L = 0; for (const q of parts) L += q.re.length;
  const bre = new Float32Array(L), bim = new Float32Array(L);
  let off = 0; for (const q of parts) { bre.set(q.re, off); bim.set(q.im, off); off += q.re.length; }
  // integer STO: prepend `pre` samples of the cyclic preamble up-chirp (keeps preamble periodic)
  const pre = Math.max(0, stoSamples | 0), up = makeUpSymbol(N, 0);
  const re = new Float32Array(pre + L), im = new Float32Array(pre + L);
  for (let i = 0; i < pre; i++) { const idx = ((i - pre) % N + N) % N; re[i] = up.re[idx]; im[i] = up.im[idx]; }
  re.set(bre, pre); im.set(bim, pre);
  // global CFO: exp(+j2π·cfoBins·n/N), n = global sample index (so pre-roll stays phase-continuous)
  for (let i = 0; i < re.length; i++) {
    const gn = i - pre, ph = 2 * Math.PI * cfoBins * gn / N, c = Math.cos(ph), s = Math.sin(ph);
    const a = re[i], b = im[i]; re[i] = a * c - b * s; im[i] = a * s + b * c;
  }
  // deterministic complex Gaussian noise
  if (noise > 0) {
    let seed = 0x2545f491 ^ (sf << 8) ^ payload.length;
    const u = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed + 1) / 0x80000000; };
    for (let i = 0; i < re.length; i++) {
      const g = Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
      const h = Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
      re[i] += noise * g; im[i] += noise * h;
    }
  }
  return { re, im, symbols, N };
}

Deno.test("LoRa frame sync: synthetic full-packet round-trip recovers payload+CRC under CFO/STO", () => {
  const payloads = [
    [0x48, 0x65, 0x6c, 0x6c, 0x6f],                             // "Hello"
    Array.from({ length: 11 }, (_, i) => (i * 29 + 7) & 0xff),  // longer, multi-block
  ];
  for (const sf of [7, 9]) {
    for (const cr of [1, 4]) {
      for (const payload of payloads) {
        // (cfoBins, stoSamples) sweep: prove the pipeline clean (0,0) THEN with integer offsets.
        for (const [cfoBins, stoSamples] of [[0, 0], [3, 0], [0, 5], [3, 7], [-2, 3]]) {
          const label = `SF${sf} CR4/${cr + 4} len=${payload.length} cfo=${cfoBins} sto=${stoSamples}`;
          const sig = synthLoraSignal(payload, { sf, cr, crc: true, hasHeader: true, cfoBins, stoSamples });
          const out = decodeLoraSignal(sig.re, sig.im, { sf });
          assert(out.found, `preamble not found: ${label}`);
          assertEquals(out.cfo, cfoBins, `CFO mismatch: ${label}`);
          assertEquals(out.sto, stoSamples, `STO mismatch: ${label}`);
          assertEquals(out.bytes, payload, `payload mismatch: ${label}`);
          assert(out.crcOk === true, `CRC failed: ${label}`);
          assert(out.header.checksumOk, `header checksum bad: ${label}`);
          assertEquals(out.header.cr, cr, `header cr: ${label}`);
        }
      }
    }
  }
});

Deno.test("LoRa frame sync: recovers payload under CFO+STO+noise", () => {
  const payload = [0x4d, 0x65, 0x73, 0x68]; // "Mesh"
  const sig = synthLoraSignal(payload, { sf: 7, cr: 1, crc: true, hasHeader: true, cfoBins: 3, stoSamples: 4, noise: 0.05 });
  const out = decodeLoraSignal(sig.re, sig.im, { sf: 7 });
  assert(out.found, "preamble not found under noise");
  assertEquals(out.bytes, payload, "payload mismatch under noise");
  assert(out.crcOk === true, "CRC failed under noise");
});

Deno.test("LoRa frame sync: no preamble → found:false", () => {
  const sf = 7, N = 1 << sf;
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const re = new Float32Array(30 * N), im = new Float32Array(30 * N);
  for (let i = 0; i < re.length; i++) { re[i] = rnd(); im[i] = rnd(); }
  assert(!decodeLoraSignal(re, im, { sf }).found, "noise falsely synced");
});
