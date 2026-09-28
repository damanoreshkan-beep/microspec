import { decode as decodePng } from "npm:@jsquash/png@3.0.1";
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

const alphaFromBlack = (d, w, h) => {
  let floor = 0;
  for (const [cx, cy] of [[0, 0], [w - 32, 0], [0, h - 32], [w - 32, h - 32]])
    for (let y = cy; y < cy + 32; y++) for (let x = cx; x < cx + 32; x++) { const i = (y * w + x) * 4; floor = Math.max(floor, d[i], d[i + 1], d[i + 2]); }
  floor += 2;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    if (m <= floor) continue;
    const a = Math.round((m - floor) / (255 - floor) * 255);
    out[i] = Math.min(255, Math.round(d[i] * 255 / m)); out[i + 1] = Math.min(255, Math.round(d[i + 1] * 255 / m)); out[i + 2] = Math.min(255, Math.round(d[i + 2] * 255 / m)); out[i + 3] = a;
  }
  return out;
};
const alphaFromWhite = (d, w, h) => {
  let floor = 255;
  for (const [cx, cy] of [[0, 0], [w - 32, 0], [0, h - 32], [w - 32, h - 32]])
    for (let y = cy; y < cy + 32; y++) for (let x = cx; x < cx + 32; x++) { const i = (y * w + x) * 4; floor = Math.min(floor, d[i], d[i + 1], d[i + 2]); }
  floor -= 2;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mn >= floor) continue;
    const a = Math.min(255, Math.round((floor - mn) / floor * 255));
    const af = a / 255;
    out[i] = Math.max(0, Math.min(255, Math.round((d[i] - floor * (1 - af)) / af)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round((d[i + 1] - floor * (1 - af)) / af)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round((d[i + 2] - floor * (1 - af)) / af)));
    out[i + 3] = a;
  }
  return out;
};

for (const arg of Deno.args) {
  if (arg.startsWith("--")) continue;
  const m = /^([nd]):([a-z]+)=(.+)$/.exec(arg);
  if (!m) throw new Error(`usage: n:<name>=<png> | d:<name>=<png>, got ${arg}`);
  const [, set, name, src] = m;
  const png = await Deno.readFile(src);
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image width="1024" height="1024" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: 512 } }).render();
  const px = new Uint8ClampedArray(r.pixels.buffer, r.pixels.byteOffset, r.pixels.byteLength);
  const rgba = (set === "n" ? alphaFromBlack : alphaFromWhite)(px, r.width, r.height);
  const webp = new Uint8Array(await encodeWebp({ data: rgba, width: r.width, height: r.height }, { quality: 80 }));
  const outDir = Deno.args.find((a) => a.startsWith("--out="))?.slice(6) ?? `${ROOT}/packages/runtime`;
  const prefix = Deno.args.find((a) => a.startsWith("--prefix="))?.slice(9);
  const file = `ds-${prefix ? prefix + "-" : ""}${set}-${name}.webp`;
  await Deno.writeFile(`${outDir}/${file}`, webp);
  console.log(`${file} ${(webp.length / 1024).toFixed(0)}KB`);
}
