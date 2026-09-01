/* @ts-self-types="./vfilter.d.ts" */
/**
 * # runtime/vfilter.js — a scraped video feed, cleaned without a DOM
 *
 * Pure helpers for cleaning a scraped video feed: `dedupeVideos` collapses the same clip published under
 * several urls (re-signed variants, JSON-LD plus the video tag, one clip as two files on two hosts) and
 * `isBlackSample` / `isFlatSample` / `hasPoster` classify posters so broken or placeholder thumbnails can
 * be dropped. It lives in the runtime, not in the app, so the logic is unit-tested; the app owns only the
 * DOM side (loading a poster into a canvas and reading the pixels back) and this module never touches the
 * DOM. What it buys the farm is that the black slide — the posterless source asset that used to win the
 * dedupe — is decided by a test, not by whichever copy the page listed first.
 *
 * ![The feed cleaner: items through clipId, url and poster identity into dedupeVideos; RGBA samples through luma stats into black or flat](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-vfilter.svg)
 *
 * ## Import
 * ```js
 * import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";                    // an app's page: the import map resolves /_rt/
 * import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "@microspec/core/runtime/vfilter.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link dedupeVideos} — `dedupeVideos(items)` → the items without duplicate clips, ORDER preserved; a later
 *   copy with a poster replaces an earlier posterless one in place. A non-array yields `[]`.
 * - {@link isBlackSample} — `isBlackSample(rgba, { meanMax = 12, peakMax = 24 })` → true when the sample has
 *   near-zero mean luma AND no bright pixel anywhere; false for an empty sample.
 * - {@link isFlatSample} — `isFlatSample(rgba, { stdMax = 6 })` → true when luma standard deviation is ≈ 0,
 *   a uniform fill of any colour; false for an empty sample.
 * - {@link hasPoster} — `hasPoster(item)` → true when `item.poster` is a non-blank string.
 *
 * ## In practice
 * ```js
 * import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";   // apps/reel/view.js
 *
 * // the app owns the canvas: a 24×24 sample of the poster, then the pure classifier
 * const c = document.createElement("canvas"); c.width = 24; c.height = 24;
 * const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, 24, 24);
 * const px = cx.getImageData(0, 0, 24, 24).data;
 * const blank = isBlackSample(px) || isFlatSample(px);          // black OR uniform flat-fill
 *
 * // blanks rejected BEFORE dedupe, so a blank never wins a duplicate's slot
 * function clean(arr, { requirePoster = false } = {}) {
 *   let out = arr.filter((i) => !(i.poster && blankPosters.has(i.poster)));
 *   if (requirePoster) out = out.filter(hasPoster);
 *   return dedupeVideos(out);
 * }
 * ```
 *
 * ## How it fits
 * It imports nothing and no runtime module imports it; tests/vfilter_test.js holds the contract in the
 * unit gate. One farm app reaches it — reel, whose feed is scraped from several hosts — and reel's
 * generated sw.js precaches it. The playback side of the same app is video.js (`createPlayer`); this file
 * is the feed side only.
 *
 * ## Invariants and pitfalls
 * - Identity is three keys, any of which matches: the CLIP ID (a 6+ digit number that is BOTH the filename's
 *   token AND its own path segment — both halves required, or a path-wide scan fuses every clip of a month
 *   by its date segment), the normalised video url (origin + pathname, no query or hash), and the
 *   normalised poster url.
 * - `orig` beats `video` as the identity source: the proxied `video` url has no extension and no identity,
 *   the original one does.
 * - Which copy survives matters: first-wins keeps the posterless source asset (the black slide). A later
 *   copy WITH a poster replaces the earlier one in place and answers to both copies' keys; otherwise first wins.
 * - Items with no poster never collide on the poster key — a null poster is not a shared placeholder.
 * - Both classifiers fail toward KEEPING a clip: an empty or too-short sample returns false, and the
 *   thresholds are conservative. The peak test is the discriminator for black — a real night scene still has
 *   a highlight; the std test for flat — a real frame always carries texture or JPEG noise.
 * - `isFlatSample` subsumes a perfectly flat black frame too, so callers OR the two rather than pick one.
 * - Alpha is ignored: posters are opaque, and a fully transparent one reads as blank, which is equally unwanted.
 * @module
 */
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
/**
 * Drop duplicate clips from a feed, preserving order; a later copy with a poster replaces an earlier posterless one.
 * @param items feed items ({ video, orig?, poster? }); a non-array yields []
 * @returns the deduplicated items
 */
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
/**
 * Classify an RGBA sample as a black/broken poster: near-zero mean luma and no bright pixel anywhere.
 * @param rgba RGBA bytes from getImageData
 * @param opts thresholds — `meanMax` (default 12) and `peakMax` (default 24) on 0..255 luma
 * @returns true when the sample is black; false for an empty sample (keep the clip)
 */
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
/**
 * Classify an RGBA sample as a flat/placeholder poster: a near-uniform fill of any colour (luma std ≈ 0).
 * @param rgba RGBA bytes from getImageData
 * @param opts thresholds — `stdMax` (default 6) on 0..255 luma standard deviation
 * @returns true when the sample is flat; false for an empty sample (keep the clip)
 */
export function isFlatSample(rgba, { stdMax = 6 } = {}) {
  const s = lumaStats(rgba);
  return !!s && s.std <= stdMax;
}

// hasPoster(item) — does the item carry a usable poster? A poster is present only when it is a non-empty
// string (after trimming); null / "" / whitespace / non-strings count as posterless. Pure, DOM-free.
/**
 * Whether a feed item carries a usable poster (a non-empty string after trimming).
 * @param item a feed item, possibly null
 * @returns true when `item.poster` is a non-blank string
 */
export function hasPoster(item) {
  return !!item && typeof item.poster === "string" && item.poster.trim() !== "";
}
