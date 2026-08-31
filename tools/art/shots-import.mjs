// Store screenshots — the dist-eye artifact (packages/gates/dist-eye.mjs, one PNG per deployed app at the
// reference device, DPR 2) becomes apps/store/assets/shot-<id>.webp at 1× (384×832, q80 ≈ 40 KB), which the
// store's app page and featured cards load lazily. BUILD-TIME ONLY.
//   gh run download <deploy-run> -R damanoreshkan-beep/microspec -n dist-eye -D <dir>
//   deno run -A tools/art/shots-import.mjs <dir>
import { decode as decodePng } from "npm:@jsquash/png@3.0.1";
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const dir = Deno.args[0];
if (!dir) { console.error("usage: shots-import.mjs <dist-eye dir>"); Deno.exit(2); }
await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const OUT = `${ROOT}/apps/store/assets`;
await Deno.mkdir(OUT, { recursive: true });
let n = 0, bytes = 0;
for await (const e of Deno.readDir(dir)) {
  if (!e.isFile || !e.name.endsWith(".png")) continue;
  const id = e.name.slice(0, -4);
  const png = await Deno.readFile(`${dir}/${e.name}`);
  const src = await decodePng(png.buffer);
  const w = Math.round(src.width / 2), h = Math.round(src.height / 2);
  // resvg downsamples the PNG cleanly (bilinear); jsquash encodes the pixels
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${src.width}" height="${src.height}"><image width="${src.width}" height="${src.height}" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: w } }).render();
  const px = r.pixels;
  const webp = new Uint8Array(await encodeWebp({ data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength), width: w, height: h }, { quality: 80 }));
  await Deno.writeFile(`${OUT}/shot-${id}.webp`, webp);
  n++; bytes += webp.length;
}
console.log(`shots: ${n} written to apps/store/assets/ (${(bytes / 1024).toFixed(0)} KB total)`);
