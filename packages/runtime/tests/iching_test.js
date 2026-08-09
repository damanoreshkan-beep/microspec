
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  METHODS, castLine, cast, bitOf, isMoving, bitsOf, transform, movingLines,
  keyOf, bitsFromKey, TRIGRAMS, trigramOf, lowerTrigram, upperTrigram,
  KING_WEN, kingWenOf, hexagramNumber, invert, complement, reading,
} from "../iching.js";

const bits = (s) => [...s].map(Number);          
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test("the two methods are DIFFERENT distributions", () => {
  assertEquals(METHODS.coins.weights, { 6: 1, 7: 3, 8: 3, 9: 1 });
  assertEquals(METHODS.coins.total, 8);
  assertEquals(METHODS.yarrow.weights, { 6: 1, 7: 5, 8: 7, 9: 3 });
  assertEquals(METHODS.yarrow.total, 16);
  for (const m of Object.values(METHODS)) {
    assertEquals(Object.values(m.weights).reduce((a, b) => a + b), m.total, `${m.id} weights must sum to total`);
  }
  assertEquals(METHODS.coins.weights[6], METHODS.coins.weights[9]);
  assertEquals(METHODS.yarrow.weights[9], 3 * METHODS.yarrow.weights[6]);
});

Deno.test("both methods move a line exactly 1/4 of the time", () => {
  for (const m of Object.values(METHODS)) {
    const moving = m.weights[6] + m.weights[9];
    assertEquals(moving * 4, m.total, `${m.id}: P(moving) must be 1/4, got ${moving}/${m.total}`);
  }
  for (const m of Object.values(METHODS)) {
    assertEquals(m.weights[6] + m.weights[8], m.weights[7] + m.weights[9], `${m.id}: yin/yang must be balanced`);
  }
});

Deno.test("castLine reproduces the exact weights across the whole range", () => {
  for (const [id, m] of Object.entries(METHODS)) {
    const seen = { 6: 0, 7: 0, 8: 0, 9: 0 };
    for (let i = 0; i < m.total; i++) seen[castLine(id, () => (i + 0.5) / m.total)]++;
    assertEquals(seen, m.weights, `${id}: castLine does not match its own weights`);
  }
});

Deno.test("an unknown method throws rather than silently defaulting", () => {
  assertThrows(() => castLine("dice"), Error, "unknown method");
});

Deno.test("6 and 8 are yin, 7 and 9 are yang; only 6 and 9 move", () => {
  assertEquals([6, 7, 8, 9].map(bitOf), [0, 1, 0, 1]);
  assertEquals([6, 7, 8, 9].map(isMoving), [true, false, false, true]);
});

Deno.test("transformation flips ONLY the moving lines, simultaneously", () => {
  const lines = [6, 7, 8, 9, 7, 8];                   
  assertEquals(bitsOf(lines), [0, 1, 0, 1, 1, 0]);
  assertEquals(transform(lines), [1, 1, 0, 0, 1, 0]); 
  assertEquals(movingLines(lines), [1, 4]);           
});

Deno.test("no moving lines means ONE hexagram, not an identical second one", () => {
  const r = reading([7, 8, 7, 8, 7, 8]);
  assertEquals(r.changing, false);
  assertEquals(r.toBits, null, "a reading with no change must not present a second hexagram");
  assertEquals(r.toNumber, null);
  assertEquals(r.moving, []);
});

Deno.test("inversion and transformation are DIFFERENT operations", () => {
  const b = bits("110100");
  assertEquals(invert(b), bits("001011"), "inversion reverses line order");
  assertEquals(complement(b), bits("001011").map((x) => x), "…which here coincides — so use a second case");
  const c = bits("111000");
  assertEquals(invert(c), bits("000111"));
  assertEquals(complement(c), bits("000111"));
  const d = bits("110000");
  assertEquals(invert(d), bits("000011"));
  assertEquals(complement(d), bits("001111"), "complement flips values, inversion reverses order");
});

