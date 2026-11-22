/* @ts-self-types="./apk.d.ts" */
/**
 * # runtime/apk.js — the APK client, the icon rasteriser, and the one save/share path that works in the shell
 *
 * Client helper for the on-demand APK generator. The heavy lifting (patch + v1-sign) is pure Deno on the
 * edge (the product backend's /feed/apk, which holds the key); this module only calls it through the sealed tunnel
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
 * - {@link buildApk} — `buildApk({ url, name, iconB64, fgB64?, bg?, power? })` → a signed APK Blob; throws
 *   `apk <status> <reason>` with the edge's one-line reason on a non-ok status.
 * - {@link apkPower} — `apkPower(spec)` → the shell FLAVOUR the app declared (`profile.apk`), checked
 *   against the catalogue; the value `buildApk` must be handed, so no caller re-types a flavour name.
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
import { VPS_PROXY } from "./feed.js";
import { shell } from "./shell.js";
import { FLAVOURS } from "./shell-actions.js";
import { Effect } from "./fx.js";
import { APK } from "./apk.config.js";

function bytesToB64(buf) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function canvasToPngB64(cv) {
  return new Promise((resolve) => cv.toBlob(async (b) => resolve(bytesToB64(new Uint8Array(await b.arrayBuffer()))), "image/png"));
}

const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const pngOf = (cv) => Effect.promise(() => canvasToPngB64(cv));
const imageFrom = (src) => Effect.callback((resume) => {
  const i = new Image();
  i.onload = () => resume(Effect.succeed(i));
  i.onerror = (e) => resume(Effect.fail(e));
  i.src = src;
});
const coverDrawn = (img, size) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const s = Math.max(size / (img.width || 1), size / (img.height || 1));
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return cv;
};
const rasterized = (blob, size) => Effect.acquireUseRelease(
  Effect.sync(() => URL.createObjectURL(blob)),
  (url) => imageFrom(url).pipe(Effect.map((img) => coverDrawn(img, size)), Effect.flatMap(pngOf)),
  (url) => Effect.sync(() => URL.revokeObjectURL(url)),
);

/**
 * Rasterise any image blob (svg/ico/png/webp) into a square PNG, cover-fitted.
 * @param blob the source image
 * @param size the square edge in pixels (default 192)
 * @returns base64 PNG bytes, no data: prefix
 */
