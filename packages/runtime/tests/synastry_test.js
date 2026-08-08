// microspec runtime — synastry unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { signOf, signPair, compat, band, ELEMENT, MODALITY } from "../synastry.js";

Deno.test("synastry signOf: longitude → sign, wraps negatives", () => {
  assertEquals(signOf(0), 0); assertEquals(signOf(29.9), 0); assertEquals(signOf(35), 1);
  assertEquals(signOf(359), 11); assertEquals(signOf(-10), 11); assertEquals(signOf(360), 0);
});

Deno.test("synastry element/modality: the 12 signs cycle correctly", () => {
  assertEquals([0, 1, 2, 3, 4].map(ELEMENT), [0, 1, 2, 3, 0], "fire·earth·air·water repeats");
  assertEquals([0, 1, 2, 3].map(MODALITY), [0, 1, 2, 0], "cardinal·fixed·mutable; Cancer is cardinal");
  assertEquals(ELEMENT(-1), ELEMENT(11), "wraps");
});

Deno.test("synastry signPair: aspect model, symmetric, in range", () => {
  assertEquals(signPair(0, 0), 78, "conjunction");
  assertEquals(signPair(0, 4), 90, "trine (same element) is the sweet spot");
  assertEquals(signPair(0, 3), 43, "square grates");
  assertEquals(signPair(0, 6), 66, "opposition attracts+strains");
  assertEquals(signPair(0, 2), 72, "sextile flows");
  assertEquals(signPair(0, 8), signPair(0, 4), "8 apart == 4 apart (both trine)");
  assertEquals(signPair(2, 7), signPair(7, 2), "symmetric");
  for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) { const v = signPair(a, b); assert(v >= 40 && v <= 100, `${a},${b} in range`); }
});

Deno.test("synastry compat: axes + weighted overall in 0..100; identical charts score high", () => {
  const same = { sun: 4, moon: 4, mercury: 4, venus: 4, mars: 4 };
  const c = compat(same, same);
  for (const k of ["overall", "core", "love", "emotion", "mind", "passion"]) assert(c[k] >= 0 && c[k] <= 100, `${k} in range`);
  assertEquals(c.core, 78, "same sun+moon → conjunction core");
  const trine = { sun: 0, moon: 0, mercury: 0, venus: 0, mars: 0 };
  const trineB = { sun: 4, moon: 4, mercury: 4, venus: 4, mars: 4 };
  assert(compat(trine, trineB).overall > compat({ sun: 0, moon: 0, mercury: 0, venus: 0, mars: 0 }, { sun: 3, moon: 3, mercury: 3, venus: 3, mars: 3 }).overall, "all-trine beats all-square");
});

Deno.test("synastry band: thresholds", () => {
  assertEquals([90, 78, 77, 62, 48, 47, 20].map(band), [3, 3, 2, 2, 1, 0, 0]);
});
