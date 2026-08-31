// PWA icon generation — pure WASM, no Chromium. Chrome's install criteria (beforeinstallprompt) require real
// PNG icons ≥192 + a 512 + a maskable; an SVG-only manifest is NOT installable. Run at deploy time into
// dist/<app>/icons/.
//
// Two sources, one output contract:
//   · the LUMINOUS master `apps/<id>/icon.webp` (1024², opaque, black ground — docs/research/luminous-icons.md):
//     every tile is a resample of it; the APK adaptive foreground gets its alpha DERIVED from luminance
//     (the ground is black, so pixel = colour·α; α = max channel above the measured black floor).
//   · the legacy brand (lucide paths on a brand-coloured tile) for any app that has no master yet.
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { decode as decodeWebp } from "npm:@jsquash/webp@1.4.0";
import { encode as encodePng } from "npm:@jsquash/png@3.0.1";

let inited = false;
export async function ensure() {   // shared with og.mjs — initWasm() may run only once per process
  if (!inited) { await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")); inited = true; }
}

// ── legacy vector tiles ──────────────────────────────────────────────────────────────────────────────────
// "any" icon: rounded tile (matches icon.svg). "maskable": full-bleed square + smaller glyph in the safe zone.
const anySvg = (bg, fg, paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="${bg}"/><g transform="translate(81.92,81.92) scale(14.506666666666666)" fill="none" stroke="${fg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
// Android adaptive-icon FOREGROUND layer (108dp; the launcher shows the centre 72dp through its mask, and
// anything meant to stay visible must sit inside the 66dp safe zone). Glyph box 54dp → 216px of 432 (lucide
// art stays within ~22/24 of its box, so its corners land inside the 66dp circle),
// transparent everywhere else; the background is @color = brand.bg, patched by the APK builder. Consumed by
// /_rt/apk.js (the systemic "Download APK" row), never by the manifest.
const adaptiveFgSvg = (fg, paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432"><g transform="translate(108,108) scale(9)" fill="none" stroke="${fg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
const maskSvg = (bg, fg, paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${bg}"/><g transform="translate(102,102) scale(12.8)" fill="none" stroke="${fg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;

async function toPng(svg, size) {
  await ensure();
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

async function generateVectorIcons(dir, brand, paths) {
  const a = anySvg(brand.bg, brand.fg, paths);
  const m = maskSvg(brand.bg, brand.fg, paths);
  await Deno.writeFile(`${dir}/icon-192.png`, await toPng(a, 192));
  await Deno.writeFile(`${dir}/icon-512.png`, await toPng(a, 512));
  await Deno.writeFile(`${dir}/icon-192-maskable.png`, await toPng(m, 192));
  await Deno.writeFile(`${dir}/icon-512-maskable.png`, await toPng(m, 512));
  await Deno.writeFile(`${dir}/apple-touch-icon.png`, await toPng(m, 180)); // square (iOS rounds it)
  await Deno.writeFile(`${dir}/icon-fg-432.png`, await toPng(adaptiveFgSvg(brand.fg, paths), 432)); // APK adaptive foreground
  await Deno.writeFile(`${dir}/favicon.ico`, await icoOf([16, 32, 48].map((s) => toPng(a, s))));
}

// ── luminous raster tiles ────────────────────────────────────────────────────────────────────────────────
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

// The master, resampled: `scale` < 1 shrinks the frame onto a black ground (the maskable safe zone), `rx` clips
// the rounded tile. resvg reads PNG, not WebP, so the decoded master is re-encoded once per app (lossless).
const rasterTile = (pngB64, { rx = 0, scale = 1, ground = "#000" } = {}) => {
  const o = (1 - scale) / 2 * 1024, s = 1024 * scale;
  const clip = rx ? `<clipPath id="c"><rect width="1024" height="1024" rx="${rx}"/></clipPath>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${clip}<g${rx ? ' clip-path="url(#c)"' : ""}>${ground ? `<rect width="1024" height="1024" fill="${ground}"/>` : ""}<image x="${o}" y="${o}" width="${s}" height="${s}" href="data:image/png;base64,${pngB64}"/></g></svg>`;
};

// Alpha from luminance. The black floor is MEASURED off the four 32² corner patches (Z-Image leaves 0–13/255
// there), and everything at or below floor+2 becomes fully transparent; colour is un-premultiplied.
export function alphaFromBlack(rgba, w, h) {
  let floor = 0;
  for (const [cx, cy] of [[0, 0], [w - 32, 0], [0, h - 32], [w - 32, h - 32]])
    for (let y = cy; y < cy + 32; y++) for (let x = cx; x < cx + 32; x++) { const i = (y * w + x) * 4; floor = Math.max(floor, rgba[i], rgba[i + 1], rgba[i + 2]); }
  floor += 2;
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const m = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (m <= floor) continue;                                   // stays 0,0,0,0
    const a = Math.round((m - floor) / (255 - floor) * 255);
    out[i] = Math.min(255, Math.round(rgba[i] * 255 / m)); out[i + 1] = Math.min(255, Math.round(rgba[i + 1] * 255 / m)); out[i + 2] = Math.min(255, Math.round(rgba[i + 2] * 255 / m)); out[i + 3] = a;
  }
  return out;
}

// ICO container of PNG frames (the Vista+ format every current browser and Windows reads).
async function icoOf(framePromises) {
  const frames = await Promise.all(framePromises);
  const hdr = 6 + 16 * frames.length;
  const total = hdr + frames.reduce((s, f) => s + f.length, 0);
  const ico = new Uint8Array(total), dv = new DataView(ico.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, frames.length, true);
  let off = hdr;
  frames.forEach((f, i) => {
    const size = f[16] << 24 | f[17] << 16 | f[18] << 8 | f[19];   // IHDR width; 256 is encoded as 0
    const o = 6 + 16 * i;
    ico[o] = size & 255; ico[o + 1] = size & 255; ico[o + 2] = 0; ico[o + 3] = 0;
    dv.setUint16(o + 4, 1, true); dv.setUint16(o + 6, 32, true); dv.setUint32(o + 8, f.length, true); dv.setUint32(o + 12, off, true);
    ico.set(f, off); off += f.length;
  });
  return ico;
}

async function generateLuminousIcons(dir, webp) {
  await ensure();
  const img = await decodeWebp(webp);
  if (img.width !== 1024 || img.height !== 1024) throw new Error(`icon.webp must be 1024×1024, got ${img.width}×${img.height}`);
  const opaque = new Uint8ClampedArray(img.data); for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  const pngB64 = b64(new Uint8Array(await encodePng({ data: opaque, width: 1024, height: 1024 })));
  const any = rasterTile(pngB64, { rx: 208 });                  // rounded tile, rx 20 % (= icon.svg)
  const mask = rasterTile(pngB64, { scale: 0.74 });             // full-bleed; a ~82 %-wide subject stays inside the 80 % safe circle
  await Deno.writeFile(`${dir}/icon-192.png`, await toPng(any, 192));
  await Deno.writeFile(`${dir}/icon-512.png`, await toPng(any, 512));
  await Deno.writeFile(`${dir}/icon-192-maskable.png`, await toPng(mask, 192));
  await Deno.writeFile(`${dir}/icon-512-maskable.png`, await toPng(mask, 512));
  await Deno.writeFile(`${dir}/apple-touch-icon.png`, await toPng(rasterTile(pngB64), 180)); // square (iOS rounds it)
  // APK adaptive foreground: the glow with derived alpha, shrunk to 0.5 into the 66dp safe zone, transparent ground.
  const fgB64 = b64(new Uint8Array(await encodePng({ data: alphaFromBlack(img.data, 1024, 1024), width: 1024, height: 1024 })));
  await Deno.writeFile(`${dir}/icon-fg-432.png`, await toPng(rasterTile(fgB64, { scale: 0.5, ground: null }), 432));
  await Deno.writeFile(`${dir}/favicon.ico`, await icoOf([16, 32, 48].map((s) => toPng(any, s))));
}

// generate the icon set the manifest + index.html reference, into `dir` (e.g. dist/hn/icons).
// `master` = the bytes of apps/<id>/icon.webp when the app has one; otherwise the brand tiles are drawn.
export async function generateAppIcons(dir, brand, paths, master = null) {
  await Deno.mkdir(dir, { recursive: true });
  if (master) await generateLuminousIcons(dir, master);
  else await generateVectorIcons(dir, brand, paths);
}
