# Watch mode — the farm at 208px, with every function still reachable

Research note for: *"I need a watch mode. I see it like this: the bottom tabs move to the right of the
player widget and become vertical, and since the visualiser and the player no longer fit, wrap them in two
sliders you swipe between. Make it systemic for every app — everything must work in micro-mode. Analyse it,
maybe you see something even better, but the main rule is that every function works and can be reached.
Research modern 2027 solutions."*

## 1. What "watch" actually measures

| Device | Physical | CSS px |
|---|---|---|
| Apple Watch 46mm | 416×496 @2× | **208×248** |
| Apple Watch 42mm | 374×446 @2× | 187×223 |
| Wear OS round (454×454) | 454×454 @2× | **227×227** |

So the target is **~190–230 CSS px wide, ~220–250 tall** — a quarter of the reference phone in each axis, an
order of magnitude less area. The farm already had a "watch ~200px" check, but it was a *proxy*: it narrowed
`#view` to 200px with an inline style and measured overflow. That tests a narrow **element** inside a 384px
**viewport**, so no media query fires, `--ms-*` never steps, and the dock stays exactly as it was. It could
never have caught a layout that needs the chrome itself to change — which is the entire problem at this size.

The fix is to stop proxying: add a real `watch 208×248` viewport to the breakpoint matrix and let the same
overflow/fit assertions run against it, like every other shape.

## 2. The arithmetic that forces the design

At 208×248, the farm's existing chrome costs, before any content:

```
header  --hdr-h   3.5rem = 56px      22% of the height
dock    --dock-h  4.25rem = 68px     27% of the height
                  ──────
                  124px              → 124px left for the app. Half the screen is chrome.
```

And horizontally the dock is worse than it looks: four tabs at a 36px tap floor plus gaps need ~170px, which
*fits* at 208 — but only by consuming the full width of a screen that also has to show content.

So the owner's instinct is right and it is the same conclusion Wear OS reached: **at this size a persistent
horizontal bottom bar is unaffordable.** Turning it 90° is the cheapest possible fix — a vertical rail costs
**width once** (40px, 19%) instead of **height forever** (68px, 27%), and vertical is the axis this screen has
the least to lose in, because content that runs out of width can wrap and content that runs out of height
cannot.

## 3. The two-pane answer, and why it is pages rather than panels

`.ms-side` already turns a stage-above-controls layout into stage-BESIDE-controls below 520px of height. At
208px wide that same split gives the stage 79px and the transport 129px — both useless. The next move down
the ladder is not a smaller split, it is **no split**: each becomes a full-screen page and you swipe.

This is exactly the platform answer. Wear OS 6 / Material 3 Expressive is built on a horizontal pager with a
scroll indicator and no tab bar; watchOS is the same idea. Nothing is hidden, nothing shrinks below its tap
floor, and the cost is one gesture.

**The systemic part — and the reason it needs no per-app work:** an app that already declares `.ms-side` has
*already told the runtime which two things it is*: `[data-stage-box]` and `.ms-side-main`. Those are the two
pages. So the same markup that gives a phone a side-by-side layout gives a watch a two-page pager, with no
app touching a media query and no new authoring contract. `v2m`, and every app that adopts `.ms-side`, gets
watch mode for free.

## 4. The 2027 mechanism: CSS carousels, not a JS pager

[CSS Overflow 5](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::scroll-marker) shipped
the missing half of scroll-snap:

- `scroll-marker-group: after` on the scroller creates a real focus/ARIA group of markers;
- `::scroll-marker` on each item is its dot — the browser scrolls to the item when the dot is activated;
- `:target-current` styles the dot of the currently snapped item;
- `::scroll-button()` generates prev/next affordances.

Support: **Chrome 135+ (March 2025), Safari 18.2 (December 2025)**, Firefox partial as of mid-2026. Which is
why the pager is built as **scroll-snap first, markers as enhancement** behind
`@supports selector(::scroll-marker)`: without them the swipe still works exactly the same, it just loses its
dots. Zero JavaScript either way — no pager state, no resize listener, no index to keep in sync, and the
gesture is the platform's own (momentum, RTL, accessibility, keyboard) rather than a `pointermove` handler.

This is the genuinely modern answer and it is *smaller* than what it replaces, which is the test that matters.

## 5. Where the owner's plan is refined rather than followed

One number changes the shape of the rail. Four icon tabs stacked vertically at the 36px floor plus gaps are
~170px of a 248px screen — they fit, but only if the rail is **icons only** (no captions, which the ≤440px
step already drops) and only if it is **40px wide, centred vertically**, not full-height. So:

- the rail is **not** a translated dock — it is the dock with `grid-auto-flow: row`, pinned right, centred, at
  `w-fit`, and the runtime publishes `--dock-w` for content to clear while `--dock-h` collapses to 0;
- the header keeps its actions but loses its wordmark: 56px → 36px. The app's name is not information at
  208px wide; a refresh button is. "Every function reachable" cuts the ornament, never the control.

I considered and rejected the more aggressive option — dropping the rail entirely and paging between *tabs*
the way Wear OS does. It buys 40px of width and costs discoverability: with no persistent affordance, the only
way to learn a tab exists is to swipe into it. The owner's rule is that every function must be reachable, and
a rail is one tap to any tab against an unknown number of swipes. The rail stays.

## 6. What the gate must do

- **`watch 208×248` and `watch-sq 200×200` join `BREAKPOINTS`** (and `shoot.mjs`'s table), so the
  horizontal-overflow and fit assertions sweep them per tab like every other shape. Two shapes, not one,
  and the square is not a rounding of the tall one: Wear OS round is 227×227 and the floor is ~200×200, so
  the width barely moves while the height drops from 248 to **200**. Everything that fails there fails
  *vertically* — which is the axis the rail was meant to buy back, making the square watch the shape that
  actually proves the trade worked. The old narrow-`#view` proxy stays — it is a *card* collapse test for
  data apps, a different question — but it is no longer the only thing called "watch".
- **Soft first.** Both land as `soft: true`: measured, reported with the same numbers, not fatal. The farm
  was never designed at this size, and there is no local Chromium here to find out which apps break before
  pushing — so switching the gate on the day it lands would mean a red main across dozens of apps and no
  way to triage. It reports, the apps get fixed against real measurements, the flag comes off. A gate
  switched on before the work is done is a gate that gets switched off again.
- **A unit test on the CSS contract**: in watch mode the dock is a row-flow rail, `--dock-h` is 0, the tap
  floor is still ≥36px, and `.ms-side` becomes a snap pager whose children are 100%-wide snap targets.
- **The eye**: `shoot.mjs <app> --bp watch`, both themes, added to the taste pass beside `split`/`split-sm`.

## 7. Bottom line

1. The old watch check tested a narrow element in a wide window — the one thing it could not see is the
   chrome, which is the whole problem. A real 208×248 viewport replaces it.
2. Vertical rail: trade 40px of width once for 68px of height forever. Header sheds its wordmark, keeps its
   controls.
3. Two pages instead of two panels, driven by the `.ms-side` markup apps already write — so watch mode is
   inherited, not authored.
4. Native CSS carousel (`scroll-snap` + `::scroll-marker`, `@supports`-gated) — no JavaScript, no state, and
   the gesture belongs to the browser.
