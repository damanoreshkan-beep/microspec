/* @ts-self-types="./hdr.d.ts" */
/**
 * # runtime/hdr.js — Radiance (.hdr) decoding, the short path to image-based lighting
 *
 * A browser cannot decode Radiance, so an HDR environment map needs either a conversion step or a decoder.
 * This is the decoder, and deliberately the SHORT path: the asset stays the original CC0 file from Poly Haven
 * or ambientCG — no intermediate format, no build artefact, nothing to keep in sync. An ordinary image tops
 * out at 255 per channel and the real world does not: metal looks like metal because its reflection of a
 * lamp is hundreds of times brighter than its reflection of the wall, and flattening that range renders
 * plastic. The bytes therefore come back UNCHANGED as RGBE — three mantissas and a shared exponent, 512 KB
 * for a 512x256 map against 2 MB as float32 — and the shader expands a sample in one instruction:
 * `radiance = rgbe.rgb * exp2(rgbe.a * 255.0 - 128.0)`. Pure functions over bytes, no DOM, no GPU, so
 * `deno test` covers the parser that everything else trusts.
 *
 * ![The HDR decoder: header, flat or RLE scanlines, RGBE out, linear averaging on the way down](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-hdr.svg)
 *
 * ## Import
 * ```js
 * import { decodeHDR, downsampleRGBE } from "/_rt/hdr.js";                    // an app's page: the import map resolves /_rt/
 * import { decodeHDR, downsampleRGBE } from "@microspec/core/runtime/hdr.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link decodeHDR} — `(bytes)` a Radiance file (Uint8Array or ArrayBuffer) to `{ width, height, rgbe }`, RGBA8 bytes
 *   with alpha = shared exponent + 128; throws a named `hdr: …` error on anything it will not read.
 * - {@link rgbeToLinear} — `(r, g, b, e)` one RGBE pixel to linear radiance `[r, g, b]`, the shader's maths on the CPU.
 * - {@link downsampleRGBE} — `({ width, height, rgbe }, outW)` a box-downsample that averages in LINEAR radiance and
 *   re-packs each pixel with a fresh shared exponent.
 *
 * ## In practice
 * ```js
 * import { decodeHDR, downsampleRGBE } from "../../packages/runtime/hdr.js";   // tools/art/hero.mjs
 *
 * const raw = await Deno.readFile(new URL(`../../apps/${app}/assets/env.hdr`, import.meta.url));
 * const full = decodeHDR(raw);
 * const env = ENV_W && full.width > ENV_W ? downsampleRGBE(full, ENV_W) : full;
 *
 * // A MIP CHAIN, every level averaged in linear radiance — a rough surface samples a blurred reflection.
 * let lvl = env;
 * for (let m = 0; m < MIPS; m++) {
 *   device.queue.writeTexture({ texture: envTex, mipLevel: m }, lvl.rgbe,
 *     { bytesPerRow: lvl.width * 4, rowsPerImage: lvl.height }, [lvl.width, lvl.height]);
 *   if (m + 1 < MIPS) lvl = downsampleRGBE(lvl, Math.max(1, lvl.width >> 1));
 * }
 * ```
 *
 * ## How it fits
 * Imports nothing and nothing in the runtime imports it. Its consumer today is the offline renderer
 * `tools/art/hero.mjs`, which decodes `apps/<id>/assets/env.hdr` into the environment texture the hero shader
 * reflects; `tests/hdr_test.js` covers flat and RLE files, the error paths and linear-domain averaging. No farm
 * app imports it yet — an app that wants the same map in the browser fetches the `.hdr`, decodes it here and
 * uploads `rgbe` as RGBA8.
 *
 * ## Invariants and pitfalls
 * - Two encodings exist in the wild. New-style RLE marks a scanline `2, 2, hi, lo` (width 8..32767) and stores the
 *   four components SEPARATELY, each run-length encoded; anything else is flat RGBE quadruples. A decoder that
 *   assumes RLE does not fail loudly on a flat file — it produces noise, which is worse — so the marker is checked
 *   per scanline, and a width under 8 always takes the flat path.
 * - Only `-Y h +X w` orientation and an RGBE `FORMAT=` (or none) are accepted; a header that never ends, a
 *   truncated run, a zero-length span or a run that overflows its row throw with the row number.
 * - Never average packed RGBE bytes. The exponent is SHARED per pixel, so two neighbours at different scales
 *   cannot be mixed byte-wise; doing it naively dims every bright source — precisely the part of the map that makes
 *   a reflection look like metal. {@link downsampleRGBE} converts to linear, averages, then re-packs.
 * - An exponent byte of 0 decodes to black; otherwise {@link rgbeToLinear} scales by `2^(e - 136)`, i.e.
 *   `2^(e - 128) / 256` — the shader's expansion, for tests and CPU-side checks.
 * - The output of {@link downsampleRGBE} keeps the aspect: `outH = round(outW * height / width)`, at least 1.
 * @module
 */
