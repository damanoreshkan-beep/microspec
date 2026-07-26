# Claymorphism — the measured recipe

Research note for the farm-wide migration of `signal` / `signal-light` from an ink palette to clay.
Everything below is either **measured** from a reference file or **sourced**; anything that is neither is
marked as such.

## Why this note exists

The farm already owns the *mechanism* — `.sf-raised` / `.sf-inset` / `.sf-pressed` (theme.css:327-346) are
built on exactly the three shadows claymorphism is made of. What changes is **values**, not structure:

1. the palette becomes warm (greige page, clay surfaces) instead of ink, and
2. **the drop shadow is tinted with the surface hue** instead of neutral black.

That second line is the whole style. A grey shadow under a pastel surface reads as "a card with a shadow";
a warm shadow under a warm surface reads as clay.

## The style, sourced

Term coined by Michal Malewicz (Hype4 Academy) as an answer to the inflated-3D trend. Canonical recipe is
three shadows in one `box-shadow` plus a large radius:

```css
border-radius: 32px;                            /* 20–40px; below ~20 the volume reads as a plain shadow */
background: #d4dbdb;
box-shadow:
  35px 35px 68px 0 rgba(145,192,255,.5),        /* outer — TINTED with the surface hue */
  inset -8px -8px 16px 0 rgba(145,192,255,.6),  /* inner shade: bottom-right */
  inset  0  11px 28px 0 rgb(255,255,255);       /* inner highlight: top */
```

Sources: [Hype4 — how to create claymorphism](https://hype4.academy/articles/coding/how-to-create-claymorphism-using-css) ·
[Claymorphism generator](https://hype4.academy/tools/claymorphism-generator) ·
[LogRocket](https://blog.logrocket.com/implementing-claymorphism-css/) ·
[clay.css](https://codeadrian.github.io/clay.css/) ·
[tailwindcss-claymorphism](https://github.com/dulltackle/tailwindcss-claymorphism) ·
[Setproduct guide](https://www.setproduct.com/blog/claymorphism-design-guide)

**Why it is not neumorphism.** Neumorphism extrudes the element from the background *in the same colour*,
so it structurally cannot carry contrast — that is why it died. Claymorphism lays a distinct surface **over**
the page and tints the shadow, so contrast survives by construction. They look alike and are built
oppositely; do not copy neumorphism's "same colour, embossed" move.

## Measured — reference B (the dark/light board pair)

`i.pinimg.com/originals/8d/ff/8e/8dff8edbed34f4063d15643b48d2eb06.png`, 1024×1024, measured with
imagescript in Deno. **The file is AI-generated**: its text is unreadable noise, so nothing about
typography or geometry is taken from it. Palette and the page/surface/shadow deltas are the usable signal.

| What | Value |
|---|---|
| page, outside the boards | `#e8e1d9` · L=226 |
| light board face | `#e2d8c8` · L=217 |
| shadow under the light board | `#715a48` · L=94 (min), recovering to 142 |
| dark board face | `#352a30` · L=45 (aubergine, **not** near-black) |
| dark board inner card | `#272226` · L=35 |
| accent — orange / terracotta | `#e8ad70` · L=181 |
| accent — pastel green | `#bed6c4` · L=208 |
| accent — lavender | `#bea8bc` · L=174 |
| cream wave on the dark side | `#ceb59c` · L=185 |

**Top-edge profile** of the light board (x=300): `231 → 217`. The page above is 231, the face is 217.

**Vertical profile through a pastel-green button** (x=610): `209 → 200 (face) → 235 (specular) → 203 →
198 → 155 (bottom shade) → 98 (cast shadow)`.

### What the numbers actually say

- **There are THREE levels, not two — and reading it as two is what failed the gate in all 58 apps.**
  Outer canvas 231 → board/container 217 → the cards *on* the board, lighter again. A **container** sits
  below its page; a **card** sits above its container. The −14 is real, but it describes the *board*, not
  a card. I first applied the board's colour to `base-100` (the farm's card), which darkened every
  surface in the farm and cost `text-base-content/60` its contrast — 4.57:1 → 3.72:1, axe-serious in
  every app at once. In the farm's two levels: `base-100` (card) is the LIGHTER, `base-200` (page)
  carries the cream.
- **Volume is edge contrast, not fill.** The green button's face barely moves (209→200) while the inner
  highlight jumps to **235 (+35)** and the bottom shade drops to **155 (−45)**. Lightening the *face* is
  what flattens clay — the farm's surface system already encodes this ("a raised surface is not a lighter
  fill").
- **The shadow is warm, not grey.** `#715a48` under the board. Hue-matched to the surface, which is the
  single highest-signal difference from a generic card shadow.
- **Dark clay exists, and it is aubergine.** L=45 with pastel marks on top. Clay fails on *near-black*
  (a #0A0A0B base gives grey inflated buttons), not on darkness itself. This corrects the earlier claim
  that "a dark theme cannot be clay" — it can, at L≈35-55 and with a hue.

### Corrected from the earlier note

The earlier report generalised "**all coloured surfaces hold equal lightness**" into a law. It does **not**
hold on this reference: green 208/216, lavender 174/177, orange 181/196 — a spread of ~40, not ~15. Treat
equal-lightness as a *technique* for keeping text contrast uniform across coloured cards, not as a property
of the style. Where the farm puts text on a coloured surface, apply it deliberately.

## Pitfalls

1. **Pastel + soft shadows pull text under 4.5:1 — and the failure arrives through ALPHA, not colour.**
   Every *solid* content-on-surface pair can pass (they did: tightest 4.91:1) while the farm still fails
   axe in all 58 apps, because what it renders is `text-base-content/60` — an alpha composited over the
   surface. 60% of a warm ink on a cream card is **3.72:1** where the same ink at 100% is 11:1. Muted
   text is the binding constraint of ANY light theme: the old ink theme cleared it by 0.07 (4.57:1).
   **The warmth budget of a light clay theme is set by that number, not by taste.**
   `runtime_test.js` now computes the composited pair locally — it reproduces axe's 3.72 exactly, so this
   never needs a CI round to discover again.
2. **A grey shadow kills the effect.** Tint it with the surface hue.
3. **Radius is half the effect.** Below ~20px the volume reads as an ordinary drop shadow.
4. **Near-black cannot be clay.** Give the dark theme a hue (aubergine/warm brown) and L≈35-55.
5. **Cost per element is unmeasured.** Three shadows × every surface × 59 apps — no benchmark found.
   *Requires verification* on a low-end device before assuming it is free.

## How this lands in the farm

- Repaint the two existing theme blocks; **keep the keys** `signal` / `signal-light`. They are mode
  identifiers now. Renaming would touch 59 `spec.json` files, 7 runtime/gate fallbacks, and would strand
  every persisted `localStorage` theme value on a `data-theme` that no longer exists (→ unstyled first
  load) for zero visual gain.
- Each theme is **three** blocks, not one: DaisyUI colours, the `--sf-*` surface set, and the `--ms-vol-*`
  enclosure set.
- `--sf-drop` becomes hue-tinted. Radius rises into the clay band; radius does not affect layout height,
  so `.ms-fit` screens are unaffected.
