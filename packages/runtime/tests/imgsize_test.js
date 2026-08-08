// microspec runtime — imgsize unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { fitResolution, sizeFor, estimateSeconds, QUALITY, DEFAULT, MAX_SIDE, AR } from "../imgsize.js";

Deno.test("imgsize fitResolution: fills the MP budget at the exact screen ratio, 32-aligned, ≤ budget", () => {
  // S25 Ultra: 384×832 @ dpr 3.5 → 1344×2912 physical ≈ 3.9 MP, already under 4 MP.
  const r = fitResolution(384, 832, 3.5, 4);
  assertEquals(r.width % 32, 0);
  assertEquals(r.height % 32, 0);
  assert(r.width * r.height <= 4_000_000, `over budget: ${r.width}×${r.height}`);
  assert(r.height > r.width, "portrait screen must stay portrait");
  // aspect within one 32-step of the source ratio
  assert(Math.abs(r.width / r.height - 384 / 832) < 0.04, `ratio drift ${r.width}/${r.height}`);
});

Deno.test("imgsize fitResolution: a big screen scales DOWN to the budget", () => {
  const r = fitResolution(4000, 4000, 2, 4);   // 8000² = 64 MP → must land ≤ 4 MP
  assert(r.width * r.height <= 4_000_000, `${r.width}×${r.height} over 4MP`);
  assert(r.width * r.height > 3_000_000, "should still fill most of the budget");
  assert(Math.abs(r.width - r.height) <= 32, "square in → near-square out (one 32-step of shrink-to-fit)");
});

Deno.test("imgsize fitResolution: 16:9 desktop stays ≤ budget and 32-aligned", () => {
  const r = fitResolution(1920, 1080, 1, 4);
  assertEquals(r.width % 32, 0);
  assertEquals(r.height % 32, 0);
  assert(r.width * r.height <= 4_000_000);
  assert(r.width > r.height, "landscape stays landscape");
});

Deno.test("imgsize fitResolution: tiny/degenerate input clamps to the 64px floor", () => {
  const r = fitResolution(10, 10, 1, 4);
  assert(r.width >= 64 && r.height >= 64);
  assertEquals(r.width % 32, 0);
});

Deno.test("imgsize fitResolution: a smaller MP budget yields a smaller image", () => {
  const hi = fitResolution(1000, 1000, 2, 4), lo = fitResolution(1000, 1000, 2, 1);
  assert(lo.width * lo.height < hi.width * hi.height, "1MP budget must be smaller than 4MP");
  assert(lo.width * lo.height <= 1_000_000);
});

Deno.test("imgsize sizeFor: every quality stop is exact 3:4, 32-aligned and within the Space ceiling", () => {
  for (const stop of QUALITY) {
    const s = sizeFor(stop);
    assertEquals(s.width % 32, 0, `width 32-aligned (${s.width})`);
    assertEquals(s.height % 32, 0, `height 32-aligned (${s.height})`);
    assert(s.width <= MAX_SIDE && s.height <= MAX_SIDE, `≤ ${MAX_SIDE} per side (${s.width}×${s.height})`);
    assert(Math.abs(s.width / s.height - AR) < 1e-9, `exact 3:4 (${s.width}×${s.height})`);
  }
  // the DEFAULT stop is the app's balanced render — must stay the pre-slider 768×1024 (no regression)
  const def = sizeFor(QUALITY[DEFAULT]);
  assertEquals([def.width, def.height], [768, 1024]);
  // the top stop is the high-res max the big FLUX Spaces honour
  const hi = sizeFor(QUALITY.at(-1));
  assertEquals([hi.width, hi.height], [1536, 2048]);
});

Deno.test("imgsize sizeFor: higher stop is strictly larger; over-cap input clamps to the ceiling", () => {
  for (let i = 1; i < QUALITY.length; i++) {
    const lo = sizeFor(QUALITY[i - 1]), hi = sizeFor(QUALITY[i]);
    assert(hi.width * hi.height > lo.width * lo.height, `stop ${i} larger than ${i - 1}`);
  }
  const over = sizeFor(4096);
  assert(over.width <= MAX_SIDE && over.height <= MAX_SIDE, "beyond-ceiling long edge clamps to MAX_SIDE");
});

Deno.test("imgsize estimateSeconds: monotonic in area, in a plausible band across the ladder", () => {
  const draft = sizeFor(QUALITY[0]), full = sizeFor(QUALITY.at(-1));
  const eDraft = estimateSeconds(draft.width, draft.height), eFull = estimateSeconds(full.width, full.height);
  assert(eDraft < eFull, "a bigger image estimates a longer wait");
  assert(eDraft >= 5 && eFull <= 40, `estimates stay in a plausible band (${eDraft}s … ${eFull}s)`);
  // strictly increasing at every step of the quality ladder
  for (let i = 1; i < QUALITY.length; i++) {
    const a = sizeFor(QUALITY[i - 1]), b = sizeFor(QUALITY[i]);
    assert(estimateSeconds(b.width, b.height) > estimateSeconds(a.width, a.height), `estimate rises at stop ${i}`);
  }
});
