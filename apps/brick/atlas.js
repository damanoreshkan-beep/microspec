// brick — the light that falls on the art.
//
// The art itself is ready-made and CC0 (Kenney "Pixel Platformer", quantised into LCD ink
// densities by tools/art/brick-import.mjs). What this file adds is the VOLUME, and it adds it
// the same way theme.css does for the console around it: one light, upper-left at 45°, a
// highlight on the faces turned toward it and a shade on the faces turned away.
//
// That is the whole idea of the app. The console is the page extruded; the LCD is a recess in
// the console; and the blocks inside the game are extruded under the same light, at pixel
// scale. Nothing here is hand-drawn — the depth is COMPUTED from each sprite's own silhouette,
// so it applies to every asset in the pack without anyone drawing a bevel.
//
// Pure: every function returns ink levels, never a canvas. That is what lets the browser, the
// gate and the offline PNG preview all get identical pixels.

import { T, K, clampLevel, LIGHT, LCD, segmentRGB } from "/_rt/brick.js";
/* Not under assets/: deploy/sw.mjs deliberately keeps apps/<id>/assets/* OUT of the offline
   precache (media is fetched on first use), and this is SHELL — a static import the view cannot
   render without. The wasm stays in assets/ because it genuinely is a binary fetched at runtime. */
import { TILE_ART, CHAR_ART } from "./art.js";

export const TRANSPARENT = 255;

/* ── cells ────────────────────────────────────────────────────────────────────────────── */
function parse(rows) {
  const h = rows.length, w = rows[0].length;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      px[y * w + x] = c === "." ? TRANSPARENT : c.charCodeAt(0) - 48;
    }
  return { px, w, h };
}
const at = (c, x, y) => (x < 0 || y < 0 || x >= c.w || y >= c.h ? TRANSPARENT : c.px[y * c.w + x]);
const clone = (c) => ({ px: c.px.slice(), w: c.w, h: c.h });

/**
 * The rim light, derived from the silhouette. A pixel whose up-or-left neighbour is empty is
 * facing the source and gets driven thinner; one whose down-or-right neighbour is empty is
 * facing away and gets driven denser. Two passes, because the second must read the ORIGINAL
 * silhouette — running them in place turns a one-pixel sprite into a gradient.
 *
 * `surface: true` also lights the top edge of a cell with no transparent neighbours at all,
 * which is what a continuous ground row is: full to every side, but with sky above it.
 */
export function emboss(cell, { surface = false } = {}) {
  const out = clone(cell);
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      const v = at(cell, x, y);
      if (v === TRANSPARENT) continue;
      const litEdge = at(cell, x - 1, y) === TRANSPARENT || at(cell, x, y - 1) === TRANSPARENT || (surface && y === 0);
      const darkEdge = at(cell, x + 1, y) === TRANSPARENT || at(cell, x, y + 1) === TRANSPARENT;
      let n = v;
      if (litEdge) n = clampLevel(v - 1);
      if (darkEdge && !litEdge) n = clampLevel(v + 1);
      out.px[y * cell.w + x] = n;
    }
  return out;
}

/**
 * Extrusion, INSIDE the cell. A tile has neighbours on every side, so a stack that grows up-left
 * would climb over the tile next to it and the grid would come apart. Instead the face is moved
 * toward the light by `depth` and the band it vacates on the bottom-right is filled with the
 * side wall — which is exactly what an extruded block looks like from a fixed viewpoint, and it
 * keeps the tiling intact.
 */
