// microspec runtime — colour unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { rgbToHex, rgbToHsl, avgColor, luminance, ink, palette } from "../colour.js";

// build an RGBA buffer from [r,g,b] triples (alpha 255)
const rgba = (triples) => { const a = new Uint8ClampedArray(triples.length * 4); triples.forEach((t, i) => { a[i * 4] = t[0]; a[i * 4 + 1] = t[1]; a[i * 4 + 2] = t[2]; a[i * 4 + 3] = 255; }); return a; };

Deno.test("colour rgbToHex: padded, clamped, upper-case", () => {
  assertEquals(rgbToHex([0, 0, 0]), "#000000");
  assertEquals(rgbToHex([255, 255, 255]), "#FFFFFF");
  assertEquals(rgbToHex([122, 90, 200]), "#7A5AC8");
  assertEquals(rgbToHex([-5, 300, 15]), "#00FF0F"); // clamps out-of-range channels
});

Deno.test("colour rgbToHsl: primaries, greys, achromatic", () => {
  assertEquals(rgbToHsl([255, 0, 0]), [0, 100, 50]);
  assertEquals(rgbToHsl([0, 255, 0]), [120, 100, 50]);
  assertEquals(rgbToHsl([0, 0, 255]), [240, 100, 50]);
  assertEquals(rgbToHsl([0, 0, 0]), [0, 0, 0]);
  assertEquals(rgbToHsl([255, 255, 255]), [0, 0, 100]);
  assertEquals(rgbToHsl([128, 128, 128]), [0, 0, 50]); // grey → no hue, no sat
});

Deno.test("colour avgColor: mean over RGBA, alpha ignored", () => {
  assertEquals(avgColor(rgba([[255, 0, 0], [0, 0, 255]])), [128, 0, 128]);
  assertEquals(avgColor(rgba([[10, 20, 30]])), [10, 20, 30]);
  assertEquals(avgColor(new Uint8ClampedArray(0)), [0, 0, 0]); // empty → black, never NaN
});

Deno.test("colour ink: readable over a swatch (WCAG luminance)", () => {
  assertEquals(ink([255, 255, 255]), "#000000"); // black on white
  assertEquals(ink([0, 0, 0]), "#FFFFFF");       // white on black
  assertEquals(ink([250, 220, 60]), "#000000");  // black on bright yellow
  assert(luminance([255, 255, 255]) > luminance([0, 0, 0]));
});

Deno.test("colour palette: median cut is deterministic and separates dominant colours", () => {
  const buf = rgba([...Array(100).fill([255, 8, 8]), ...Array(100).fill([8, 8, 255])]);
  const p = palette(buf, 2);
  assertEquals(p.length, 2, "two boxes for two dominant colours");
  assertEquals(JSON.stringify(p), JSON.stringify(palette(buf, 2)), "same pixels → same palette");
  const reds = p.filter((c) => c[0] > 200 && c[2] < 60).length;
  const blues = p.filter((c) => c[2] > 200 && c[0] < 60).length;
  assertEquals(reds, 1, "one red-dominant swatch");
  assertEquals(blues, 1, "one blue-dominant swatch");
  // a single-colour image yields a single swatch, never k padded duplicates
  assertEquals(palette(rgba(Array(50).fill([30, 60, 90])), 5).length, 1);
});
