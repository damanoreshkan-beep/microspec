/* @ts-self-types="./apk.d.ts" */
/**
 * # runtime/apk.js — the APK client, the icon rasteriser, and the one save/share path that works in the shell
 *
 * Client helper for the on-demand APK generator. The heavy lifting (patch + v1-sign) is pure Deno on the
 * edge (microspec-edge /feed/apk, core, holds the key); this module only calls it through the sealed tunnel
 * and hands the result to the user. Because the edge has no image library, every icon is rasterised here in
 * the browser (canvas → PNG): a site favicon or a crafted letter tile becomes the legacy launcher icon, and
 * the same tile is shrunk into the safe zone to become a real adaptive icon, so an APK carries exactly the
 * identity the installed PWA has on every launcher shape. The module also owns the file-saving fork the
 * farm kept getting wrong: inside our Android shell a bare `<a download>` is silently dead and there is no
 * `navigator.share`, so `downloadBlob`, `downloadUrl` and `shareFile` try the shell bridge first and fall
 * back to the browser — the only version that works in both.
 *
 * ![apk.js: icons rasterised in the browser, buildApk through the tunnel, downloadBlob and shareFile forking on the shell](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-apk.svg)
 *
 * ## Import
 * ```js
 * import { buildApk, letterTilePng, adaptiveFromTile, downloadBlob, apkFilename } from "/_rt/apk.js";   // an app's page: the import map resolves /_rt/
 * import { shareFile, downloadUrl } from "@microspec/core/runtime/apk.js";                              // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **The build**
 * - {@link buildApk} — `buildApk({ url, name, iconB64, fgB64?, bg? })` → a signed APK Blob; throws
 *   `apk <status> <reason>` with the edge's one-line reason on a non-ok status.
 * - {@link apkFilename} — `apkFilename(name)` → a safe lowercase dash-separated `.apk` name ("app.apk" when empty).
 *
 * **Icons, rasterised in the browser**
 * - {@link rasterizeIcon} — `rasterizeIcon(blob, size = 192)` → square PNG as base64 (no data: prefix), cover-fitted
 *   from any format (svg/ico/png/webp).
 * - {@link letterTilePng} — `letterTilePng(text, accent, size = 192)` → a crafted fallback tile: accent field +
 *   the first letter.
 * - {@link fetchAppIcons} — `fetchAppIcons()` → `{ icon, fg, bg }` for THIS app from the build's icon set, or
 *   null in source / gate mode.
 * - {@link adaptiveFromTile} — `adaptiveFromTile(pngB64, fallbackBg = "#ffffff")` → `{ fg, bg }`: the tile at
 *   46% on a transparent 432px layer, its corner colour as the background.
 * - {@link fetchSiteIconPng} — `fetchSiteIconPng(url, size = 192)` → a site's best icon through the edge
 *   (/feed/appicon, SSRF-guarded) as a square PNG, or null.
 *
 * **Saving and sharing**
 * - {@link downloadBlob} — `downloadBlob(blob, filename)`: the shell's `window.__msDownload.save` where present,
 *   else an anchor download.
 * - {@link downloadUrl} — `downloadUrl(url, filename)`: the same contract for a blob:/data: URL you already hold.
 * - {@link shareFile} — `shareFile(blob, filename)` → "shared" | "cancel" | "saved"; the shell bridge first, then
 *   `navigator.share`, then a download; never throws.
 *
 * ## In practice
 * The forge in the apkforge app: a site icon or a letter tile, the adaptive layers derived from it, the edge
 * build, the download.
 * ```js
 * import { buildApk, fetchSiteIconPng, letterTilePng, adaptiveFromTile, downloadBlob, apkFilename } from "/_rt/apk.js";   // apps/apkforge/view.js
 *
 * const png = (await fetchSiteIconPng(url)) || await letterTilePng(name || url, accent());
 *
 * const generate = async () => {
 *   let iconB64 = png;
 *   if (!iconB64) { try { iconB64 = await letterTilePng(name, accent()); } catch { iconB64 = null; } }   // no icon
 *   // the site tile also becomes the adaptive icon (shrunk into the safe zone over its own corner colour)
 *   let layers = {}; try { layers = await adaptiveFromTile(iconB64, accent()); } catch { layers = {}; }   // legacy icon only
 *   const blob = await buildApk({ url, name: name.trim(), iconB64, fgB64: layers.fg, bg: layers.bg });
 *   downloadBlob(blob, apkFilename(name));
 * };
 * ```
 * An app that only saves a file it made (cam, grain) imports `downloadBlob` alone; sigil holds a blob: URL
 * and uses `downloadUrl`.
 *
 * ## How it fits
 * Imports `VPS_PROXY` from feed.js (the sealed tunnel: `${VPS_PROXY}/apk` and `${VPS_PROXY}/appicon`) and
 * `shell` from shell.js (`shell.has("files.share")` / `shell.call`). render.js imports `buildApk`,
 * `fetchAppIcons`, `adaptiveFromTile`, `letterTilePng`, `downloadBlob` and `apkFilename` for the systemic
 * "Download APK" row in every profile tab, so every app's sw.js precaches `/_rt/apk.js`. 13 farm apps import
 * it directly — apkforge and os (the build), cam, grain, flux, habits, imagine, mirage, reel, sigil, trail,
 * wish (saving and sharing what they made).
 *
 * ## Invariants and pitfalls
 * - Anything that saves a file must come through `downloadBlob` / `downloadUrl`. A bare `<a download>` with a
 *   blob: URL does nothing in the shell's WebView, and each app inventing its own anchor is how five ended up
 *   broken at once.
 * - A WebView has NO `navigator.share` — measured. `shareFile` tries the shell bridge FIRST because where a
 *   bridge exists it is the only thing that can share; three apps that hand-rolled canShare → share → download
 *   were all dead in the shell.
 * - `AbortError` from the share sheet is the user's decision, not a failure: `shareFile` returns "cancel" and
 *   must never turn it into a download they did not ask for.
 * - `buildApk` surfaces the edge's own one-line reason (400 "bad url" and 400 "name required" are otherwise
 *   identical); show it, do not swallow it.
 * - A same-origin icon fetch is checked for the PNG magic bytes: a 200 that is an HTML fallback page must never
 *   become a launcher icon. `fetchAppIcons` returns null in source / gate mode — fall back to `letterTilePng`.
 * - `bg` is sampled off the maskable tile's corner, not declared: the build's maskable icon is a full-bleed
 *   brand.bg square, so the colour is read from it.
 * - The edge falls back to `iconB64` for the adaptive foreground when `fgB64` is absent (API 26+).
 * @module
 */
