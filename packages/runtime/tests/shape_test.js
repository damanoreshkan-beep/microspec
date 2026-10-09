import { assert, assertEquals, assertNotEquals, assertThrows } from "jsr:@std/assert@1";
import { pkgRoot } from "../pkgroot.js";
import { NAMES, ORGANIC, shapeOf, pathOf, scalePath, morpher, morphTo, shaper, EASE_IN_OUT } from "../shape.js";

const nums = (d) => d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi).map(Number);

Deno.test("shape — the 35 Material shapes, and an organic set drawn only from them", () => {
  assertEquals(NAMES.length, 35);
  assert(ORGANIC.length >= 8);
  for (const n of ORGANIC) assert(NAMES.includes(n), `${n} is not a Material shape`);
  for (const bad of ["Heart", "Arrow", "Burst", "Boom", "PixelCircle", "Ghostish", "Square", "Circle"]) {
    assert(!ORGANIC.includes(bad), `${bad} is a sign or a plain box, not an organic form`);
  }
});

Deno.test("shape — shapeOf is stable per seed and spreads over the set", () => {
  assertEquals(shapeOf("a1b2c3d4e5f60718"), shapeOf("a1b2c3d4e5f60718"), "same seed, same form, every device");
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(shapeOf(`song-${i}`));
  assert(seen.size >= ORGANIC.length - 1, `200 seeds reached only ${seen.size} of ${ORGANIC.length} forms`);
  assertEquals(shapeOf(42, ["Flower"]), "Flower", "a caller's own set is honoured");
});

Deno.test("shape — pathOf is a closed unit-box path, and throws on an unknown name", () => {
  const d = pathOf("Cookie7Sided");
  assert(d.startsWith("M") && /Z\s*$/i.test(d), "a closed path");
  for (const n of nums(d)) assert(n >= -0.01 && n <= 1.01, `coordinate ${n} outside the unit box`);
  assertEquals(pathOf("Cookie7Sided"), d, "cached and stable");
  assertThrows(() => pathOf("Nope"));
});

Deno.test("shape — scalePath lays x on the width and y on the height", () => {
  assertEquals(scalePath("M0.5 0.25L1 1Z", 200, 100), "M100 25L200 100Z");
  assertEquals(scalePath("M.5 .5C0 0 1 1 .25 .75Z", 10), "M5 5C0 0 10 10 2.5 7.5Z");
  const big = nums(scalePath(pathOf("Flower"), 260));
  assert(Math.max(...big) <= 263 && Math.min(...big) >= -3, "the form fills the box, not more");
});

Deno.test("shape — morpher runs from one form to the other with one path structure", () => {
  const at = morpher("Cookie4Sided", "Clover8Leaf");
  const a = at(0), mid = at(0.5), b = at(1);
  assertNotEquals(a, b);
  assertEquals(a.replace(/[-\d.e]+/gi, "#"), mid.replace(/[-\d.e]+/gi, "#"), "every frame has the same commands — what a clip-path tween needs");
  assertEquals(at(-1), a, "progress clamps");
  assertEquals(at(2), b, "progress clamps");
  assertEquals(morpher("Puffy", "Puffy")(0.3), pathOf("Puffy"), "a morph to itself is the shape");
});

Deno.test("shape — EASE_IN_OUT is the runtime.css --ease-in-out curve", () => {
  assertEquals(EASE_IN_OUT(0), 0);
  assertEquals(EASE_IN_OUT(1), 1);
  assert(EASE_IN_OUT(0.2) < 0.1, "a strong ease: slow out of the start");
  assert(EASE_IN_OUT(0.8) > 0.9, "…and a long settle into the end");
  for (let t = 0.05; t <= 1; t += 0.05) assert(EASE_IN_OUT(t) >= EASE_IN_OUT(t - 0.05), "never runs backwards");
  const css = Deno.readTextFileSync(new URL("packages/runtime/runtime.css", pkgRoot(import.meta.url, 3)));
  assert(/--ease-in-out:\s*cubic-bezier\(\.77,\s*0,\s*\.175,\s*1\)/.test(css), "runtime.css and shape.js must name the same curve");
});

Deno.test("shape — morphTo with no frame clock lands at once (Deno has no rAF; the gate and reduced motion take the same path)", () => {
  const frames = [];
  let done = 0;
  morphTo("Sunny", "Flower", { onFrame: (d, t) => frames.push([d, t]), onDone: () => done++ });
  assertEquals(frames.length, 1);
  assertEquals(frames[0], [morpher("Sunny", "Flower")(1), 1], "the morph's own last frame (corner-matched, so not pathOf's vertex order)");
  assertEquals(done, 1);
});

Deno.test("shape — shaper draws at once and follows its latest target", () => {
  const seen = [];
  const s = shaper("Sunny", (d) => seen.push(d));
  assertEquals(seen, [pathOf("Sunny")]);
  s.to("Flower");
  s.to("Puffy");
  assertEquals(s.current, "Puffy", "instant here, so every target lands; the last one is where it rests");
  assertEquals(seen.at(-1), morpher("Flower", "Puffy")(1));
  s.to("Puffy");
  assertEquals(seen.length, 3, "a target it already rests on draws nothing");
  s.stop();
});
