// iching — the Yijing (易經) casting math. Pure functions over numbers: no DOM, no store, no text.
// The hexagram DATA (names, canonical text) is app-owned, like apps/tarot/deck.js; this module owns only
// what can be got WRONG silently, which is all of it.
//
// Everything here is sourced in docs/research/iching.md. The three facts that matter:
//
// 1. THE TWO METHODS ARE NOT THE SAME DISTRIBUTION, and this is the thing digital I Ching apps erase.
//    Three coins are symmetric: 6 and 9 both 1/8. Yarrow stalks are NOT: 6 is 1/16 but 9 is 3/16, so a
//    yang→yin change is three times likelier than yin→yang. Picking a uniform random 6..9 — the usual
//    shortcut — is neither, and it silently changes what the oracle says.
//
// 2. LINES ARE BUILT BOTTOM-UP. The first line cast is the BOTTOM line (初爻), the sixth is the top (上爻).
//    Getting this backwards yields a different, perfectly valid-looking hexagram, with no error anywhere.
//    So the array is bottom-first, always, and only the renderer reverses.
//
// 3. INVERSION IS NOT TRANSFORMATION. Inversion (反卦) reverses the line ORDER and is what relates King Wen
//    pairs. Transformation flips the MOVING lines and is what produces the second hexagram of a reading.
//    They are different operations on the same six bits and the farm's own naming keeps them apart.

/** Line values. 6 and 9 move; 7 and 8 are static. */
export const OLD_YIN = 6, YOUNG_YANG = 7, YOUNG_YIN = 8, OLD_YANG = 9;

/**
 * Casting weights, as exact integer ratios rather than floats — the ratio IS the fact, and a float
 * would invite "close enough".
 *   coins:  1:3:3:1 over 8    (three coins, heads=3 tails=2, summed)
 *   yarrow: 1:5:7:3 over 16   (the classical modulo-class model of the 49-stalk procedure)
 */
export const METHODS = {
  coins: { id: "coins", weights: { 6: 1, 7: 3, 8: 3, 9: 1 }, total: 8 },
  yarrow: { id: "yarrow", weights: { 6: 1, 7: 5, 8: 7, 9: 3 }, total: 16 },
};

// Both methods produce a moving line exactly 1/4 of the time — coins 2/8, yarrow 4/16. What differs is
// WHICH way it moves. Asserted in the unit test so a future edit to the weights cannot break it quietly.

/** Draw one line value from a method, given a random source in [0,1). */
export function castLine(method = "yarrow", rnd = Math.random) {
  const m = METHODS[method];
  if (!m) throw new Error(`iching: unknown method "${method}"`);
  let n = Math.floor(rnd() * m.total);
  for (const v of [6, 7, 8, 9]) {
    n -= m.weights[v];
    if (n < 0) return Number(v);
  }
  return YOUNG_YIN;                       // unreachable while the weights sum to total
}

/** Six line values, BOTTOM FIRST. `lines[0]` is the bottom line (line 1). */
export function cast(method = "yarrow", rnd = Math.random) {
  return Array.from({ length: 6 }, () => castLine(method, rnd));
}

/** Line value → bit. 6 and 8 are yin (0); 7 and 9 are yang (1). */
export const bitOf = (v) => (v === YOUNG_YANG || v === OLD_YANG ? 1 : 0);
/** Only 6 and 9 move. */
export const isMoving = (v) => v === OLD_YIN || v === OLD_YANG;

/** Six line values → six bits, bottom first. */
export const bitsOf = (lines) => lines.map(bitOf);

/**
 * The transformed hexagram: every moving line flips, simultaneously.
 * 6 (old yin) → yang, 9 (old yang) → yin. Static lines are untouched.
 * With no moving lines this equals the primary — the caller should say "no moving lines" rather than
 * present an identical second hexagram as a consequence.
 */
export const transform = (lines) => lines.map((v) => (isMoving(v) ? 1 - bitOf(v) : bitOf(v)));

/** Which lines move, as 1-based positions counted from the BOTTOM. */
export const movingLines = (lines) => lines.reduce((a, v, i) => (isMoving(v) ? [...a, i + 1] : a), []);

/** Bits (bottom-first) → an integer key, bit 0 = bottom line. */
export const keyOf = (bits) => bits.reduce((n, b, i) => n | (b << i), 0);
/** …and back. */
export const bitsFromKey = (k) => Array.from({ length: 6 }, (_, i) => (k >> i) & 1);

