/* @ts-self-types="./apk.d.ts" */
/**
 * Client helper for the on-demand APK generator: the edge does the patch + sign, this module calls it through
 * the sealed tunnel (`buildApk`), rasterises launcher / adaptive icons in the browser so the edge needs no
 * image library (`rasterizeIcon`, `letterTilePng`, `fetchAppIcons`, `adaptiveFromTile`, `fetchSiteIconPng`),
 * and owns the one save/share path that works both in a browser and inside the Android shell
 * (`downloadBlob`, `downloadUrl`, `shareFile`).
 * @module
 */
import { VPS_PROXY } from "./feed.js";
import { shell } from "./shell.js";

function bytesToB64(buf) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function canvasToPngB64(cv) {
  return new Promise((resolve) => cv.toBlob(async (b) => resolve(bytesToB64(new Uint8Array(await b.arrayBuffer()))), "image/png"));
}

/**
 * Rasterise any image blob (svg/ico/png/webp) into a square PNG, cover-fitted.
 * @param blob the source image
 * @param size the square edge in pixels (default 192)
 * @returns base64 PNG bytes, no data: prefix
 */
export async function rasterizeIcon(blob, size = 192) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    const s = Math.max(size / (img.width || 1), size / (img.height || 1));
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return await canvasToPngB64(cv);
  } finally { URL.revokeObjectURL(url); }
}

/**
 * A crafted fallback icon: an accent field with the first letter of the name.
 * @param text the display name whose first letter is drawn
 * @param accent the "#rrggbb" fill (a default violet when absent)
 * @param size the square edge in pixels (default 192)
 * @returns a promise of base64 PNG bytes
 */
export function letterTilePng(text, accent, size = 192) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = accent || "#7C3AED";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(size * 0.5)}px Geist, ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(((text || "A").trim()[0] || "A").toUpperCase(), size / 2, size * 0.54);
  return canvasToPngB64(cv);
}

async function fetchPngB64(rel) {
  try {
    const r = await fetch(new URL(rel, location.href), { cache: "force-cache" });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
    return bytesToB64(buf);
  } catch { return null; }
}

async function cornerHex(pngB64) {
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${pngB64}`; });
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("") : null;
  } catch { return null; }
}

/**
 * Load THIS app's built icon set (legacy tile, adaptive foreground, sampled background colour).
 * @returns `{ icon, fg, bg }` as base64 / "#rrggbb", or null when the build's icons do not exist
 */
export async function fetchAppIcons() {
  const icon = await fetchPngB64("icons/icon-192.png");
  if (!icon) return null;
  const [fg, mask] = await Promise.all([fetchPngB64("icons/icon-fg-432.png"), fetchPngB64("icons/icon-192-maskable.png")]);
  const bg = mask ? await cornerHex(mask) : null;
  return { icon, fg: fg || undefined, bg: bg || undefined };
}

/**
 * Derive an adaptive icon (foreground layer + background colour) from a full-bleed tile.
 * @param pngB64 the tile as base64 PNG
 * @param fallbackBg background used when the tile's corner is not opaque (default white)
 * @returns `{ fg, bg }` — base64 PNG of the 432px foreground layer and the "#rrggbb" background
 */
export async function adaptiveFromTile(pngB64, fallbackBg = "#ffffff") {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${pngB64}`; });
  const size = 432, box = Math.round(size * 0.46);
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  cv.getContext("2d").drawImage(img, (size - box) / 2, (size - box) / 2, box, box);
  const bg = (await cornerHex(pngB64)) || fallbackBg;
  return { fg: await canvasToPngB64(cv), bg };
}

/**
 * Fetch a site's best icon through the edge and rasterise it to a square PNG.
 * @param url the site URL
 * @param size the square edge in pixels (default 192)
 * @returns base64 PNG bytes, or null on any failure
 */
export async function fetchSiteIconPng(url, size = 192) {
  try {
    const r = await fetch(`${VPS_PROXY}/appicon?url=${encodeURIComponent(url)}`);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob.size) return null;
    return await rasterizeIcon(blob, size);
  } catch { return null; }
}

/**
 * Ask the edge to build and sign an APK for a URL; throws with the edge's one-line reason on a non-ok status.
 * @param opts `{ url, name, iconB64, fgB64?, bg? }` — the site, its display name and the launcher / adaptive icon parts
 * @returns the signed APK as a Blob
 */
export async function buildApk({ url, name, iconB64, fgB64, bg }) {
  const r = await fetch(`${VPS_PROXY}/apk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, name, icon: iconB64 || undefined, fg: fgB64 || undefined, bg: bg || undefined }),
  });
  if (!r.ok) { const why = await r.text().catch(() => ""); throw new Error(`apk ${r.status}${why ? ` ${why}` : ""}`); }
  return await r.blob();
}

/**
 * Save a Blob as a file: via the Android shell's bridge where present, else through an anchor download.
 * @param blob the bytes to save
 * @param filename the name the file is saved under
 */
export function downloadBlob(blob, filename) {
  const shell = typeof window !== "undefined" && window.__msDownload;
  if (shell && typeof shell.save === "function") {
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = String(fr.result);
      try { shell.save(filename, blob.type || "application/octet-stream", dataUrl.slice(dataUrl.indexOf(",") + 1)); }
      catch {  }
    };
    fr.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * shareFile(blob, filename) — hand a generated file to the OS share sheet, wherever the app is running.
 * Returns "shared" | "cancel" | "saved"; it never throws, because a share that fails must still leave the
 * user holding the file.
 *
 * THE FORK THAT KEEPS BEING MISSED. A WebView has NO `navigator.share` — measured, and the reason apps/os
 * goes through the bridge instead. So inside our APK, which is how these apps are actually used, the browser
 * path is not merely worse, it is absent. Three apps (sigil, grain, cam) each hand-rolled the
 * canShare→share→download ladder and every one of them is dead in the shell; os hand-rolled the shell call
 * and has no browser path. This is both halves in one place, which is the only version that works in both.
 *
 * The shell is tried FIRST for that reason: where a bridge exists it is the only thing that can share, and
 * `shell.has` already answers "no bridge / unknown action / bridge too old" as one boolean.
 */
export async function shareFile(blob, filename) {
  const mime = blob.type || "application/octet-stream";
  if (shell.has("files.share")) {
    try {
      await shell.call("files.share", { name: filename, mime, base64: bytesToB64(new Uint8Array(await blob.arrayBuffer())) });
      return "shared";
    } catch {  }
  } else {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return "shared"; }
    } catch (e) {
      if (e?.name === "AbortError") return "cancel";
    }
  }
  downloadBlob(blob, filename);
  return "saved";
}

/**
 * Save a blob:/data: URL you already hold as a file, with the same shell-aware contract as `downloadBlob`.
 * @param url the blob: or data: URL
 * @param filename the name the file is saved under
 */
export async function downloadUrl(url, filename) {
  if (!url) return;
  try { downloadBlob(await (await fetch(url)).blob(), filename); }
  catch {  }
}

/**
 * A safe, lowercase, dash-separated `.apk` filename from a display name ("app.apk" when empty).
 * @param name the display name
 * @returns the filename
 */
export function apkFilename(name) {
  const base = (name || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
  return `${base}.apk`;
}
