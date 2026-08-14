import { assert, assertEquals } from "jsr:@std/assert";
import { fitText, fitTextSource, FIT_CSS } from "../fittext.js";

/** An element whose wrapped extent is a known function of the font size. */
function stub(extentAt) {
  let size = 0;
  return {
    style: {
      set fontSize(v) { size = parseFloat(v); },
      get fontSize() { return size + "px"; },
    },
    get scrollWidth() { return extentAt(size).w; },
    get scrollHeight() { return extentAt(size).h; },
    get size() { return size; },
  };
}

const box = (w, h) => ({ clientWidth: w, clientHeight: h });

Deno.test("fittext: converges just under the largest size that fits", () => {
  const IDEAL = 137.4;
  // A cliff model: anything at or below IDEAL fits exactly, anything above overflows.
  const el = stub((s) => (s <= IDEAL ? { w: 100, h: 100 } : { w: 9999, h: 9999 }));
  const got = fitText(el, box(100, 100));
  assert(got <= IDEAL, `${got} must not exceed the ideal ${IDEAL}`);
  assert(got > IDEAL - 1, `${got} is more than a pixel short of ${IDEAL}`);
  assertEquals(el.size, got, "the winning size must be left applied on the element");
});

Deno.test("fittext: a single line scales linearly with the font size", () => {
  // 12 characters at 0.55em advance: width = 6.6 * size, height = 1.2 * size.
  const el = stub((s) => ({ w: 6.6 * s, h: 1.2 * s }));
  const got = fitText(el, box(330, 800));
  assertEquals(Math.round(got), 50, "330 / 6.6 = 50px is the width-bound answer");
});

Deno.test("fittext: the binding axis can be the height", () => {
  const el = stub((s) => ({ w: 2 * s, h: 4 * s }));
  const got = fitText(el, box(400, 200));
  assertEquals(Math.round(got), 50, "200 / 4 = 50px, not the 200px the width alone would allow");
});

Deno.test("fittext: a box with no area is not searched", () => {
  const el = stub(() => ({ w: 1, h: 1 }));
  assertEquals(fitText(el, box(0, 100)), 0);
  assertEquals(fitText(el, box(100, 0)), 0);
  assertEquals(el.size, 0, "nothing is applied when there is nothing to fit");
});

Deno.test("fittext: quarter-pixel quantisation, never above the fitting size", () => {
  for (const ideal of [7.13, 41.9, 200.02, 613.77]) {
    const el = stub((s) => (s <= ideal ? { w: 1, h: 1 } : { w: 1e6, h: 1e6 }));
    const got = fitText(el, box(500, 900));
    assertEquals(got, Math.floor(got * 4) / 4, `${got} is not a quarter-pixel step`);
    assert(got <= ideal, `${got} exceeds ${ideal}`);
  }
});

// The reason fitText may not grow a closure: the wall's viewer page is served off a phone's LAN socket and
// inlines this source instead of importing it. Compiling in an empty scope is exactly what that page does.
Deno.test("fittext: the source survives being inlined with no module scope", () => {
  const src = fitTextSource();
  assert(src.startsWith("function fitText"), src.slice(0, 40));
  const inlined = new Function(`"use strict"; return (${src});`)();
  const el = stub((s) => ({ w: 6.6 * s, h: 1.2 * s }));
  assertEquals(Math.round(inlined(el, box(330, 800))), 50, "the inlined copy must behave identically");
});

Deno.test("fittext: the wrap contract keeps a long unbreakable word from shrinking the poster", () => {
  assert(FIT_CSS.includes("overflow-wrap:anywhere"), FIT_CSS);
  assert(FIT_CSS.includes("pre-wrap"), "authored line breaks are part of the phrase");
});
