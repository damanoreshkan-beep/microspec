// microspec runtime — tarot unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { SPREADS, spreadById, hashSeed, draw } from "../tarot.js";

Deno.test("tarot SPREADS: sizes match the layouts, positions unique", () => {
  assertEquals(SPREADS.map((s) => s.pos.length), [1, 3, 3, 3, 6, 5, 4, 6, 5, 6, 10], "spread sizes");
  for (const s of SPREADS) assertEquals(new Set(s.pos).size, s.pos.length, `${s.id} positions must be unique`);
  assertEquals(spreadById("celtic").pos.length, 10);
  assertEquals(spreadById("nope").id, "daily", "unknown id falls back to the first spread");
});

Deno.test("tarot SPREADS: rows place every position exactly once", () => {
  for (const s of SPREADS) {
    if (!s.rows) continue;
    const flat = s.rows.flat();
    assertEquals(flat.length, s.pos.length, `${s.id} rows must cover all positions`);
    assertEquals([...flat].sort((a, b) => a - b), s.pos.map((_, i) => i), `${s.id} rows are a permutation of positions`);
  }
});

Deno.test("tarot draw: majorOnly stays within the 22 Major Arcana", () => {
  const d = draw(98765, 6, 22);
  assertEquals(d.length, 6, "draws 6 cards");
  assertEquals(new Set(d.map((x) => x.card)).size, 6, "cards are distinct");
  for (const x of d) assert(x.card >= 0 && x.card < 22, `card ${x.card} is a Major Arcanum (0..21)`);
});

Deno.test("tarot hashSeed: deterministic uint32", () => {
  assertEquals(hashSeed("2027-07-23"), hashSeed("2027-07-23"), "same string → same seed");
  assert(hashSeed("a") !== hashSeed("b"), "different strings → different seeds");
  const h = hashSeed("2027-07-23");
  assert(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, "seed is uint32");
});

Deno.test("tarot draw: deterministic per seed; distinct in-range cards; orientation is bool", () => {
  const a = draw(12345, 10), b = draw(12345, 10);
  assertEquals(JSON.stringify(a), JSON.stringify(b), "same seed+size → same draw");
  assertEquals(a.length, 10, "draws `size` cards");
  assertEquals(new Set(a.map((d) => d.card)).size, 10, "cards are DISTINCT (no card twice in a spread)");
  for (const d of a) { assert(d.card >= 0 && d.card < 78, `card ${d.card} in range`); assertEquals(typeof d.reversed, "boolean"); }
});

Deno.test("tarot draw: a different seed gives a different spread", () => {
  assert(JSON.stringify(draw(1, 3)) !== JSON.stringify(draw(2, 3)), "different seed → different draw");
});