export function extrude(cell, depth = 2) {
  const out = { px: new Uint8Array(cell.w * cell.h).fill(TRANSPARENT), w: cell.w, h: cell.h };
  // 1. the face, moved toward the light
  const face = new Uint8Array(cell.w * cell.h).fill(0);
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      const v = at(cell, x, y);
      if (v === TRANSPARENT) continue;
      const nx = x + LIGHT.x * depth, ny = y + LIGHT.y * depth;
      if (nx >= 0 && ny >= 0 && nx < cell.w && ny < cell.h) { out.px[ny * cell.w + nx] = v; face[ny * cell.w + nx] = 1; }
    }
  // 2. whatever the original covered and the face no longer does is the side WALL, and it is
  //    always the densest thing on the block — it is the face turned away from the source.
  for (let i = 0; i < cell.px.length; i++)
    if (out.px[i] === TRANSPARENT && cell.px[i] !== TRANSPARENT) out.px[i] = 4;
  /* 3. and the face gets an explicit one-pixel highlight along its top and left.
        The first cut let the SOURCE ART's own outline serve as the lit edge, and Kenney draws
        that outline dark — so every block came out with a heavy dark edge on the side facing
        the light and a pale one facing away. Inverted, on every box in the game. The lit edge
        is ours to draw, exactly like `--nm-light` is in theme.css; it is never inherited. */
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      const i = y * cell.w + x;
      if (!face[i]) continue;
      const upEmpty = y === 0 || !face[(y - 1) * cell.w + x];
      const leftEmpty = x === 0 || !face[y * cell.w + x - 1];
      if (upEmpty || leftEmpty) out.px[i] = 1;
    }
  return out;
}

/**
 * Clear the bottom-right edge of a cell so neighbouring blocks cannot touch.
 * Blocks need this: extruded edge-to-edge they butt against each other and a row of six bricks
 * reads as one dark bar — which is exactly how the first frame came out. The first fix shrank
 * the art to make room and resampled the crate into a blank slab; this one throws away one row
 * and one column and keeps every other source pixel exactly as drawn.
 */
export function seam(cell, by = 1) {
  const out = clone(cell);
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++)
      if (x >= cell.w - by || y >= cell.h - by) out.px[y * cell.w + x] = TRANSPARENT;
  return out;
}

/**
 * A hard contour, grown OUTWARD by one pixel at the densest level.
 *
 * Terrain gets a rim light because it is a surface catching the light; a FIGURE gets a contour,
 * because what a character needs at this size is not shading but a silhouette you can find in a
 * quarter of a second. This is the same distinction NES artists drew by hand, and here it falls
 * out of one flag rather than out of redrawing every sprite.
 */
export function outline(cell, level = 4) {
  const w = cell.w + 2, h = cell.h + 2;
  const out = { px: new Uint8Array(w * h).fill(TRANSPARENT), w, h };
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      if (at(cell, x, y) === TRANSPARENT) continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx + 1, ny = y + dy + 1;
        if (out.px[ny * w + nx] === TRANSPARENT) out.px[ny * w + nx] = clampLevel(level);
      }
    }
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      const v = at(cell, x, y);
      if (v !== TRANSPARENT) out.px[(y + 1) * w + x + 1] = v;
    }
  return out;
}

/* ── the catalogue ────────────────────────────────────────────────────────────────────── */
const RAW_TILE = {
  [T.GROUND]: TILE_ART.ground, [T.DIRT]: TILE_ART.dirt, [T.BRICK]: TILE_ART.brick,
  [T.QUESTION]: TILE_ART.question, [T.USED]: TILE_ART.used, [T.STONE]: TILE_ART.stone,
  [T.COIN]: TILE_ART.coin, [T.PIPE_TOP]: TILE_ART.pipeTop, [T.PIPE_BOD]: TILE_ART.pipeBod,
  [T.BUSH]: TILE_ART.bush, [T.HILL]: TILE_ART.hill, [T.CLOUD]: TILE_ART.bush,
};
/** Tiles that are OBJECTS rather than terrain — these get the extrusion. */
const BOXES = new Set([T.BRICK, T.QUESTION, T.USED, T.STONE]);
/** Tiles that are a continuous surface with sky above them. */
const SURFACES = new Set([T.GROUND, T.PIPE_TOP]);
/** Backdrop: pushed back to the faintest density, and never embossed — depth is what separates
    it from the play plane, so giving it depth is the one thing that would flatten the scene. */
const BACKDROP = new Set([T.BUSH, T.HILL, T.CLOUD]);

