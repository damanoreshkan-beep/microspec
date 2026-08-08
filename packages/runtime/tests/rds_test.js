// microspec runtime — rds unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { syndrome, OFFSET, ptyName, rdsChar, RdsBlockSync, RdsParser, Rds } from "../rds.js";
import { goertzelPower, pilotRatioDb, rssiFromBytes, IF_RATE, PILOT_COEFF } from "../fmradio.js";

// ================= RDS (rds.js) =================
// A standard RDS modulator (independent of the decoder's internals) so the whole chain — CRC/offset framing
// AND the 57 kHz DBPSK DSP — is validated by a synthetic-signal round-trip, the same tactic as the FM test.
function rdsCrc10(data16) { let reg = 0; for (let i = 25; i >= 0; i--) { const bit = i >= 10 ? (data16 >> (i - 10)) & 1 : 0; reg = (reg << 1) | bit; if (reg & 0x400) reg ^= 0x5B9; reg &= 0x7FF; } return reg & 0x3FF; }
function rdsBlock(data16, off) { return ((data16 & 0xFFFF) << 10) | ((rdsCrc10(data16) ^ off) & 0x3FF); }
function blockBits(b26) { const a = []; for (let i = 25; i >= 0; i--) a.push((b26 >> i) & 1); return a; }
function groupBits(a, b, c, d) { return [...blockBits(rdsBlock(a, OFFSET.A)), ...blockBits(rdsBlock(b, OFFSET.B)), ...blockBits(rdsBlock(c, OFFSET.C)), ...blockBits(rdsBlock(d, OFFSET.D))]; }
const PI = 0x1234, PTY = 10;
const PS = "TEST FM ", RT = "HELLO RADIO\r";
function ps0A(seg) { const b = (PTY << 5) | (1 << 3) | (seg & 3); const d = (PS.charCodeAt(seg * 2) << 8) | PS.charCodeAt(seg * 2 + 1); return groupBits(PI, b, 0, d); }
function rt2A(addr) { const b = 0x2000 | (PTY << 5) | (addr & 0xF); const cc = (i) => (i < RT.length ? RT.charCodeAt(i) : 0x20); const c = (cc(addr * 4) << 8) | cc(addr * 4 + 1), d = (cc(addr * 4 + 2) << 8) | cc(addr * 4 + 3); return groupBits(PI, b, c, d); }
function rdsStream(reps) { const bits = []; for (let r = 0; r < reps; r++) { for (let s = 0; s < 4; s++) bits.push(...ps0A(s)); for (let a = 0; a < 3; a++) bits.push(...rt2A(a)); } return bits; }

Deno.test("rds syndrome: a clean block's syndrome equals its own offset word (match table)", () => {
  for (const data of [0x0000, 0x1234, 0xABCD, 0xFFFF]) {
    assertEquals(syndrome(rdsBlock(data, OFFSET.A)), OFFSET.A);
    assertEquals(syndrome(rdsBlock(data, OFFSET.B)), OFFSET.B);
    assertEquals(syndrome(rdsBlock(data, OFFSET.C)), OFFSET.C);
    assertEquals(syndrome(rdsBlock(data, OFFSET.D)), OFFSET.D);
  }
  assert(syndrome(rdsBlock(0x1234, OFFSET.A) ^ 1) !== OFFSET.A, "a single bit error changes the syndrome");
});

Deno.test("ptyName / rdsChar tables", () => {
  assertEquals(ptyName(10), "Pop music"); assertEquals(ptyName(1), "News"); assertEquals(ptyName(0), "None");
  assertEquals(rdsChar(0x54), "T"); assertEquals(rdsChar(0x0D), "\r"); assertEquals(rdsChar(0x02), "·");
});

