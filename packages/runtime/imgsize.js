/* @ts-self-types="./imgsize.d.ts" */
/**
 * # runtime/imgsize.js — the "wallpaper for THIS screen" request size, deterministic and 32-aligned
 *
 * Image-generation request sizing, pure and unit-tested. The wow of an image generator on a phone is a result
 * that fills the exact device screen at native pixel density, at the highest quality the model allows:
 * `fitResolution` takes the physical viewport (CSS px × devicePixelRatio), keeps its EXACT aspect ratio, scales
 * to fill the model's megapixel budget (FLUX.2 = up to 4 MP), snaps each side to a multiple of 32 (diffusion
 * latents are 32-aligned) and never drops below 64. The quality stops (`QUALITY`, `DEFAULT`, `AR`, `MAX_SIDE`),
 * `sizeFor` and `estimateSeconds` back the Imagine composer's quality slider — resolution is the one quality
 * axis the free Spaces actually respect. No DOM, no network, so the request size is the same under the gate as on a phone.
 *
 * ![The imgsize module map: viewport × dpr → megapixel budget → 32-snap; quality stops → sizeFor → estimateSeconds](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-imgsize.svg)
 *
 * ## Import
 * ```js
 * import { fitResolution, sizeFor, estimateSeconds, QUALITY, DEFAULT, AR, MAX_SIDE } from "/_rt/imgsize.js";                    // an app's page: the import map resolves /_rt/
 * import { fitResolution, sizeFor, estimateSeconds, QUALITY, DEFAULT, AR, MAX_SIDE } from "@microspec/core/runtime/imgsize.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link fitResolution} — `fitResolution(vw, vh, dpr = 1, maxMP = 4)` → `{ width, height, mp }` in device pixels: the viewport's ratio, scaled to the budget, 32-snapped, shrunk a step at a time if snapping overshot.
 * - {@link sizeFor} — `sizeFor(longEdge)` → `{ width, height, mp }`: a quality stop (the height, portrait) to the concrete request size, `AR` kept, capped at `MAX_SIDE`.
 * - {@link estimateSeconds} — `estimateSeconds(w, h)` → whole seconds: a start-up floor plus a per-megapixel cost; always show it with a "~".
 * - {@link QUALITY} — `[512, 768, 1024, 1536, 2048]`, long-edge stops draft to max, each a multiple of 128 so ×AR stays 32-aligned.
 * - {@link DEFAULT} — `2`: the index of the default stop (1024 long edge → 768×1024).
 * - {@link AR} — `3 / 4`: the composer's portrait frame as width ÷ height.
 * - {@link MAX_SIDE} — `2048`: the per-side ceiling the free FLUX Spaces honour before silently clamping.
 *
 * ## In practice
 * ```js
 * // Illustrative — the values are the ones the unit tests pin.
 * import { fitResolution, sizeFor, estimateSeconds, QUALITY, DEFAULT } from "/_rt/imgsize.js";
 *
 * // A wallpaper for this exact screen: S25 Ultra 384×832 @ dpr 3.5 ≈ 3.9 MP, already under the 4 MP budget.
 * const wall = fitResolution(innerWidth, innerHeight, devicePixelRatio, 4);   // { width, height, mp }, both sides % 32 === 0
 *
 * // The composer's quality slider: an index into QUALITY, DEFAULT selected.
 * const stop = QUALITY[DEFAULT];                    // 1024
 * const { width, height } = sizeFor(stop);          // 768 × 1024 — exact 3:4
 * const eta = `~${estimateSeconds(width, height)}s`; // "~12s"; sizeFor(2048) → 1536×2048 → "~31s"
 * ```
 *
 * ## How it fits
 * Imports nothing and touches no DOM — a leaf. No other runtime module imports it; its consumer is the Imagine
 * composer (the quality slider and the fill-the-screen request) and `packages/runtime/tests/imgsize_test.js`,
 * which pins the S25 Ultra fit, the scale-down of an oversized screen, the 64px floor and every quality stop.
 * No farm app currently imports `/_rt/imgsize.js` directly.
 *
 * ## Invariants and pitfalls
 * - Both sides are multiples of 32 and at least 64 — diffusion latents are 32-aligned, and a degenerate viewport
 *   clamps to the floor instead of producing a zero.
 * - {@link fitResolution} never exceeds the budget: after snapping (which can push the product just over) it shrinks
 *   the longer side one 32-step at a time until it fits. The budget floor is 0.25 MP; a falsy `dpr` counts as 1.
 * - The aspect ratio is the SCREEN's, not a preset — portrait in stays portrait out, 16:9 stays landscape.
 * - The free HF Gradio Spaces honour width/height only up to {@link MAX_SIDE} per side and clamp silently past it,
 *   and their step counts are fixed per model — resolution is the only quality axis they respect.
 * - Every {@link QUALITY} stop is a multiple of 128 so ×AR lands on a clean 32-multiple (exact 3:4, no drift);
 *   the top two (1536/2048) only the big FLUX Spaces can serve — slower, a touch less reliable, offered not default.
 * - {@link DEFAULT} is the balanced 768×1024 the app always rendered, NOT the max, so the slider trades both ways.
 * - {@link estimateSeconds} is deliberately one rough number (6 s floor + 8 s/MP, anchored to the measured warm
 *   cascade): a warm realtime Space is seconds, a cold ZeroGPU fallback far slower — surface it with a "~".
 * @module
 */
