// microspec runtime — scifi unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { centsToRatio, semiToRatio, beatHz, chord, dbToGain, faderGain, equalPower, detune, STATIONS, LAYERS, station, reactorVoices } from "../scifi.js";

Deno.test("scifi ratios: equal-temperament cents/semitones", () => {
  assertEquals(centsToRatio(0), 1);
  assert(Math.abs(centsToRatio(1200) - 2) < 1e-12, "octave up");
  assert(Math.abs(centsToRatio(-1200) - 0.5) < 1e-12, "octave down");
  assert(Math.abs(semiToRatio(12) - 2) < 1e-12, "12 semitones = octave");
  assert(Math.abs(semiToRatio(7) - 1.4983) < 1e-3, "perfect fifth ≈ 1.4983");
  assertEquals(beatHz(110, 110.5), 0.5);
  const c = chord(100, [0, 7, 12]);
  assert(Math.abs(c[0] - 100) < 1e-9 && Math.abs(c[2] - 200) < 1e-9, "root + octave");
});

Deno.test("scifi levels: dB + perceptual fader", () => {
  assert(Math.abs(dbToGain(0) - 1) < 1e-12, "0 dB = unity");
  assert(Math.abs(dbToGain(-6) - 0.5012) < 1e-3, "−6 dB ≈ 0.5");
  assertEquals(faderGain(0), 0, "bottom = hard mute");
  assert(Math.abs(faderGain(1) - 1) < 1e-12, "top = unity");
  for (let v = 0.05; v <= 1; v += 0.05) { assert(faderGain(v) > 0 && faderGain(v) <= 1, "in (0,1]"); if (v > 0.1) assert(faderGain(v) > faderGain(v - 0.05), "monotone increasing"); }
});

Deno.test("scifi equalPower: constant power crossfade", () => {
  for (let x = 0; x <= 1.0001; x += 0.1) { const { from, to } = equalPower(x); assert(Math.abs(from * from + to * to - 1) < 1e-9, `power held at x=${x.toFixed(1)}`); }
  const a = equalPower(0), b = equalPower(1);
  assert(Math.abs(a.from - 1) < 1e-9 && Math.abs(a.to) < 1e-9, "x=0 → full from");
  assert(Math.abs(b.to - 1) < 1e-9 && Math.abs(b.from) < 1e-9, "x=1 → full to");
});

Deno.test("scifi detune: symmetric cluster centred on the note", () => {
  assertEquals(detune(100, 1, 10), [100], "single voice");
  const v = detune(100, 2, 12);
  assertEquals(v.length, 2);
  assert(v[0] < 100 && v[1] > 100, "straddle the base");
  assert(Math.abs(Math.sqrt(v[0] * v[1]) - 100) < 1e-9, "geometric mean = base (2 voices)");
  const w = detune(200, 5, 20);
  assert(Math.abs(w[2] - 200) < 1e-9, "odd count keeps a voice on the note");
  const geo = w.reduce((p, x) => p * x, 1) ** (1 / w.length);
  assert(Math.abs(geo - 200) < 1e-6, "geometric mean = base (5 voices)");
  for (let i = 1; i < w.length; i++) assert(w[i] > w[i - 1], "ascending");
});

Deno.test("scifi stations: every recipe is well-formed", () => {
  const ids = new Set();
  for (const s of STATIONS) {
    assert(!ids.has(s.id), `unique id ${s.id}`); ids.add(s.id);
    assert(noteFreqOk(s.root), `${s.id}: valid root note ${s.root}`);
    assertEquals(s.iv.length, 3, `${s.id}: exactly 3 chord intervals`);
    for (const L of LAYERS) assert(s.levels[L] >= 0 && s.levels[L] <= 1, `${s.id}: level ${L} in [0,1]`);
    assert(s.air > 100 && s.air < 8000, `${s.id}: air band sane`);
    assert(s.teleGap >= 1000, `${s.id}: telemetry gap sane`);
    const rv = reactorVoices(s);
    assertEquals(rv.length, 6, `${s.id}: 3 chord tones × 2 beating voices = 6`);
    for (let i = 1; i < rv.length; i++) assert(rv[i] >= rv[i - 1] * 0.999, `${s.id}: voices roughly ascending`);
  }
  assertEquals(station("nope").id, STATIONS[0].id, "unknown id falls back to first");
});

function noteFreqOk(n) { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return !!m; }