/* ── the density hierarchy ────────────────────────────────────────────────────────────────
   On a display whose only variable is how dark a segment is, DENSITY IS ATTENTION: the eye goes
   to the densest mark on the plate, and everything else is read relative to it. The first cut
   ignored this — the source art's outlines all landed on level 4, so the ground was heavier
   than the character standing on it and the frame read as a picture of a floor.

   The SECOND cut over-corrected and produced the picture the owner rejected. Measured off the
   real cells rather than off the intent: the ground came out at a mean density of 1.98 with 30%
   of it at level 1, i.e. a floor that is barely a stain on the plate; the huntress' cousin here
   came out at 2.52, half a step from the ground she stands on; and the ENEMIES landed at 3.51,
   the densest marks in the frame. The eye went to the walker, then to nothing.

   So, deepest last, and every band is a range a whole CLASS occupies rather than a nudge:
     backdrop 1 · terrain 2-3 · objects 3-4 · figures 3-4
   Terrain is matter and reads as matter. Figures are not separated from it by being darker —
   there is no room left above "objects" for that, and value alone was never going to carry it at
   18px. They are separated by a HALO (see `pose` below), which is the trick every monochrome
   handheld platformer used and the one thing the alpha did not try. */
const BANDS = {
  backdrop: [1, 1],
  terrain: [2, 3],
  /* Objects span the WHOLE upper ramp rather than its top two rungs. The source crates are
     bimodal — an outline and a fill — so a two-rung band crushed 80% of every brick onto level 4
     and a row of them read as six black holes punched in the sky. Given three rungs the texture
     survives and a brick is a brick. The LIT edge and the WALL are drawn by extrude(). */
  object: [2, 4],
  actor: [3, 4],
};

/* One band for every figure, and that is a conclusion rather than an omission. The doc above says
   the thing you control should be the thing you can always find, and the obvious reading — give
   the player a denser band than the enemies — was tried and measured: it moved the walker by 7
   points of perceived luminance out of a range of 148, which is nothing anyone can see. There are
   five rungs on this ramp and terrain already needs three of them, so VALUE cannot separate two
   figures here; there is no room. What separates them is the HALO (see `pose`), and what
   identifies the player is her silhouette and her shadow. Measured on the plate, the picture now
   reads plate 184 · backdrop 155 · ground 91 · objects and figures 56–69 — three clear planes,
   and inside the nearest one the halo does the work. */
function band(cell, [lo, hi]) {
  const out = clone(cell);
  let min = 9, max = 0;
  for (const v of cell.px) if (v !== TRANSPARENT) { if (v < min) min = v; if (v > max) max = v; }
  if (max <= min) { for (let i = 0; i < out.px.length; i++) if (out.px[i] !== TRANSPARENT) out.px[i] = hi; return out; }
  for (let i = 0; i < out.px.length; i++) {
    const v = cell.px[i];
    if (v === TRANSPARENT) continue;
    out.px[i] = clampLevel(Math.round(lo + ((v - min) / (max - min)) * (hi - lo)));
  }
  return out;
}

const tileCache = new Map();
export function tileCell(id) {
  if (tileCache.has(id)) return tileCache.get(id);
  const raw = RAW_TILE[id];
  let cell = raw ? parse(raw) : { px: new Uint8Array(0), w: 0, h: 0 };
  if (raw) {
    if (BACKDROP.has(id)) {
      cell = band(cell, BANDS.backdrop);
    } else {
      cell = band(cell, BOXES.has(id) ? BANDS.object : BANDS.terrain);
      if (BOXES.has(id)) cell = seam(extrude(cell, 2), 1);
      cell = emboss(cell, { surface: SURFACES.has(id) });
    }
  }
  tileCache.set(id, cell);
  return cell;
}

/* Six poses out of two source frames. The pack ships an idle and a walk for each character, so
   the rest are composed rather than invented: walk alternates, the airborne pose is the walk
   frame, the skid is the walk frame flipped, and death is the idle turned over. Better a
   readable reuse than a hand-drawn pose that does not match the others. */