Deno.test("eight trigrams, bottom-first bits, no duplicates", () => {
  assertEquals(TRIGRAMS.length, 8);
  assertEquals(new Set(TRIGRAMS.map((t) => t.key)).size, 8);
  assertEquals(TRIGRAMS.map((t) => t.key), [0, 1, 2, 3, 4, 5, 6, 7]);
  assertEquals(trigramOf(0b001).cn, "震", "Thunder = yang in the bottom line");
  assertEquals(trigramOf(0b100).cn, "艮", "Mountain = yang in the top line");
  assertEquals(trigramOf(0b111).cn, "乾");
  assertEquals(trigramOf(0b000).cn, "坤");
});

Deno.test("lines 1-3 are the lower trigram, 4-6 the upper", () => {
  const b = bits("111000");                     
  assertEquals(lowerTrigram(b).cn, "乾", "Heaven below");
  assertEquals(upperTrigram(b).cn, "坤", "Earth above");
});

Deno.test("keyOf/bitsFromKey round-trip, bit 0 = bottom line", () => {
  assertEquals(keyOf(bits("100000")), 1, "the bottom line is bit 0");
  assertEquals(keyOf(bits("000001")), 32, "the top line is bit 5");
  for (let k = 0; k < 64; k++) assertEquals(keyOf(bitsFromKey(k)), k);
});

Deno.test("King Wen: 64 entries, all distinct, covering every pattern", () => {
  assertEquals(KING_WEN.length, 64);
  assertEquals(new Set(KING_WEN).size, 64, "a duplicate means one hexagram is missing");
  assertEquals([...KING_WEN].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i));
});

Deno.test("King Wen: the pair rule holds for all 32 pairs", () => {
  for (let i = 0; i < 64; i += 2) {
    const a = bitsFromKey(KING_WEN[i]), b = bitsFromKey(KING_WEN[i + 1]);
    const rev = invert(a);
    if (!eq(a, rev)) {
      assert(eq(b, rev), `hexagrams ${i + 1}/${i + 2}: second is not the inversion of the first`);
    } else {
      assert(eq(b, complement(a)), `hexagrams ${i + 1}/${i + 2}: self-inverse pair must be complements`);
    }
  }
});

Deno.test("King Wen: exactly 8 hexagrams are their own inversion", () => {
  const selfInverse = KING_WEN.filter((k) => eq(bitsFromKey(k), invert(bitsFromKey(k))));
  assertEquals(selfInverse.length, 8);
  assertEquals(selfInverse.map((k) => kingWenOf(k)).sort((a, b) => a - b), [1, 2, 27, 28, 29, 30, 61, 62]);
});

Deno.test("King Wen: anchors — the pair rule cannot detect a permutation of whole pairs", () => {
  assertEquals(hexagramNumber(bits("111111")), 1, "Qian, all yang");
  assertEquals(hexagramNumber(bits("000000")), 2, "Kun, all yin");
  assertEquals(hexagramNumber(bits("111000")), 11, "Tai — Heaven below, Earth above");
  assertEquals(hexagramNumber(bits("000111")), 12, "Pi — Earth below, Heaven above");
  assertEquals(hexagramNumber(bits("101010")), 63, "既濟 Jiji — water over fire, after completion");
  assertEquals(hexagramNumber(bits("010101")), 64, "未濟 Weiji — fire over water, before completion");
  assertEquals(lowerTrigram(bits("101010")).cn, "離", "63: fire below");
  assertEquals(upperTrigram(bits("101010")).cn, "坎", "63: water above");
});

Deno.test("a full reading reports both hexagrams and the moving lines", () => {
  const r = reading([9, 8, 8, 8, 8, 8]);         
  assertEquals(r.number, hexagramNumber(bits("100000")));
  assertEquals(r.moving, [1]);
  assertEquals(r.changing, true);
  assertEquals(r.toBits, bits("000000"));
  assertEquals(r.toNumber, 2, "old yang at the bottom of a yin field transforms into Kun");
});

Deno.test("cast produces six lines, all legal values", () => {
  const lines = cast("yarrow", () => 0.5);
  assertEquals(lines.length, 6);
  for (const v of lines) assert([6, 7, 8, 9].includes(v), `illegal line value ${v}`);
});
