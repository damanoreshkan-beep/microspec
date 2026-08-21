// Pixels in, pixels out — the two conversions every mode needs and none should own.
const MAX_SIDE = 1024;   // the Spaces clamp beyond this, and the POST body has to stay under the proxy's cap

// A deterministic stand-in picture for the gate: no network, the same frame for the same seed, so the
// shot and the e2e are stable and CI never spends a GPU minute.
export const mockArt = (seed) => {
  const h = (seed * 2654435761) % 360;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128"><defs><radialGradient id="g" cx=".4" cy=".35" r=".8">` +
    `<stop offset="0" stop-color="hsl(${h} 70% 62%)"/><stop offset=".55" stop-color="hsl(${(h + 40) % 360} 55% 34%)"/>` +
    `<stop offset="1" stop-color="hsl(${(h + 200) % 360} 45% 12%)"/></radialGradient></defs>` +
    `<rect width="96" height="128" fill="url(#g)"/></svg>`)}`;
};

// Any same-origin image (blob: / data: / svg) → a capped JPEG data URL, the shape the proxy forwards to a
// Space's FileData. Same-origin only, so the canvas never taints.
export function toDataURL(url, maxSide = MAX_SIDE) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) return reject(new Error("empty image"));
        const s = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.85));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

export const extOf = (blob) => blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
