const KEY = "ms:lastgen";
const STORE_SIDE = 768;   

function downscale(src) {
  return new Promise((resolve) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const done = (v) => { if (typeof src !== "string") { try { URL.revokeObjectURL(url); } catch {  } } resolve(v); };
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) return done(null);
        const s = Math.min(1, STORE_SIDE / Math.max(w, h));
        w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        done(c.toDataURL("image/jpeg", 0.85));
      } catch { done(null); }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

export async function writeLastGen(src, prompt) {
  try {
    const url = await downscale(src);
    if (!url) return;
    localStorage.setItem(KEY, JSON.stringify({ url, prompt: String(prompt || "").slice(0, 400), ts: Date.now() }));
  } catch {  }
}

export async function readLastGen() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.url === "string" && v.url ? v : null;
  } catch { return null; }
}
