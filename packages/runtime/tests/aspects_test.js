// microspec runtime — aspects unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { aspects, ASPECTS } from "../aspects.js";

Deno.test("aspects: exact trine, square and opposition are detected with zero orb", () => {
  const found = aspects([
    { key: "mars", lon: 10 },
    { key: "jupiter", lon: 130 },   // 120° from Mars → trine
    { key: "saturn", lon: 100 },    // 90° from Mars → square
    { key: "venus", lon: 190 },     // 180° from Mars → opposition
  ]);
  const of = (a, b) => found.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  assertEquals(of("mars", "jupiter").type, "trine");
  assertEquals(of("mars", "saturn").type, "square");
  assertEquals(of("mars", "venus").type, "opposition");
  assertEquals(of("mars", "jupiter").orb, 0);
});

Deno.test("aspects: separations beyond the orb do not aspect", () => {
  // 45° apart is between sextile(60,±4) and square(90,±6) → no aspect
  const found = aspects([{ key: "mars", lon: 0 }, { key: "venus", lon: 45 }]);
  assertEquals(found.length, 0);
});

Deno.test("aspects: luminaries get the +2° orb bonus", () => {
  // Sun–Saturn 7° from a square (97° apart): base square orb 6 would MISS, luminary orb 8 CATCHES it.
  const withSun = aspects([{ key: "sun", lon: 0 }, { key: "saturn", lon: 97 }]);
  assertEquals(withSun.length, 1);
  assertEquals(withSun[0].type, "square");
  // same 97° between two non-luminaries → outside the 6° orb → no aspect
  const noSun = aspects([{ key: "mars", lon: 0 }, { key: "saturn", lon: 97 }]);
  assertEquals(noSun.length, 0);
});

Deno.test("aspects: sorted tightest orb first", () => {
  const found = aspects([
    { key: "sun", lon: 0 },
    { key: "mars", lon: 122 },   // trine, orb 2
    { key: "venus", lon: 119 },  // trine, orb 1 (tighter)
  ]);
  assert(found.length >= 2);
  assert(found[0].orb <= found[1].orb);
});

Deno.test("aspects: applying vs separating from the previous-day chart", () => {
  // Moon at 118° closing on a 120° trine to a fixed Sun at 0° → orb 2 now, was 3 → applying.
  const prev = { sun: 0, moon: 117 };
  const now = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 118 }], prev);
  assertEquals(now[0].type, "trine");
  assertEquals(now[0].applying, true);
  // Moon past exact and pulling away (122° now, 121° before) → separating.
  const sep = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 122 }], { sun: 0, moon: 121 });
  assertEquals(sep[0].applying, false);
});

Deno.test("aspects: applying is null without a previous-day chart", () => {
  const found = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 120 }]);
  assertEquals(found[0].applying, null);
});

Deno.test("ASPECTS: five Ptolemaic aspects with disjoint orb bands", () => {
  assertEquals(ASPECTS.map((a) => a.type), ["conjunction", "sextile", "square", "trine", "opposition"]);
  // no two aspect windows overlap even with the widest (+2 luminary) orbs → a pair matches at most one
  const wins = ASPECTS.map((a) => [a.angle - (a.orb + 2), a.angle + (a.orb + 2)]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < wins.length; i++) assert(wins[i][0] > wins[i - 1][1], "aspect orb bands overlap");
});
