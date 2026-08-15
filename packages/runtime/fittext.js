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
 * @param {{style: CSSStyleDeclaration, scrollWidth: number, scrollHeight: number}} el the text element
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
export const FIT_CSS = "white-space:pre-wrap;word-break:normal;line-height:0.95";
