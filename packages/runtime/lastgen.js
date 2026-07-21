// lastgen.js — a tiny same-origin handoff for "the last image I made". Every farm app is served from the one
// origin (damanoreshkan-beep.github.io), so localStorage is shared between them: Уяви (apps/imagine) WRITES its
// finished generation here, and Онови (apps/retouch) READS it to offer "edit the image you just imagined" as a
// source. Stored as a downscaled JPEG data URL (≤768px long edge) so one image sits comfortably inside the
// localStorage quota; only the newest is kept. Fail-open everywhere — a miss / private-mode / quota error just
// means the "From Imagine" source doesn't appear, never a broken app.
const KEY = "ms:lastgen";
const STORE_SIDE = 768;   // long-edge cap for the stored copy — small enough for the quota, big enough to edit

// Draw a Blob | object-URL | data-URL onto a capped canvas → JPEG data URL. Same-origin sources only (they are),
// so the canvas never taints. Resolves null on any failure.
function downscale(src) {
  return new Promise((resolve) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const done = (v) => { if (typeof src !== "string") { try { URL.revokeObjectURL(url); } catch { /* */ } } resolve(v); };
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

// writeLastGen(src, prompt) — persist the newest generated image (Blob or URL) + its prompt. Fire-and-forget.
export async function writeLastGen(src, prompt) {
  try {
    const url = await downscale(src);
    if (!url) return;
    localStorage.setItem(KEY, JSON.stringify({ url, prompt: String(prompt || "").slice(0, 400), ts: Date.now() }));
  } catch { /* quota / private mode — the handoff is a nicety, never required */ }
}

// readLastGen() — the newest handoff { url, prompt, ts } or null. Async to mirror writeLastGen (and leave room
// for a future IndexedDB backing without changing callers).
export async function readLastGen() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.url === "string" && v.url ? v : null;
  } catch { return null; }
}
