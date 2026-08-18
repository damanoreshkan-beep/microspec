// Client helper for the on-demand APK generator. The heavy lifting (patch + v1-sign) is pure-Deno on the
// edge (microspec-edge /feed/apk, core, holds the key); this only calls it through the sealed tunnel and
// downloads the result, plus rasterises an icon in the browser (canvas → PNG) so the edge needs no image
// library. Used by the apkforge app and the systemic profile "Download APK" row. See apps/apkforge/RESEARCH.md.
import { VPS_PROXY } from "./feed.js";

function bytesToB64(buf) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function canvasToPngB64(cv) {
  return new Promise((resolve) => cv.toBlob(async (b) => resolve(bytesToB64(new Uint8Array(await b.arrayBuffer()))), "image/png"));
}

// rasterizeIcon(blob, size) → square PNG (base64, no data: prefix). Cover-fits any format (svg/ico/png/webp).
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

// fetchAppIconPng() → THIS app's own launcher icon (base64 PNG), or null. The build writes the PWA icon set
// to <app>/icons/ (deploy/icons.mjs) — the same PNG Chrome puts on the home screen when the PWA is installed,
// so the APK carries the app's real identity, not a synthesised letter tile. Same-origin, no canvas: the PNG
// goes to the edge as-is (every launcher density bucket gets it; 192px is xxxhdpi-exact). Null in source /
// gate mode where dist/ icons do not exist — the caller falls back to letterTilePng.
export async function fetchAppIconPng() {
  try {
    const r = await fetch(new URL("icons/icon-192.png", location.href), { cache: "force-cache" });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    // PNG magic — a 200 that is not a PNG (an HTML fallback page) must not become the launcher icon
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
    return bytesToB64(buf);
  } catch { return null; }
}

// fetchSiteIconPng(url) → the site's best icon rasterised to a PNG (base64), or null. Goes through the edge
// (open /feed/appicon — SSRF-guarded), so cross-origin favicons work without CORS taint.
export async function fetchSiteIconPng(url, size = 192) {
  try {
    const r = await fetch(`${VPS_PROXY}/appicon?url=${encodeURIComponent(url)}`);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob.size) return null;
    return await rasterizeIcon(blob, size);
  } catch { return null; }
}

// buildApk({url, name, iconB64}) → a signed APK Blob. Calls the edge (core /feed/apk) via the sealed tunnel.
export async function buildApk({ url, name, iconB64 }) {
  const r = await fetch(`${VPS_PROXY}/apk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, name, icon: iconB64 || undefined }),
  });
  // The status alone can't tell "bad url" from "name required" — both are 400 — so carry the edge's own
  // one-line reason back to the screen. It is short, safe text (util.send), never a page.
  if (!r.ok) { const why = await r.text().catch(() => ""); throw new Error(`apk ${r.status}${why ? ` ${why}` : ""}`); }
  return await r.blob();
}

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

// downloadUrl(url, filename) — same contract as downloadBlob for a blob:/data: URL you already hold.
// Anything that saves a file must come through here: a bare <a download> is silently dead in the shell,
// and each app inventing its own anchor is how five of them ended up broken at once.
export async function downloadUrl(url, filename) {
  if (!url) return;
  try { downloadBlob(await (await fetch(url)).blob(), filename); }
  catch { /* revoked or unreadable — nothing to save */ }
}

// A safe .apk filename from a display name.
export function apkFilename(name) {
  const base = (name || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
  return `${base}.apk`;
}
