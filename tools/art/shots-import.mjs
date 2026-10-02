import { decode as decodePng } from "npm:@jsquash/png@3.0.1";
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { APPS } from "../graph.mjs";

const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
let wasm = null;

/**
 * Every `<name>.png` in `dir` becomes `shot-<name>.webp` in `out`, at half size (a DPR-2 capture → 1×), quality 80.
 * @param dir a directory of PNG captures named `<app>--<tab>[--light].png`
 * @param out the store's assets directory
 * @returns `{ n, bytes }` — how many pictures were written and their total size
 */
export async function importShots(dir, out) {
  await (wasm ||= initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")));
  await Deno.mkdir(out, { recursive: true });
  let n = 0, bytes = 0;
  for await (const e of Deno.readDir(dir)) {
    if (!e.isFile || !e.name.endsWith(".png")) continue;
    const png = await Deno.readFile(`${dir}/${e.name}`);
    const src = await decodePng(png.buffer);
    const w = Math.round(src.width / 2), h = Math.round(src.height / 2);
    const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${src.width}" height="${src.height}"><image width="${src.width}" height="${src.height}" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: w } }).render();
    const px = r.pixels;
    const webp = new Uint8Array(await encodeWebp({ data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength), width: w, height: h }, { quality: 80 }));
    await Deno.writeFile(`${out}/shot-${e.name.slice(0, -4)}.webp`, webp);
    n++; bytes += webp.length;
  }
  return { n, bytes };
}

if (import.meta.main) {
  const dir = Deno.args.find((a) => !a.startsWith("--"));
  if (!dir) { console.error("usage: shots-import.mjs <dir of PNGs> [--out=<store assets dir>]"); Deno.exit(2); }
  const out = Deno.args.find((a) => a.startsWith("--out="))?.slice(6) ?? `${Deno.cwd()}/${APPS}/store/assets`;
  const { n, bytes } = await importShots(dir, out);
  console.log(`shots: ${n} written to ${out} (${(bytes / 1024).toFixed(0)} KB total)`);
}
