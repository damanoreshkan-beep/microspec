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
