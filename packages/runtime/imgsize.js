/* @ts-self-types="./imgsize.d.ts" */
/**
 * Image-generation request sizing. `fitResolution` turns the physical viewport into the "wallpaper for THIS
 * screen" size — exact aspect ratio, scaled to the model's megapixel budget, 32-aligned for diffusion
 * latents. The quality stops (`QUALITY`, `DEFAULT`, `AR`, `MAX_SIDE`), `sizeFor` and `estimateSeconds` back
 * the Imagine composer's quality slider. Pure and unit-tested so the request size is deterministic.
 * @module
 */
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
  if (area > budget) { const s = Math.sqrt(budget / area); w *= s; h *= s; }   
  w = snap(w); h = snap(h);
  while (w * h > budget && (w > MIN || h > MIN)) { if (w >= h) w = Math.max(MIN, w - MULT); else h = Math.max(MIN, h - MULT); }
  return { width: w, height: h, mp: Math.round((w * h) / 10_000) / 100 };
}

/** The composer's frame: portrait 3:4, as width ÷ height. */
export const AR = 3 / 4;                                   
/** Per-side ceiling (px) the free FLUX Spaces honour before silently clamping. */
export const MAX_SIDE = 2048;                              
/** Long-edge stops (px) of the quality slider, draft to max; each a multiple of 128 so ×AR stays 32-aligned. */
export const QUALITY = [512, 768, 1024, 1536, 2048];
/** Index into `QUALITY` of the default stop (1024 long edge → 768×1024). */
export const DEFAULT = 2;

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
