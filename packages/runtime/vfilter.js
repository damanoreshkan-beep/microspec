// vfilter — pure helpers for cleaning a scraped video feed (apps/reel): drop duplicate clips and detect
// "black/broken" posters. Kept here (not in the app) so the logic is unit-tested; the app owns only the DOM
// side (loading a poster into a canvas) — this module never touches the DOM.

// Normalise a URL to its identity: origin + pathname, dropping signing / cache-bust query + hash
// (`…/clip.mp4?token=a` and `?token=b` are the same file). Non-URLs pass through unchanged.
const norm = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u || ""; } };

/* The CLIP ID — a long number that is BOTH the filename's token AND its own path segment.
   Some sites publish one clip as two files (source asset, no poster, often unplayable + low-bitrate
   preview with a poster) on different hosts, so url identity cannot see they are the same video.
   Both halves are required: a path-wide scan matches the DATE in `…/<yyyymm>/<dd>/<id>/…` and fuses
   every clip from that month. Dry-run: real duplicates collapse on 4 sources, zero on the other 5. */
const clipId = (u) => {
  let p;
  try { p = new URL(u).pathname; } catch { return ""; }
  const segs = p.split("/");
  const m = (segs[segs.length - 1] || "").match(/(\d{6,})/);
  return m && segs.includes(m[1]) ? m[1] : "";
};

// dedupeVideos(items) — drop duplicate clips, preserving ORDER. Two items are the same clip when their
// CLIP ID matches, or their normalised VIDEO url, or their normalised POSTER url: a page lists a clip twice
// (JSON-LD + <video>, or re-signed variants), broken clips repeat sharing one placeholder thumbnail, and —
// the case the url alone misses entirely — one clip is published as two files (see `clipId`).
//
// Which copy SURVIVES matters: first-wins keeps the posterless source asset, i.e. the black slide, and makes
// the bug worse. So a later copy WITH a poster replaces an earlier one without, in place. Otherwise first wins.
export function dedupeVideos(items) {
  const at = new Map(), out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const src = (it && (it.orig || it.video)) || "";
    const keys = [];
    const cid = clipId(src); if (cid) keys.push("c:" + cid);
    const vk = norm(src); if (vk) keys.push("v:" + vk);
    const pk = it && it.poster ? norm(it.poster) : ""; if (pk) keys.push("p:" + pk);

    const hit = keys.find((k) => at.has(k));
    if (hit != null) {
      const i = at.get(hit);
      if (!out[i].poster && it && it.poster) out[i] = it;           // the copy that can actually be shown
      for (const k of keys) if (!at.has(k)) at.set(k, i);           // …and it answers to both copies' keys
      continue;
    }
    out.push(it);
    for (const k of keys) at.set(k, out.length - 1);
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
