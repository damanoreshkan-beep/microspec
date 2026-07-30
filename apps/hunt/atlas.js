// hunt — the art, decoded, and the light that falls on it.
//
// Same three moves as brick's atlas: a rim derived from the SILHOUETTE, an extrusion for things
// that are boxes, and a contour for things that are figures. What differs is only that a pixel is
// a palette index, so "one step lighter" is a RAMP lookup instead of `level ± 1` — see
// packages/runtime/hunt.js.
//
// The terrain is DRAWN rather than imported. There is no CC0 tileset at 24px in this style, and
// putting a cartoon tileset under these figures would be a style collision that no amount of
// lighting fixes. Geometry is cheap; a matching palette is not.
//
// Pure: every function returns index buffers, never a canvas — so the browser, the gate and the
// offline PNG preview all get identical pixels.

import { TILE, T, K, WORLD, lit, shade, LIGHT } from "/_rt/hunt.js";
import { PALETTE, RAMP, TRANSPARENT, ART } from "./art.js";

export { PALETTE, RAMP, TRANSPARENT };

/* The world palette is appended to the character palette, so one index space covers both and the
   renderer never has to ask which table a pixel came from. */
const WORLD_KEYS = Object.keys(WORLD).filter((k) => typeof WORLD[k] === "string");
export const FULL = [...PALETTE, ...WORLD_KEYS.map((k) => WORLD[k])];
const W = {};
WORLD_KEYS.forEach((k, i) => { W[k] = PALETTE.length + i; });
export const WORLD_INDEX = W;

/* Ramps for the drawn terrain, by construction rather than by search: each world colour names its
   own lighter and darker partner, so a lit edge on stone is stone. */
const WORLD_RAMP = {
  [W.grass]: [W.grassLit, W.earth],
  [W.grassLit]: [W.grassLit, W.grass],
  [W.earth]: [W.grass, W.earthDark],
  [W.earthDark]: [W.earth, W.earthDark],
  [W.stone]: [W.stoneLit, W.earthDark],
  [W.stoneLit]: [W.stoneLit, W.stone],
  [W.wood]: [W.spear, W.earthDark],
};
export const FULL_RAMP = [...RAMP, ...WORLD_KEYS.map((_, i) => WORLD_RAMP[PALETTE.length + i] ?? [PALETTE.length + i, PALETTE.length + i])];

/* ── cells ────────────────────────────────────────────────────────────────────────────── */
const cell = (w, h) => ({ px: new Uint8Array(w * h).fill(TRANSPARENT), w, h });
const at = (c, x, y) => (x < 0 || y < 0 || x >= c.w || y >= c.h ? TRANSPARENT : c.px[y * c.w + x]);
const clone = (c) => ({ px: c.px.slice(), w: c.w, h: c.h });
const put = (c, x, y, v) => { if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px[y * c.w + x] = v; };
const fill = (c, x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(c, i, j, v); };

/** Decode one animation out of the run-length stream the importer committed. */
function decodeAnim(a) {
  const bin = atob(a.rle);
  const packed = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) packed[i] = bin.charCodeAt(i);
  const px = new Uint8Array(a.w * a.h * a.n);
  let o = 0;
  for (let i = 0; i < packed.length; i += 2) { px.fill(packed[i], o, o + packed[i + 1]); o += packed[i + 1]; }
  return { px, w: a.w, h: a.h, n: a.n };
}

const animCache = new Map();
export function anim(who, name) {
  const key = who + ":" + name;
  if (animCache.has(key)) return animCache.get(key);
  const src = ART[who]?.[name];
  const v = src ? decodeAnim(src) : null;
  animCache.set(key, v);
  return v;
}

/**
 * Halve a cell's height by dropping every other row.
 *
 * This is how a crouch is drawn. The collision box halves when she ducks — that is the whole point
 * of the button — and a full-height sprite standing on a half-height box says "upright" while the
 * hitbox says "ducking", which is a lie the player will feel before they can name it. 2:1 is an
 * INTEGER ratio, so the pixels stay on their grid; any other squash would smear them.
 */
export function squashV(c) {
  const h = Math.ceil(c.h / 2), out = cell(c.w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < c.w; x++) {
      const a = at(c, x, y * 2), b = at(c, x, y * 2 + 1);
      out.px[y * c.w + x] = a !== TRANSPARENT ? a : b;   // keep ink over emptiness, never lose a limb
    }
  return out;
}

