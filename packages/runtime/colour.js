
export const clamp8 = (n) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

export const rgbToHex = ([r, g, b]) =>
  "#" + [r, g, b].map((n) => clamp8(n).toString(16).padStart(2, "0")).join("").toUpperCase();

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

export function avgColor(px) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 2 < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
}

export function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const ink = (rgb) => (luminance(rgb) > 0.4 ? "#000000" : "#FFFFFF");

export function palette(px, k = 5) {
  const pts = [];
  const stride = 4 * Math.max(1, Math.floor(px.length / 4 / 4000)); 
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
    if (bi < 0 || bestRange === 0) break; 
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