// Client helper for the on-demand APK generator. The heavy lifting (patch + v1-sign) is pure-Deno on the
// edge (microspec-edge /feed/apk, core, holds the key); this only calls it through the sealed tunnel and
// downloads the result, plus rasterises an icon in the browser (canvas → PNG) so the edge needs no image
// library. Used by the apkforge app and the systemic profile "Download APK" row. See apps/apkforge/RESEARCH.md.
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

// rasterizeIcon(blob, size) → square PNG (base64, no data: prefix). Cover-fits any format (svg/ico/png/webp).
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

// letterTilePng(text, accent, size) → a crafted fallback icon: accent field + the first letter (no emoji,
// no scraped clip-art). Async (canvas.toBlob).
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

// fetchPngB64(relUrl) → same-origin PNG as base64, or null (404, or a 200 that is not a PNG — an HTML fallback
// page must never become a launcher icon).
async function fetchPngB64(rel) {
  try {
    const r = await fetch(new URL(rel, location.href), { cache: "force-cache" });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
    return bytesToB64(buf);
  } catch { return null; }
}

// cornerHex(pngB64) → "#rrggbb" of the top-left pixel, or null when it is not opaque. Reads a colour off a
// tile instead of asking anyone to declare it — the build's maskable icon is a full-bleed brand.bg square.
async function cornerHex(pngB64) {
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${pngB64}`; });
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("") : null;
  } catch { return null; }
}

// fetchAppIcons() → { icon, fg, bg } for THIS app from the icon set the build writes to <app>/icons/
// (deploy/icons.mjs), or null where it does not exist (source / gate mode → the caller falls back to a
// letter tile). icon = the 192px tile Chrome puts on the home screen (the APK's legacy launcher icon);
// fg = the transparent adaptive foreground (glyph in the safe zone); bg = brand.bg, sampled off the maskable
// tile. So an APK carries exactly the identity the installed PWA has, on every launcher shape.
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

// adaptiveFromTile(pngB64, fallbackBg) → { fg, bg } derived from a full-bleed tile (a site favicon, a letter
// tile): the tile shrunk to 46% into the safe zone on a transparent 432px layer, and its corner colour as
// the background (a flat-background tile becomes seamless; a transparent logo sits on fallbackBg). This is
// what Android itself does to a legacy icon, done once here so the APK ships a real adaptive icon.
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

// fetchSiteIconPng(url) → the site's best icon rasterised to a PNG (base64), or null. Goes through the edge
// (open /feed/appicon — SSRF-guarded), so cross-origin favicons work without CORS taint.
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

// buildApk({url, name, iconB64, fgB64?, bg?}) → a signed APK Blob. Calls the edge (core /feed/apk) via the
// sealed tunnel. iconB64 = legacy launcher PNG; fgB64 + bg = the adaptive icon's foreground layer and
// "#rrggbb" background (API 26+); the edge falls back to iconB64 for the foreground when fg is absent.
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
  // The status alone can't tell "bad url" from "name required" — both are 400 — so carry the edge's own
  // one-line reason back to the screen. It is short, safe text (util.send), never a page.
  if (!r.ok) { const why = await r.text().catch(() => ""); throw new Error(`apk ${r.status}${why ? ` ${why}` : ""}`); }
  return await r.blob();
}

/**
 * Save a Blob as a file: via the Android shell's bridge where present, else through an anchor download.
 * @param blob the bytes to save
 * @param filename the name the file is saved under
 */
export function downloadBlob(blob, filename) {
  // Inside our Android shell an <a download> with a blob: URL does nothing at all — WebView has no blob
  // download path — so hand the bytes over instead. Absent (every browser), fall through to the anchor.
  const shell = typeof window !== "undefined" && window.__msDownload;
  if (shell && typeof shell.save === "function") {
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = String(fr.result);
      try { shell.save(filename, blob.type || "application/octet-stream", dataUrl.slice(dataUrl.indexOf(",") + 1)); }
      catch { /* shell refused — nothing better to try */ }
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
    } catch { /* the bridge refused — fall through and at least save it */ }
  } else {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return "shared"; }
    } catch (e) {
      // AbortError is the user closing the sheet. That is a decision, not a failure, and must NOT be
      // "helpfully" turned into a download they did not ask for.
      if (e?.name === "AbortError") return "cancel";
    }
  }
  downloadBlob(blob, filename);
  return "saved";
}

// downloadUrl(url, filename) — same contract as downloadBlob for a blob:/data: URL you already hold.
// Anything that saves a file must come through here: a bare <a download> is silently dead in the shell,
// and each app inventing its own anchor is how five of them ended up broken at once.
/**
 * Save a blob:/data: URL you already hold as a file, with the same shell-aware contract as `downloadBlob`.
 * @param url the blob: or data: URL
 * @param filename the name the file is saved under
 */
export async function downloadUrl(url, filename) {
  if (!url) return;
  try { downloadBlob(await (await fetch(url)).blob(), filename); }
  catch { /* revoked or unreadable — nothing to save */ }
}

// A safe .apk filename from a display name.
/**
 * A safe, lowercase, dash-separated `.apk` filename from a display name ("app.apk" when empty).
 * @param name the display name
 * @returns the filename
 */
export function apkFilename(name) {
  const base = (name || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
  return `${base}.apk`;
}
