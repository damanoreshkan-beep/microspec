// microspec runtime — ambient unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { consonance, voicingScore, MODES as AMODES, CHORDS as ACHORDS, buildScale, voiceLead, VOICE_FLOOR, VOICE_CEIL, pickChord, sparkleNote, enoLoops, loopsForDensity, ENO_BASE, STYLES, styleById, chordRoot, mulberry32 as arng } from "../ambient.js";

// ===================== ambient (generative ambient theory) =====================

Deno.test("ambient: consonance ranks the perfect 5th sweetest, minor 2nd/tritone harshest", () => {
  assert(consonance(7) > consonance(4), "P5 should beat M3");        // 3:2 vs 5:4
  assert(consonance(4) > consonance(1), "M3 should beat m2");
  assert(consonance(1) < consonance(5) && consonance(6) < consonance(5), "m2 and tritone are rough");
  assertEquals(consonance(12), consonance(0));                        // octave wraps to unison
  assertEquals(consonance(-5), consonance(7));                        // sign-independent
});

Deno.test("ambient: a consonant voicing scores higher than a clustered one", () => {
  assert(voicingScore([60, 67, 72]) > voicingScore([60, 61, 62]), "open 5th/octave beats a semitone cluster");
});

Deno.test("ambient: every mode starts on the root and stays within an octave, strictly ascending", () => {
  for (const [k, steps] of Object.entries(AMODES)) {
    assertEquals(steps[0], 0, `${k} must start at the root`);
    for (let i = 1; i < steps.length; i++) assert(steps[i] > steps[i - 1] && steps[i] < 12, `${k} step out of range`);
  }
});

Deno.test("ambient: buildScale spans the octaves and every pitch is in the mode", () => {
  const root = 48, s = buildScale(root, "major", 3);
  assertEquals(s.length, AMODES.major.length * 3);
  assertEquals(s[0], root);
  const pcs = new Set(AMODES.major.map((x) => (root + x) % 12));
  for (const m of s) assert(pcs.has(((m % 12) + 12) % 12), "pitch not in scale");
  for (let i = 1; i < s.length; i++) assert(s[i] > s[i - 1], "not ascending");
});

Deno.test("ambient: voiceLead anchors the root as bass and lifts every upper voice above the low-interval floor", () => {
  const v = voiceLead(null, 36, ACHORDS.maj9);   // C2 root — thirds/9ths must not stay in the mud
  assertEquals(Math.min(...v), 36, "bass is the chord root");
  for (const m of v) { assert(m <= VOICE_CEIL, "above ceiling"); if (m !== 36) assert(m >= VOICE_FLOOR, "upper voice below floor"); }
  assert(v.every((x, i) => i === 0 || x >= v[i - 1]), "ascending");
});

Deno.test("ambient: voiceLead minimises motion — upper voices hug the previous voicing", () => {
  const prev = [40, 52, 55, 59];
  const led = voiceLead(prev, 41, ACHORDS.maj7);        // F root chord after the previous
  // total motion of the voice-led upper voices must beat the naive (root+interval, no octave shift) placement
  const naive = ACHORDS.maj7.map((iv) => 41 + iv).slice(1);
  const nearest = (arr, x) => Math.min(...arr.map((p) => Math.abs(p - x)));
  const ledMotion = led.slice(1).reduce((a, m) => a + nearest(prev, m), 0);
  const naiveMotion = naive.reduce((a, m) => a + nearest(prev, m), 0);
  assert(ledMotion <= naiveMotion, "voice-leading did not reduce motion");
});

Deno.test("ambient: pickChord stays in the palette, avoids an immediate repeat, and is deterministic", () => {
  const pal = STYLES[0].chords;
  const rng1 = arng(7), rng2 = arng(7);
  for (let i = 0; i < 20; i++) {
    const a = pickChord(pal, 1, rng1);
    assert(a >= 0 && a < pal.length, "out of palette");
    assert(pal.length === 1 || a !== 1, "did not avoid repeat");
  }
  // same seed → same sequence
  const s1 = arng(9), s2 = arng(9);
  for (let i = 0; i < 10; i++) assertEquals(pickChord(pal, 0, s1), pickChord(pal, 0, s2));
});

Deno.test("ambient: sparkleNote returns a chord tone in the sparkle register", () => {
  const rng = arng(3);
  const iv = ACHORDS.min7, root = 40;
  const pcs = new Set(iv.map((x) => ((root + x) % 12)));
  for (let i = 0; i < 30; i++) {
    const m = sparkleNote(root, iv, 2, rng);
    assert(m >= 60 && m <= 96, "outside sparkle register");
    assert(pcs.has(((m % 12) + 12) % 12), "not a chord tone");
  }
});

Deno.test("ambient: enoLoops are near-coprime, jittered within ±5%, and deterministic", () => {
  const a = enoLoops(6, arng(11)), b = enoLoops(6, arng(11));
  assertEquals(a.length, 6);
  assertEquals(a.map((x) => x.len), b.map((x) => x.len));           // deterministic
  a.forEach((x, i) => {
    assert(x.len > 0 && x.phase >= 0 && x.phase < x.len, "phase in range");
    assert(Math.abs(x.len - ENO_BASE[i]) <= ENO_BASE[i] * 0.05 + 1e-9, "jitter beyond ±5%");
  });
  assertEquals(enoLoops(99, arng(1)).length, ENO_BASE.length);      // clamps to available bases
  assert(loopsForDensity(0) >= 3 && loopsForDensity(1) <= ENO_BASE.length);
});

Deno.test("ambient: exactly ten distinct styles, each valid and referencing a real mode + chords", () => {
  assertEquals(STYLES.length, 10);
  assertEquals(new Set(STYLES.map((s) => s.id)).size, 10, "style ids unique");
  assertEquals(new Set(STYLES.map((s) => s.hue)).size, 10, "hues distinct (colour = meaning)");
  for (const s of STYLES) {
    assert(AMODES[s.scale], `${s.id}: unknown scale ${s.scale}`);
    assert(s.chords.length >= 1, `${s.id}: no chords`);
    for (const c of s.chords) { assert(ACHORDS[c[1]], `${s.id}: unknown chord ${c[1]}`); assert(chordRoot(s, c) >= s.root, "chord root below pad root"); }
    assert(["et", "ji"].includes(s.tuning), `${s.id}: bad tuning`);
    assert(s.rel >= s.atk, `${s.id}: release should be >= attack for a pad`);
  }
  assertEquals(styleById("zen").id, "zen");
  assertEquals(styleById("nope").id, STYLES[0].id);                 // fallback
});
