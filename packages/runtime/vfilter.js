/* @ts-self-types="./vfilter.d.ts" */
/**
 * Pure, DOM-free helpers for cleaning a scraped video feed: `dedupeVideos` collapses the same clip
 * published under several urls, and `isBlackSample` / `isFlatSample` / `hasPoster` classify posters so
 * broken or placeholder thumbnails can be dropped. Lives in the runtime (not the app) so the logic is
 * unit-tested; the app owns only the canvas side.
 * @module
 */

const norm = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u || ""; } };

const clipId = (u) => {
  let p;
  try { p = new URL(u).pathname; } catch { return ""; }
  const segs = p.split("/");
  const m = (segs[segs.length - 1] || "").match(/(\d{6,})/);
  return m && segs.includes(m[1]) ? m[1] : "";
};





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
      if (!out[i].poster && it && it.poster) out[i] = it;           
      for (const k of keys) if (!at.has(k)) at.set(k, i);           
      continue;
    }
    out.push(it);
    for (const k of keys) at.set(k, out.length - 1);
  }
  return out;
}




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



/**
 * Whether a feed item carries a usable poster (a non-empty string after trimming).
 * @param item a feed item, possibly null
 * @returns true when `item.poster` is a non-blank string
 */
export function hasPoster(item) {
  return !!item && typeof item.poster === "string" && item.poster.trim() !== "";
}
