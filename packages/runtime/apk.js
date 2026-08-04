// Client helper for the on-demand APK generator. The heavy lifting (patch + v1-sign) is pure-Deno on the
// edge (microspec-edge /feed/apk, core, holds the key); this only calls it through the sealed tunnel and
// downloads the result, plus rasterises an icon in the browser (canvas → PNG) so the edge needs no image
// library. Used by the apkforge app and the systemic profile "Download APK" row. See apps/apkforge/RESEARCH.md.
import { VPS_PROXY } from "./feed.js";

function canvasToPngB64(cv) {
  return new Promise((resolve) => cv.toBlob(async (b) => {
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    resolve(btoa(s));
  }, "image/png"));
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
  if (!r.ok) throw new Error(`apk ${r.status}`);
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
