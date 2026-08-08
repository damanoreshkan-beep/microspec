// microspec runtime — chroma unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { hueToNote, paletteToChord, brightnessToCutoff, satToDetune, SCALES } from "../chroma.js";

Deno.test("chroma hueToNote: hue splits the scale, never leaves it, monotone non-decreasing", () => {
  assertEquals(hueToNote(0), 48);          // root
  assertEquals(hueToNote(359), 48 + 21);   // top of the two-octave pentatonic
  assertEquals(hueToNote(120), 55);        // green → scale degree 3
  assertEquals(hueToNote(240), 62);        // blue  → scale degree 6
  let prev = -1;
  for (let h = 0; h < 360; h += 5) { const n = hueToNote(h); assert(n >= prev, `hue ${h} dipped`); assert(SCALES.penta.includes(n - 48), "left the scale"); prev = n; }
});

Deno.test("chroma paletteToChord: hues → a sorted, de-duplicated, in-scale chord", () => {
  assertEquals(paletteToChord([[255, 0, 0], [0, 255, 0], [0, 0, 255]]), [48, 55, 62]);
  assertEquals(paletteToChord([[255, 0, 0], [255, 0, 0]]), [48], "same hue collapses to one note");
  assertEquals(paletteToChord([]), []);
  for (const n of paletteToChord([[10, 200, 130], [200, 40, 90], [40, 40, 220]], SCALES.minor)) assert(SCALES.minor.includes(n - 48), "minor mode stays in scale");
});

Deno.test("chroma brightness→cutoff and sat→detune: clamped, monotone, right endpoints", () => {
  assertEquals(brightnessToCutoff(0), 300);
  assertEquals(brightnessToCutoff(1), 4000);
  assertEquals(brightnessToCutoff(-5), 300);
  assertEquals(brightnessToCutoff(9), 4000);
  assert(brightnessToCutoff(0.5) > 300 && brightnessToCutoff(0.5) < 4000);
  assertEquals(satToDetune(0), 0);
  assertEquals(satToDetune(1), 14);
});

Deno.test("chroma SCALES: every mood scale is well-formed (starts at 0, non-decreasing, 10 degrees, in range)", () => {
  for (const [name, s] of Object.entries(SCALES)) {
    assertEquals(s.length, 10, `${name} spans two octaves (10 degrees)`);
    assertEquals(s[0], 0, `${name} starts on the root`);
    for (let i = 1; i < s.length; i++) assert(s[i] >= s[i - 1], `${name} is monotone non-decreasing`);
    for (const d of s) assert(Number.isInteger(d) && d >= 0 && d <= 24, `${name} degree ${d} within two octaves`);
    // every degree lands on a note that hueToNote can reach across the wheel
    assertEquals(hueToNote(0, s), 48 + s[0]); assertEquals(hueToNote(359, s), 48 + s[s.length - 1]);
  }
});
