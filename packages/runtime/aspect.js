
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export function frameContent(rgba, sw, sh, { dark = 18, run = 0.94, minSide = 0.22, skew = 2, step = 18 } = {}) {
  if (!rgba || !(sw > 1) || !(sh > 1) || rgba.length < sw * sh * 4) return null;
  const colDark = new Array(sw).fill(0), rowDark = new Array(sh).fill(0);
  const L = new Float64Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const l = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
      L[y * sw + x] = l;
      if (l <= dark) { colDark[x]++; rowDark[y]++; }
    }
  }
  const lead = (arr, n, len) => { let k = 0; while (k < Math.floor(len / 2) && arr[k] / n >= run) k++; return k; };
  const trail = (arr, n, len) => { let k = 0; while (k < Math.floor(len / 2) && arr[len - 1 - k] / n >= run) k++; return k; };
  const l = lead(colDark, sh, sw), r = trail(colDark, sh, sw);
  const t = lead(rowDark, sw, sh), b = trail(rowDark, sw, sh);
  const cw = sw - l - r, ch = sh - t - b;
  if (cw < sw * minSide || ch < sh * minSide) return null;
  if ((l || r) && Math.abs(l - r) > skew) return null;
  if ((t || b) && Math.abs(t - b) > skew) return null;
  if (l || r || t || b) {
    let inSum = 0, inN = 0, barSum = 0, barN = 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const inside = x >= l && x < sw - r && y >= t && y < sh - b;
        if (inside) { inSum += L[y * sw + x]; inN++; } else { barSum += L[y * sw + x]; barN++; }
      }
    }
    const bar = barN ? barSum / barN : 0, content = inN ? inSum / inN : 0;
    if (bar > dark || content - bar < step) return null;
  }
  return { x: l / sw, y: t / sh, w: cw / sw, h: ch / sh };
}



export function sameContent(a, b, tol = 0.035) {
  if (!a || !b) return false;
  return ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
}


export function fitPlan(intrinsic, content, view, { maxCrop = 0.25, maxZoom = 5 } = {}) {
  const iw = Number(intrinsic?.w), ih = Number(intrinsic?.h);
  const vw = Number(view?.w), vh = Number(view?.h);
  const flat = { fill: false, scale: 1, dx: 0, dy: 0, crop: 1, aspect: 0 };
  if (!(iw > 0) || !(ih > 0) || !(vw > 0) || !(vh > 0)) return flat;
  const c = content && content.w > 0 && content.h > 0 ? content : { x: 0, y: 0, w: 1, h: 1 };
  const fileAR = iw / ih, viewAR = vw / vh;
  const aspect = fileAR * (c.w / c.h);                                  
  const crop = 1 - Math.min(aspect, viewAR) / Math.max(aspect, viewAR);
  if (crop > maxCrop) return { ...flat, crop, aspect };
  const dw = fileAR > viewAR ? vw : vh * fileAR;                        
  const dh = fileAR > viewAR ? vw / fileAR : vh;
  const scale = Math.min(maxZoom, Math.max(vw / (dw * c.w), vh / (dh * c.h)));
  const cx = dw * (c.x + c.w / 2 - 0.5), cy = dh * (c.y + c.h / 2 - 0.5);
  return { fill: scale > 1.001, scale, dx: -scale * cx, dy: -scale * cy, crop, aspect };
}