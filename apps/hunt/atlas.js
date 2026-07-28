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

/** One frame out of a decoded animation, as its own cell. */
const frameCache = new Map();
export function frameCell(who, name, f) {
  const key = `${who}:${name}:${f}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const a = anim(who, name);
  let c = cell(1, 1);
  if (a) {
    const i = Math.max(0, Math.min(a.n - 1, f | 0));
    c = { px: a.px.slice(i * a.w * a.h, (i + 1) * a.w * a.h), w: a.w, h: a.h };
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

const tileCache = new Map();
export function tileCell(id) {
  if (tileCache.has(id)) return tileCache.get(id);
  let c = cell(TILE, TILE);
  switch (id) {
    case T.GROUND:                                   // mossy crust over earth
      fill(c, 0, 0, TILE, TILE, W.earth);
      fill(c, 0, 0, TILE, 5, W.grass);
      for (let i = 0; i < TILE; i++) put(c, i, 0, W.grassLit);
      for (let j = 5; j < TILE; j++) for (let i = 0; i < TILE; i++) if (speck(i, j, 1) === 0) put(c, i, j, W.earthDark);
      c = emboss(c, { surface: true, tiling: true });
      break;
    case T.DIRT:
      fill(c, 0, 0, TILE, TILE, W.earth);
      for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) if (speck(i, j, 2) === 0) put(c, i, j, W.earthDark);
      break;
    case T.BRICK: case T.STONE: case T.USED:
      fill(c, 0, 0, TILE, TILE, W.stone);
      for (let i = 0; i < TILE; i++) { put(c, i, 0, W.stoneLit); put(c, i, TILE / 2, W.earthDark); }
      c = seam(extrude(c, 2), 1);
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
      for (let j = 6; j < 18; j++) { const r = Math.round(Math.sqrt(36 - (j - 12) ** 2)); fill(c, 12 - r, j, r * 2, 1, W.gold); }
      c = emboss(c);
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
  tileCache.set(id, c);
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
