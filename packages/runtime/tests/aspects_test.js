
import { assert, assertEquals } from "jsr:@std/assert@1";
import { aspects, ASPECTS } from "../aspects.js";

Deno.test("aspects: exact trine, square and opposition are detected with zero orb", () => {
  const found = aspects([
    { key: "mars", lon: 10 },
    { key: "jupiter", lon: 130 },   
    { key: "saturn", lon: 100 },    
    { key: "venus", lon: 190 },     
  ]);
  const of = (a, b) => found.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  assertEquals(of("mars", "jupiter").type, "trine");
  assertEquals(of("mars", "saturn").type, "square");
  assertEquals(of("mars", "venus").type, "opposition");
  assertEquals(of("mars", "jupiter").orb, 0);
});

Deno.test("aspects: separations beyond the orb do not aspect", () => {
  const found = aspects([{ key: "mars", lon: 0 }, { key: "venus", lon: 45 }]);
  assertEquals(found.length, 0);
});

Deno.test("aspects: luminaries get the +2° orb bonus", () => {
  const withSun = aspects([{ key: "sun", lon: 0 }, { key: "saturn", lon: 97 }]);
  assertEquals(withSun.length, 1);
  assertEquals(withSun[0].type, "square");
  const noSun = aspects([{ key: "mars", lon: 0 }, { key: "saturn", lon: 97 }]);
  assertEquals(noSun.length, 0);
});

Deno.test("aspects: sorted tightest orb first", () => {
  const found = aspects([
    { key: "sun", lon: 0 },
    { key: "mars", lon: 122 },   
    { key: "venus", lon: 119 },  
  ]);
  assert(found.length >= 2);
  assert(found[0].orb <= found[1].orb);
});

Deno.test("aspects: applying vs separating from the previous-day chart", () => {
  const prev = { sun: 0, moon: 117 };
  const now = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 118 }], prev);
  assertEquals(now[0].type, "trine");
  assertEquals(now[0].applying, true);
  const sep = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 122 }], { sun: 0, moon: 121 });
  assertEquals(sep[0].applying, false);
});

Deno.test("aspects: applying is null without a previous-day chart", () => {
  const found = aspects([{ key: "sun", lon: 0 }, { key: "moon", lon: 120 }]);
  assertEquals(found[0].applying, null);
});

Deno.test("ASPECTS: five Ptolemaic aspects with disjoint orb bands", () => {
  assertEquals(ASPECTS.map((a) => a.type), ["conjunction", "sextile", "square", "trine", "opposition"]);
  const wins = ASPECTS.map((a) => [a.angle - (a.orb + 2), a.angle + (a.orb + 2)]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < wins.length; i++) assert(wins[i][0] > wins[i - 1][1], "aspect orb bands overlap");
});
