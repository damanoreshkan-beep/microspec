/* @ts-self-types="./fittext.d.ts" */
/**
 * # runtime/fittext.js — the largest font-size a phrase still fits at, measured
 *
 * A character count cannot predict this: "ШШШ" and "ііі" are the same length and nowhere near the same
 * width, so every clamp()/cqi formula is wrong for one of them; SVG text would scale for free but does not
 * line-wrap, which is the whole job. So `fitText` binary-searches font-size and reads the real wrapped
 * extent back out of the layout engine. Two passes, because the wrap rule decides what a poster looks like
 * as much as the size does: breaking only at word boundaries reads as a phrase, breaking anywhere reads
 * bigger and turns "Починаємо за 5 хвилин" into "Почи / наєм / о за 5 / хвили / н" on a portrait screen. Word
 * boundaries win unless they cost more than 3× the size — the one long unbreakable word (a URL, a hashtag)
 * that would otherwise shrink the whole poster to its own width is what `anywhere` exists for.
 *
 * ![The fittext module's map: two binary searches over font-size, word-boundary wrap against anywhere, the 3x rule choosing](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-fittext.svg)
 *
 * ## Import
 * ```js
 * import { fitText, fitTextSource, FIT_CSS } from "/_rt/fittext.js";                    // an app's page: the import map resolves /_rt/
 * import { fitText, fitTextSource, FIT_CSS } from "@microspec/core/runtime/fittext.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link fitText} — `fitText(el, box)`: sets `el.style.fontSize` and `el.style.overflowWrap` to the winning pair and returns the applied size in px (a quarter-pixel floor; 0 when the box has no extent).
 * - {@link fitTextSource} — `fitTextSource()`: the function's own source text, for a page that cannot import it.
 * - {@link FIT_CSS} — `"white-space:pre-wrap;word-break:normal;line-height:0.95"`, the wrapping contract the search assumes; goes inline on the fitted element.
 *
 * ## In practice
 * ```js
 * // apps/wall/view.js — the preview IS the poster: same algorithm, same wrap contract
 * import { fitText, fitTextSource, FIT_CSS } from "/_rt/fittext.js";
 *
 * useLayoutEffect(() => {
 *   const el = textRef.current, box = boxRef.current;
 *   if (!el || !box) return;
 *   fitText(el, box);
 *   const ro = new ResizeObserver(() => fitText(el, box));
 *   ro.observe(box);
 *   return () => ro.disconnect();
 * }, [text]);
 *
 * // The page the room's screens receive is served off the phone's own LAN socket and cannot import
 * // from /_rt/ — so it inlines the one algorithm instead of keeping a second copy that could drift.
 * const VIEWER_PAGE = `<style>#t{${FIT_CSS}}</style><script>${fitTextSource()}` + "…";
 * ```
 *
 * ## How it fits
 * Imports nothing and nothing in the runtime imports it — `fitText` is deliberately self-contained (no
 * imports, no module constants, nothing from its closure) because the wall app inlines its source into a
 * page with no network behind it. Two farm apps import it: wall (the poster and its LAN viewer page) and
 * hoard (the amount, sized to its box rather than to a guess). tests/fittext_test.js compiles
 * `fitTextSource()` in an empty scope, so the day someone reaches for a module-level helper here the test
 * fails instead of the room's screens.
 *
 * ## Invariants and pitfalls
 * - `fitText` must stay self-contained: no imports, no closure references. The unit test enforces it because the wall viewer page runs the source standalone.
 * - `overflow-wrap` is not in `FIT_CSS` on purpose — `fitText` owns it (word boundaries first, `anywhere` only as the fallback), and a stylesheet value would fight the search.
 * - The 3× rule: `anywhere` wins only when the word-boundary size × 3 is smaller than the anywhere size. Everything else stays a phrase.
 * - The open bound is 2× the longest side of the box (unreachable for any 1+ character string); 13 halvings take 1664 px to under a quarter pixel, and the search stops early once `hi - lo <= 0.25`.
 * - The fit test allows `+0.5` px of slack on both axes to absorb sub-pixel rounding; without it the last step oscillates and the search returns `lo`.
 * - A search is ~26 reflows (two passes). hoard refits only when the string changes length; wall refits from a `ResizeObserver` on the box, not per frame.
 * - `el` must be laid out and measurable (`scrollWidth`/`scrollHeight`); a box with `clientWidth` or `clientHeight` of 0 returns 0 without touching the element.
 * @module
 */
