// imgsize — the "wallpaper for THIS screen" resolution. The wow of an image generator on a phone is a result
// that fills the exact device screen at native pixel density, at the highest quality the model allows. So:
// take the physical viewport (CSS px × devicePixelRatio), keep its EXACT aspect ratio, and scale to fill the
// model's megapixel budget (FLUX.2 = up to 4 MP). Snap each side to a multiple of 32 (diffusion latents are
// 32-aligned) and never drop below 64. Pure + unit-tested so the request size is deterministic and gate-safe.
const MULT = 32, MIN = 64;
const snap = (n) => Math.max(MIN, Math.round(n / MULT) * MULT);

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
export const AR = 3 / 4;                                   // portrait 3:4 — width ÷ height
export const MAX_SIDE = 2048;                              // FLUX schnell/dev honour up to 2048/side (SD3=1344,
                                                          // realtime is smaller — the cascade falls through)
// Long-edge (px) stops, 0 = draft … top = max. Every stop is a multiple of 128, so ×AR lands on a clean
// 32-multiple (exact 3:4, no drift). The top two (1536/2048) only the big FLUX Spaces can serve, so they're
// slower and a touch less reliable — offered, not the default.
export const QUALITY = [512, 768, 1024, 1536, 2048];
// The default stop — balanced and reliable (768×1024, what the app always rendered). NOT the max, so the
// slider trades both ways: down to a fast draft, up to a slow high-res render.
export const DEFAULT = 2;

// A quality stop (long edge, px) → the concrete request size. AR kept, both sides latent-aligned to 32 and
// never past the Space ceiling. Portrait, so the long edge is the height.
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
export function estimateSeconds(w, h) {
  return Math.round(COLD + PER_MP * (w * h) / 1_000_000);
}
