
const norm = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u || ""; } };

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

export function isBlackSample(rgba, { meanMax = 12, peakMax = 24 } = {}) {
  const s = lumaStats(rgba);
  return !!s && s.mean <= meanMax && s.peak <= peakMax;
}

export function isFlatSample(rgba, { stdMax = 6 } = {}) {
  const s = lumaStats(rgba);
  return !!s && s.std <= stdMax;
}

export function hasPoster(item) {
  return !!item && typeof item.poster === "string" && item.poster.trim() !== "";
}
