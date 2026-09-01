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
// GENERATED by tools/dts.mjs from packages/runtime/apk.js — edit the JSDoc there, never this file.
/**
 * Rasterise any image blob (svg/ico/png/webp) into a square PNG, cover-fitted.
 * @param blob the source image
 * @param size the square edge in pixels (default 192)
 * @returns base64 PNG bytes, no data: prefix
 */
export function rasterizeIcon(blob: any, size?: number): Promise<any>;
/**
 * A crafted fallback icon: an accent field with the first letter of the name.
 * @param text the display name whose first letter is drawn
 * @param accent the "#rrggbb" fill (a default violet when absent)
 * @param size the square edge in pixels (default 192)
 * @returns a promise of base64 PNG bytes
 */
export function letterTilePng(text: any, accent: any, size?: number): Promise<any>;
/**
 * Load THIS app's built icon set (legacy tile, adaptive foreground, sampled background colour).
 * @returns `{ icon, fg, bg }` as base64 / "#rrggbb", or null when the build's icons do not exist
 */
export function fetchAppIcons(): Promise<{
    icon: any;
    fg: any;
    bg: string;
}>;
/**
 * Derive an adaptive icon (foreground layer + background colour) from a full-bleed tile.
 * @param pngB64 the tile as base64 PNG
 * @param fallbackBg background used when the tile's corner is not opaque (default white)
 * @returns `{ fg, bg }` — base64 PNG of the 432px foreground layer and the "#rrggbb" background
 */
export function adaptiveFromTile(pngB64: any, fallbackBg?: string): Promise<{
    fg: any;
    bg: string;
}>;
/**
 * Fetch a site's best icon through the edge and rasterise it to a square PNG.
 * @param url the site URL
 * @param size the square edge in pixels (default 192)
 * @returns base64 PNG bytes, or null on any failure
 */
export function fetchSiteIconPng(url: any, size?: number): Promise<any>;
/**
 * Ask the edge to build and sign an APK for a URL; throws with the edge's one-line reason on a non-ok status.
 * @param opts `{ url, name, iconB64, fgB64?, bg? }` — the site, its display name and the launcher / adaptive icon parts
 * @returns the signed APK as a Blob
 */
export function buildApk({ url, name, iconB64, fgB64, bg }: {
    url: any;
    name: any;
    iconB64: any;
    fgB64: any;
    bg: any;
}): Promise<any>;
/**
 * Save a Blob as a file: via the Android shell's bridge where present, else through an anchor download.
 * @param blob the bytes to save
 * @param filename the name the file is saved under
 */
export function downloadBlob(blob: any, filename: any): void;
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
export function shareFile(blob: any, filename: any): Promise<"saved" | "shared" | "cancel">;
/**
 * Save a blob:/data: URL you already hold as a file, with the same shell-aware contract as `downloadBlob`.
 * @param url the blob: or data: URL
 * @param filename the name the file is saved under
 */
export function downloadUrl(url: any, filename: any): Promise<void>;
/**
 * A safe, lowercase, dash-separated `.apk` filename from a display name ("app.apk" when empty).
 * @param name the display name
 * @returns the filename
 */
export function apkFilename(name: any): string;
