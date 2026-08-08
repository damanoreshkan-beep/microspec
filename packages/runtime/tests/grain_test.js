// microspec runtime — grain unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { hannCurve as grHann, grainRate as grGrainRate, overlapOf as grOverlapOf, cloudGain as grCloudGain, planGrains as grPlan, conditionSample as grCondition, dcOffset as grDcOffset, clipRatio as grClipRatio, trimBounds as grTrim, detectPitch as grPitch, CENTS as grCENTS, encodeWav as grWav, syntheticSample as grSynth, MIN_KEEP as grMIN_KEEP } from "../grain.js";
import { mulberry32 as grRng } from "../groove.js";

// ================= grain (granular math) =================
Deno.test("grain/hann: the envelope is zero at both ends — that is what stops the click", () => {
  const w = grHann();
  assertEquals(w.length, 128);
  assertEquals(w[0], 0);
  assert(Math.abs(w[w.length - 1]) < 1e-12, "the last point must land on zero, not near it");
  assert(Math.abs(w[64] - 1) < 0.002, "peak at the centre");
  for (let i = 0; i < 64; i++) assert(Math.abs(w[i] - w[127 - i]) < 1e-6, "symmetric");
});

Deno.test("grain/overlap: O = rate * duration, both directions", () => {
  assertEquals(Math.round(grGrainRate(0.07, 4)), 57);            // the shipped default: ~57 grains/s
  assert(Math.abs(grOverlapOf(0.07, grGrainRate(0.07, 4)) - 4) < 1e-9);
  assert(grCloudGain(1, 4) < grCloudGain(1, 1), "denser clouds must come down in level");
  assert(Math.abs(grCloudGain(1, 4) - 0.5) < 1e-9);              // 1/sqrt(4)
});

Deno.test("grain/planGrains: deterministic in the seed — the export replays what was heard", () => {
  const opts = { span: 1, grainMs: 70, overlap: 4, sprayMs: 120, pos: 0.3, sampleDur: 2, seed: 42 };
  const a = grPlan(opts), b = grPlan(opts);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  assert(JSON.stringify(grPlan({ ...opts, seed: 43 })) !== JSON.stringify(a), "a new seed must move the spray");
  assertEquals(a.length, Math.ceil(1 / (1 / grGrainRate(0.07, 4))));
  for (const g of a) assert(g.offset >= 0 && g.offset + g.dur * g.rate <= 2 + 1e-9, "a grain may never read past the sample");
});

Deno.test("grain/planGrains: pitch does not leak into the read head (the classic granular bug)", () => {
  const base = { span: 0.5, grainMs: 70, overlap: 4, advance: 1, pos: 0, sampleDur: 4, seed: 5 };
  const low = grPlan({ ...base, semis: -12 }), high = grPlan({ ...base, semis: 12 });
  // the read head is driven by `advance` alone, so both pitches visit the same source positions (the tail
  // bound legitimately differs — a rate-2 grain cannot start within dur*2 of the end)
  assertEquals(low.map((g) => g.offset.toFixed(6)), high.map((g) => g.offset.toFixed(6)));
  assert(Math.abs(high[0].rate - 2) < 1e-9 && Math.abs(low[0].rate - 0.5) < 1e-9);
  // an octave up reads twice the source seconds of unity rate for the same OUTPUT duration
  const unity = grPlan({ ...base, semis: 0 });
  assert(Math.abs(high[0].dur * high[0].rate - 2 * unity[0].dur * unity[0].rate) < 1e-9);
  assert(Math.abs(low[0].dur * low[0].rate - 0.5 * unity[0].dur * unity[0].rate) < 1e-9);
  // advance=0 freezes the head: every grain reads the same place (spray off)
  const frozen = grPlan({ ...base, advance: 0, sprayMs: 0 });
  assert(frozen.every((g) => Math.abs(g.offset - frozen[0].offset) < 1e-9));
});

Deno.test("grain/conditioning: DC goes, a quiet take is boosted but capped, a clipped one is flagged", () => {
  const sr = 48000, n = sr;
  const quiet = new Float32Array(n);
  for (let i = 0; i < n; i++) quiet[i] = 0.02 * Math.sin((2 * Math.PI * 220 * i) / sr) + 0.3;   // +0.3 DC
  assert(Math.abs(grDcOffset(quiet) - 0.3) < 0.01);
  const c = grCondition([quiet], sr);
  assert(Math.abs(grDcOffset(c.pcm)) < 0.01, "DC must be gone");
  assert(c.pcm.length >= sr * grMIN_KEEP, "a steady quiet take must never be trimmed to nothing");
  assertEquals(c.gain, 8);
  assert(c.quiet, "a take that needed the full +18 dB is flagged, not silently rescued");

  const loud = new Float32Array(n);
  for (let i = 0; i < n; i++) loud[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 1.4;
  assert(grClipRatio(loud) >= 0.005 && grCondition([loud], sr).clipped);
});

Deno.test("grain/trim: silence at the edges goes, the sound in the middle stays", () => {
  const sr = 48000, n = sr * 2, x = new Float32Array(n);
  for (let i = sr * 0.8; i < sr * 1.2; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 300 * i) / sr);
  const [a, b] = grTrim(x, sr);
  assert(a > sr * 0.7 && a <= sr * 0.8, `left edge landed at ${a / sr}s`);
  assert(b >= sr * 1.2 && b < sr * 1.35, `right edge landed at ${b / sr}s`);
});

Deno.test("grain/pitch: YIN finds the tone, and calls noise unpitched instead of naming it", () => {
  const sr = 48000;
  const tone = grSynth(sr, 1.5, 220);
  const p = grPitch(tone, sr);
  assert(p.pitched, "a struck 220 Hz bowl must resolve");
  assert(Math.abs(grCENTS(p.hz, 220)) < 30, `off by ${grCENTS(p.hz, 220).toFixed(1)} cents`);

  const rng = grRng(3), noise = new Float32Array(sr);
  for (let i = 0; i < noise.length; i++) noise[i] = (rng() * 2 - 1) * 0.6;
  assert(!grPitch(noise, sr).pitched, "white noise must come back unpitched — a door slam has no note");
});

Deno.test("grain/wav: the canonical 44-byte 16-bit PCM header", () => {
  const sr = 8000, x = new Float32Array(100).fill(0.5);
  const w = grWav([x], sr), v = new DataView(w.buffer);
  const tag = (o) => String.fromCharCode(w[o], w[o + 1], w[o + 2], w[o + 3]);
  assertEquals(w.length, 44 + 200);
  assertEquals([tag(0), tag(8), tag(12), tag(36)], ["RIFF", "WAVE", "fmt ", "data"]);
  assertEquals(v.getUint32(4, true), 36 + 200);
  assertEquals([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true)], [1, 1, sr]);
  assertEquals([v.getUint32(28, true), v.getUint16(32, true), v.getUint16(34, true)], [sr * 2, 2, 16]);
  assertEquals(v.getUint32(40, true), 200);
  assertEquals(v.getInt16(44, true), Math.round(0.5 * 32767));
  // full scale must not wrap to -32768
  assertEquals(new DataView(grWav([new Float32Array([1, -1])], sr).buffer).getInt16(44, true), 32767);
});
