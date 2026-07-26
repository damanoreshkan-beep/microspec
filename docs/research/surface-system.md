# The surface system — four states and five elevations, measured off the reference

Research note for: *"the design is nothing like [the reference pins]. It is a gross error to assume what is
on prod matches my request. This has to be accounted for, precisely MEASURED, researched, thought through.
Right now every widget fails to match it."*

The criticism is correct and the mistake is worth naming, because it is a method failure rather than a taste
one: an earlier pass took a single glance at the reference, extracted one idea ("the screen is a lit
volume"), applied it to the **shell** — a vignette on `body` — and called the request done. The reference is
not about the shell. Its very first row is titled **FOUNDATIONS** and it names four SURFACES; everything
below is those surfaces applied to *every widget on the page*. So the shell got a shadow and all fifty-odd
components stayed flat, which is precisely "кожен віджет не відповідає цьому".

Second mistake: the first pass *described* the reference instead of measuring it. Below it is measured.

## 1. What the reference actually specifies

Two pins, one language (`pin.it/5luDTDSjK` → pin `1096274734320084795`, `pin.it/2ZPpW5G3Q` →
`1057501556271747841`). The second is an explicit styleguide and it enumerates the system:

- **FOUNDATIONS** — `BASE LAYER` · `RAISED LAYER` · `INSET LAYER` · `PRESSED LAYER`
- **ELEVATION LEVELS** — L1 flat · L2 hover · L3 raised · L4 modal · L5 popover
- **BORDER THICKNESS** — 1px thin · 2px regular · 4px thick
- **RADIUS SCALE** — 4 · 8 · 12 · 16 · 24px
- **ICONOGRAPHY** — 16 / 20 / 24px, stroke weight **2px**
- then the same four surfaces applied to: buttons (default/pressed/disabled), text fields (+error),
  checkbox · radio · switch · slider, tabs · breadcrumbs · steppers · pagination, cards · list items ·
  badges · avatars · tooltips · table headers, modals · toasts · alerts · progress · skeletons · empty states.

## 2. The measurement

Sampled with `imagescript` — a vertical luminance profile through each FOUNDATIONS swatch, against the page
behind it (`#f0e7de`, luminance **232.3**). Luminance is 0–255; Δ is relative to the page.

| Surface | Face | Δ page | Top edge | Bottom edge | Reading |
|---|---|---|---|---|---|
| **BASE** | 234.8 | **+2.5** | 247 (**+15**) | 181 (**−54**) | the page itself, with a soft ambient drop |
| **RAISED** | 232.9 | **+0.6** | 250 (**+17**) | 176 (**−57**) | same face — the *edges* do the lifting |
| **INSET** | 219.7 | **−12.6** | 184 inside the top (**−36**) | 233 (**+13**) | face genuinely darker + inner shadow at the TOP |
| **PRESSED** | 199.1 | **−33.2** | 136 inside the top (**−63**) | 229 (**+10**) | much darker face, deep inner shadow |

Three things fall out of that table, and only the first was in the earlier pass:

1. **A raised surface is not a lighter surface.** Its face is the same luminance as the page (Δ +0.6); the
   entire effect is a **light rim on top (+17)** and a **drop shadow below (−57)**. Lightening the fill is
   the classic mistake and it flattens the material instantly.
2. **An inset surface is genuinely darker than its parent** (−12.6), not merely edged. That is why the
   earlier "trough" read as nothing: it added a shadow without dropping the face.
3. **Pressed is not a hover-with-more-shadow** — it is a −33 face with a −63 inner shadow at the top. It is
   the strongest state in the entire kit, which is right: it is the only one you cause by touching.

The light comes from directly above in all four: highlight on the top edge, shadow on the bottom (raised) or
the reverse *inside* the shape (inset/pressed). One light source, no exceptions.

## 3. Translating to a dark, ink-forward farm

The reference is cream + deep teal. The farm is `#0A0A0B` ink with colour reserved for meaning, and copying
its palette would be theft of the wrong layer. What transfers is the **structure**: the four states, the
elevation ladder, and — crucially — the fact that the moves are RELATIVE, which survives inversion:

| Token | Light theme | Dark theme |
|---|---|---|
| `--sf-raise-rim` | white 70% on the top edge | white 8% on the top edge |
| `--sf-raise-drop` | ink 18%, y+6 blur 14 | black 55%, y+8 blur 18 |
| `--sf-inset-face` | −5% luminance vs parent | `base-200` against `base-100` |
| `--sf-inset-top` | ink 14% inner, y+2 blur 4 | black 55% inner, y+2 blur 5 |
| `--sf-press-face` | −13% vs parent | `base-300`, brightness 0.94 |
| `--sf-press-top` | ink 25% inner, y+3 blur 6 | black 70% inner, y+3 blur 7 |

Ratios preserved from the measurement: the pressed inner shadow is **~1.75×** the inset one (63/36), and the
raised rim is **~1.13×** the base rim (17/15) while its drop is **1.06×** (57/54). So `pressed` is a real
step past `inset`, and `raised` is only a *slightly* firmer `base` — which is why the reference's base and
raised swatches look so similar and why treating them as one state would have been wrong.

## 4. Where it applies — every widget, or it is not a system

The failure being corrected is scope, so the rule is: **a surface class is chosen by ROLE, not by taste**,
and every kit node declares one.

- **raised** — anything that floats over content: `Island`, the dock, the header, `Sheet`, toasts, popovers,
  and a resting `.btn`.
- **inset** — anything a value sits IN: a range track, a text field, a `Segmented` rail, a progress trough,
  a skeleton row.
- **pressed** — the `:active` state of every control, and the *selected* cell of a strip.
- **base** — cards and panels in flow.

Elevation is the same idea with a number: L1 flat → L2 hover → L3 raised (island/dock) → L4 modal (sheet) →
L5 popover (toast). One scale, so a sheet can never accidentally sit under a dock.

## 5. Bottom line

1. The request was a **material system for every widget**, and the earlier pass delivered a vignette on the
   body. That is the error, and it came from describing the reference rather than measuring it.
2. Measured: raised lifts by its EDGES (face Δ+0.6), inset and pressed genuinely DARKEN their face (−12.6,
   −33.2), and pressed is ~1.75× inset — a real step, not a stronger hover.
3. It transfers to a dark farm because every move is relative; the palette does not come with it.
4. It is only a system if every node declares a surface. Tokens in `theme.css`, applied across the kit, with
   the radius / border / icon scales the reference also enumerates.
