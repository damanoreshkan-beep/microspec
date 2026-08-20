# hoard — research

What the build had to get right in one pass: the accrual model, the persistence shape, and a molten-gold
field that reads as a dragon's hoard rather than a progress bar. Every load-bearing claim below was checked
against the primary source named beside it; the shader numbers were all read off a real Chromium render on
the VPS eye, never estimated.

## 1. The accrual model — the WORK clock, not the calendar

The brief asks for "how much you earn per second" from a monthly salary, a shift, or a full working day,
with a start and a stop button. Those two facts settle the model between them:

| | monthly salary ÷ … | a month of work at 30 000 |
|---|---|---|
| calendar seconds | 2 592 000 s | 0,0116 ₴/s |
| **work seconds (21 d × 8 h)** | **604 800 s** | **0,0496 ₴/s** |

A calendar rate ticks while you sleep, which makes a start button meaningless — you would never stop it. So
the divisor is the seconds you actually work, and the button is what says when those are.
`packages/runtime/earn.js:perSecond`, pinned by `tests/earn_test.js` ("the work clock, not the calendar").

`shift` and `day` are the SAME formula (pay ÷ hours ÷ 3600) at different default block lengths — 12 h and
8 h. Kept as two modes anyway, because the label is what tells the person which number to type; the code
is one path, not two (`DEFAULTS`, and the "shift and day are the same formula" test).

**Known consequence, accepted:** changing the rate mid-session re-prices the whole elapsed span, since the
amount is always `perSecond(rate) × elapsed`. That reads correctly ("at this rate, I have earned X") and
avoids storing a rate history for a stopwatch.

## 2. Elapsed time survives everything, because it is never counted

`hoard:startedAt` is a millisecond epoch in `localStorage` (the owner asked for the timestamp explicitly,
and it is also the only correct design). Every number derives from `Date.now() - startedAt`:

- an accumulator advanced per tick drifts the moment the tab is backgrounded — `requestAnimationFrame` does
  not run on a hidden tab, which `glstage.js:frame` relies on for its own draw skip;
- a reload, a phone restart or eight hours with the screen off all resolve to the same subtraction.

The e2e pins it ("час рахується від збереженої мітки"): reload mid-session, the amount must not go down.

## 3. Storage: IndexedDB for the sessions, localStorage for the two settings

`packages/runtime/db.js` `collection(name)` is the farm's IndexedDB helper — one shared DB, records
namespaced by an indexed `coll` field, `all()` newest-first. Right for banked sessions (hundreds of small
records, async, no quota anxiety). `persistentAtom` (localStorage) holds only the rate object and the start
timestamp — two values that must be readable synchronously on first paint.

Both paths are guarded: `db.js` rejects where `indexedDB` is absent (preflight/linkedom), and every call
site falls back to an in-memory list rather than rendering nothing.

## 4. The field — what was actually measured

Target named before any tuning, per the design rules: 21st's **"WebGL Liquid"** (`21st.dev` id 18531,
`mcp__21st__get_component`) — a cinematic domain-warped liquid, not a lit object. Its shader turns out to be
the recipe this farm already documents (`n1/n2/n3` at 2.8/4.0/6.5 through a rotated fbm,
`mat2(0.86,0.51,-0.51,0.86)`), which is a confirmation rather than an import: nothing was copied.
`Gem Smoke` (id 21868) supplied the second idea — a glowing mass with a smoke rim, not an outline.

Four things were wrong in the first render and only visible in the PNG. Both fixes are in the shader's own
comments so nobody re-derives them:

1. **Frequencies are in FRAME HEIGHTS, and p.x is tiny.** `p = (uv-0.5)*vec2(aspect,1.0)` makes the p-unit
   the frame HEIGHT, so at 384×832 p.x spans only ±0.23. The first cut wrote `fbm(p*1.6)` — less than ONE
   noise cell across the entire width — and rendered as a flat amber slab with no structure whatever. The
   multiplier for N features across the width is **N × (height/width) = N × 2.17** at the reference device;
   a cell at frequency f is 832/f px and fbm doubles four times. Shipping: 4.3 / 10.8 / 19.5.
2. **A `floor(coord/n)` hash is a visible LATTICE.** The glints rendered as an aligned grid of dots. Jitter
   the point inside its cell (`gj = vec2(hash(gi+7.1), hash(gi+3.3))`) and use a radial falloff.
3. **`crest` is 1 everywhere ABOVE the pile.** The glints were gated on `crest` alone and sprinkled across
   the empty sky. They must be multiplied by `mass`.
4. **Gold under a flat luminance ceiling is khaki.** What makes metal read as metal is a few per cent of
   pixels going far brighter than the body ever does. So the rim and gems are allowed past the clamp — and
   the licence is bought with a **height gate**: the overshoot fades out over up 0.50..0.62 while the amount
   block sits at 0.65..0.78, so no glint can ever brighten the ground under the type.

**The amplitude budget** (display space), which is a contract, not a look — axe cannot see a canvas:

| theme | band | measured against | ratio |
|---|---|---|---|
| dark | [0.085, 0.36] | `base-content` #EDEDF0, linear 0.749 | (0.749+0.05)/(0.36^2.2+0.05) = **5.1:1** |
| light | [0.50, 0.88] | `base-content` #0A0A0C, linear 0.0034 | (0.472^2.2+0.05)/(0.0534) = **4.5:1** at the floor |
| specular | ≤0.62 dark / ≤0.97 light | height-gated below up 0.62 | never under the type |

The light band is DARKER than the page on purpose. The first light pass used [0.58, 0.95] and rendered as
lemon candy: on near-white paper gold has to be darker than the paper, and the body additionally needs a
`pow(f, 1.7)` push so only the highlights climb the band.

**The crest tops out at 0.60 of the frame height**, so a full hoard rises *toward* the amount block and
never behind it.

## 5. Judging GLSL without a browser on this device

`tools/art/hero.mjs` renders WGSL only, and Chromium is banned locally. The path used here (from
`[[reference_glstage_presence]]`) is a self-contained page with the shader INLINED — a `fetch()` of a
sibling is blocked under `file://` — scp'd to `vps:~/eye/out/` and shot with `node shot.mjs` directly
(`eye.sh` matches `http*` only). Generator: the session scratchpad's `gen.mjs`. It draws SIX states into one
sheet (idle new · idle seasoned · running 1 h / 4 h / 8 h / full) at 384×832 each, because a data-driven
field has twenty looks and a pretty frame proves nothing about the other nineteen. ~40 s per sheet.

## UNVERIFIED

- Nothing here depends on it, but the exact sRGB→linear conversion above uses the `x^2.2` approximation
  rather than the piecewise sRGB curve. The margin at both floors (5.1:1 and 4.5:1 against a 4.5 target) is
  larger than the approximation's error, and the CI axe gate does not read canvases either way.
