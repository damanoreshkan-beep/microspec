import { decode as decodePng } from "npm:@jsquash/png@3.0.1";
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { encode as encodeAvif } from "npm:@jsquash/avif@2.1.1";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

// The ground's level, read off the four corners — as a PERCENTILE, not the extreme: one bright speck of the
// material drifting into a corner set the floor for the whole picture, and ink's night fill (2026-10-09) lost
// everything below it — the wisps went, scraps of red were left.
const groundOf = (d, w, h, pick, q) => {
  const v = [];
  for (const [cx, cy] of [[0, 0], [w - 32, 0], [0, h - 32], [w - 32, h - 32]])
    for (let y = cy; y < cy + 32; y++) for (let x = cx; x < cx + 32; x++) { const i = (y * w + x) * 4; v.push(pick(d[i], d[i + 1], d[i + 2])); }
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * q))];
};
const alphaFromBlack = (d, w, h) => {
  let floor = groundOf(d, w, h, Math.max, 0.99);
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
  let floor = groundOf(d, w, h, Math.min, 0.01);
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

// --size=N: the sprite's width. 512 is enough for chrome decor (a garland tile, a corner, an empty state);
// a texture that FILLS a form on a 3× phone needs ~1536 (fonoteka's orb: 408 CSS px × 3), and a 512 one is
// stretched 3× and reads soft — measured 2026-10-09, every theme's scatter was 512 (lum's night 384).
const SIZE = Number(Deno.args.find((a) => a.startsWith("--size="))?.slice(7) || 512);
// --q=N: webp quality. A dense, detailed fill with alpha compresses poorly: 1536 px at q80 was 1.1 MB.
const Q = Number(Deno.args.find((a) => a.startsWith("--q="))?.slice(4) || 80);
// --format=avif: libaom AV1 still image. Measured on lum's 1024 night fill, PSNR as seen over the page ground:
// webp q75 523 KB / 38.0 dB · webp lossless 1210 KB · avif q80 391 KB / 40.5 dB — smaller AND closer to the
// source. Every target phone decodes it (iOS 16+, Chrome Android 85+).
const FORMAT = Deno.args.find((a) => a.startsWith("--format="))?.slice(9) || "webp";
for (const arg of Deno.args) {
  if (arg.startsWith("--")) continue;
  const m = /^([nd]):([a-z]+)=(.+)$/.exec(arg);
  if (!m) throw new Error(`usage: n:<name>=<png> | d:<name>=<png>, got ${arg}`);
  const [, set, name, src] = m;
  const png = await Deno.readFile(src);
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image width="1024" height="1024" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: SIZE } }).render();
  const px = new Uint8ClampedArray(r.pixels.buffer, r.pixels.byteOffset, r.pixels.byteLength);
  const rgba = (set === "n" ? alphaFromBlack : alphaFromWhite)(px, r.width, r.height);
  const pic = { data: rgba, width: r.width, height: r.height };
  const webp = new Uint8Array(FORMAT === "avif" ? await encodeAvif(pic, { quality: Q, speed: 4 }) : await encodeWebp(pic, { quality: Q }));
  const outDir = Deno.args.find((a) => a.startsWith("--out="))?.slice(6) ?? `${ROOT}/packages/runtime`;
  const prefix = Deno.args.find((a) => a.startsWith("--prefix="))?.slice(9);
  const file = `ds-${prefix ? prefix + "-" : ""}${set}-${name}.${FORMAT}`;
  await Deno.writeFile(`${outDir}/${file}`, webp);
  console.log(`${file} ${(webp.length / 1024).toFixed(0)}KB`);
}