// fittext — the largest font-size at which a phrase still fits its box, MEASURED rather than estimated.
//
// A character count cannot predict this: "ШШШ" and "ііі" are the same length and nowhere near the same
// width, so every clamp()/cqi formula is wrong for one of them. SVG text would scale for free but does not
// line-wrap (SVG 2 Text), which is the whole job here. So: binary search over font-size, reading the real
// wrapped extent back out of the layout engine.
//
// Two passes, because the wrap rule decides what a poster looks like as much as the size does. Breaking
// only at word boundaries reads as a phrase; breaking anywhere reads bigger and turns "Починаємо за 5
// хвилин" into "Почи / наєм / о за 5 / хвили / н" on a portrait screen (measured on the reference device).
// So word boundaries win unless they cost more than 3× the size — the one long unbreakable word (a URL, a
// hashtag) that would otherwise shrink the whole poster to its own width, which is the case `anywhere`
// exists for.
//
// fitText is deliberately SELF-CONTAINED — no imports, no module constants, nothing from its closure. The
// wall app serves a page off the phone's own LAN socket, and that page cannot import from /_rt/; it inlines
// this function's own source instead (fitTextSource). A unit test compiles the source in an empty scope, so
// the day someone reaches for a module-level helper here, the test fails instead of the room's screens.

/**
 * @param {{style: object, scrollWidth: number, scrollHeight: number}} el the text element (its `style` is a CSSStyleDeclaration)
 * @param {{clientWidth: number, clientHeight: number}} box the frame it must not exceed
 * @returns {number} the applied size in px
 */
export function fitText(el, box) {
  const w = box.clientWidth, h = box.clientHeight;
  if (!(w > 0) || !(h > 0)) return 0;
  const search = function (wrap) {
    el.style.overflowWrap = wrap;
    // 2x the longest side is unreachable for any string of 1+ characters, so it is a safe open bound.
    let lo = 1, hi = Math.max(2, Math.max(w, h) * 2), best = 1;
    // 13 halvings take 1664px to under a quarter pixel: ceil(log2(1663/0.25)) = 13.
    for (let i = 0; i < 13 && hi - lo > 0.25; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = mid + "px";
      // +0.5 absorbs sub-pixel rounding; without it the last step oscillates and the search returns lo.
      if (el.scrollWidth <= w + 0.5 && el.scrollHeight <= h + 0.5) { best = mid; lo = mid; }
      else hi = mid;
    }
    return Math.floor(best * 4) / 4;
  };
  const words = search("normal");
  const anywhere = search("anywhere");
  const wrap = words * 3 >= anywhere ? "normal" : "anywhere";
  const size = wrap === "normal" ? words : anywhere;
  el.style.overflowWrap = wrap;
  el.style.fontSize = size + "px";
  return size;
}

/** The function's own source, for a page that cannot import it. Pairs with FIT_CSS. */
export const fitTextSource = () => fitText.toString();

// The wrapping contract the search assumes. `overflow-wrap` is NOT here on purpose: fitText owns it (word
// boundaries first, `anywhere` only as the fallback above), and a stylesheet value would fight the search.
/** Inline CSS for the fitted element — the wrapping contract `fitText` assumes; `overflow-wrap` is left to fitText. */
export const FIT_CSS = "white-space:pre-wrap;word-break:normal;line-height:0.95";
