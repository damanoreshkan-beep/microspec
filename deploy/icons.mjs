// PWA icon generation — SVG → PNG via resvg (pure WASM, no Chromium). Chrome's install criteria
// (beforeinstallprompt) require real PNG icons ≥192 + a 512 + a maskable; an SVG-only manifest is NOT
// installable. Run at deploy time into dist/<app>/icons/.
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

let inited = false;
export async function ensure() {   // shared with og.mjs — initWasm() may run only once per process
  if (!inited) { await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")); inited = true; }
}

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

// generate the icon set the manifest + index.html reference, into `dir` (e.g. dist/hn/icons)
export async function generateAppIcons(dir, brand, paths) {
  await Deno.mkdir(dir, { recursive: true });
  const a = anySvg(brand.bg, brand.fg, paths);
  const m = maskSvg(brand.bg, brand.fg, paths);
  await Deno.writeFile(`${dir}/icon-192.png`, await toPng(a, 192));
  await Deno.writeFile(`${dir}/icon-512.png`, await toPng(a, 512));
  await Deno.writeFile(`${dir}/icon-192-maskable.png`, await toPng(m, 192));
  await Deno.writeFile(`${dir}/icon-512-maskable.png`, await toPng(m, 512));
  await Deno.writeFile(`${dir}/apple-touch-icon.png`, await toPng(m, 180)); // square (iOS rounds it)
  await Deno.writeFile(`${dir}/icon-fg-432.png`, await toPng(adaptiveFgSvg(brand.fg, paths), 432)); // APK adaptive foreground
}
