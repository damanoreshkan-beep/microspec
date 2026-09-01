/* @ts-self-types="./lastgen.d.ts" */
/**
 * # runtime/lastgen.js — a same-origin handoff for "the last image I made"
 *
 * Every farm app is served from the one origin, so localStorage is shared between them: an image generator
 * WRITES its finished generation here and an editor READS it to offer "edit the image you just imagined" as a
 * source, with no server and no account in between. The stored copy is a downscaled JPEG data URL (≤768px long
 * edge) so one image sits comfortably inside the localStorage quota; only the newest is kept. Fail-open
 * everywhere — a miss, private mode or a quota error just means the "From Imagine" source does not appear,
 * never a broken app.
 *
 * ![The lastgen module map: Imagine writeLastGen → downscale → localStorage ms:lastgen → readLastGen in imagine's edit pane and mirage](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-lastgen.svg)
 *
 * ## Import
 * ```js
 * import { writeLastGen, readLastGen } from "/_rt/lastgen.js";                    // an app's page: the import map resolves /_rt/
 * import { writeLastGen, readLastGen } from "@microspec/core/runtime/lastgen.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link writeLastGen} — `writeLastGen(src, prompt)`: downscale a Blob, object URL or data URL to a JPEG data URL and store it with the prompt (cut to 400 chars) and `ts: Date.now()`; async, fire-and-forget, swallows every failure.
 * - {@link readLastGen} — `readLastGen()`: the newest handoff `{ url, prompt, ts }`, or `null` when nothing valid is stored; async to mirror the writer.
 *
 * ## In practice
 * ```js
 * import { writeLastGen } from "/_rt/lastgen.js";
 * // the generator, once the first slide is in hand:
 * const blob = await pr.blob();
 * setIdx(0); setPhase("done"); writeLastGen(blob, p);          // apps/imagine/view.js
 *
 * import { readLastGen } from "/_rt/lastgen.js";
 * // the editor's source chooser — the third source exists only when a handoff is present:
 * const [last, setLast] = useState(null);
 * useEffect(() => {
 *   if (gate) setLast(mockArt(13));                            // a fixed "last picture" on the shot and in e2e
 *   else readLastGen().then((v) => setLast(v?.url || null)).catch(() => {});
 * }, []);                                                      // apps/mirage/source.js
 * ```
 *
 * ## How it fits
 * Imports nothing; a leaf on `localStorage`, `Image` and a canvas. No other runtime module imports it. 2 farm apps
 * reach it — imagine (writes from `view.js`, reads in its `edit.js` and `describe.js` panes) and mirage (writes
 * from `state.js` after a Make, reads in `source.js`); both list `/_rt/lastgen.js` in their sw.js precache.
 *
 * ## Invariants and pitfalls
 * - One key, `ms:lastgen`, newest only — a write replaces the previous handoff; there is no history.
 * - The stored copy is capped at 768px on the long edge and encoded as JPEG at 0.85 — small enough for the quota,
 *   big enough to edit. Do not expect the original resolution back.
 * - Same-origin sources only: the canvas never taints because every farm image is served from the one origin;
 *   a cross-origin URL would resolve to `null` and store nothing.
 * - Fail-open by design: a load error, a zero-size image, a quota or private-mode exception all resolve silently.
 *   Callers still wrap `readLastGen()` in `.catch` and gate the read (`if (!gate)`) so a shot stays deterministic.
 * - {@link writeLastGen} revokes the object URL it created for a Blob source; a string source is used as-is.
 * - Both functions are async on purpose: a future IndexedDB backing must not change callers.
 * @module
 */
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
/**
 * Persist the newest generated image and its prompt for another app to pick up; swallows every failure.
 * @param src a Blob, object URL or data URL of the image
 * @param prompt the prompt that produced it (stored truncated to 400 chars)
 * @returns resolves once stored or skipped
 */
export async function writeLastGen(src, prompt) {
  try {
    const url = await downscale(src);
    if (!url) return;
    localStorage.setItem(KEY, JSON.stringify({ url, prompt: String(prompt || "").slice(0, 400), ts: Date.now() }));
  } catch { /* quota / private mode — the handoff is a nicety, never required */ }
}

// readLastGen() — the newest handoff { url, prompt, ts } or null. Async to mirror writeLastGen (and leave room
// for a future IndexedDB backing without changing callers).
/**
 * Read the newest handoff written by `writeLastGen`.
 * @returns `{ url, prompt, ts }` or null when nothing valid is stored
 */
export async function readLastGen() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.url === "string" && v.url ? v : null;
  } catch { return null; }
}
