// aspect — how a clip should be fitted to the surface it plays on, for the case where the file's own numbers
// lie about what is inside it. Pure maths (no DOM): the caller samples a frame, this decides the framing.
//
// Measured on a real feed (2026-08-06, gitignored `aspect.local_test.js`): on a page whose every clip is
// vertical, 12 of 12 grid previews declared 320x180 with DAR 16:9 and a 323x182 poster — while ffmpeg
// cropdetect on the same files reported `crop=100:180:108:0`. The portrait frame is PILLARBOXED into a
// landscape file, so every metadata channel says landscape and only the pixels disagree.
// Hence: orientation comes from a sampled frame, and `object-fit` alone can never fix it — the bars are
// pixels, so the content has to be zoomed past them.

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/* frameContent(rgba, sw, sh) → the non-black content box as FRACTIONS of the frame ({x,y,w,h}), or null when
   the sample cannot be trusted. A full frame (no bars) returns the whole box — that is a real answer, and the
   one an unpadded vertical clip gives.
   Four guards, and each exists because a dark SCENE would otherwise read as a bar:
     · `run` — a bar column is dark for ~all of its height, not most of it (a caption/logo is tolerated);
     · `skew` — a pillarbox is centred, so the two bars match within a cell or two;
     · `step` — the bar is BLACK and the content is meaningfully brighter, i.e. there is an edge, not a fade;
     · `minSide` — nothing survives if the "content" is a sliver.
   The fifth guard is not here because it is temporal: `sameContent` over two samples. Bars do not move. */
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

// sameContent(a, b) — do two samples describe the same box? The temporal guard: baked bars are identical from
// frame to frame, a dark shot is not. Two nulls do NOT agree (nothing was measured).
export function sameContent(a, b, tol = 0.035) {
  if (!a || !b) return false;
  return ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
}

/* fitPlan(intrinsic, content, view) → {fill, scale, dx, dy, crop, aspect}: how to present the CONTENT of a
   clip on a surface, given the file's intrinsic size, the content box inside it (fractions, from
   frameContent) and the surface's measured box. The DOM contract is one transform over `object-fit: contain`:
       transform: translate(dx px, dy px) scale(scale)
   `contain` lays the whole file out centred, so the content box is a known rectangle inside it; the transform
   zooms that rectangle to cover the surface and re-centres it. One formula covers both shapes — a padded
   landscape file and a genuinely vertical one (whose content box is the whole frame).
   `maxCrop` is the budget for what covering costs, and it is what keeps a landscape clip untouched. Measured
   against the gate's own breakpoints for a 9:16 content box: 0.2% at 320x568, 17.9% at 384x832 (the reference
   device), 20.0% at 412x915 — then 41.3% at split 412x430 and 46.9% at split-sm 360x340. So 0.25 fills on
   every phone shape and refuses in split-screen, where cropping half the clip away would be amputation; a
   16:9 clip costs 74% on a phone and is never touched. */
export function fitPlan(intrinsic, content, view, { maxCrop = 0.25, maxZoom = 5 } = {}) {
  const iw = Number(intrinsic?.w), ih = Number(intrinsic?.h);
  const vw = Number(view?.w), vh = Number(view?.h);
  const flat = { fill: false, scale: 1, dx: 0, dy: 0, crop: 1, aspect: 0 };
  if (!(iw > 0) || !(ih > 0) || !(vw > 0) || !(vh > 0)) return flat;
  const c = content && content.w > 0 && content.h > 0 ? content : { x: 0, y: 0, w: 1, h: 1 };
  const fileAR = iw / ih, viewAR = vw / vh;
  const aspect = fileAR * (c.w / c.h);                                  // what the CONTENT's aspect really is
  const crop = 1 - Math.min(aspect, viewAR) / Math.max(aspect, viewAR);
  if (crop > maxCrop) return { ...flat, crop, aspect };
  const dw = fileAR > viewAR ? vw : vh * fileAR;                        // the file's laid-out box under contain
  const dh = fileAR > viewAR ? vw / fileAR : vh;
  const scale = Math.min(maxZoom, Math.max(vw / (dw * c.w), vh / (dh * c.h)));
  const cx = dw * (c.x + c.w / 2 - 0.5), cy = dh * (c.y + c.h / 2 - 0.5);
  return { fill: scale > 1.001, scale, dx: -scale * cx, dy: -scale * cy, crop, aspect };
}
