// Minimal PNG decode for the art importer. BUILD-TIME ONLY — nothing here ships to a browser.
// DecompressionStream does the inflate; the rest is a few dozen lines of spec.
// Supports 8-bit RGBA/RGB/grey/palette and sub-byte palette/grey depths, which is every PNG
// Kenney ships.

const cat = (...a) => { const t = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of a) { t.set(x, o); o += x.length; } return t; };

export async function decodePNG(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8, w = 0, h = 0, depth = 8, ctype = 6, plte = null, trns = null;
  const idat = [];
  while (p < bytes.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = data[8]; ctype = data[9]; }
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data.slice());
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 && !(depth < 8 && (ctype === 0 || ctype === 3)))
    throw new Error(`unsupported PNG: depth ${depth} ctype ${ctype}`);
  const raw = new Uint8Array(await new Response(new Blob([cat(...idat)]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const stride = depth === 8 ? w * ch : Math.ceil(w * depth / 8);
  const out = new Uint8Array(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++], line = raw.subarray(o, o + stride); o += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    const bpp = depth === 8 ? ch : 1;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev ? prev[i] : 0, c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
  }
  let px = out;
  if (depth < 8) {
    px = new Uint8Array(w * h);
    const per = 8 / depth, mask = (1 << depth) - 1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        px[y * w + x] = (out[y * stride + ((x / per) | 0)] >> (8 - depth * ((x % per) + 1))) & mask;
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (ctype === 6) { rgba[i * 4] = px[i * 4]; rgba[i * 4 + 1] = px[i * 4 + 1]; rgba[i * 4 + 2] = px[i * 4 + 2]; rgba[i * 4 + 3] = px[i * 4 + 3]; }
    else if (ctype === 2) { rgba[i * 4] = px[i * 3]; rgba[i * 4 + 1] = px[i * 3 + 1]; rgba[i * 4 + 2] = px[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    else if (ctype === 0) { const v = depth === 8 ? px[i] : px[i] * (255 / ((1 << depth) - 1)); rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
    else if (ctype === 4) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = px[i * 2]; rgba[i * 4 + 3] = px[i * 2 + 1]; }
    else if (ctype === 3) { const x = px[i]; rgba[i * 4] = plte[x * 3]; rgba[i * 4 + 1] = plte[x * 3 + 1]; rgba[i * 4 + 2] = plte[x * 3 + 2]; rgba[i * 4 + 3] = trns && x < trns.length ? trns[x] : 255; }
  }
  return { w, h, rgba };
}

const TBL = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = TBL[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const be = (n) => new Uint8Array([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
const chunk = (type, data) => { const t = new TextEncoder().encode(type); return cat(be(data.length), t, data, be(crc32(cat(t, data)))); };

export async function encodePNG(rgba, w, h) {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  return cat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", cat(be(w), be(h), new Uint8Array([8, 6, 0, 0, 0]))), chunk("IDAT", z), chunk("IEND", new Uint8Array()));
}

/** Read one file out of a .zip. Store and deflate only — which is all a zip of PNGs uses. */
export async function unzipOne(zip, name) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = zip.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) !== 0x06054b50) continue;          // end-of-central-directory
    let p = dv.getUint32(i + 16, true);
    const n = dv.getUint16(i + 10, true);
    for (let k = 0; k < n; k++) {
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), cmtLen = dv.getUint16(p + 32, true);
      const fn = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
      if (fn === name) {
        const lho = dv.getUint32(p + 42, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
        const lNameLen = dv.getUint16(lho + 26, true), lExtraLen = dv.getUint16(lho + 28, true);
        const start = lho + 30 + lNameLen + lExtraLen;
        const body = zip.subarray(start, start + csize);
        if (method === 0) return body.slice();
        if (method === 8) return new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
        throw new Error(`zip method ${method} unsupported for ${name}`);
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
  }
  throw new Error(`not found in zip: ${name}`);
}
