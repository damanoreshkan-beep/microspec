// Icon importer — a generated 1024² PNG (docs/research/luminous-icons.md) becomes the app's committed art:
//   apps/<id>/icon.webp   the MASTER, 1024², opaque, q90 (~100 KB; a PNG of the same frame is ~1.2 MB)
//   apps/<id>/icon.svg    a wrapper embedding a 256² WebP — what README, <link rel="icon"> and the store grid load
// BUILD-TIME ONLY (deploy/icons.mjs derives every PNG/ICO from the master at deploy).
//   deno run -A tools/art/icon-import.mjs <id>=<png> [<id>=<png> …]
import { decode as decodePng } from "npm:@jsquash/png@3.0.1";
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

/** The SVG wrapper: a 256² WebP on a rounded black tile (rx 20 %, the farm's icon radius). */
export function iconSvgFor(webp256) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256"><clipPath id="r"><rect width="256" height="256" rx="52"/></clipPath><rect width="256" height="256" rx="52" fill="#000"/><image clip-path="url(#r)" width="256" height="256" href="data:image/webp;base64,${b64(webp256)}"/></svg>\n`;
}

export async function importIcon(id, pngPath) {
  const png = await Deno.readFile(pngPath);
  const img = await decodePng(png.buffer);
  if (img.width !== 1024 || img.height !== 1024) throw new Error(`${pngPath}: expected 1024×1024, got ${img.width}×${img.height}`);
  const opaque = new Uint8ClampedArray(img.data); for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  const master = new Uint8Array(await encodeWebp({ data: opaque, width: 1024, height: 1024 }, { quality: 90 }));
  // 256² for the wrapper: resvg downsamples the PNG (it reads PNG, not WebP), then jsquash encodes the pixels
  const small = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image width="1024" height="1024" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: 256 } }).render();
  const px = small.pixels;
  const webp256 = new Uint8Array(await encodeWebp({ data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength), width: 256, height: 256 }, { quality: 82 }));
  // --out=<apps dir>: the product's apps/ (the core has no apps since the split); default = this checkout's
  const appsDir = Deno.args.find((a) => a.startsWith("--out="))?.slice(6) ?? `${ROOT}/apps`;
  const dir = `${appsDir}/${id}`;
  await Deno.stat(dir);   // an unknown app id is an error, not a new directory
  await Deno.writeFile(`${dir}/icon.webp`, master);
  await Deno.writeTextFile(`${dir}/icon.svg`, iconSvgFor(webp256));
  return { master: master.length, svg: webp256.length };
}

if (import.meta.main) {
  for (const arg of Deno.args) {
    if (arg.startsWith("--")) continue;                                  // --out= is an option, not an icon
    const i = arg.indexOf("="); if (i < 0) throw new Error(`usage: <id>=<png>, got ${arg}`);
    const id = arg.slice(0, i), src = arg.slice(i + 1);
    const r = await importIcon(id, src);
    console.log(`${id}: icon.webp ${(r.master / 1024).toFixed(0)} KB · icon.svg (webp ${(r.svg / 1024).toFixed(0)} KB)`);
  }
}
