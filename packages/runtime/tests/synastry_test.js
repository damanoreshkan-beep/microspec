// microspec runtime — synastry unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { signOf, contacts, score, band, ELEMENT, MODALITY, MOIETY, SYN_BODIES } from "../synastry.js";

// A person is just [{key, lon}] — built here by hand so every test states its own chart.
const at = (m) => SYN_BODIES.map((k) => ({ key: k, lon: m[k] ?? null }));

Deno.test("synastry signOf: longitude → sign, wraps negatives", () => {
  assertEquals(signOf(0), 0); assertEquals(signOf(29.9), 0); assertEquals(signOf(35), 1);
  assertEquals(signOf(359), 11); assertEquals(signOf(-10), 11); assertEquals(signOf(360), 0);
});

Deno.test("synastry element/modality: the 12 signs cycle correctly", () => {
  assertEquals([0, 1, 2, 3, 4].map(ELEMENT), [0, 1, 2, 3, 0], "fire·earth·air·water repeats");
  assertEquals([0, 1, 2, 3].map(MODALITY), [0, 1, 2, 0], "cardinal·fixed·mutable; Cancer is cardinal");
  assertEquals(ELEMENT(-1), ELEMENT(11), "wraps");
});

Deno.test("synastry MOIETY: Dariot's table, and no guessed modern orbs", () => {
  assertEquals(MOIETY.sun, 7.5); assertEquals(MOIETY.moon, 6);
  assertEquals(MOIETY.mercury, 3.5); assertEquals(MOIETY.venus, 3.5); assertEquals(MOIETY.mars, 4);
  for (const k of ["uranus", "neptune", "pluto"]) {
    assert(MOIETY[k] === undefined, `${k} has no traditional moiety and must not be given one`);
  }
});

Deno.test("synastry contacts: the orb is the SUM of the two moieties, not an aspect-wide number", () => {
  // Sun–Moon reaches 13.5°; a 13° square is in orb.
  assertEquals(contacts(at({ sun: 0 }), at({ moon: 103 })).length, 1, "13° off a square, inside 7.5+6");
  assertEquals(contacts(at({ sun: 0 }), at({ moon: 104 })).length, 0, "14° off is outside it");
  // Mercury–Venus reaches only 7°.
  assertEquals(contacts(at({ mercury: 0 }), at({ venus: 96 })).length, 1, "6° off a square, inside 3.5+3.5");
  assertEquals(contacts(at({ mercury: 0 }), at({ venus: 98 })).length, 0, "8° off is outside it");
});

Deno.test("synastry contacts: strength measures closeness to exact inside the pair's own window", () => {
  const exact = contacts(at({ venus: 10 }), at({ mars: 130 }))[0];
  assertEquals(exact.type, "trine"); assertEquals(exact.orb, 0); assertEquals(exact.strength, 1);
  assertEquals(exact.limit, 7.5, "venus 3.5 + mars 4");
  const wide = contacts(at({ venus: 10 }), at({ mars: 126 }))[0];
  assertEquals(wide.orb, 4);
  assert(wide.strength < exact.strength, "a 4° trine is weaker than an exact one");
  // The pair the old sign model could not tell apart: both are "4 signs apart".
  assert(contacts(at({ venus: 0 }), at({ mars: 120 }))[0].strength >
    contacts(at({ venus: 29 }), at({ mars: 120 }))[0].strength, "degree within the sign now matters");
});

Deno.test("synastry contacts: it is a CROSS product — both directions and same-body pairs are kept", () => {
  const list = contacts(at({ venus: 0, mars: 0 }), at({ venus: 0, mars: 0 }));
  const keys = list.map((c) => c.a + "-" + c.b).sort();
  assertEquals(keys, ["mars-mars", "mars-venus", "venus-mars", "venus-venus"],
    "A.venus–B.mars and B.venus–A.mars are different claims; two Suns are a real contact");
});

Deno.test("synastry contacts: the aspect windows stay disjoint at the widest possible limit", () => {
  // Sun–Moon (13.5°) is the widest pair there is; no separation may match two aspects.
  for (let s = 0; s <= 180; s += 0.25) {
    assert(contacts(at({ sun: 0 }), at({ moon: s })).length <= 1, `${s}° matched more than one aspect`);
  }
});

Deno.test("synastry contacts: a body with no position is skipped, not scored as 0°", () => {
  assertEquals(contacts(at({ sun: null }), at({ sun: 0 })).length, 0);
});

Deno.test("synastry score: axes and overall stay in 0..100", () => {
  const s = score(contacts(at({ sun: 12, moon: 200, mercury: 40, venus: 65, mars: 300 }),
    at({ sun: 132, moon: 44, mercury: 160, venus: 185, mars: 60 })));
  for (const k of ["overall", "core", "love", "emotion", "mind", "passion"]) {
    assert(s[k] >= 0 && s[k] <= 100, `${k} = ${s[k]} out of range`);
  }
});

Deno.test("synastry score: all-trine beats all-square, and aversion sits between them", () => {
  const A = at({ sun: 0, moon: 0, mercury: 0, venus: 0, mars: 0 });
  const trine = score(contacts(A, at({ sun: 120, moon: 120, mercury: 120, venus: 120, mars: 120 })));
  const square = score(contacts(A, at({ sun: 90, moon: 90, mercury: 90, venus: 90, mars: 90 })));
  const silent = score(contacts(A, at({ sun: 25, moon: 25, mercury: 25, venus: 25, mars: 25 })));
  assert(trine.overall > silent.overall, "exact trines read above neutral");
  assert(silent.overall > square.overall, "exact squares read below neutral");
  assertEquals(silent.overall, 60, "no contact at all is neutral, not mild");
});

Deno.test("synastry score: an absent pair gets no vote — silence cannot dilute a real contact", () => {
  // `mind` reads Mercury against Mercury/Sun/Moon. One exact Mercury–Mercury trine and nothing else must
  // read as a trine, not as a trine averaged with four neutrals. This is the measured dead-band bug.
  const s = score(contacts(at({ mercury: 0 }), at({ mercury: 120 })));
  assertEquals(s.mind, 90, "one EXACT trine and four absent pairs is a trine at full strength");
});

Deno.test("synastry band: every band is reachable under the contact model", () => {
  assertEquals([84, 72, 71, 65, 64, 58, 57, 20].map(band), [3, 3, 2, 2, 1, 1, 0, 0]);
});
