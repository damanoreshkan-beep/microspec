
function keyOf(item) {
  const u = (item && (item.orig || item.video)) || "";
  try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; }
}

export function dedupeVideos(items) {
  const seen = new Set(), out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const k = keyOf(it);
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    out.push(it);
  }
  return out;
}

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
