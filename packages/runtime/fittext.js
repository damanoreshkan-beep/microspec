/* @ts-self-types="./fittext.d.ts" */
/**
 * The largest font-size at which a phrase still fits its box, MEASURED rather than estimated: `fitText`
 * binary-searches font-size against the layout engine's real wrapped extent, preferring word-boundary wraps
 * over `anywhere`. `fitTextSource` hands the function's own source to a page that cannot import it, and
 * `FIT_CSS` is the wrapping contract the search assumes.
 * @module
 */

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
    let lo = 1, hi = Math.max(2, Math.max(w, h) * 2), best = 1;
    for (let i = 0; i < 13 && hi - lo > 0.25; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = mid + "px";
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

/** Inline CSS for the fitted element — the wrapping contract `fitText` assumes; `overflow-wrap` is left to fitText. */
export const FIT_CSS = "white-space:pre-wrap;word-break:normal;line-height:0.95";
