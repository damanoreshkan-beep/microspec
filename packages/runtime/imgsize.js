const MULT = 32, MIN = 64;
const snap = (n) => Math.max(MIN, Math.round(n / MULT) * MULT);

export function fitResolution(vw, vh, dpr = 1, maxMP = 4) {
  let w = Math.max(1, vw) * (dpr || 1), h = Math.max(1, vh) * (dpr || 1);
  const budget = Math.max(0.25, maxMP) * 1_000_000;
  const area = w * h;
  if (area > budget) { const s = Math.sqrt(budget / area); w *= s; h *= s; }   
  w = snap(w); h = snap(h);
  while (w * h > budget && (w > MIN || h > MIN)) { if (w >= h) w = Math.max(MIN, w - MULT); else h = Math.max(MIN, h - MULT); }
  return { width: w, height: h, mp: Math.round((w * h) / 10_000) / 100 };
}

export const AR = 3 / 4;                                   
export const MAX_SIDE = 1024;                              
export const QUALITY = [512, 640, 768, 896, 1024];        

export function sizeFor(longEdge) {
  const h = Math.min(MAX_SIDE, snap(Math.max(MIN, longEdge)));
  const w = Math.min(MAX_SIDE, snap(h * AR));
  return { width: w, height: h, mp: Math.round((w * h) / 10_000) / 100 };
}

const COLD = 11, PER_MP = 26;
export function estimateSeconds(w, h) {
  return Math.round(COLD + PER_MP * (w * h) / 1_000_000);
}
