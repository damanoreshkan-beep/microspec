# Adaptive from the small-phone floor to a TV — which mechanism answers which question

> Historical note: the farm previously targeted smartwatch viewports (200–300px). That was dropped —
> the gate no longer sweeps below the small-phone floor (320px). The mechanism lessons below stand
> regardless of where the bottom of the ladder sits.

Research note for: *"you are making crutches at random without even researching the problem. Research how our
adaptivity requirements are properly built on Tailwind, from watch 200×200 up to TV."*

The criticism is exact. Three consecutive commits tried to make one slider group lay out correctly at 200px
— `auto-fit` arithmetic, then a grid expression the browser silently dropped, then a specificity fix for a
tie that (measured afterwards) never existed. Each was a guess about a mechanism I had not read. This note
is the reading.

## 1. The two questions, and the two mechanisms

There are exactly two kinds of adaptive decision in this farm, and they have different inputs:

| Question | Input | Mechanism |
|---|---|---|
| How much room does the **window** have? | viewport | media query |
| How much room does **this component** have? | the component's own box | container query |

Tailwind v4 supports both first-class: `@container` (sets `container-type: inline-size`), variants
`@3xs`(16rem)…`@7xl`(80rem), `@max-*`, arbitrary `@min-[475px]` / `@max-[960px]`, named containers
(`@container/main` → `@sm/main:`), container units (`cqw`, `cqh`), and `@container-size` for block-size.
Viewport breakpoints are CSS-first (`@theme { --breakpoint-tv: 120rem }`).

The farm already had the rule and had written it down: `Transport` is `@container` with `@max-[300px]:`
variants, and its unit test says *"container queries, never viewport ones — the watch gate narrows #view to
200px while the window stays 384px."* `.ms-cols` was the one component-internal decision driven by a
**viewport height** media query. That is why it behaved unpredictably: it was answering the wrong question.

## 2. Why the `auto-fit` attempt could not have worked

Per [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/repeat), the number of
repetitions is computed by *"treating each track as its maximal track sizing function, if that is definite"*
— and with `minmax(X, 1fr)` the max is **flexible, not definite**, so the browser falls back to the
**minimum**, `X`. Two consequences, both of which bit:

- the column count is arithmetic against a number I *chose* (`3rem`), against a container width I did not
  measure. The observed result — `[h99 grid 2tr]` — was the browser doing that arithmetic correctly with
  inputs I had guessed.
- *"If the grid container has no definite or maximum size … the specified track list repeats only once."*
  An intrinsically-sized container silently collapses the whole thing to one column, with no error anywhere.

So `auto-fit` is the wrong tool for a layout whose column count matters. It is right when the count is
genuinely "as many as fit and I do not care"; it is wrong when the answer must be *three at this size, two
at that one*, because it expresses that answer only indirectly, through a floor and a container width.

**Explicit container-query breakpoints say the thing itself**, are readable, and are testable.

## 3. The ladder, end to end

One scale, two mechanisms, no gaps. Sizes in CSS px.

| Band | Shape | Decided by | What changes |
|---|---|---|---|
| ≤440 tall | split-screen / floating window | **media** | fourth density step, dock drops captions |
| ≤520 tall (≥340 wide) | landscape phone, split | **media** | `.ms-side`: stage moves beside its controls |
| 320–430 wide | phones | **container** | component internals: strips, transports, groups |
| 768–1024 | tablet | **container** + media for page columns | side-by-side page regions |
| 1280–1536 | desktop | media | max-widths, multi-column reading |
| **≥1920 (`--breakpoint-tv: 120rem`)** | TV / 10-foot | **media** | density steps **UP**, not down: type and targets grow with viewing distance |

The TV end is the half this farm has never had. Every `--ms-*` step so far compacts; a 10-foot UI needs the
opposite — the same tokens moving the other way, because a 44px target at 3m is not a 44px target at 30cm.
The ladder is therefore symmetric around the reference device, not one-directional.

## 4. The rules this yields

1. **A component never reads the viewport.** If the decision is "what fits inside me", the component
   declares `@container` and its children use `@max-*`/`@min-*`. The window's size is not evidence about a
   box that might be in a sheet, a rail, a split pane or a 200px column.
2. **Chrome reads the viewport, and only chrome.** Dock orientation, header height, the fit contract, safe
   areas. These are facts about the device, and there is exactly one of each per screen.
3. **Prefer an explicit breakpoint to intrinsic arithmetic.** `auto-fit`/`minmax` derive a count from a
   guessed floor and an unmeasured width, and degrade to one track in silence. Say "two columns here, three
   there" and the rule can be read, tested, and disproved.
4. **State the axis.** A rule written for rows must say it is for rows (`:not(.flex-col)`); `flex-wrap` on a
   column wraps into a second *column*, off the side of the box. This cost three apps a phantom failure.
5. **Assert the computed result, not the source.** A unit test that greps CSS text passes while the browser
   ignores the rule. Where it matters, the gate must read `getComputedStyle` — which is how the grid was
   finally caught applying with the wrong track count rather than "not applying".

## 5. Bottom line

- The bug was never the number. It was using a viewport query for a component decision, and intrinsic
  arithmetic for a count that had a right answer.
- Tailwind v4 already gives the correct tool for each half, and the farm already used it correctly in the
  one place it had been researched (`Transport`).
- The scale needs a TV end, stepping density up, or "adaptive" means "adaptive downwards only".