const flipX = (c) => { const o = clone(c); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) o.px[y * c.w + x] = c.px[y * c.w + (c.w - 1 - x)]; return o; };
const flipY = (c) => { const o = clone(c); for (let y = 0; y < c.h; y++) o.px.set(c.px.subarray((c.h - 1 - y) * c.w, (c.h - y) * c.w), y * c.w); return o; };

const spriteCache = new Map();
export function spriteCell(kind, frame) {
  const key = kind * 8 + frame;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const art = kind === K.PLAYER ? CHAR_ART.player : kind === K.WALKER ? CHAR_ART.walker
            : kind === K.HOPPER ? CHAR_ART.hopper : null;
  let cell;
  if (kind === K.POP) cell = tileCell(T.COIN);
  else if (kind === K.DEBRIS) {
    const c = parse(TILE_ART.brick);
    const half = { px: new Uint8Array(8 * 8).fill(TRANSPARENT), w: 8, h: 8 };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) half.px[y * 8 + x] = at(c, x + 4, y + 4);
    cell = emboss(band(half, BANDS.object));
  } else if (!art) cell = { px: new Uint8Array(0), w: 0, h: 0 };
  else {
    /* Contour, then HALO. The inner ring is the dark silhouette a figure needs to be one shape at
       18px; the outer ring is drawn at level 0, which on this panel is the bare plate — and a
       plate-coloured ring is opaque now, so it CARVES the figure out of whatever she is standing
       on. Without it a dark character on solid dark ground is one dark mass, which is exactly
       what raising the terrain band would otherwise have cost. Two pixels of growth per side; the
       renderer already centres a sprite on its collision box, so the halo costs no alignment. */
    const bnd = kind === K.PLAYER ? BANDS.actor : BANDS.foe;
    const pose = (rows) => emboss(outline(outline(band(parse(rows), bnd), 4), 0));
    const idle = pose(art[0]), walk = pose(art[1]);
    cell = frame === 1 ? walk : frame === 2 ? idle : frame === 3 ? walk
         : frame === 4 ? flipY(idle) : frame === 5 ? flipX(walk) : idle;
  }
  spriteCache.set(key, cell);
  return spriteCache.get(key) ?? cell;
}

/* ── painting ─────────────────────────────────────────────────────────────────────────── */
/**
 * Paint a cell into an RGBA buffer.
 *
 * A pixel resolves to the OPAQUE colour its density means on this panel (`segmentRGB`) and
 * replaces what was there — it does not blend with it. That is the whole repair of the
 * translucent look: this function used to composite ink at `INK[level]` over the buffer, so a
 * terrain tile at level 2 let 55% of the parallax hill behind it through. A panel has one layer
 * of segments over one backplate; there is nothing behind a segment to show through.
 *
 * `alphaScale` survives as the one honest use of partial coverage — a mark that genuinely
 * darkens what is under it, i.e. the ground shadow — and at its default of 1 the write is a
 * straight replace.
 */
export function paint(rgba, W, H, cell, ox, oy, { plate = LCD.plate, ink = LCD.ink, alphaScale = 1, level = null } = {}) {
  const lut = [0, 1, 2, 3, 4].map((l) => segmentRGB(l, plate, ink));
  for (let y = 0; y < cell.h; y++) {
    const py = oy + y;
    if (py < 0 || py >= H) continue;
    for (let x = 0; x < cell.w; x++) {
      const v = cell.px[y * cell.w + x];
      if (v === TRANSPARENT) continue;
      const px = ox + x;
      if (px < 0 || px >= W) continue;
      if (alphaScale <= 0) continue;
      const c = lut[clampLevel(level == null ? v : level)];
      const o = (py * W + px) * 4;
      for (let i = 0; i < 3; i++) rgba[o + i] = rgba[o + i] * (1 - alphaScale) + c[i] * alphaScale;
      rgba[o + 3] = 255;
    }
  }
}

export const TILE_IDS = [T.GROUND, T.DIRT, T.BRICK, T.QUESTION, T.USED, T.STONE, T.COIN, T.PIPE_TOP, T.PIPE_BOD, T.BUSH, T.HILL];
export const SPRITE_KINDS = [K.PLAYER, K.WALKER, K.HOPPER, K.POP, K.DEBRIS];
