import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { decode as decodeWebp } from "npm:@jsquash/webp@1.4.0";
import { encode as encodePng } from "npm:@jsquash/png@3.0.1";

let inited = false;
export async function ensure() {
  if (!inited) { await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")); inited = true; }
}

const anySvg = (bg, fg, paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="${bg}"/><g transform="translate(81.92,81.92) scale(14.506666666666666)" fill="none" stroke="${fg}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
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
  await Deno.writeFile(`${dir}/apple-touch-icon.png`, await toPng(m, 180));
  await Deno.writeFile(`${dir}/icon-fg-432.png`, await toPng(adaptiveFgSvg(brand.fg, paths), 432));
  await Deno.writeFile(`${dir}/favicon.ico`, await icoOf([16, 32, 48].map((s) => toPng(a, s))));
}

const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

const pngCache = new WeakMap();
export async function masterPngB64(webp) {
  if (pngCache.has(webp)) return pngCache.get(webp);
  const img = await decodeWebp(webp);
  if (img.width !== 1024 || img.height !== 1024) throw new Error(`icon.webp must be 1024×1024, got ${img.width}×${img.height}`);
  const opaque = new Uint8ClampedArray(img.data); for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  const out = { png: b64(new Uint8Array(await encodePng({ data: opaque, width: 1024, height: 1024 }))), rgba: img.data };
  pngCache.set(webp, out);
  return out;
}

const rasterTile = (pngB64, { rx = 0, scale = 1, ground = "#000" } = {}) => {
  const o = (1 - scale) / 2 * 1024, s = 1024 * scale;
  const clip = rx ? `<clipPath id="c"><rect width="1024" height="1024" rx="${rx}"/></clipPath>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${clip}<g${rx ? ' clip-path="url(#c)"' : ""}>${ground ? `<rect width="1024" height="1024" fill="${ground}"/>` : ""}<image x="${o}" y="${o}" width="${s}" height="${s}" href="data:image/png;base64,${pngB64}"/></g></svg>`;
};

export function alphaFromBlack(rgba, w, h) {
  let floor = 0;
  for (const [cx, cy] of [[0, 0], [w - 32, 0], [0, h - 32], [w - 32, h - 32]])
    for (let y = cy; y < cy + 32; y++) for (let x = cx; x < cx + 32; x++) { const i = (y * w + x) * 4; floor = Math.max(floor, rgba[i], rgba[i + 1], rgba[i + 2]); }
  floor += 2;
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const m = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (m <= floor) continue;
    const a = Math.round((m - floor) / (255 - floor) * 255);
    out[i] = Math.min(255, Math.round(rgba[i] * 255 / m)); out[i + 1] = Math.min(255, Math.round(rgba[i + 1] * 255 / m)); out[i + 2] = Math.min(255, Math.round(rgba[i + 2] * 255 / m)); out[i + 3] = a;
  }
  return out;
}

async function icoOf(framePromises) {
  const frames = await Promise.all(framePromises);
  const hdr = 6 + 16 * frames.length;
  const total = hdr + frames.reduce((s, f) => s + f.length, 0);
  const ico = new Uint8Array(total), dv = new DataView(ico.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, frames.length, true);
  let off = hdr;
  frames.forEach((f, i) => {
    const size = f[16] << 24 | f[17] << 16 | f[18] << 8 | f[19];
    const o = 6 + 16 * i;
    ico[o] = size & 255; ico[o + 1] = size & 255; ico[o + 2] = 0; ico[o + 3] = 0;
    dv.setUint16(o + 4, 1, true); dv.setUint16(o + 6, 32, true); dv.setUint32(o + 8, f.length, true); dv.setUint32(o + 12, off, true);
    ico.set(f, off); off += f.length;
  });
  return ico;
}

async function generateLuminousIcons(dir, webp) {
  await ensure();
  const { png: pngB64, rgba } = await masterPngB64(webp);
  const any = rasterTile(pngB64, { rx: 208 });
  const mask = rasterTile(pngB64, { scale: 0.74 });
  await Deno.writeFile(`${dir}/icon-192.png`, await toPng(any, 192));
  await Deno.writeFile(`${dir}/icon-512.png`, await toPng(any, 512));
  await Deno.writeFile(`${dir}/icon-192-maskable.png`, await toPng(mask, 192));
  await Deno.writeFile(`${dir}/icon-512-maskable.png`, await toPng(mask, 512));
  await Deno.writeFile(`${dir}/apple-touch-icon.png`, await toPng(rasterTile(pngB64), 180));
  const fgB64 = b64(new Uint8Array(await encodePng({ data: alphaFromBlack(rgba, 1024, 1024), width: 1024, height: 1024 })));
  await Deno.writeFile(`${dir}/icon-fg-432.png`, await toPng(rasterTile(fgB64, { scale: 0.5, ground: null }), 432));
  await Deno.writeFile(`${dir}/favicon.ico`, await icoOf([16, 32, 48].map((s) => toPng(any, s))));
}

export async function generateAppIcons(dir, brand, paths, master = null) {
  await Deno.mkdir(dir, { recursive: true });
  if (master) await generateLuminousIcons(dir, master);
  else await generateVectorIcons(dir, brand, paths);
}