// imgsize — the "wallpaper for THIS screen" resolution. The wow of an image generator on a phone is a result
// that fills the exact device screen at native pixel density, at the highest quality the model allows. So:
// take the physical viewport (CSS px × devicePixelRatio), keep its EXACT aspect ratio, and scale to fill the
// model's megapixel budget (FLUX.2 = up to 4 MP). Snap each side to a multiple of 32 (diffusion latents are
// 32-aligned) and never drop below 64. Pure + unit-tested so the request size is deterministic and gate-safe.
const MULT = 32, MIN = 64;
const snap = (n) => Math.max(MIN, Math.round(n / MULT) * MULT);

/**
 * Fit the physical viewport to a megapixel budget, keeping its aspect ratio and snapping each side to 32.
 * @param vw viewport width in CSS px
 * @param vh viewport height in CSS px
 * @param dpr devicePixelRatio (default 1)
 * @param maxMP megapixel budget (default 4)
 * @returns `{ width, height, mp }` in device pixels
 */
export function fitResolution(vw, vh, dpr = 1, maxMP = 4) {
  let w = Math.max(1, vw) * (dpr || 1), h = Math.max(1, vh) * (dpr || 1);
  const budget = Math.max(0.25, maxMP) * 1_000_000;
  const area = w * h;
  if (area > budget) { const s = Math.sqrt(budget / area); w *= s; h *= s; }   // scale down to the budget, ratio kept
  w = snap(w); h = snap(h);
  // snapping up can push the product just over budget — shrink the longer side a step at a time until it fits.
  while (w * h > budget && (w > MIN || h > MIN)) { if (w >= h) w = Math.max(MIN, w - MULT); else h = Math.max(MIN, h - MULT); }
  return { width: w, height: h, mp: Math.round((w * h) / 10_000) / 100 };
}

// ── Quality → request size → time estimate, for the Imagine composer's quality slider.
// The free HF Gradio Spaces honour width/height only up to MAX_SIDE per side (beyond that they silently
// clamp), and their step counts are fixed per-model — so the one quality axis the backend actually respects
// is resolution. Bigger image = more detail = more diffusion compute = longer wait, which is exactly what
// the estimate below reflects. Portrait 3:4 (the composer's frame); each stop's long edge ×AR lands on a
// clean 32-multiple, so the aspect ratio is exact with no drift.
/** The composer's frame: portrait 3:4, as width ÷ height. */
export const AR = 3 / 4;                                   // portrait 3:4 — width ÷ height
/** Per-side ceiling (px) the free FLUX Spaces honour before silently clamping. */
export const MAX_SIDE = 2048;                              // FLUX schnell/dev honour up to 2048/side (SD3=1344,
                                                          // realtime is smaller — the cascade falls through)
// Long-edge (px) stops, 0 = draft … top = max. Every stop is a multiple of 128, so ×AR lands on a clean
// 32-multiple (exact 3:4, no drift). The top two (1536/2048) only the big FLUX Spaces can serve, so they're
// slower and a touch less reliable — offered, not the default.
/** Long-edge stops (px) of the quality slider, draft to max; each a multiple of 128 so ×AR stays 32-aligned. */
export const QUALITY = [512, 768, 1024, 1536, 2048];
// The default stop — balanced and reliable (768×1024, what the app always rendered). NOT the max, so the
// slider trades both ways: down to a fast draft, up to a slow high-res render.
/** Index into `QUALITY` of the default stop (1024 long edge → 768×1024). */
export const DEFAULT = 2;

// A quality stop (long edge, px) → the concrete request size. AR kept, both sides latent-aligned to 32 and
// never past the Space ceiling. Portrait, so the long edge is the height.
/**
 * Turn a quality stop into the concrete portrait request size.
 * @param longEdge the long edge in px (the height)
 * @returns `{ width, height, mp }`, 32-aligned and capped at `MAX_SIDE`
 */
export function sizeFor(longEdge) {
  const h = Math.min(MAX_SIDE, snap(Math.max(MIN, longEdge)));
  const w = Math.min(MAX_SIDE, snap(h * AR));
  return { width: w, height: h, mp: Math.round((w * h) / 10_000) / 100 };
}

// Approximate wall-clock for one free-Space generation: a small start-up floor plus a per-megapixel cost.
// Deliberately a single rough number (a warm realtime Space is seconds; a cold ZeroGPU fallback is far
// slower — the truth swings), always surfaced with a "~". Anchored to the measured warm cascade (~2s at
// 0.8 MP, ~9s at 3.1 MP) with a buffer for cold-start/queue, giving ~8s draft … ~31s at the 1536×2048 max.
const COLD = 6, PER_MP = 8;
/**
 * Rough wall-clock estimate for one free-Space generation at a given size — always show it with a "~".
 * @param w width in px
 * @param h height in px
 * @returns whole seconds
 */
export function estimateSeconds(w, h) {
  return Math.round(COLD + PER_MP * (w * h) / 1_000_000);
}
