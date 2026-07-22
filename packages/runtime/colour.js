// colour.js — pixel → colour maths for the camera picker (and any app reading a frame). Pure,
// zero-dependency, unit-tested. Inputs are plain [r,g,b] (0..255) and RGBA pixel buffers (Uint8ClampedArray
// or number[]), so every function runs in the headless gate on a seeded buffer — no canvas required.

export const clamp8 = (n) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

export const rgbToHex = ([r, g, b]) =>
  "#" + [r, g, b].map((n) => clamp8(n).toString(16).padStart(2, "0")).join("").toUpperCase();

// [r,g,b] 0..255 → [h 0..360, s 0..100, l 0..100]
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// mean colour of an RGBA buffer (every 4th byte is alpha, ignored)
export function avgColor(px) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 2 < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
}

// WCAG relative luminance (0..1) — used to choose a readable ink over a swatch.
export function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const ink = (rgb) => (luminance(rgb) > 0.4 ? "#000000" : "#FFFFFF");

// "#rgb" / "#rrggbb" → [r,g,b] 0..255. Tolerant: strips '#', expands shorthand, pads/clamps garbage to 0.
export function hexRgb(hex) {
  const s = String(hex).replace(/^#/, "");
  const h = (s.length === 3 ? s.replace(/(.)/g, "$1$1") : s).padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
}

// Adaptive app-icon tint. Apps declare a dark brand `bg` + an accent `fg`; a raw dark bg reads as a heavy
// black square on the LIGHT theme, so derive a {tile, glyph} pair that stays colourful AND legible in BOTH
// themes — the same icon adapts with the theme instead of being a flat black square. The colour source is the
// accent, unless it's inky/near-neutral-light (low saturation + high luminance, e.g. an ink-white accent),
// in which case we fall back to the brand `bg` so a light tile isn't a washed-out white with an invisible
// glyph. Returns CSS strings (color-mix, oklch) — resolved by the browser, so no JS re-tint per pixel.
export function iconTint(bg, fg, dark) {
  const rgb = hexRgb(fg), [, sat] = rgbToHsl(rgb);
  const hue = (sat < 18 && luminance(rgb) > 0.5) ? bg : fg;   // inky accent → colour from the brand bg
  return dark
    ? { tile: `linear-gradient(145deg, color-mix(in oklch, ${hue} 24%, ${bg}), ${bg})`, glyph: fg }
    : { tile: `linear-gradient(145deg, color-mix(in oklch, ${hue} 22%, #fff), color-mix(in oklch, ${hue} 8%, #fff))`, glyph: `color-mix(in oklch, ${hue} 84%, #000)` };
}

// Dominant palette of an RGBA buffer via median cut: repeatedly split the colour box with the widest
// channel spread at its median, until k boxes, then average each. Deterministic — same pixels → same
// palette (shareable, gate-stable). Returns up to k [r,g,b]; fewer only if the image has fewer colours.
export function palette(px, k = 5) {
  const pts = [];
  const stride = 4 * Math.max(1, Math.floor(px.length / 4 / 4000)); // cap ~4000 samples
  for (let i = 0; i + 2 < px.length; i += stride) pts.push([px[i], px[i + 1], px[i + 2]]);
  if (!pts.length) return [];
  let boxes = [pts];
  while (boxes.length < k) {
    let bi = -1, bestRange = -1, bestCh = 0;
    boxes.forEach((box, idx) => {
      for (let c = 0; c < 3; c++) {
        let mn = 255, mx = 0;
        for (const p of box) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
        if (mx - mn > bestRange) { bestRange = mx - mn; bi = idx; bestCh = c; }
      }
    });
    if (bi < 0 || bestRange === 0) break; // every box is a single colour — nothing left to split
    const box = boxes[bi].slice().sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter((b) => b.length).map((box) => {
    let r = 0, g = 0, b = 0;
    for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
    return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
  });
}
