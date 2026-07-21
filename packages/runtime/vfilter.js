// vfilter — pure helpers for cleaning a scraped video feed (apps/reel): drop duplicate clips and detect
// "black/broken" posters. Kept here (not in the app) so the logic is unit-tested; the app owns only the DOM
// side (loading a poster into a canvas) — this module never touches the DOM.

// Stable identity for a video item. Prefer the ORIGINAL (pre-proxy) URL, and key on origin + pathname so
// signed / cache-busted query variants of the same file collapse to one (`…/clip.mp4?token=a` and `?token=b`
// are the same clip). Falls back to the raw string when it isn't a URL. A video FILE's identity is its path,
// not its query, so stripping the query is safe here and catches the common "listed twice / re-signed" dupes.
function keyOf(item) {
  const u = (item && (item.orig || item.video)) || "";
  try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; }
}

// dedupeVideos(items) — drop duplicate clips, preserving order and the FIRST occurrence (which carries the
// best title/poster from JSON-LD, usually listed before the bare <video>). Items without a usable key are
// always kept (we can't prove they're dupes).
export function dedupeVideos(items) {
  const seen = new Set(), out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const k = keyOf(it);
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    out.push(it);
  }
  return out;
}

// isBlackSample(rgba, opts) — classify a small canvas sample (RGBA bytes from getImageData) as a
// "black/broken" poster: near-zero MEAN luma AND no meaningfully bright pixel ANYWHERE. The peak test is the
// discriminator — a real frame, even a night scene, has some highlight (a light, a rim, a face); a broken or
// placeholder frame is uniformly ~0. Alpha is ignored (posters are opaque; a fully transparent one reads as
// blank too, which is equally unwanted). Rec.601 luma. Conservative thresholds → fail toward KEEPING a clip.
export function isBlackSample(rgba, { meanMax = 12, peakMax = 24 } = {}) {
  if (!rgba || rgba.length < 4) return false;
  let sum = 0, peak = 0, n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    sum += l; if (l > peak) peak = l; n++;
  }
  if (!n) return false;
  return (sum / n) <= meanMax && peak <= peakMax;
}