export async function rasterizeIcon(blob, size = 192) {
  return await Effect.runPromise(rasterized(blob, size));
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

const isPng = (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
const builtPng = (rel) => tried(() => fetch(new URL(rel, location.href), { cache: APK.cache })).pipe(
  Effect.flatMap((r) => !r.ok ? Effect.succeed(null) : tried(() => r.arrayBuffer()).pipe(
    Effect.map((ab) => new Uint8Array(ab)),
    Effect.map((buf) => isPng(buf) ? bytesToB64(buf) : null),
  )),
  Effect.catchCause(() => Effect.succeed(null)),
);

const cornerOf = (pngB64) => imageFrom(`data:image/png;base64,${pngB64}`).pipe(
  Effect.map((img) => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("") : null;
  }),
  Effect.catchCause(() => Effect.succeed(null)),
);

/**
 * Load THIS app's built icon set (legacy tile, adaptive foreground, sampled background colour).
 * @returns `{ icon, fg, bg }` as base64 / "#rrggbb", or null when the build's icons do not exist
 */
export async function fetchAppIcons() {
  return await Effect.runPromise(builtPng(APK.icons.tile).pipe(
    Effect.flatMap((icon) => !icon ? Effect.succeed(null) : Effect.forEach([APK.icons.fg, APK.icons.mask], (rel) => builtPng(rel), { concurrency: 2 }).pipe(
      Effect.flatMap(([fg, mask]) => (mask ? cornerOf(mask) : Effect.succeed(null)).pipe(
        Effect.map((bg) => ({ icon, fg: fg || undefined, bg: bg || undefined })),
      )),
    )),
  ));
}

/**
 * Derive an adaptive icon (foreground layer + background colour) from a full-bleed tile.
 * @param pngB64 the tile as base64 PNG
 * @param fallbackBg background used when the tile's corner is not opaque (default white)
 * @returns `{ fg, bg }` — base64 PNG of the 432px foreground layer and the "#rrggbb" background
 */
export async function adaptiveFromTile(pngB64, fallbackBg = "#ffffff") {
  return await Effect.runPromise(Effect.gen(function* () {
    const img = yield* imageFrom(`data:image/png;base64,${pngB64}`);
    const size = APK.adaptive.size, box = Math.round(size * APK.adaptive.safe);
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    cv.getContext("2d").drawImage(img, (size - box) / 2, (size - box) / 2, box, box);
    const bg = (yield* cornerOf(pngB64)) || fallbackBg;
    return { fg: yield* pngOf(cv), bg };
  }));
}

/**
 * Fetch a site's best icon through the edge and rasterise it to a square PNG.
 * @param url the site URL
 * @param size the square edge in pixels (default 192)
 * @returns base64 PNG bytes, or null on any failure
 */
export async function fetchSiteIconPng(url, size = 192) {
  return await Effect.runPromise(tried(() => fetch(`${VPS_PROXY}${APK.appicon}?url=${encodeURIComponent(url)}`)).pipe(
    Effect.flatMap((r) => r.ok ? tried(() => r.blob()) : Effect.succeed(null)),
    Effect.flatMap((blob) => blob?.size ? rasterized(blob, size) : Effect.succeed(null)),
    Effect.catchCause(() => Effect.succeed(null)),
  ));
}

/**
 * The shell flavour an app's APK must be built with, taken from its spec — `undefined` for the plain
 * `full` shell. It exists as a named function because deriving it from a literal is a fault with a delay
 * fuse: `profile.apk === "godot" ? "godot" : undefined` was correct until `"mesh"` entered the schema,
 * after which every mesh app downloaded the `full` shell and had its own capability refused on the device
 * with "capability not granted to this page". The catalogue's own flavour list is what admits a value here.
 * @param spec the app's spec object
 * @returns the flavour name, or undefined for the default shell
 */
export const apkPower = (spec) => {
  const want = spec?.profile?.apk;
  return want && FLAVOURS.includes(want) ? want : undefined;
};

/**
 * Ask the edge to build and sign an APK for a URL; throws with the edge's one-line reason on a non-ok status.
 * @param opts `{ url, name, iconB64, fgB64?, bg?, power? }` — the site, its display name, the launcher / adaptive icon
 *   parts, and `power` naming a heavier shell FLAVOUR the app needs — {@link apkPower} of the spec, passed
 *   straight through (`"godot"` for a Godot stage, `"mesh"` for the vendored BLE transport). Omitting it
 *   builds the `full` shell, whose bridge refuses that capability on the device; the edge grants a flavour
 *   only to our own origin. Never re-derive it from a literal: forward whatever the spec declared.
 * @returns the signed APK as a Blob
 */
export async function buildApk({ url, name, iconB64, fgB64, bg, power }) {
  const r = await fetch(`${VPS_PROXY}/apk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, name, icon: iconB64 || undefined, fg: fgB64 || undefined, bg: bg || undefined, power: power || undefined }),
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
      catch { }
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
  const viaShell = tried(async () => shell.call(APK.share, { name: filename, mime, base64: bytesToB64(new Uint8Array(await blob.arrayBuffer())) })).pipe(
    Effect.as("shared"),
    Effect.catch(() => Effect.succeed(null)),
  );
  const viaSheet = tried(async () => {
    const file = new File([blob], filename, { type: mime });
    if (!navigator.canShare?.({ files: [file] })) return null;
    await navigator.share({ files: [file] });
    return "shared";
  }).pipe(Effect.catch((e) => Effect.succeed(e?.name === "AbortError" ? "cancel" : null)));
  const saved = Effect.sync(() => { downloadBlob(blob, filename); return "saved"; });
  return await Effect.runPromise((shell.has(APK.share) ? viaShell : viaSheet).pipe(
    Effect.flatMap((done) => done ? Effect.succeed(done) : saved),
  ));
}

/**
 * Save a blob:/data: URL you already hold as a file, with the same shell-aware contract as `downloadBlob`.
 * @param url the blob: or data: URL
 * @param filename the name the file is saved under
 */
export async function downloadUrl(url, filename) {
  if (!url) return;
  try { downloadBlob(await (await fetch(url)).blob(), filename); }
  catch { }
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
