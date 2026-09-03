/* @ts-self-types="./intake.d.ts" */
/**
 * # runtime/intake.js — where a picture comes from
 *
 * Every app that starts from a photo asks the same three questions — upload, camera, or the last picture the
 * farm made — and then needs the same two conversions: a capped JPEG data URL to send, and the true pixel
 * size of what came back. `imagine` carried two copies of each, `mirage` and `zir` one each ("a third app
 * with a photo intake is the signal they belong in the core's kit" — the third was `rukh`, 2026-09-03).
 * This module is that kit: the chooser island, the primed viewfinder, the bitmap helpers, and the gate's
 * deterministic stand-in picture. The copy is built in (en · uk), like `camprime.js` — a shared component
 * that demands an i18n key from every app that mounts it ships the raw key the first time someone forgets.
 *
 * ![The intake module's map: the chooser, the viewfinder, the bitmap helpers and their dependants](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-intake.svg)
 *
 * ## Import
 * ```js
 * import { Chooser, Camera, toDataURL, sizeOf, extOf, mockArt } from "/_rt/intake.js";                    // an app's page: the import map resolves /_rt/
 * import { Chooser, Camera, toDataURL, sizeOf, extOf, mockArt } from "@microspec/core/runtime/intake.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link Chooser} — `({ loc, onPick, onCamera, compact })` the frost island with the three sources; `compact` is one row of glyphs for a half-stage.
 * - {@link Camera} — `({ loc, reason, privacy, onCapture, onClose, onSettings })` the viewfinder, PRIMED before it opens (never a cold camera), one shutter.
 * - {@link toDataURL} — `(url, maxSide)` any same-origin picture → a JPEG data URL capped at {@link MAX_SIDE} on the long side, plus the size sent;
 *   a picture the browser cannot decode (HEIC/HEIF from a Samsung gallery) goes to the edge's `/feed/convert` (media's ffmpeg) and comes back a JPEG.
 * - {@link sizeOf} — `(blobOrUrl)` the pixel size of a picture, MEASURED with `createImageBitmap` (naturalWidth lies on a scaled `<img>`).
 * - {@link extOf} — `(blob)` `webp` · `png` · `jpg` from the blob's type, for a filename.
 * - {@link mockArt} — `(seed, scale)` a deterministic SVG data URL for the gate: no network, the same frame for the same seed.
 * - {@link MAX_SIDE} — 1024: the Spaces clamp beyond it, the POST body stays under the proxy's cap, and an upscaler's 4× stays at 4096².
 *
 * ## In practice
 * ```js
 * const [src, setSrc] = useState(null), [cam, setCam] = useState(false);
 * html`<${Stage}>
 *   ${src ? html`<img src=${src} />` : cam
 *     ? html`<${Camera} loc=${loc} reason=${T(t, "camReason")} privacy=${T(t, "primePrivacy")} onCapture=${(d) => { setSrc(d); setCam(false); }} onClose=${() => setCam(false)} onSettings=${() => S.screen.set("perms")} />`
 *     : html`<${Chooser} loc=${loc} onPick=${setSrc} onCamera=${() => setCam(true)} />`}
 * <//>`;
 * const { data, w, h } = await toDataURL(src);   // what goes on the wire
 * ```
 *
 * ## Why
 * The chooser floats on the stage as a frost island because a solid panel would punch a hole in it; the
 * viewfinder never opens cold because the priming screen is where the honest privacy line lives (the frame
 * IS uploaded — say so). The gate has no camera and no network, so `mockArt` stands in for both, marked by
 * the app with `data-live`, and the e2e reads `[data-src-upload]` / `[data-shutter]` — the same hooks every
 * consumer already tests.
 *
 * @module
 */
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { gate } from "./gate.js";
import { VPS_PROXY } from "./feed.js";
import { report } from "./telemetry.js";
import { Island } from "./ui.js";
import { CameraPrime } from "./camprime.js";
import { readLastGen } from "./lastgen.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

/** The upload cap on the long side: 1024 → an upscaler's 4× is 4096², and the JPEG stays ~300 KB on the wire. */
export const MAX_SIDE = 1024;

// The chooser's own words (en · uk), the way camprime.js carries the priming screen's — never an app key.
const LBL = {
  uk: { pick: "Обери фото", upload: "Завантажити", camera: "Камера", last: "Остання картинка", capture: "Зробити фото", back: "Нове фото" },
  en: { pick: "Choose a photo", upload: "Upload", camera: "Camera", last: "Last picture", capture: "Take a photo", back: "New photo" },
};
const words = (loc) => LBL[loc] || LBL.en;

/**
 * A deterministic stand-in picture for the gate: no network, the same frame for the same seed, so a shot and an
 * e2e are stable and CI never spends a GPU minute. Fine lines, so "before" and "after" differ visibly when the
 * gate's after is the same picture at a larger `scale`.
 * @param seed any integer — picks the hue
 * @param scale the intrinsic size multiplier (1 = 96×128)
 * @returns an `image/svg+xml` data URL
 */
