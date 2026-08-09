# Yijing (易經) — research note

**Date:** 2026-08-08. The long read was delegated to Codex (briefed read-only; `git status --short` clean
afterwards). What follows is **mine**: every load-bearing claim carries how *I* validated it, and the
UNVERIFIED section is the part the build must not depend on.

Note on the name: 易経 is the Japanese spelling (*Ekikyō*). Chinese is 易經 (traditional) / 易经 (simplified),
*Yìjīng*. The app uses the Chinese form.

## 0. The finding that makes this app honest

**The two traditional casting methods are not the same distribution, and almost every digital I Ching
erases the difference by drawing a uniform random 6–9.**

| line | meaning | three coins | yarrow stalks |
|---|---|---|---|
| 6 | old yin — moves to yang | 1/8 | **1/16** |
| 7 | young yang — static | 3/8 | 5/16 |
| 8 | young yin — static | 3/8 | 7/16 |
| 9 | old yang — moves to yin | 1/8 | **3/16** |

Coins are symmetric. Yarrow is not: **a yang→yin change is three times likelier than yin→yang**, and
static yin (7/16) outweighs static yang (5/16). Both methods move a line exactly 1/4 of the time — what
differs is *which way*. A uniform 6–9 is neither, and it quietly changes what the oracle says.

**How I validated it.** I derived the yarrow fractions from the procedure rather than copying them. First
change: 49 stalks, one set aside, so `left + (right − 1) = 48 ≡ 0 mod 4`. Of the four residue classes one
removes 9 and three remove 5 → P(9)=1/4, P(5)=3/4. Second and third changes start from a multiple of 4, so
after setting one aside the sum is ≡ −1 mod 4 → two classes each → 1/2 and 1/2. Then:

```
9 = 5+4+4 → 3/4 · 1/2 · 1/2 = 3/16      8 = 5+4+8, 5+8+4, 9+4+4 → 7/16
7 = 5+8+8, 9+4+8, 9+8+4 → 5/16          6 = 9+8+8 → 1/4 · 1/2 · 1/2 = 1/16
```

Sums to 16/16. Codex reached the same fractions independently from *Xici* I.9 (`大衍之數五十，其用四十有九`),
via Legge 1882.

## 1. The caveat that came out of simulating it

I also implemented the physical procedure and **measured** it over 2,000,000 lines — and it did **not**
reproduce the canonical fractions:

| | 6 | 7 | 8 | 9 |
|---|---|---|---|---|
| canonical (modulo-class model) | .0625 | .3125 | .4375 | .1875 |
| measured, uniform-random cut position | .048 | .278 | .452 | .222 |

The canonical fractions assume the residue classes are equiprobable. A physical split of a bundle — modelled
as a uniform random cut point — does not make them so. Codex flagged the same limit independently: *Xici*
prescribes ritual operations, not a probability model of a human dividing a heap.

**Consequence for the build:** the app draws 6/7/8/9 directly from the weights `1:5:7:3`. It does **not**
simulate a cut, because a simulated cut is a different distribution wearing the tradition's name.

(First measurement of this was wrong in a way worth recording: my throwaway LCG had correlated low bits and
reported coins as .133/.385/.366/.115 instead of .125/.375/.375/.125. The bias was the same size as the
effect being measured. Re-run with `crypto.getRandomValues`, coins landed exact.)

## 2. Structure — the three things that fail silently

- **Lines are built bottom-up.** The first line cast is the bottom line (初爻); the sixth is the top (上爻).
  Reversed, you get a different, entirely valid-looking hexagram and no error anywhere. The runtime array
  is bottom-first always; only the renderer reverses.
- **Inversion ≠ transformation.** Inversion (反卦) reverses line ORDER and is what relates King Wen pairs.
  Transformation flips the MOVING lines and produces the second hexagram of a reading. Different operations
  on the same six bits; `iching.js` names them apart.
- **No moving lines means ONE hexagram.** With no 6 or 9 the "transformed" hexagram is identical to the
  primary. Presenting it as a second result is the app inventing a change the cast did not produce.

Trigram bits are bottom-first too. The classic error is copying a table written top-first (the way the
Unicode glyphs are drawn), which swaps 震 (yang at the bottom) with 艮 (yang at the top) and nothing notices.

## 3. King Wen order — transcribed, therefore checked

There is **no accepted algorithm** that generates the King Wen sequence, so the table can only be copied —
and must therefore be validated. Three independent checks, all in `tests/iching_test.js`:

1. **Pair rule.** For each pair (1,2), (3,4) … the second is the inversion of the first; if the first is its
   own inversion, the second is its complement. Catches a flipped bit or a wrong partner.
2. **Completeness.** 64 entries, all distinct, covering every pattern 0..63. Catches a duplicate or omission.
3. **Anchors.** 1, 2, 11, 12, 63, 64 asserted by meaning. The pair rule structurally *cannot* detect a
   permutation of whole pairs, so anchors are not optional.

Exactly 8 hexagrams are their own inversion — a six-bit palindrome is fixed by its first three, so 2³ — and
they are 1, 2, 27, 28, 29, 30, 61, 62, forming four complement pairs.

**This process earned its keep twice.** My first table, written from memory, failed all three checks
(既濟 came out 64th). And when the sourced table failed only the anchor, the error turned out to be in **my
test**: 既濟 is 水火既濟, water *over* fire — lower 離 = `101`, upper 坎 = `010`, so `101010`. The table was
right and my memory was wrong, which is exactly why anchors assert against meaning rather than recall.

Table source: Wikipedia *King Wen sequence*, cross-checked structurally here. Names cross-checked against
Chinese Text Project.

## 4. Text and copyright — what may go in a public repo

- **Legge 1882** (*The Yî King*, Sacred Books of the East XVI) is public domain — pre-1931 US publication,
  and Legge died 1897 so life+70 expired long ago. Machine-readable at Wikisource and Internet Archive.
- **Wilhelm/Baynes is NOT.** The German original is 1924, but the Baynes English translation is 1950 and
  Baynes died 1989: US protection can run to end-2045, life+70 jurisdictions to end-2059. A translation
  carries its own copyright regardless of the age of what it translates. **Do not put it in the repo.**
- Modern translations (Blofeld, Lynn, Rutt, Huang, Minford) are likewise protected.
- The Chinese original is ancient and free of authorial copyright; a specific modern edition's markup may
  not be.

Minimum canonical set per hexagram: number, Chinese name, hexagram statement (卦辭 — what Wilhelm calls
"Judgment"), the Great Image (大象傳), and six line texts (爻辭). Note the trap: popular apps label 彖傳
"Judgment", which is a different textual layer from 卦辭.

## 5. UNVERIFIED — the build must not depend on these

- **Whether Legge's phrasing reads well to a modern Ukrainian speaker.** The translation is 1882 English;
  faithful, but archaic. Whether to show it, paraphrase it, or synthesise a reading around the structure is
  a product decision, not a settled one.
- **The claim that Jing Fang invented the coin method** in the 1st century BCE is widely repeated and, per
  Codex, not safely attributable. The app should not state it.
- **Everything about interpretation.** The math is exact; what a hexagram *means* for someone is not, and
  the app must not present a generated reading as canonical text.
