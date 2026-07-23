// vfilter — pure helpers for cleaning a scraped video feed (apps/reel): drop duplicate clips and detect
// "black/broken" posters. Kept here (not in the app) so the logic is unit-tested; the app owns only the DOM
// side (loading a poster into a canvas) — this module never touches the DOM.

// Normalise a URL to its identity: origin + pathname, dropping signing / cache-bust query + hash
// (`…/clip.mp4?token=a` and `?token=b` are the same file). Non-URLs pass through unchanged.
const norm = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u || ""; } };

// dedupeVideos(items) — drop duplicate clips, preserving order and the FIRST occurrence (which carries the
// best title/poster from JSON-LD, usually listed before the bare <video>). Two items are the same clip when
// EITHER their normalised VIDEO url OR their normalised POSTER url matches: a page lists a clip twice
// (JSON-LD + <video>, or re-signed variants) AND — the case the video-url alone misses — broken/unavailable
// clips repeat sharing one placeholder poster thumbnail. Items with neither key are always kept.
export function dedupeVideos(items) {
  const seen = new Set(), out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const vk = norm((it && (it.orig || it.video)) || "");
    const pk = it && it.poster ? norm(it.poster) : "";
    if ((vk && seen.has("v:" + vk)) || (pk && seen.has("p:" + pk))) continue;
    if (vk) seen.add("v:" + vk);
    if (pk) seen.add("p:" + pk);
    out.push(it);
  }
  return out;
}

// lumaStats(rgba) — Rec.601 luma mean / peak / population standard deviation over an RGBA sample (bytes from
// getImageData). Alpha is ignored (posters are opaque; a fully transparent one reads as blank too, which is
// equally unwanted). Returns null for an empty/too-short sample so callers can fail toward KEEPING a clip.
function lumaStats(rgba) {
  if (!rgba || rgba.length < 4) return null;
  let sum = 0, sumSq = 0, peak = 0, n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    sum += l; sumSq += l * l; if (l > peak) peak = l; n++;
  }
  if (!n) return null;
  const mean = sum / n;
  return { mean, peak, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
}

// isBlackSample(rgba, opts) — classify a small canvas sample as a "black/broken" poster: near-zero MEAN luma
// AND no meaningfully bright pixel ANYWHERE. The peak test is the discriminator — a real frame, even a night
// scene, has some highlight (a light, a rim, a face); a broken or placeholder frame is uniformly ~0.
// Conservative thresholds → fail toward KEEPING a clip.
export function isBlackSample(rgba, { meanMax = 12, peakMax = 24 } = {}) {
  const s = lumaStats(rgba);
  return !!s && s.mean <= meanMax && s.peak <= peakMax;
}

// isFlatSample(rgba, opts) — classify a sample as a "flat/placeholder" poster: a single near-uniform fill of
// ANY colour (a solid grey/white/coloured card a CDN serves when it has no real thumbnail). The discriminator
// is luma standard deviation ≈ 0 — a genuine video frame always carries texture/gradient/JPEG noise (std well
// above the floor even for a foggy sky or a night scene), a synthetic fill does not. Complements isBlackSample,
// which only catches the *black* case; this also catches uniform light/coloured placeholders. It subsumes a
// perfectly flat black frame too, so callers OR the two. Conservative threshold → fail toward KEEPING a clip.
export function isFlatSample(rgba, { stdMax = 6 } = {}) {
  const s = lumaStats(rgba);
  return !!s && s.std <= stdMax;
}

// hasPoster(item) — does the item carry a usable poster? A poster is present only when it is a non-empty
// string (after trimming); null / "" / whitespace / non-strings count as posterless. Pure, DOM-free.
export function hasPoster(item) {
  return !!item && typeof item.poster === "string" && item.poster.trim() !== "";
}