Deno.test("rds framing: bitstream → block sync → parser recovers PS, RadioText, PTY, PI", () => {
  const sync = new RdsBlockSync(), parser = new RdsParser();
  for (const bit of rdsStream(12)) { const g = sync.pushBit(bit); if (g) parser.group(g); }
  const s = parser.snapshot();
  assertEquals(s.pi, PI);
  assertEquals(s.ptyName, "Pop music");
  assertEquals(s.ps, "TEST FM");
  assertEquals(s.rt, "HELLO RADIO");
});

Deno.test("rds end-to-end DSP: 57 kHz DBPSK MPX → Rds recovers the station metadata", () => {
  const FS = 250_000, CHIP = 2375;   // 2 chips per bit
  const bits = rdsStream(30);
  // differential encode, then biphase (Manchester) chips: e=1 → [+1,−1], e=0 → [−1,+1]
  const chips = []; let e = 0;
  for (const b of bits) { e ^= b; chips.push(e ? 1 : -1, e ? -1 : 1); }
  // modulate chips onto a 57 kHz subcarrier at FS (rectangular chips; the decoder's LPF shapes them)
  const total = Math.floor(chips.length * FS / CHIP);
  const mpx = new Float32Array(total);
  for (let n = 0; n < total; n++) { const ci = Math.floor(n * CHIP / FS); mpx[n] = 0.7 * chips[ci] * Math.cos(2 * Math.PI * 57000 * n / FS); }
  const rds = new Rds(FS);
  let snap;
  for (let i = 0; i < total; i += 8192) snap = rds.process(mpx.subarray(i, Math.min(total, i + 8192)));
  assert(rds.groups > 20, `decoded too few groups (${rds.groups})`);
  assertEquals(snap.pi, PI);
  assertEquals(snap.ptyName, "Pop music");
  assertEquals(snap.ps, "TEST FM");
  assert(/HELLO RADIO/.test(snap.rt), `RadioText not recovered: "${snap.rt}"`);
});

Deno.test("rds DSP robustness: locks through a carrier phase+freq offset and additive noise", () => {
  const FS = 250_000, CHIP = 2375;
  const bits = rdsStream(45);
  const chips = []; let e = 0;
  for (const b of bits) { e ^= b; chips.push(e ? 1 : -1, e ? -1 : 1); }
  const total = Math.floor(chips.length * FS / CHIP);
  const mpx = new Float32Array(total);
  // deterministic pseudo-noise (no Math.random in this suite's spirit), a static phase offset, +6 Hz carrier drift
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let n = 0; n < total; n++) { const ci = Math.floor(n * CHIP / FS); mpx[n] = 0.7 * chips[ci] * Math.cos(2 * Math.PI * 57006 * n / FS + 1.1) + 0.05 * rnd(); }
  const rds = new Rds(FS);
  let snap; for (let i = 0; i < total; i += 8192) snap = rds.process(mpx.subarray(i, Math.min(total, i + 8192)));
  assertEquals(snap.ps, "TEST FM");
  assertEquals(snap.ptyName, "Pop music");
  assert(/HELLO RADIO/.test(snap.rt), `RadioText not recovered under impairment: "${snap.rt}"`);
});

// ================= FM auto-scan helpers (fmradio.js) =================

Deno.test("goertzelPower: peaks at the target bin, low off-target", () => {
  const N = 2500, fs = IF_RATE, tone = new Float32Array(N);
  for (let n = 0; n < N; n++) tone[n] = Math.sin(2 * Math.PI * 19000 * n / fs);
  const at19 = goertzelPower(tone, PILOT_COEFF);
  const off = goertzelPower(tone, 2 * Math.cos(2 * Math.PI * 30000 / fs));
  assert(at19 > 100 * off, "a 19 kHz tone concentrates at the 19 kHz bin");
});

Deno.test("pilotRatioDb: high with a pilot present, low on noise", () => {
  const N = 2500, fs = IF_RATE;
  let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const withPilot = new Float32Array(N), noise = new Float32Array(N);
  for (let n = 0; n < N; n++) { const nz = 0.3 * rnd(); withPilot[n] = Math.sin(2 * Math.PI * 19000 * n / fs) + nz; noise[n] = nz; }
  assert(pilotRatioDb(withPilot) > 6, `pilot should be detected: ${pilotRatioDb(withPilot).toFixed(1)} dB`);
  assert(pilotRatioDb(noise) < 6, `noise should not: ${pilotRatioDb(noise).toFixed(1)} dB`);
});