// ── the eight trigrams (bagua) ────────────────────────────────────────────────────────────────────
// `bits` is bottom-first, matching everything else here. The common way to get this wrong is to copy a
// table written top-first (as the Unicode glyphs are drawn) into a bottom-first runtime.
export const TRIGRAMS = [
  { key: 0b000, cn: "坤", pinyin: "Kūn", en: "Earth", glyph: "☷" },
  { key: 0b001, cn: "震", pinyin: "Zhèn", en: "Thunder", glyph: "☳" },
  { key: 0b010, cn: "坎", pinyin: "Kǎn", en: "Water", glyph: "☵" },
  { key: 0b011, cn: "兌", pinyin: "Duì", en: "Lake", glyph: "☱" },
  { key: 0b100, cn: "艮", pinyin: "Gèn", en: "Mountain", glyph: "☶" },
  { key: 0b101, cn: "離", pinyin: "Lí", en: "Fire", glyph: "☲" },
  { key: 0b110, cn: "巽", pinyin: "Xùn", en: "Wind", glyph: "☴" },
  { key: 0b111, cn: "乾", pinyin: "Qián", en: "Heaven", glyph: "☰" },
];
export const trigramOf = (k) => TRIGRAMS[k & 0b111];
/** Lines 1-3 are the lower (inner) trigram, 4-6 the upper (outer). */
export const lowerTrigram = (bits) => trigramOf(keyOf(bits.slice(0, 3)));
export const upperTrigram = (bits) => trigramOf(keyOf(bits.slice(3, 6)));

// ── King Wen order ───────────────────────────────────────────────────────────────────────────────
// KING_WEN[n - 1] is the bit key of hexagram n. This is a canonical fixture, not a derivation: there is
// no accepted algorithm that generates the King Wen order, so it can only be transcribed — and therefore
// it has to be CHECKED. The unit test validates it three ways (pair rule, completeness, anchors), which
// between them catch a flipped bit, a duplicate, a wrong partner and a reversed reading direction.
export const KING_WEN = [
  0b111111, 0b000000, 0b010001, 0b100010, 0b010111, 0b111010, 0b000010, 0b010000,
  0b110111, 0b111011, 0b000111, 0b111000, 0b111101, 0b101111, 0b000100, 0b001000,
  0b011001, 0b100110, 0b000011, 0b110000, 0b101001, 0b100101, 0b100000, 0b000001,
  0b111001, 0b100111, 0b100001, 0b011110, 0b010010, 0b101101, 0b011100, 0b001110,
  0b111100, 0b001111, 0b101000, 0b000101, 0b110101, 0b101011, 0b010100, 0b001010,
  0b100011, 0b110001, 0b011111, 0b111110, 0b011000, 0b000110, 0b011010, 0b010110,
  0b011101, 0b101110, 0b001001, 0b100100, 0b110100, 0b001011, 0b001101, 0b101100,
  0b110110, 0b011011, 0b110010, 0b010011, 0b110011, 0b001100, 0b010101, 0b101010,
];

const _index = new Map(KING_WEN.map((k, i) => [k, i + 1]));
/** Bit key → King Wen number 1..64. */
export const kingWenOf = (key) => _index.get(key);
/** Six bits (bottom-first) → King Wen number. */
export const hexagramNumber = (bits) => kingWenOf(keyOf(bits));

/** Inversion (反卦): reverse the line order. This is what relates King Wen pairs. */
export const invert = (bits) => [...bits].reverse();
/** Complement (錯卦): flip every line. The partner rule for the eight self-inverse hexagrams. */
export const complement = (bits) => bits.map((b) => 1 - b);

/**
 * A complete reading, from six cast line values.
 * Everything a view needs, and nothing it has to derive itself — deriving `moving` or the transformed
 * hexagram in a template is how the two get confused.
 */
export function reading(lines) {
  const bits = bitsOf(lines);
  const moving = movingLines(lines);
  const toBits = transform(lines);
  return {
    lines,                                   // 6/7/8/9, bottom first
    bits,
    number: hexagramNumber(bits),
    lower: lowerTrigram(bits),
    upper: upperTrigram(bits),
    moving,                                  // 1-based from the bottom
    // A reading with no moving lines has ONE hexagram. Reporting an identical second one as a result
    // is the app inventing a change the cast did not produce.
    changing: moving.length > 0,
    toBits: moving.length ? toBits : null,
    toNumber: moving.length ? hexagramNumber(toBits) : null,
  };
}
