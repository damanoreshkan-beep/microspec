// microspec runtime — sigil unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { PLANETS, squareFor, isMagic, magicConstant, distill, sigilPath, hash32, smooth } from "../sigil.js";

// ---- sigil: deterministic kamea geometry from an intent ----

Deno.test("sigil: every planetary kamea is magic (rows=cols=diagonals)", () => {
  for (const p of PLANETS) {
    const sq = squareFor(p.order);
    assertEquals(sq.length, p.order, `order ${p.order} wrong size`);
    assert(isMagic(sq), `kamea order ${p.order} (${p.key}) is not magic`);
    // spot-check the constant
    const want = magicConstant(p.order);
    assertEquals(sq[0].reduce((a, b) => a + b, 0), want, `row sum ${p.order}`);
  }
});

Deno.test("sigil: Agrippa Sun kamea (order 6) constant is 111", () => {
  assertEquals(magicConstant(6), 111);
  assert(isMagic(squareFor(6)));
});

Deno.test("sigil: distill strikes vowels + repeated consonants (Spare)", () => {
  // "I AM CALM AND FOCUSED" → consonants first-seen: M C L N D F S
  assertEquals(distill("I AM CALM AND FOCUSED"), ["M", "C", "L", "N", "D", "F", "S"]);
  // all-vowel intent falls back to unique letters, never empty
  assert(distill("AEIOU").length >= 1);
  // punctuation/digits ignored; a single-consonant intent falls back to unique letters (never < 2 points)
  assertEquals(distill("go!! 42 go").join(""), "GO");
});

Deno.test("sigil: Ukrainian intent distills without throwing", () => {
  const out = distill("Я СПОКІЙНА І СИЛЬНА");
  assert(out.length >= 2, "uk intent produced too few letters");
  assert(out.every((c) => typeof c === "string" && c.length === 1));
});

Deno.test("sigil: sigilPath is deterministic and well-formed", () => {
  const a = sigilPath("I am calm and focused");
  const b = sigilPath("I am calm and focused");
  assertEquals(a.planet, b.planet);
  assertEquals(a.points.length, b.points.length);
  assertEquals(a.points[0], b.points[0]);
  assertEquals(a.points.at(-1), b.points.at(-1));
  // planet order matches the square used
  assertEquals(a.nodes.length, a.order * a.order);
  // every point sits inside the centred box
  for (const p of a.points) { assert(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, "point out of box"); }
  assert(a.points.length >= 2, "need at least two points");
});

Deno.test("sigil: empty / letter-less intent → null", () => {
  assertEquals(sigilPath(""), null);
  assertEquals(sigilPath("   42 !! "), null);
});

Deno.test("sigil: different intents diverge (planet or path)", () => {
  const a = sigilPath("courage");
  const b = sigilPath("serenity");
  const diff = a.planet !== b.planet ||
    a.points.length !== b.points.length ||
    JSON.stringify(a.points) !== JSON.stringify(b.points);
  assert(diff, "two unrelated intents produced an identical sigil");
});

Deno.test("sigil: hash32 stable, smooth expands a short path", () => {
  assertEquals(hash32("abc"), hash32("abc"));
  assert(hash32("abc") !== hash32("abd"));
  const pts = [{ x: -0.5, y: 0 }, { x: 0, y: 0.5 }, { x: 0.5, y: 0 }];
  assert(smooth(pts, 10).length > pts.length, "smooth should add samples");
});
