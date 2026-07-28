// Import apps/hunt's art from LuizMelo's CC0 character packs.
//
//   deno run -A tools/art/hunt-import.mjs           # → apps/hunt/art.js
//   deno run -A tools/art/hunt-import.mjs --check   # fail if the committed file is stale
//   deno run -A tools/art/hunt-import.mjs --preview out.png
//
// Unlike brick, this app has COLOUR. brick quantises to five densities of one ink because an LCD
// has no colour at all; here the art keeps its palette, so the pipeline changes in exactly three
// places and nowhere else:
//
//   · a pixel is a PALETTE INDEX, not a density;
//   · the light model cannot do index ± 1 — neighbouring palette entries are not neighbouring
//     shades — so a RAMP is derived from the palette itself and committed alongside it;
//   · the plate, the ghost, the segment lattice and the polariser are gone. They were the LCD.
//
// The frames are trimmed per ANIMATION, not per frame: trimming each frame to its own content box
// re-centres the character on every step and the walk cycle jitters.
//
// LICENCE: LuizMelo's packs are CC0 1.0 — see apps/hunt/assets/NOTICE.md.

import { decodePNG, encodePNG } from "./png.mjs";

const ROOT = new URL("../../", import.meta.url);
const CACHE = new URL("tools/art/.cache/hunt/", ROOT);
const OUT = new URL("apps/hunt/art.js", ROOT);
const PALETTE_SIZE = 32;

/* Which sheet is which pose. The engine's frame numbers are the contract (see game.c build_dl);
   everything else is animation the renderer cycles through. */
const SHEETS = {
  hero: { file: "huntress", anims: ["idle", "run", "jump", "fall", "attack", "hit", "dead"] },
  foe:  { file: "hunter",   anims: ["idle", "run", "jump", "fall", "attack", "attacked", "dead"] },
};

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

async function load(name) {
  const img = await decodePNG(Deno.readFileSync(new URL(name + ".png", CACHE)));
  const F = img.h, n = Math.round(img.w / F);
  if (n < 1 || Math.abs(img.w / F - n) > 0.01) throw new Error(`${name}: ${img.w}x${img.h} is not a row of square frames`);
  return { ...img, F, n };
}

/** The union content box across every frame of an animation — see the note about jitter above. */
function boxOf(img) {
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (img.rgba[(y * img.w + x) * 4 + 3] < 128) continue;
      const fx = x % img.F;
      if (fx < minx) minx = fx; if (fx > maxx) maxx = fx;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  return { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
}

// ── the palette, measured from the art ────────────────────────────────────────────────────
const sheets = {};
for (const g of Object.values(SHEETS))
  for (const a of g.anims) {
    try { sheets[`${g.file}_${a}`] = await load(`${g.file}_${a}`); } catch { /* optional pose */ }
  }
if (!Object.keys(sheets).length) throw new Error(`no sheets in ${CACHE} — see apps/hunt/assets/NOTICE.md for where they come from`);

const hist = new Map();
for (const img of Object.values(sheets))
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.rgba[i * 4 + 3] < 128) continue;
    const k = (img.rgba[i * 4] << 16) | (img.rgba[i * 4 + 1] << 8) | img.rgba[i * 4 + 2];
    hist.set(k, (hist.get(k) || 0) + 1);
  }