export const mockArt = (seed, scale = 1) => {
  const h = (seed * 2654435761) % 360, w = 96 * scale, hh = 128 * scale;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 96 128"><defs><radialGradient id="g" cx=".4" cy=".35" r=".8">` +
    `<stop offset="0" stop-color="hsl(${h} 70% 62%)"/><stop offset=".55" stop-color="hsl(${(h + 40) % 360} 55% 34%)"/>` +
    `<stop offset="1" stop-color="hsl(${(h + 200) % 360} 45% 12%)"/></radialGradient></defs>` +
    `<rect width="96" height="128" fill="url(#g)"/><path d="M8 100 Q 48 60 88 100 M8 90 Q 48 50 88 90" fill="none" stroke="white" stroke-opacity=".6" stroke-width=".8"/></svg>`)}`;
};

/**
 * Any same-origin image (blob: / data: / svg) → a capped JPEG data URL, the shape the edge forwards to a Space's
 * file input. Same-origin only, so the canvas never taints. Also reports the size it sent.
 * @param url the picture's URL
 * @param maxSide the cap on the long side (default {@link MAX_SIDE})
 * @returns `{ data, w, h }` — the JPEG data URL and the pixel size sent
 */
export async function toDataURL(url, maxSide = MAX_SIDE) {
  try { return await decodeHere(url, maxSide); }
  catch (e) {
    // The browser could not decode it — Android Chrome reads no HEIC/HEIF, and that is what a Samsung gallery
    // hands an <input accept="image/*"> (mirage, 2026-09-03: "Не вдалося прочитати" before any request left the
    // phone). The edge's media process decodes it with ffmpeg and answers a JPEG; the gate has no network.
    if (gate || !/^(blob|data):/.test(url)) throw e;
    // the numbers a bug report cannot carry: what the browser was handed (type · bytes) and which step refused
    let about = { type: "", size: 0 };
    try { const bl = await (await fetch(url)).blob(); about = { type: bl.type, size: bl.size }; } catch { /* unreadable url */ }
    report("intake.decode", { step: "local", msg: e?.message || String(e), ...about }, "warn");
    let converted;
    try { converted = await convertAtEdge(url); }
    catch (e2) { report("intake.convert", { msg: e2?.message || String(e2), ...about }); throw e2; }
    try { return await decodeHere(converted, maxSide); }
    catch (e3) { report("intake.decode", { step: "converted", msg: e3?.message || String(e3), ...about }); throw e3; }
  }
}
function decodeHere(url, maxSide) {
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
        resolve({ data: c.toDataURL("image/jpeg", 0.9), w, h });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}
// the bytes as a data: URL (a blob: URL is read back; a data: URL is passed as is), POSTed to /feed/convert
async function convertAtEdge(url) {
  const image = url.startsWith("data:") ? url : await new Promise(async (ok, no) => {
    try { const bl = await (await fetch(url)).blob(); const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error("read failed")); fr.readAsDataURL(bl); } catch (e) { no(e); }
  });
  const r = await fetch(`${VPS_PROXY}/convert`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) });
  if (!r.ok) throw new Error("convert " + r.status);
  const j = await r.json().catch(() => null);
  if (!j?.image?.startsWith?.("data:image/")) throw new Error("convert: no image");
  return j.image;
}

/**
 * The pixel size of a picture, measured — `naturalWidth` lies on a scaled `<img>`; a decoded bitmap does not.
 * @param blobOrUrl a Blob, or a URL `fetch` can read
 * @returns `{ w, h }`, or null when the bytes do not decode
 */
export async function sizeOf(blobOrUrl) {
  try {
    const bl = typeof blobOrUrl === "string" ? await (await fetch(blobOrUrl)).blob() : blobOrUrl;
    const bm = await createImageBitmap(bl);
    const s = { w: bm.width, h: bm.height }; bm.close?.(); return s;
  } catch { return null; }
}

/**
 * The file extension a blob's type implies, for a filename.
 * @param blob the picture
 * @returns `"webp"` · `"png"` · `"jpg"`
 */
export const extOf = (blob) => blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";

/**
 * The chooser: upload · camera · the last picture the farm made, on a frost island over the stage (a solid
 * panel would punch a hole in it). `compact` is the same three sources as glyphs in one row, for a slot that
 * shares the stage with another (a blend's two pictures): a labelled column needs ~160 px a half-stage lacks.
 * Under the gate the third source is a fixed `mockArt`, so it exists on the shot and in e2e.
 * @param props `{ loc, onPick(url), onCamera(), compact? }`
 * @returns the preact vnode, absolutely positioned over its stage
 */
export function Chooser({ loc, onPick, onCamera, compact = false }) {
  const L = words(loc);
  const fileRef = useRef();
  const [last, setLast] = useState(null);
  useEffect(() => { if (gate) setLast(mockArt(13)); else readLastGen().then((v) => setLast(v?.url || null)).catch(() => {}); }, []);
  const onFile = (e) => { const f = e.target.files?.[0]; if (f) onPick(URL.createObjectURL(f)); e.target.value = ""; };
  if (compact) return html`<div class="absolute inset-0 flex items-center justify-center p-[var(--ms-gap)]">
    <input ref=${fileRef} type="file" accept="image/*" class="hidden" aria-hidden="true" onChange=${onFile} />
    <${Island} tone="frost" data-source className="flex items-center gap-1.5 rounded-full p-1.5">
      <button data-src-upload aria-label=${L.upload} title=${L.upload} class="btn btn-primary btn-circle btn-sm" onClick=${() => fileRef.current?.click()}>${Icon("lucide:upload", "text-base")}</button>
      <button data-src-camera aria-label=${L.camera} title=${L.camera} class="btn btn-circle btn-sm" onClick=${onCamera}>${Icon("lucide:camera", "text-base")}</button>
      ${last ? html`<button data-src-last aria-label=${L.last} title=${L.last} class="btn btn-ghost btn-circle btn-sm" onClick=${() => onPick(last)}>${Icon("lucide:sparkles", "text-base")}</button>` : null}
    <//>
  </div>`;
  return html`<div class="absolute inset-0 flex items-center justify-center p-[var(--ms-pad)]">
    <input ref=${fileRef} type="file" accept="image/*" class="hidden" aria-hidden="true" onChange=${onFile} />
    <${Island} tone="frost" data-source className="w-full max-w-[17rem] flex flex-col gap-[var(--ms-gap)]">
      <div class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70">${L.pick}</div>
      <button data-src-upload class="btn btn-primary rounded-full justify-start gap-2.5" onClick=${() => fileRef.current?.click()}>${Icon("lucide:upload", "text-lg")}${L.upload}</button>
      <button data-src-camera class="btn rounded-full justify-start gap-2.5" onClick=${onCamera}>${Icon("lucide:camera", "text-lg")}${L.camera}</button>
      ${last ? html`<button data-src-last class="btn btn-ghost rounded-full justify-start gap-2.5" onClick=${() => onPick(last)}>${Icon("lucide:sparkles", "text-lg")}${L.last}</button>` : null}
    <//>
  </div>`;
}

/**
 * The viewfinder: primed before it opens (never a cold camera), the back stream while enabled, one shutter.
 * `privacy` is the honest line for the priming screen — the frame IS uploaded, so the built-in "processed on
 * your device" must be overridden here; `onSettings` opens the app's permissions route when the camera is blocked.
 * @param props `{ loc, reason, privacy, onCapture(dataUrl), onClose(), onSettings() }`
 * @returns the preact vnode, absolutely positioned over its stage
 */
export function Camera({ loc, reason, privacy, onCapture, onClose, onSettings }) {
  const L = words(loc);
  const videoRef = useRef(), streamRef = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (gate || !enabled) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setErr("unavailable"); return; }
    let live = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (!live) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current; if (v) { v.srcObject = stream; v.setAttribute?.("playsinline", ""); try { await v.play?.(); } catch { /* */ } }
      } catch (e) { if (live) setErr(e && e.name === "NotAllowedError" ? "denied" : "unavailable"); }
    })();
    return () => { live = false; try { streamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch { /* */ } streamRef.current = null; const v = videoRef.current; try { if (v) v.srcObject = null; } catch { /* */ } };
  }, [enabled]);
  const capture = () => {
    const v = videoRef.current; if (!v || !(v.videoWidth > 0)) return;
    try { const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0); onCapture(c.toDataURL("image/jpeg", 0.92)); } catch { /* capture blocked */ }
  };
  const on = enabled && !err;
  return html`<${Fragment}>
    <div class="absolute inset-0 rounded-[var(--ms-r)] overflow-hidden bg-black">
      <video ref=${videoRef} autoplay muted playsinline class=${`absolute inset-0 w-full h-full object-cover ${on ? "" : "opacity-0"}`}></video>
      ${on ? html`<${Fragment}>
        <button data-cam-back aria-label=${L.back} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 text-white border-0" onClick=${onClose}>${Icon("lucide:x", "text-base")}</button>
        <button data-shutter aria-label=${L.capture} onClick=${capture} class="absolute left-1/2 -translate-x-1/2 bottom-5 w-[4.6rem] h-[4.6rem] rounded-full bg-white/10 sf-e3 flex items-center justify-center active:scale-95 transition-transform">
          <span class="w-[3.6rem] h-[3.6rem] rounded-full bg-primary border-4 border-base-100"></span>
        </button>
      </${Fragment}>` : null}
    </div>
    ${on ? null : html`<${CameraPrime} loc=${loc} reason=${reason} privacy=${privacy} privacyIcon="lucide:cloud-upload"
      onEnable=${() => { setErr(null); setEnabled(true); }} onSettings=${onSettings} denied=${err === "denied"} unavailable=${err === "unavailable"} />`}
  </${Fragment}>`;
}
