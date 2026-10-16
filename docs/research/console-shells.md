# Console shells — from Tailwind classes to real devices

> **`brick` was removed from the farm on 2026-07-30.** This document stays: the geometry it measures — the
> d-pad hub (~34% of the whole cross), the button pair at 1.60 D on a 22° axis, the diamond at 1.92 D on the
> axes — still carries load, because the console is shared and `hunt` wears it. Everything specific to
> `brick` as an app reads as history.

Date: 2026-07-29 · for `packages/runtime/shells.js` + `packages/runtime/console.js`
The research was delegated (thread `019fae8d`); **every load-bearing number was checked separately** — the
section "What did not survive checking" below is not rhetorical: it holds three errors that would have
gone into the code.

---

## The catalogue was removed (2026-07-30). What of it still stands

A catalogue of nine shells was built from this document, shipped to production and **removed** a day later
(`0b07d30 console: one device, and the game gets the whole screen`). `packages/runtime/shells.js` is gone,
`packages/runtime/console.js` exports only `GameConsole`, the geometry of the one device is written once in
`packages/runtime/theme.css`, and `packages/gates/shoot.mjs` has no `--shell` flag.

The document stays because part of its measurements still stands in the code under a unit test. The other
part describes a thing that no longer exists and must not be read as a spec. Below is where the line runs.

### What the catalogue cost

Three things. No gate saw any of them.

1. **A settings tab in every game.** `brick` and `hunt` had a `shell` tab (`view: "brickShell"`) with a
   `ShellPicker` — a picker screen whose content was a picture of a picker screen. Two games, two tabs
   nobody plays in.

2. **The aperture as a fraction of the body — which is exactly why the game was tiny.** A catalogue has to
   **differ** somehow, and the strongest silhouette cue is `screenW` from section 3.1 (`0.42 · 0.55 ·
   0.61`). So the number that tells the devices apart and the number that decides how big the game is are
   one and the same number, and it was handed to the first job. `0.55` of a `24rem` body is a game about
   155 px wide on a 390 px phone; in `hunt` the forest came out at ~115 px. The body also shrank to its own
   content, so two thirds of the view was empty page above and below a device too small to read. None of
   it overflows (it is **smaller** than its box — a direction no gate measures), a11y does not care about
   the size of a `<canvas>` with a correct `aria-label`, and in a screenshot it is "a console, a bit
   small". Recorded in [GATE_BLINDSPOTS](../GATE_BLINDSPOTS.md).