const ranked = [...hist.entries()].sort((a, b) => b[1] - a[1]);
const PAL = ranked.slice(0, PALETTE_SIZE).map(([k]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
const covered = ranked.slice(0, PALETTE_SIZE).reduce((s, [, v]) => s + v, 0) /
                ranked.reduce((s, [, v]) => s + v, 0);

const nearest = new Map();
const indexOf = (r, g, b) => {
  const k = (r << 16) | (g << 8) | b;
  if (nearest.has(k)) return nearest.get(k);
  let best = 0, bd = Infinity;
  for (let i = 0; i < PAL.length; i++) { const d = dist2([r, g, b], PAL[i]); if (d < bd) { bd = d; best = i; } }
  nearest.set(k, best);
  return best;
};

/* The RAMP. For every palette entry, which entry is its highlight and which is its shade — the one
   thing the ink model got for free (level ± 1) and colour does not. Derived, not authored: the
   lighter neighbour is the closest entry that is brighter AND near in hue, so a lit edge on skin
   stays skin rather than jumping to the nearest bright thing in the picture. */
function rampFor(i) {
  const c = PAL[i], L = lum(...c);
  let up = i, dn = i, ud = Infinity, dd = Infinity;
  for (let j = 0; j < PAL.length; j++) {
    if (j === i) continue;
    const o = PAL[j], Lo = lum(...o);
    // hue proximity = colour distance with the brightness difference discounted
    const d = dist2(c, o) - (Lo - L) ** 2 * 0.75;
    if (Lo > L + 8 && d < ud) { ud = d; up = j; }
    if (Lo < L - 8 && d < dd) { dd = d; dn = j; }
  }
  return [up, dn];
}
const RAMP = PAL.map((_, i) => rampFor(i));

// ── frames ────────────────────────────────────────────────────────────────────────────────
const TRANSPARENT = 255;
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };

/* Run-length, because a trimmed sprite box is still mostly nothing: a figure is thin and its box
   is as wide as its widest frame. One byte per pixel came to 231 KB of base64 for fourteen
   animations, against 8.8 KB for the whole of brick — deliverable after gzip, but an unreadable
   third of a megabyte sitting in a repository people review. Pairs of (value, run), runs capped at
   255. Decoded in one pass by the atlas. */
function rle(px) {
  const out = [];
  let i = 0;
  while (i < px.length) {
    const v = px[i];
    let n = 1;
    while (i + n < px.length && px[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return new Uint8Array(out);
}

const out = {};
let bytes = 0, raw = 0;
for (const [key, g] of Object.entries(SHEETS)) {
  out[key] = {};
  for (const a of g.anims) {
    const img = sheets[`${g.file}_${a}`];
    if (!img) continue;
    const box = boxOf(img);
    const px = new Uint8Array(box.w * box.h * img.n).fill(TRANSPARENT);
    for (let f = 0; f < img.n; f++)
      for (let y = 0; y < box.h; y++)
        for (let x = 0; x < box.w; x++) {
          const sx = f * img.F + box.x + x, sy = box.y + y;
          const o = (sy * img.w + sx) * 4;
          if (img.rgba[o + 3] < 128) continue;
          px[(f * box.h + y) * box.w + x] = indexOf(img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]);
        }
    const packed = rle(px);
    bytes += packed.length; raw += px.length;
    out[key][a] = { w: box.w, h: box.h, n: img.n, rle: b64(packed) };
  }
}

const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const body = `// GENERATED by tools/art/hunt-import.mjs — do not edit by hand.
//
// LuizMelo character packs (CC0 1.0), quantised to a ${PALETTE_SIZE}-colour palette measured from the art
// itself — those ${PALETTE_SIZE} entries cover ${(covered * 100).toFixed(1)}% of every opaque pixel, and the rest map to their
// nearest neighbour. Pixels are palette INDICES (255 = transparent), base64 of one byte each,
// trimmed per ANIMATION so the character does not re-centre between frames, then RUN-LENGTH coded
// as (value, run) pairs — a thin figure in a box as wide as its widest frame is mostly nothing.
//
// RAMP[i] = [lighter, darker] — which entry to use for a lit edge and for a shaded one. The ink
// model got this for free as level ± 1; a palette cannot, because neighbouring entries are not
// neighbouring shades. Derived by luminance with hue proximity weighted, so a highlight on skin
// stays skin. See apps/hunt/assets/NOTICE.md.

export const PALETTE = ${JSON.stringify(PAL.map(hex))};

export const RAMP = ${JSON.stringify(RAMP)};

export const TRANSPARENT = ${TRANSPARENT};

export const ART = ${JSON.stringify(out, null, 1)};
`;

if (Deno.args.includes("--check")) {
  const have = (() => { try { return Deno.readTextFileSync(OUT); } catch { return null; } })();
  if (have !== body) { console.error("✗ apps/hunt/art.js is stale — run: deno run -A tools/art/hunt-import.mjs"); Deno.exit(1); }
  console.log("✓ hunt art is up to date");
} else if (Deno.args.includes("--preview")) {
  const at = Deno.args[Deno.args.indexOf("--preview") + 1] ?? "hunt-art.png";
  const cells = [];
  for (const g of Object.values(out)) for (const [name, a] of Object.entries(g)) cells.push({ name, ...a });
  const CW = Math.max(...cells.map((c) => c.w * c.n)), CH = Math.max(...cells.map((c) => c.h));
  const S = 3, W = CW * S, H = cells.length * CH * S;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { img[i * 4] = 24; img[i * 4 + 1] = 26; img[i * 4 + 2] = 30; img[i * 4 + 3] = 255; }
  cells.forEach((c, row) => {
    const packed = Uint8Array.from(atob(c.rle), (ch) => ch.charCodeAt(0));
    const px = new Uint8Array(c.w * c.h * c.n);
    for (let i = 0, o = 0; i < packed.length; i += 2) { px.fill(packed[i], o, o + packed[i + 1]); o += packed[i + 1]; }
    for (let f = 0; f < c.n; f++)
      for (let y = 0; y < c.h; y++)
        for (let x = 0; x < c.w; x++) {
          const v = px[(f * c.h + y) * c.w + x];
          if (v === TRANSPARENT) continue;
          const [r, g, b] = PAL[v];
          for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
            const o = (((row * CH + y) * S + dy) * W + (f * c.w + x) * S + dx) * 4;
            img[o] = r; img[o + 1] = g; img[o + 2] = b;
          }
        }
  });
  Deno.writeFileSync(at, await encodePNG(img, W, H));
  console.log("wrote", at, `${W}x${H}`, "·", cells.map((c) => c.name).join(" "));
} else {
  Deno.writeTextFileSync(OUT, body);
  console.log(`wrote apps/hunt/art.js — ${PALETTE_SIZE} colours covering ${(covered * 100).toFixed(1)}%, ` +
    `${Object.values(out).reduce((s, g) => s + Object.keys(g).length, 0)} animations, ` +
    `${(raw / 1024).toFixed(1)} KB of pixels → ${(bytes / 1024).toFixed(1)} KB run-length ` +
    `(${(bytes / raw * 100).toFixed(0)}%) → ${(body.length / 1024).toFixed(1)} KB of module`);
}