/** One frame out of a decoded animation, as its own cell. */
const frameCache = new Map();
export function frameCell(who, name, f, low = false) {
  const key = `${who}:${name}:${f}:${low ? 1 : 0}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const a = anim(who, name);
  let c = cell(1, 1);
  if (a) {
    const i = Math.max(0, Math.min(a.n - 1, f | 0));
    c = { px: a.px.slice(i * a.w * a.h, (i + 1) * a.w * a.h), w: a.w, h: a.h };
    if (low) c = squashV(c);
    c = outline(c);
  }
  frameCache.set(key, c);
  return c;
}

/**
 * A contour, grown outward by one pixel in the DARKEST entry of the palette.
 *
 * Terrain gets a rim because it is a surface catching the light; a figure gets a contour, because
 * what a character needs at this size is not shading but a silhouette you can find in a quarter of
 * a second — especially against a busy forest. Same distinction as brick, one flag rather than a
 * redraw of every sprite.
 */
let DARKEST = 0;
{
  let best = Infinity;
  PALETTE.forEach((h, i) => {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L < best) { best = L; DARKEST = i; }
  });
}
export function outline(c) {
  const w = c.w + 2, h = c.h + 2, out = cell(w, h);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      if (at(c, x, y) === TRANSPARENT) continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]])
        if (out.px[(y + dy + 1) * w + x + dx + 1] === TRANSPARENT) out.px[(y + dy + 1) * w + x + dx + 1] = DARKEST;
    }
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) { const v = at(c, x, y); if (v !== TRANSPARENT) out.px[(y + 1) * w + x + 1] = v; }
  return out;
}

/**
 * The rim, from the silhouette: faces that meet the light are lit, faces that turn away shaded.
 *
 * `tiling` is not a nicety. A terrain tile is a standalone cell, so to this function its left and
 * right edges LOOK like silhouette — while in the world they are the middle of a continuous
 * surface. Embossing them draws a dark line down every tile boundary, and the player sees a grid.
 * Tiling terrain is lit on the TOP only, because that is the only edge that meets the sky.
 */
export function emboss(c, { surface = false, tiling = false } = {}) {
  const out = clone(c);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const v = at(c, x, y);
      if (v === TRANSPARENT) continue;
      const litEdge = (!tiling && at(c, x - 1, y) === TRANSPARENT) || at(c, x, y - 1) === TRANSPARENT || (surface && y === 0);
      const darkEdge = (!tiling && at(c, x + 1, y) === TRANSPARENT) || at(c, x, y + 1) === TRANSPARENT;
      if (litEdge) out.px[y * c.w + x] = lit(FULL_RAMP, v);
      else if (darkEdge) out.px[y * c.w + x] = shade(FULL_RAMP, v);
    }
  return out;
}

/** Extrusion inside the cell — the face moves toward the light, the vacated band is the wall. */
export function extrude(c, depth = 2) {
  const out = cell(c.w, c.h);
  const face = new Uint8Array(c.w * c.h);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const v = at(c, x, y);
      if (v === TRANSPARENT) continue;
      const nx = x + LIGHT.x * depth, ny = y + LIGHT.y * depth;
      if (nx >= 0 && ny >= 0 && nx < c.w && ny < c.h) { out.px[ny * c.w + nx] = v; face[ny * c.w + nx] = 1; }
    }
  for (let i = 0; i < c.px.length; i++)
    if (out.px[i] === TRANSPARENT && c.px[i] !== TRANSPARENT) out.px[i] = shade(FULL_RAMP, c.px[i]);
  // the lit edge is DRAWN, never inherited — the source art's own outline is dark, and letting it
  // serve as the highlight inverts the light on every block. brick paid for this one.
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      if (!face[i]) continue;
      if (y === 0 || !face[(y - 1) * c.w + x] || x === 0 || !face[y * c.w + x - 1]) out.px[i] = lit(FULL_RAMP, out.px[i]);
    }
  return out;
}

const seam = (c, by = 1) => {
  const out = clone(c);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (x >= c.w - by || y >= c.h - by) out.px[y * c.w + x] = TRANSPARENT;
  return out;
};

/* ── the terrain, drawn ───────────────────────────────────────────────────────────────── */
const speck = (x, y, s) => (((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0) % 11;
const rnd = (x, y, s) => ((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0;

/**
 * A stone in the soil: an ellipse, capped by the lamp and shaded on the face that turns away.
 *
 * Drawn rather than embossed because `emboss` works off the SILHOUETTE of the whole cell, and a
 * stone buried in earth has no silhouette — its edges are interior pixels, so emboss would light
 * the tile's own border instead and leave the stone flat.
 */
function pebble(c, cx, cy, rx, ry) {
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    for (let dx = -hw; dx <= hw; dx++) {
      const lit = dy === -ry || (dx === -hw && dy < 0);              // upper-left meets the light
      const dark = dy >= ry - 1 || dx >= hw - 1;
      put(c, cx + dx, cy + dy, lit ? W.gritLit : dark ? W.earthDeep : W.grit);
    }
  }
}

/** A root, wandering down and sideways one pixel at a time. Straight lines do not grow. */
function root(c, x, y, len, ink, v) {
  let cx = x;
  for (let j = 0; j < len; j++) {
    put(c, cx, y + j, ink);
    if (j > 3 && speck(cx, y + j, v + 40) === 0) put(c, cx + 1, y + j, ink);      // a side hair
    cx += (rnd(cx, y + j, v + 7) % 3) - 1;
    if (cx < 0 || cx >= TILE) return;
  }
}

/**
 * Soil, at two scales. Fine per-pixel speckle alone is sandpaper — it has no features, so a 24px
 * tile of it reads as one flat value no matter how much of it there is. The coarse pass works on
 * 3×3 blocks, which is what gives the mass its patches of wetter and drier ground.
 */
function soil(c, base, patch, grain, v) {
  fill(c, 0, 0, TILE, TILE, base);
  for (let j = 0; j < TILE; j++)
    for (let i = 0; i < TILE; i++) {
      if (speck(i >> 1, j >> 1, v + 60) > 6) put(c, i, j, patch);
      if (speck(i, j, v + 2) === 0) put(c, i, j, grain);
    }
}

/**
 * A terrain tile. `variant` exists because every ground tile in the level is the SAME cached cell,
 * so any texture inside it repeats every 24px and the eye locks onto that grid — the renderer picks
 * a variant from world position, which turns a 24px period into an irregular one for four cells.
 */
const tileCache = new Map();
export function tileCell(id, variant = 0) {
  const v = variant & 3, key = id * 4 + v;
  if (tileCache.has(key)) return tileCache.get(key);
  let c = cell(TILE, TILE);
  switch (id) {
    case T.GROUND: {
      /* Moss over earth, and the boundary between them is a WAVE. A ruled line is the most
         artificial thing a side-on tileset can hold, and this one ran the full width of the screen
         in one bright green stroke — 5px of flat grass under a solid grassLit lip.

         emboss() is deliberately NOT used here. It lights row 0 unconditionally (a cell's top edge
         always borders nothing, `surface` or not), which is precisely the solid lip being removed. */
      soil(c, W.earth, W.earthMid, W.earthDark, v);
      for (let i = 0; i < TILE; i++) {
        const d = 4 + speck(i, 0, v + 11) % 3;                            // 4..6px of crust
        fill(c, i, 0, 1, d, W.grass);
        put(c, i, 0, speck(i, 1, v + 5) % 3 ? W.grassLit : W.grass);      // a dithered moonlit lip
        put(c, i, d, W.earthDark);                                        // the crust's own shadow
        if (speck(i, 2, v + 17) === 0) fill(c, i, d, 1, 2, W.grass);      // moss reaching down
      }
      /* And it fades DOWN into the subsoil. Without this the crust tile's earth met the DIRT tile's
         earthDark at a perfectly straight line running the width of the level — the same ruled edge
         the grass line was just cured of, one row lower. A dither whose density tracks depth ends
         the tile on the colour the next one starts with, so there is no boundary left to see. */
      for (let j = 7; j < TILE; j++)
        for (let i = 0; i < TILE; i++)
          if (speck(i, j, v + 30) < ((j - 7) * 11) / (TILE - 7)) put(c, i, j, W.earthDark);
      if (v === 1) root(c, 7, 8, 12, W.earthDark, v);                     // moss holding the bank
      break;
    }
    case T.DIRT:
      /* Subsoil, and it is DARKER than the crust above it. Both used to be `earth` under the same
         speckle, so the twenty rows below the grass line were one undifferentiated brown mass with
         no stratification at all — the fill under the world, drawn as the world.

         One stone in every four tiles, one root in every four. The first cut put two or three
         stones in EVERY tile and, because a variant places them at fixed local coordinates, they
         came out in horizontal rows: not soil, a cobbled wall. Density is the whole judgement here.  */
      soil(c, W.earthDark, W.earthMid, W.earthDeep, v);
      if (v === 0) pebble(c, 7, 14, 3, 2);
      if (v === 2) pebble(c, 17, 5, 2, 2);
      if (v === 1) root(c, 9, 0, 15, W.earthDeep, v);
      break;
    case T.BRICK: case T.STONE: case T.USED:
      /* A mossy rock LEDGE, not a masonry block. What was here was a flat grey square, extruded and
         then `seam`ed — which draws a one-pixel gap on two sides of every tile, so a run of three
         blocks came out as a grid of three squares rather than as one shelf you can stand on. No
         seam now: adjacent tiles merge, which is what a ledge is. The moss cap is deliberately the
         same construction as the ground crust, because it is the same thing — a surface the forest
         has got to — and that is what ties a floating platform to the world under it. */
      fill(c, 0, 0, TILE, TILE, W.stone);
      for (let j = 0; j < TILE; j++)
        for (let i = 0; i < TILE; i++) {
          if (speck(i >> 1, j >> 1, v + 70) > 9) put(c, i, j, W.stoneLit);   // grain in the rock
          if (speck(i, j, v + 6) === 0) put(c, i, j, W.earthDark);           // and its pits
        }
      for (let i = 0; i < TILE; i++) {
        const d = 2 + speck(i, 0, v + 21) % 3;
        fill(c, i, 0, 1, d, W.grass);
        put(c, i, 0, speck(i, 1, v + 9) % 3 ? W.grassLit : W.grass);
        put(c, i, d, W.earthDark);
        put(c, i, TILE - 1, W.earthDeep);                                    // the underside, unlit
      }
      break;
    case T.QUESTION:
      fill(c, 0, 0, TILE, TILE, W.wood);
      fill(c, 4, 4, TILE - 8, TILE - 8, W.gold);
      c = seam(extrude(c, 2), 1);
      break;
    case T.PIPE_TOP: case T.PIPE_BOD: {
      const top = id === T.PIPE_TOP;
      fill(c, 2, top ? 0 : 0, TILE - 4, TILE, W.wood);
      if (top) fill(c, 0, 0, TILE, 5, W.stone);
      for (let j = 0; j < TILE; j++) { put(c, 3, j, W.spear); put(c, TILE - 4, j, W.earthDark); }
      c = emboss(c);
      break;
    }
    case T.COIN:
      /* A struck disc, not a filled circle. emboss() alone gives a coin a one-pixel lip and leaves
         the other 100 pixels one flat gold — which against this muted night palette was the single
         most artificial shape left in the frame, a vector circle sitting on a painted forest. Rim,
         body, and a lit crescent on the upper left, from the same lamp as everything else. */
      for (let j = 6; j < 18; j++) {
        const r = Math.round(Math.sqrt(36 - (j - 12) ** 2));
        fill(c, 12 - r, j, r * 2, 1, W.gold);
        put(c, 12 - r, j, W.goldDark); put(c, 11 + r, j, W.goldDark);      // the milled edge
        // The crescent: two pixels in from the rim, on the faces turned toward the light.
        if (j < 12) { put(c, 13 - r, j, W.goldLit); put(c, 14 - r, j, W.goldLit); }
      }
      for (let i = 9; i < 15; i++) { put(c, i, 6, W.goldDark); put(c, i, 17, W.goldDark); }
      break;
    case T.SPEAR:                                    // ammo lying on the ground
      fill(c, 3, 13, 18, 2, W.spear);
      fill(c, 18, 11, 4, 6, W.spearTip);
      c = emboss(c);
      break;
    case T.HEART: {
      const rows = ["..XX..XX..", ".XXXXXXXX.", ".XXXXXXXX.", "..XXXXXX..", "...XXXX...", "....XX...."];
      rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === "X") put(c, i + 7, j + 8, W.heart); }));
      c = emboss(c);
      break;
    }
    case T.BUSH:
      for (const [cx, cy, r] of [[8, 18, 6], [15, 16, 5], [20, 19, 4]])
        for (let dy = -r; dy <= r; dy++) { const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))); if (half) fill(c, cx - half, cy + dy, half * 2, 1, W.grass); }
      c = emboss(c);
      break;
    default:
      c = cell(0, 0);
  }
  tileCache.set(key, c);
  return c;
}

/* ── the spear in flight ──────────────────────────────────────────────────────────────────
   Drawn, and drawn at ANGLES: the projectile arcs, and a spear that always points due east while
   falling reads as a bug rather than as a spear. Baked per angle rather than rotated at draw time,
   because rotating pixel art in the canvas resamples it into mush. */
const spearCache = new Map();
export function spearCell(slope) {
  const k = Math.max(-2, Math.min(2, Math.round(slope)));
  if (spearCache.has(k)) return spearCache.get(k);
  const L = 20, c = cell(L + 4, 12);
  for (let i = 0; i < L; i++) {
    const y = 6 + Math.round((i - L / 2) * k * 0.22);
    put(c, i + 1, y, W.spear);
    put(c, i + 1, y + 1, W.wood);
  }
  const ty = 6 + Math.round((L / 2) * k * 0.22);
  fill(c, L, ty - 1, 4, 3, W.spearTip);
  const out = emboss(c);
  spearCache.set(k, out);
  return out;
}