3. **A colour game on a monochrome plate.** Section 3.4 gives the tint to the **shell**, and one shell
   serves both games — so `hunt` (Kenney's colour CC0 art) lived the whole time on `brick`'s yellow-green
   plate. Section 3.5 saw this trap and stopped half a step short of the conclusion: it says that for
   `hunt` the tint stays a frame, instead of saying the direction is wrong. Now the plate travels **from
   the game to the shell** — `GameConsole({ plate })` → `--sh-tint`; `brick` passes its olive `LCD.plate`,
   `hunt` passes `WORLD.sky[0]`.

### What still carries load

These are measurements of the device, not of the catalogue, and they are under the test
`deck · a cluster is measured back out of its own layout, never trusted as a literal`
(`packages/runtime/runtime_test.js`), which cites this file as its source:

- **3.3, the action pair:** centres `1.60 D` (1.45–1.75) on a `22°` axis (15–28°). Together with fix
  **1.1** — the defect was the distance (`0.99 D`, the rims touch), not the angle.
- **3.3, the diamond:** opposite centres `1.92 D` (1.80–2.10), rotation `0° ± 3°`.
- **3.2, the d-pad:** the hub is **34%** of the full extent of the cross. In `theme.css` it is `.ms-pad-hub`
  at `92%` of the centre cell, i.e. `30.7%` of the cross; the test derives one from the other and fails if
  the percentage is edited into something that does not exist. The arm-end radius is ~`10%` of the arm
  width (`.ms-pad-key: 12%`) — not `50%`.
- **3.4, the last line:** inactive segments `0.025–0.06`. Lives as `LCD.grid = 0.05` in
  `packages/runtime/brick.js`.
- **Section 2 entirely.** The dimensions are checked, the sources were opened; they simply feed nothing
  right now.
- **Section 4**, reduced to its consequence: the body has exactly two values (`#35342C` / `#D8D5C2`), they
  are written as theme-dependent CSS, not computed in JS, and they are muted — for exactly the reasons laid
  out here (the `--nm-dark`/`--nm-light` shadow pair holds only while the base has headroom both ways).
- **Section 5, traps 4–6** (the tight pair, the rotated diamond, the round cross ends) — all three under the
  test above.

### What describes something that no longer exists

- **3.1 entirely** — the table of nine bodies (`aspect`, `screenW`, `area`, radii). One body remains:
  `max-width: 30rem` (`46rem` in landscape), one radius `calc(var(--ms-r) * 1.2)`, `height: 100%`. The
  `--sh-screen-w` variable is not just removed — it is **banned** by the test
  `console · one device, and the aperture is never rationed`, because what must not come back is not the
  value but the shape of the mistake: an aperture expressed as a fraction of the body.
- **3.2, the paragraph on the disc pad.** There is no `.ms-pad-disc`; there is one cross.
- **3.4, the tint table.** There are two plates now, and they belong to the games, not to this file.
- **3.5** — the diagnosis is still useful, its direction is reversed (see item 3 above).
- **Section 6, the shell contract object** (`label`/`orient`/`aspect`/`radius`/`bezel`/`screenW`/
  `deck`/`pad`/`key`/`tint`/`hue`) — none of these fields exist. The principle "the shell knows nothing
  about a specific game" still holds, but the test named there (`shells · the console choice is shared,
  not per app`) is removed too; its role is played by `console · one device…`, which scans `console.js`
  without comments for `SHELLS`/`ShellPicker`/`ShellTab`/`./shells.js` and for the names of specific games.
- **Section 5, traps 1–3** — they are about not confusing silhouettes with each other. There is one
  silhouette.

### The conclusion worth more than the numbers

Nine devices are nine chances to get wrong the one number that matters on a phone: **how big the game
is**. The catalogue did not just fail to help — it made that number a by-product of the decorative
requirement "the table rows must differ". The research was careful and its load-bearing numbers are not
wrong; what was wrong was the framing of the task, and no volume of checked dimensions catches that.

---

## 0. Why this was needed

`shells.js` had six rows that differed **only** in corner radius, `max-width` and `padding`. All six were
`sf-raised bg-base-100`. So the catalogue of "console variants" was a catalogue of one body with different
radii, and no gate sees it: a11y is silent, overflow is silent, the screenshot shows six nearly identical
rectangles.

The requirement: the variants must be **real**. The decisions taken:

- the actions on the right — **an A/B/X/Y diamond with fixed actions** (not a remapping configurator);
- realism — **full, including the body colours**, not only the silhouette.

The second deliberately departs from the farm's rule "ink is the brand, colour = meaning". It was raised as
a risk among the options and confirmed — so below there is a separate section on how to do it without
breaking contrast and without turning neumorphism into plastic.

---

## 1. What did not survive checking

Three claims from the delegated research had the right shape and the wrong content. All three carried
load — each would have become a number in CSS.

### 1.1 The geometry of the existing button pair — measured wrongly

The claim: "the centres are `1.44D` apart on X and `0.92D` on Y, angle ≈ `32.6°`, steeper than a typical
handheld" → trap no. 4 "the pair is too steep".

Measured from `packages/runtime/console.js:93` (container `width: 2.4s`, `aspect-ratio 2.4/1.7`; button
`52%` of the container width, `aspect-ratio 1`):

```
D  = 0.52 × 2.4s              = 1.248s
Δx = (2.4s − D/2) − D/2       = 1.152s
Δy = (1.7s − D/2) − D/2       = 0.452s
angle = atan2(0.452, 1.152)   = 21.4°
centre distance               = 1.2375s = 0.992 D
rim gap                       = −0.008 D
```

**The 21.4° angle is fine** (historical range 15–28°, default 22°). The defect is something else entirely,
and the research missed it: **the centres sit at 0.99D, so the buttons touch at the rims**. Historically
1.45–1.75D. The distance needs fixing, not the angle.

### 1.2 The DMG palette — right values, wrong source

The research gave `#9BBC0F / #8BAC0F / #306230 / #0F380F`, citing
<https://lospec.com/palette-list/nintendo-gameboy-bgb>. That page, opened, has
`#e0f8d0 / #88c070 / #346856 / #081820` — **a different palette**.

The values themselves are right, but they are the `original-gameboy` palette:
<https://lospec.com/palette-list/original-gameboy> (VERIFIED, opened). A classic case of "cited something
other than what was read" — which is exactly why uncited = unchecked.

### 1.3 The slim pocket model's screen — did not shrink

The claim: the Pocket's active area ≈ `44×40 mm`, "scaled from a front photo", → `56.7% W`.

Wikipedia (VERIFIED, opened <https://en.wikipedia.org/wiki/Game_Boy>) says the Pocket has **the same 2.5″
panel** `160×144`, only FSTN instead of STN. The body shrank, the screen did not:

```
2.5″ = 63.5 mm; 10:9 → w = 63.5 × 10/√181 = 47.2 mm, h = 42.5 mm
DMG:    47.2 / 90.0  = 52.4% W     area 2006 / 13320 = 15.1%
Pocket: 47.2 / 77.6  = 60.8% W     area 2006 /  9902 = 20.3%
```

This is not a detail: **the screen growing relative to the body is precisely what tells the slim model
from the thick one**. With the research's number the two shells would have come out nearly identical —
exactly the flaw being fixed.

---

## 2. Checked dimensions

Everything below is VERIFIED; each source was opened.

| Class | Dimensions (mm) | Screen | Source |
|---|---|---|---|
| early monochrome portrait | 90 × 148 × 32 | 2.5″ STN, `160×144`, four shades of green | [Wikipedia: Game Boy](https://en.wikipedia.org/wiki/Game_Boy) |
| slim monochrome portrait | 77.6 × 127.6 × 25.3 | 2.5″ **FSTN**, `160×144`, true black and white | same |
| landscape cartridge | 144.5 × 82 × 24.5 | TFT `61.2 × 40.8 mm`, `240×160` | [Nintendo, technical data](https://www.nintendo.com/en-gb/Support/Game-Boy-Advance/Product-information/Technical-data/Technical-data-619479.html) |
| clamshell | the same screen `61.2 × 40.8`, `240×160` | | Nintendo, SP technical data |
| early colour landscape | 210 × 113 × 38 | 3.2″ **backlit** CCFL, `160×144` with **non-square** pixels | [Wikipedia: Game Gear](https://en.wikipedia.org/wiki/Game_Gear) |
| dual-orientation | 128 × 74.3 × 24.3 | 2.9″, `224×144` | [Wikipedia: WonderSwan](https://en.wikipedia.org/wiki/WonderSwan) |
| modern slab (narrow end) | 208.3 × 91.4 × 14 | 5.5″, `1280×720` | [Nintendo Switch Lite](https://www.nintendo.com/us/gaming-systems/switch/tech-specs/) |
| modern slab (wide end) | 298 × 117 × 49 | 7.4″, `1280×800` | [Steam Deck](https://www.steamdeck.com/en/tech) |

**The early colour model's non-square pixels matter.** A physical `10:9` cannot be derived from `160×144`;
the panel's physical ratio stays **UNKNOWN**, and the 3.2″ had to be split under a `4:3` assumption. Marked
INFERRED, not VERIFIED.

For the 9999-in-1 "brick", the single-game LCD keychain and the arcade panel **no single dimension
exists** — these are families with incompatible bodies. Archetype ranges are given, not false precision.

---

## 3. The numbers that go into code

### 3.1 The body

`aspect` = W:H of the front silhouette. `screenW` = aperture width / body width. `area` = aperture area /
body area — and **that is what tells the classes apart**, because two screens of the same width at `10:9`
and `16:9` have different heights.

| id | aspect | screenW | area | radii (fraction of the shorter side) | source |
|---|---:|---:|---:|---|---|
| `brick` | 0.58 | 0.55 | 0.15 | 5% uniform | archetype, INFERRED |
| `pocket` | **0.608** | **0.524** | **0.151** | top 5%, bottom-left 5%, **bottom-right 26%** | computed from VERIFIED |
| `slim` | **0.608** | **0.608** | **0.203** | 8% uniform | computed from VERIFIED |
| `cart` | **1.762** | **0.424** | **0.211** | 22% (the ends are grips) | computed from VERIFIED |
| `clam` | 0.55 open | 0.72 | 0.19 | outer 8%, at the hinge 2% | INFERRED |
| `backlit` | **1.858** | 0.33 | 0.134 | 22% on the grips | body VERIFIED, screen INFERRED |
| `slab` | **2.28–2.55** → 2.40 | **0.56** | **0.45** | 25% of the height | computed from VERIFIED |
| `arcade` | 1.80 | 0.52 | 0.30 | panel 3%, front corners 10% | archetype, INFERRED |
| `bare` | — | 1.00 | 1.00 | — | no body |

The arithmetic for `slab` (so it can be checked rather than taken on faith):

```
Switch Lite: 5.5″ 16:9  → w = 139.7 × 16/√337 = 121.8 mm → 121.8/208.3 = 58.5% W, area 43.8%
Steam Deck:  7.4″ 16:10 → w = 188.0 × 16/√356 = 159.4 mm → 159.4/298.0 = 53.5% W, area 45.5%
```

The research gave the slab an area of `33–42%` — below both computations from checked diagonals. The
computed value is used.

### 3.2 The d-pad

- the full extent of the cross = **3.0–3.3 ×** the arm width (a 3×3 grid with a small chamfer);
- the round centre hub = **34%** of the full extent.
  The code currently applies `38%` to the **centre third**, i.e. effectively `12.7%` — visually there is no
  hub (`console.js:80`);
- the arm-end radius = **10%** of the arm width. **Not 50%**: fully round ends turn the cross into a
  four-petal flower — which is exactly what the shells with `key: "round"` do now;
- the recessed seat around the cross = **8%** of the extent.

Disc pad: diameter **0.95 ×** the extent of the equivalent cross, a centre dead zone of **27%**, the recess
extends **8%** of the diameter past the disc. Right now `disc` only clips the same 3×3 grid with a circle
(`console.js:77`) — that is not a disc.

### 3.3 The actions

Let `D` be the diameter of one button.

**Four (diamond).** Opposite centres **1.92 D** (range 1.80–2.10), bounding box **2.92 D**, rotation
**0° ± 3°**.

This runs against intuition, so on its own: **the ABXY diamond on real devices is aligned to the axes.**
The feeling of a "tilted diamond" comes from offsetting the whole cluster or tilting the labels, not from
rotating the cluster. No primary drawing with an angle was found (UNKNOWN); photogrammetry from front
orthographic images gives a deviation of ≤ 2° ± 2°. So a decorative `15–25°` is a mistake, not a style.

At `< 1.6 D` the four buttons clump into a flower; at `> 2.3 D` they stop reading as one cluster.

**Two (offset pair).** Angle **22°** (15–28°), centres **1.60 D** (1.45–1.75).
Existing code: angle 21.4° — right, centres 0.99 D — **the rims touch**. The distance is what gets fixed.

**Three (triangle).** The in-between form: the same 22° axis, the third button at the apex.

**One.** Unchanged — 1.5 × `--ms-ctl`.

The cluster's vertical position relative to the cross: compact landscape — **0–4% H higher**; `slab` with
sticks — **4–10% H higher**; portrait monochrome — on the same band or up to **3% H higher**.

### 3.4 Screen tints

| id | plate (off) | ink | in-between |
|---|---|---|---|
| `brick` | `#B9C77A` | `#26351F` | `#52623A`, `#82915A` |
| `pocket` | `#9BBC0F` | `#0F380F` | `#306230`, `#8BAC0F` |
| `slim` | `#C4C7B8` | `#2B302B` | `#62685F`, `#969B8F` |
| `cart` | `#B9B9A9` | `#30352F` | — (a colour canvas on top) |
| `clam` | `#B8C0B6` | `#20252A` | backlight `#E9EEF2` |
| `backlit` | `#667066` | `#151A18` | on `#D8E0DC` |
| `slab` | `#17191B` | `#050607` | on `#E4E8EA` |
| `arcade` | `#171A18` | `#050706` | phosphor `#526159` |

The `pocket` palette is VERIFIED, [lospec `original-gameboy`](https://lospec.com/palette-list/original-gameboy).
The rest are CSS approximations of the classes (INFERRED). **UNKNOWN:** a single "actual hex" of an unlit
STN does not exist without a defined illuminant, viewing angle and camera profile; anyone giving an exact hex
from a photograph gives a number with an error ≫ 5%.

Inactive segments: opacity **0.025–0.06**. Above `0.08` they read as lit.

### 3.5 Where the tint actually reaches

There is a trap worth naming here, because it makes half of the parameter dead.

`brick` is a **monochrome** game: `packages/runtime/brick.js` holds `LCD.plate = "#b4bc96"`,
`LCD.ink = "#23281c"` and five ink densities. So the plate already exists, it is just nailed down. The
shell can set it — and **that is what turns a "variant" from a frame into a device**.

`hunt` is a **colour** game (a palette from Kenney's CC0 art). It cannot be repainted: that would be a
filter, not a device. For it the tint stays the colour of the aperture around the canvas and of the "dead"
screen.

So: the tint **drives `brick`'s plate** and **the frame of both**. Nothing more. A parameter that does not
reach the pixels must be either wired or thrown out.

---

## 4. Coloured bodies without breaking the material

The decision is full authenticity. The risk is real: `.sf-raised` lays the `--nm-dark`/`--nm-light` shadow
pair on `--color-base-100`, and the material holds only because **the base has headroom both ways**
(`#2A2A2E` / `#EEEEF1`, never pure black and never pure white).

The rules derived from this, which must stay in the code:

1. **Two values per shell, not one.** The body colour is theme-dependent CSS
   (`[data-theme="signal"]` / `[data-theme="signal-light"]`), never computed in JS: the view does not
   repaint on a theme switch.
2. **Muted and mid-range.** 90s plastic is not saturated anyway. Keep the lightness in the same corridor as
   the theme's base (±10%), otherwise the shadow pair dies and the extrusion becomes a bevel.
3. **The body never becomes a background for text.** Labels and glyphs on the buttons stay `base-content`;
   the buttons stay `bg-base-100`, not the body colour. The **body** carries the colour, the **key** carries
   the contrast.
4. **The screen is the only place where colour is saturated.** Historically true as well: the LCD plate is
   the brightest coloured field on the whole device.

---

## 5. Traps that make a device unrecognisable

The research's list, corrected where the measurements here disagreed with it.

1. **Too large a screen on the early monochrome.** Historically `52% W` and `15%` of the area. Give it
   `70% W` or `>25%` of the area and the silhouette becomes a modern emulator console.
2. **A `slab` not wide enough.** The class sits at `2.28–2.55`. Below `2.05` it reads as a cartridge model;
   at `1.76` it is literally the cartridge model's geometry.
3. **The same radius on every body.** The cartridge model needs `22%` at the ends, the brick `5%`. `20%` on
   the brick makes it a phone; `6%` on the cartridge model removes the grips.
4. **~~The button pair too steep~~ → the pair too tight.** The 21.4° angle is right; the flaw is that the
   centres sit at `0.99 D` and the rims touch. It needs `1.60 D`.
5. **A decoratively rotated diamond.** `0° ± 3°`, not `15–25°`.
6. **Round d-pad ends.** A radius of `10%` of the arm width, not `50%` — otherwise it is a flower.

---

## 6. The shell contract

The principle that still holds: **the shell must know nothing about a specific game** (pinned by the unit
test `shells · the console choice is shared, not per app`).

The refinement this research introduces: the shell **knows its own aperture** — its share of the body, the
frame, the tint. That is not knowledge about the game: a real device has its own aperture, and the game is
letterboxed inside it. The canvas already does this (`max-w-full max-h-full w-auto h-auto`), so the aperture
never dictates the game's aspect ratio.

```js
{
  label,                 // i18n key
  orient,                // "portrait" | "landscape"
  aspect,                // W:H of the silhouette; null for bare
  radius,                // "5%" or four values for asymmetric bodies
  bezel,                 // lens frame, a fraction of the body width
  screenW,               // aperture / body width
  deck,                  // "split" | "flank" | "clam" | "float"
  pad,                   // "cross" | "disc"
  key,                   // "square" | "round"
  tint,                  // key into the plate table
  hue,                   // body theme key; the colour lives in theme.css
}
```

What is deliberately absent: the number of action buttons. How many there are is the **game's** call
(`hunt` has four actions, `brick` two), and the shell decides only **how** they are laid out. A shell that
demands exactly four buttons is a shell that fits one game.

---

## 7. What stays UNKNOWN

Nothing may be built on these:

- the physical panel ratio of the early colour landscape model (non-square pixels);
- the official angle of the ABXY diamond in degrees — no primary drawings were found, `0° ± 3°` is a
  photogrammetric inference;
- the "actual" hex of an unlit STN — without an illuminant and a camera profile the quantity is undefined;
- the dimensions of the 9999-in-1 "brick", the single-game LCD and the arcade panel — these are families,
  not models.