// hdr — Radiance (.hdr) decoding, for image-based lighting.
//
// A browser cannot decode Radiance, so an HDR environment map needs either a conversion step or a decoder.
// This is the decoder, and it is deliberately the SHORT path: the asset stays the original CC0 file from
// Poly Haven / ambientCG, with no intermediate format, no build artefact and nothing to keep in sync.
//
// WHY HDR AT ALL. An ordinary image tops out at 255 per channel. The real world does not: a lamp is
// thousands of times brighter than the wall beside it. Metal looks like metal because its reflection of
// that lamp is *hundreds* of times brighter than its reflection of the wall — flatten the range and the
// same shader renders plastic. So the environment map has to carry true radiance, which is what Radiance's
// RGBE encoding does: three mantissa bytes and one shared exponent.
//
// The decoder returns the bytes UNCHANGED as RGBE rather than expanding to float. A 512×256 environment is
// 512 KB as RGBA8 and 2 MB as float32, and the shader can decode a sample in one instruction:
//
//     radiance = rgbe.rgb * exp2(rgbe.a * 255.0 - 128.0)
//
// Pure functions over bytes — no DOM, no GPU — so `deno test` covers the parser that everything else trusts.

/** @returns {{ width: number, height: number, rgbe: Uint8Array }} RGBA8 bytes, alpha = shared exponent + 128 */
export function decodeHDR(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let pos = 0;
  const line = () => {
    let s = "";
    while (pos < buf.length && buf[pos] !== 10) s += String.fromCharCode(buf[pos++]);
    pos++;
    return s;
  };

  const magic = line();
  if (!magic.startsWith("#?")) throw new Error("hdr: not a Radiance file");
  let format = "";
  for (;;) {
    if (pos >= buf.length) throw new Error("hdr: header never ended");
    const l = line();
    if (l === "") break;                                  // a blank line closes the header
    if (l.startsWith("FORMAT=")) format = l.slice(7).trim();
  }
  if (format && !/rgbe/i.test(format)) throw new Error(`hdr: unsupported FORMAT=${format}`);

  const dims = line().trim();
  const m = dims.match(/^-Y\s+(\d+)\s+\+X\s+(\d+)$/);
  if (!m) throw new Error(`hdr: unsupported resolution line "${dims}"`);
  const height = Number(m[1]), width = Number(m[2]);

  const rgbe = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    if (pos + 4 > buf.length) throw new Error(`hdr: data ended at row ${y} of ${height}`);

    // Two encodings exist in the wild. New-style RLE marks a scanline with 2,2,hi,lo and then stores the
    // four components SEPARATELY, each run-length encoded. Anything else is flat RGBE quadruples. A
    // decoder that assumes RLE does not fail loudly on a flat file — it produces noise, which is worse.
    const isRLE = buf[pos] === 2 && buf[pos + 1] === 2 &&
      ((buf[pos + 2] << 8) | buf[pos + 3]) === width && width >= 8 && width < 32768;

    if (!isRLE) {
      for (let x = 0; x < width; x++) {
        rgbe[row + x * 4] = buf[pos++];
        rgbe[row + x * 4 + 1] = buf[pos++];
        rgbe[row + x * 4 + 2] = buf[pos++];
        rgbe[row + x * 4 + 3] = buf[pos++];
      }
      continue;
    }

    pos += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < width) {
        if (pos >= buf.length) throw new Error(`hdr: truncated run at row ${y}`);
        let count = buf[pos++];
        if (count > 128) {
          count -= 128;                                   // a run of one repeated byte
          const v = buf[pos++];
          if (x + count > width) throw new Error(`hdr: run overflows row ${y}`);
          for (let i = 0; i < count; i++) rgbe[row + (x++) * 4 + c] = v;
        } else {
          if (count === 0) throw new Error(`hdr: zero-length span at row ${y}`);
          if (x + count > width) throw new Error(`hdr: span overflows row ${y}`);
          for (let i = 0; i < count; i++) rgbe[row + (x++) * 4 + c] = buf[pos++];
        }
      }
    }
  }
  return { width, height, rgbe };
}

/** One RGBE pixel → linear radiance. The same maths the shader does, for tests and for CPU-side checks. */
export function rgbeToLinear(r, g, b, e) {
  if (e === 0) return [0, 0, 0];
  const f = Math.pow(2, e - 136);                         // 2^(e-128) / 256
  return [r * f, g * f, b * f];
}

/**
 * Box-downsample an RGBE image, averaging in LINEAR radiance.
 *
 * Averaging the packed bytes instead would be wrong in a way that is easy to miss: the exponent is SHARED
 * per pixel, so two neighbours at different scales cannot be mixed byte-wise. Doing it naively dims every
 * bright source — precisely the part of the map that makes a reflection look like metal.
 */
export function downsampleRGBE({ width, height, rgbe }, outW) {
  const outH = Math.max(1, Math.round(outW * height / width));
  const out = new Uint8Array(outW * outH * 4);
  const sx = width / outW, sy = height / outH;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let rr = 0, gg = 0, bb = 0, n = 0;
      const x0 = Math.floor(x * sx), x1 = Math.min(width, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      const y0 = Math.floor(y * sy), y1 = Math.min(height, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 4;
          const [r, g, b] = rgbeToLinear(rgbe[i], rgbe[i + 1], rgbe[i + 2], rgbe[i + 3]);
          rr += r; gg += g; bb += b; n++;
        }
      }
      rr /= n; gg /= n; bb /= n;
      const o = (y * outW + x) * 4;
      const peak = Math.max(rr, gg, bb);
      if (peak < 1e-9) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      const ex = Math.max(-128, Math.min(127, Math.ceil(Math.log2(peak))));
      const scale = 255.999 / Math.pow(2, ex);
      out[o] = Math.min(255, Math.floor(rr * scale));
      out[o + 1] = Math.min(255, Math.floor(gg * scale));
      out[o + 2] = Math.min(255, Math.floor(bb * scale));
      out[o + 3] = ex + 128;
    }
  }
  return { width: outW, height: outH, rgbe: out };
}