Deno.test("rssiFromBytes: stronger IQ → higher dBFS, monotone", () => {
  const mk = (amp) => { const b = new Uint8Array(2048); for (let i = 0; i < b.length; i++) b[i] = (Math.round(amp * Math.sin(i)) + 256) & 0xff; return b; };
  assert(rssiFromBytes(mk(100)) > rssiFromBytes(mk(20)), "louder signal reads higher");
  assert(rssiFromBytes(mk(100)) < 0, "dBFS is ≤ 0 (relative to full scale)");
});

// ---- RDS stable/accumulating display layer ----
const g0A = (ps, seg, ok = [1, 1, 1, 1]) => ({ a: 0x1234, b: (10 << 5) | (seg & 3), c: 0, d: (ps.charCodeAt(seg * 2) << 8) | ps.charCodeAt(seg * 2 + 1), ok });
const feedPS = (p, ps, reps) => { for (let r = 0; r < reps; r++) for (let s = 0; s < 4; s++) p.group(g0A(ps, s)); };
const g2A = (str, addr, ab = 0, ok = [1, 1, 1, 1]) => { const cc = (i) => (i < str.length ? str.charCodeAt(i) : 0x20); return { a: 0x1234, b: 0x2000 | (ab << 4) | (addr & 0xF), c: (cc(addr * 4) << 8) | cc(addr * 4 + 1), d: (cc(addr * 4 + 2) << 8) | cc(addr * 4 + 3), ok }; };

Deno.test("rds PS latch: a confirmed name survives noise + dropout (never cleared)", () => {
  const p = new RdsParser();
  feedPS(p, "TEST FM ", 3);
  assertEquals(p.snapshot().ps, "TEST FM");
  // a single differing group must not flip a 2-of-3-confirmed name
  for (let s = 0; s < 4; s++) p.group(g0A("HITS ONE", s));
  assertEquals(p.snapshot().ps, "TEST FM", "one group can't overwrite a confirmed name");
  // CRC-failed (bad block-D) groups write nothing → name holds
  for (let r = 0; r < 3; r++) for (let s = 0; s < 4; s++) p.group(g0A("XXXXXXXX", s, [1, 1, 1, 0]));
  assertEquals(p.snapshot().ps, "TEST FM", "bad blocks never reach the buffer");
});

Deno.test("rds dynamic PS: a churning name is detected and kept out of the name slot", () => {
  const p = new RdsParser();
  feedPS(p, "AAAA1111", 2); feedPS(p, "BBBB2222", 2); feedPS(p, "CCCC3333", 2);
  const s = p.snapshot();
  assert(s.dynamic, "three distinct confirmed names → dynamic");
  assert(s.ps !== "CCCC3333", "name slot is frozen, not following the scroll");
  assertEquals(s.scroll, "CCCC3333", "latest frame is exposed as scroll text");
});

Deno.test("rds RadioText: A/B flag debounced, last complete message latched", () => {
  const p = new RdsParser();
  for (let r = 0; r < 3; r++) { p.group(g2A("HELLO\r", 0, 0)); p.group(g2A("HELLO\r", 1, 0)); }
  assertEquals(p.snapshot().rt, "HELLO");
  p.group(g2A("XXXXXX", 0, 1));                 // a single flipped A/B must NOT wipe the text
  assertEquals(p.snapshot().rt, "HELLO", "one flipped A/B can't clear RadioText");
  for (let r = 0; r < 3; r++) { p.group(g2A("WORLD\r", 0, 1)); p.group(g2A("WORLD\r", 1, 1)); } // sustained new message
  assertEquals(p.snapshot().rt, "WORLD", "a debounced new message replaces atomically");
});
