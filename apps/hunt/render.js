// hunt — the renderer. One frame, in colour.
//
// The pass order lives here once and runs against a `painter`, so the browser (Canvas2D, blitting
// pre-baked cells) and the offline Deno preview draw exactly the same picture. brick learned that
// the hard way: a preview rendered by a second code path is a preview of something nobody ships.
//
// What is gone from brick's order: the plate, the ghost trail, the segment lattice and the
// polariser sheen. Those four were the LCD, not the game. What stays is everything that was about
// light — the rim, the extrusion, the contour, and the ground shadow as a 45° projection.

import {
  SCRW, SCRH, TILE, ROWS, LAYERS, shadowFor, parallaxX,
  T, K, S, POSE, ANIM, animFrame, decodeEntry,
} from "/_rt/hunt.js";
import { tileCell, frameCell, spearCell, anim, WORLD_INDEX as W } from "./atlas.js";

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x; };

/* ── the sky and what is far away ─────────────────────────────────────────────────────────
   Generated from the camera rather than stored: none of it carries gameplay meaning, and a tile
   that means nothing is a tile that should not cost memory. Integer offsets only — a fractional
   parallax resamples the silhouette and the crispness of everything else stops mattering.

   What was here before was two bands of `sqrt(1 - (dy/h)²)` — literal semicircles, 220px wide. At
   that size an arc does not read as land, it reads as a compass, and the app calls itself a forest
   while drawing no trees at all. Four depths now, and every band ends at the SAME base (two pixels
   under the grass line) so no band can show a seam of raw sky above the ground: distance is carried
   by the profile, by the speed, and by the value — see the note on WORLD in /_rt/hunt.js. */
const DEPTH = Object.freeze({ range: 0.06, far: LAYERS[0], mid: LAYERS[1], near: LAYERS[2] });

/** Smooth 1-D value noise in [0,1): nodes every `period` px, smoothstepped between them. This is
    the difference between rolling land and a row of triangles, and it costs one lerp. */
function vnoise(wx, period, salt) {
  const i = Math.floor(wx / period), u = (wx - i * period) / period;
  const a = hash(salt + i) & 1023, b = hash(salt + i + 1) & 1023;
  return (a + (b - a) * (u * u * (3 - 2 * u))) / 1024;
}

/**
 * A per-column silhouette, emitted as horizontal RUNS rather than 384 one-pixel rects.
 *
 * Both painters charge per rect (a fillRect in the browser, a fill loop in the preview) and this
 * renderer has four full-width bands in it. Neighbouring columns share a top most of the time, so
 * batching cuts the call count by roughly an order of magnitude for nothing but a comparison.
 * `top(x)` at or below `base` draws nothing, which is how a pit opts out of the deep-soil band.
 */
function silhouette(p, ink, base, top) {
  let x0 = 0, cur = top(0);
  for (let x = 1; x <= SCRW; x++) {
    const t = x < SCRW ? top(x) : Infinity;
    if (t === cur) continue;
    if (cur < base) p.rect(x0, cur, x - x0, base - cur, ink);
    x0 = x; cur = t;
  }
}

/**
 * One band of conifers, drawn tree by tree rather than column by column.
 *
 * Per-tree is what buys the near band its TRUNKS: a tree whose crown stops short of the base leaves
 * a gap you see the next band through, which is what the edge of a forest actually looks like. A
 * per-column silhouette can only produce one continuous skyline, which is right for the far bands
 * and wrong for the one you are standing in.
 */
function conifers(p, camx, o) {
  const off = parallaxX(camx, o.depth);
  /* THE UNDERSTORY, and it is not decoration. A band of cones all standing on the same line leaves a
     V between every adjacent pair that runs to the ground, so the band reads as a picket fence — the
     valleys in a real treeline are filled by the trees behind, and at one depth there are none. A
     ragged floor is the cheapest honest stand-in. The near band gets none: its gaps are the point,
     they are what the boles stand in and what you see the next band through. */
  if (o.floor) silhouette(p, o.ink, o.base, (x) => o.base - o.floor - Math.round(vnoise(x + off, 13, o.salt + 9) * 7));
  const i0 = Math.floor((off - o.period) / o.period), i1 = Math.ceil((off + SCRW + o.period) / o.period);
  for (let i = i0; i <= i1; i++) {
    /* `>>>`, everywhere, and not as a style preference: hash() returns an unsigned 32-bit value, so
       a signed `>>` on anything past 2³¹ yields a NEGATIVE number and `% n` then yields a negative
       remainder. That put `taper` below 1 on half the trees — and an exponent below 1 is a CONVEX
       profile, which drew domes. The exact artefact this backdrop was written to delete. */
    const seed = hash(o.salt + i);
    const w = o.wlo + (seed >>> 2) % o.wspan;
    /* Every seventh or so is a VETERAN, a third again as tall. A stand of trees within 20% of one
       height is a hedge; the reason a real treeline has a profile is that a few of them won. */
    const h = ((seed >>> 26) % 7 ? 1 : 1.35) * (o.hlo + (seed >>> 8) % o.hspan);
    const cx = i * o.period + ((seed >>> 4) % o.period) - off;
    if (cx + w < 0 || cx - w > SCRW) continue;
    // A third of the near band is young growth with no clear bole — a forest edge is not a colonnade.
    const trunk = o.trunk && (seed >>> 17) % 3 ? o.trunk + ((seed >>> 19) % 12) : 0;
    const bot = o.base - trunk;
    const half = w >> 1;
    /* 1.0 is a straight cone; above it the sides bow IN, which is a spruce. The range has to reach
       all the way down to 1 or the band comes out as one repeated needle — with taper pinned high
       every tree is the same silhouette no matter how its width and height vary. Never BELOW 1:
       that is a convex profile, and a convex profile is a dome. */
    const taper = 1 + ((seed >>> 12) % 90) / 100;
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= SCRW) continue;
      /* A spruce, not a cone: the profile bows in (exponent > 1), so the crown is a spire and the
         skirt is wide. ±1px of hash along the slope keeps the branches off the ruler. */
      const top = bot - Math.round(h * (1 - Math.abs(dx) / half) ** taper) + (hash(o.salt * 31 + x + i * 7) & 1);
      if (top < bot) {
        p.rect(x, top, 1, bot - top, o.ink);
        // The lamp is upper-left (LIGHT), so the left slope of a near crown catches it and the
        // right does not. One pixel, on the near band only — at the far ones it would be noise.
        if (o.litInk && dx < 0 && (x & 1) === 0) p.rect(x, top, 1, 1, o.litInk);
      }
    }
    if (trunk) {
      const bw = 2 + ((seed >>> 21) & 3);
      p.rect(cx - (bw >> 1), bot, bw, trunk, W.bark);
      p.rect(cx - (bw >> 1), bot, 1, trunk, W.barkLit);
    }
  }
}

/**
 * Where the darkness under a PIT starts, per tile column.
 *
 * A pit has no soil to take the answer from, so it borrows the lip beside it — the chasm then opens
 * at the edge you actually walked off. Clamped to the standard crust line, because a pit next to a
 * plateau would otherwise be blacked out from three rows up, hiding the forest behind it.
 */
function pitTops(crust, horizon) {
  const n = crust.length, out = new Int16Array(n);
  let prev = horizon;
  for (let c = 0; c < n; c++) { if (crust[c] !== 32767) prev = crust[c]; out[c] = prev; }
  let next = out[n - 1];
  for (let c = n - 1; c >= 0; c--) {
    if (crust[c] !== 32767) next = crust[c];
    out[c] = Math.max(horizon, Math.min(out[c], next));
  }
  return out;
}

const colOf = (x) => Math.round(x / TILE) + 1;

function backdrop(p, camx, crust) {
  p.sky();
  const horizon = ROWS * TILE - TILE * 3;
  /* Two pixels under the crust line, and no further. The terrain is not flat (it runs y=120..216),
     and the obvious fix — drop the base a whole row so a dip cannot expose sky — buries the near
     band's boles, which are 11..22px long and measured from this same line. What a dip exposes is
     answered below instead, by the thing a dip actually is: a cut, with soil behind it. */
  const base = horizon + 2;

  /* Stars do not parallax AT ALL. That is not a shortcut — zero is the physically true speed for
     something at infinity, and it is the cue that separates sky from land before any silhouette
     does. Held below the HUD row so a readout never sits in a star field. */
  for (let i = 0; i < 54; i++) {
    const s = hash(i * 2711 + 17);
    p.rect(s % SCRW, 30 + ((s >>> 9) % 92), 1, 1, (s >>> 20) % 6 ? W.star : W.moon);
  }
  /* The moon, and it is where the light comes FROM: every surface in this game (and in the page
     around it) is lit from the upper left at 45°, so the source belongs in the upper left of the
     frame rather than wherever it looked prettiest.

     Its terminator is SHADED FROM THE NORMAL rather than drawn. The two cuts before this both
     placed the boundary with a straight line (`cut = 7 - dy`), and a straight terminator is a
     CHORD — it reads as a bite taken out of a disc, which is exactly how it kept photographing:
     the brightest object in the frame and the worst-drawn one. A real terminator is the
     projection of a great circle onto the disc, so it curves, and the honest way to get that
     curve at 16px is not to derive its ellipse but to ask each pixel which way it faces and let
     the shape fall out. Three tones, because a sphere with one boundary is a pac-man and the limb
     needs somewhere to go. Runs per row rather than per pixel: same result, a third of the calls. */
  {
    const R = 8, cx = 88, cy = 46, K = Math.sqrt(1 / 3);       // the farm's 45° lamp, toward the viewer
    for (let dy = -R; dy <= R; dy++) {
      const hw = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy)));
      let runFrom = -hw, runTone = null;
      for (let dx = -hw; dx <= hw + 1; dx++) {
        let tone = null;
        if (dx <= hw) {
          const nx = dx / R, ny = dy / R;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const lam = (-nx - ny + nz) * K;                     // Lambert against (-1,-1,1)/√3
          tone = lam > 0.66 ? W.moon : lam > 0.3 ? W.moonMid : W.moonDim;
        }
        if (tone !== runTone) {
          if (runTone !== null) p.rect(cx + runFrom, cy + dy, dx - runFrom, 1, runTone);
          runFrom = dx; runTone = tone;
        }
      }
    }
  }

  /* THE RANGE. Value noise at two periods, not peaks: this is old worn country under a forest, and
     a skyline of triangles would say alps. Nearly fixed (0.06) — which is what "far" means. No lit
     crest: at this distance the haze has already eaten the modelling, and a highlight drawn there
     came back as a dotted wire strung across the frame. */
  const roff = parallaxX(camx, DEPTH.range);
  silhouette(p, W.ridge, base, (x) => {
    const wx = x + roff;
    const n = vnoise(wx, 173, 4001) * 0.68 + vnoise(wx, 59, 4200) * 0.32;
    return base - 44 - Math.round(n * 34) + (hash(wx * 3 + 91) & 1);
  });

  /* The two far bands are seeded WIDER than their period, so their crowns overlap and merge into a
     continuous mass with a ragged top. Trees narrower than the period leave a gap between every
     pair and the band comes back as a comb — which is what a distant forest never looks like. The
     near band is the opposite: sparse enough to walk between, which is what leaves room for boles. */
  conifers(p, camx, { depth: DEPTH.far, base, salt: 5100, period: 17, wlo: 20, wspan: 12, hlo: 18, hspan: 18, floor: 16, ink: W.canopyFar });
  conifers(p, camx, { depth: DEPTH.mid, base, salt: 6100, period: 26, wlo: 30, wspan: 16, hlo: 30, hspan: 26, floor: 20, ink: W.canopyMid });
  conifers(p, camx, {
    depth: DEPTH.near, base, salt: 7100, period: 54, wlo: 34, wspan: 16, hlo: 46, hspan: 34,
    ink: W.canopy, litInk: W.canopyLit, trunk: 11,
  });

  /* Under the crust the world is opaque — in TWO different ways, and painting them alike is what put
     a black notch in the middle of the ground. A column whose surface sits below the standard crust
     line is a DIP, and what a dip exposes is its own back wall: soil, in shadow. A column with no
     soil at all is a PIT, and what a pit exposes is nothing. Both are drawn here rather than left to
     the tiles, because the tiles are exactly what is missing in both cases. */
  silhouette(p, W.earthDeep, SCRH, (x) => (crust[colOf(x)] === 32767 ? SCRH : horizon));
  // The lip of a cut catches the lamp. Without it the wall is one flat value — a doorway punched
  // through the ground rather than earth someone has walked past the edge of.
  silhouette(p, W.earthDark, horizon + 3, (x) => {
    const c = crust[colOf(x)];
    return c !== 32767 && c > horizon ? horizon : horizon + 3;
  });
  const pits = pitTops(crust, horizon);
  silhouette(p, W.abyss, SCRH, (x) => (crust[colOf(x)] === 32767 ? pits[colOf(x)] : SCRH));
}

/**
 * The crust's top edge, roughened at 1px resolution against WORLD x.
 *
 * The tile is 24px and every ground tile is the same object, so any texture inside it repeats at
 * 24px and the eye finds that grid instantly — which is why the horizon read as a ruled highlighter
 * stroke. Smooth noise (adjacent columns correlate) so the result is tufts rather than a comb, and
 * seeded from world position so the period is the level's rather than the tile's.
 */
function fringe(p, sx, sy, wx) {
  for (let i = 0; i < TILE; i++) {
    const x = wx + i;
    let t = Math.round(vnoise(x, 5, 8800) * 3) - 1;
    if (hash(x * 13 + 41) % 23 === 0) t += 3;             // the odd blade that got away
    if (t <= 0) continue;
    p.rect(sx + i, sy - t, 1, t, hash(x + 999) & 3 ? W.grass : W.grassLit);
  }
}

/**
 * The soil gets heavy toward the bottom of the frame.
 *
 * A tile cannot say this: every DIRT cell is the same object whether it is one row under the grass
 * or eight, so depth has to be drawn over them. Ragged rather than banded (a ruled edge here is the
 * same mistake the grass line was making), keyed to world x so it does not crawl with the camera,
 * and skipped over columns with no floor — a pit is a drop, and giving it a soil bottom would put
 * a floor in it.
 */
function deepSoil(p, camx, crust) {
  silhouette(p, W.earthDeep, SCRH, (x) =>
    (crust[colOf(x)] === 32767 ? SCRH : SCRH - 20 - Math.round(vnoise(x + camx, 41, 9100) * 16)));
}

/** The floor under each column, so a shadow has something to fall on — and a pit has none. */
function groundMap(dl, dln) {
  const cols = new Int16Array(SCRW / TILE + 4).fill(32767);
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite || e.tile < T.SOLID) continue;
    const c = Math.round(e.x / TILE) + 1;
    if (c >= 0 && c < cols.length && e.y < cols[c]) cols[c] = e.y;
  }
  return cols;
}
/**
 * The top of the SOIL per column — GROUND and DIRT only.
 *
 * Deliberately not groundMap(): that one answers "what can a shadow land on", so a floating stone
 * ledge counts and it should. This one answers "where does the earth start", and a ledge over a pit
 * must not make the pit report a floor — it would fill the drop with soil.
 */
function crustMap(dl, dln) {
  const cols = new Int16Array(SCRW / TILE + 4).fill(32767);
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite || (e.tile !== T.GROUND && e.tile !== T.DIRT)) continue;
    const c = Math.round(e.x / TILE) + 1;
    if (c >= 0 && c < cols.length && e.y < cols[c]) cols[c] = e.y;
  }
  return cols;
}

const floorUnder = (cols, x, feet) => {
  const c = Math.round(x / TILE) + 1;
  const y = c >= 0 && c < cols.length ? cols[c] : 32767;
  return y === 32767 || y < feet - 2 ? null : y;
};

function ellipse(p, cx, cy, rx, ry, alpha) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    if (half > 0) p.shadow(cx - half, cy + dy, half * 2, 1, alpha);
  }
}

/** Which decoded animation a sprite kind uses. */
const whoOf = (kind) => (kind === K.PLAYER ? "hero" : kind === K.HERO || kind === K.WALKER || kind === K.HOPPER ? "foe" : null);

export function renderFrame(p, dl, dln, st, { hud = true, box = null } = {}) {
  /* The height of the thing the simulation collides with. It comes from the engine (game_box) —
     standing a sprite on the bottom of a TILE was one pixel out in brick and twelve here, and
     twelve pixels is a character hovering above the ground. */
  const boxH = (kind) => (box ? box(kind).h : TILE);
  const camx = st[S.CAMX], frameNo = st[S.FRAME];
  const floors = groundMap(dl, dln), crust = crustMap(dl, dln);
  backdrop(p, camx, crust);

  const sprites = [];
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite) { sprites.push(e); continue; }
    /* WORLD position, not screen position, picks the tile variant — so the texture stays put as the
       camera moves instead of crawling, and the 24px repeat breaks up over four cells. */
    const wx = e.x + camx;
    const c = tileCell(e.tile, hash(wx * 7 + e.y * 31) >>> 8);
    if (c.w) p.cell(c, e.x, e.y);
    if (e.tile === T.GROUND) fringe(p, e.x, e.y, wx);
  }
  deepSoil(p, camx, crust);

  /* Shadows before bodies, and projected onto the floor rather than offset behind the sprite: at
     45° the displacement equals the height, so a jumping figure leaves its shadow on the ground
     and that separation is the depth. Over a pit there is no floor, so there is no shadow. */
  for (const e of sprites) {
    const who = whoOf(e.kind);
    if (!who) continue;
    const a = anim(who, "idle");
    const w = a ? a.w : TILE;
    const feet = e.y + boxH(e.kind);
    const gy = floorUnder(floors, e.x, feet);
    if (gy == null) continue;
    const sh = shadowFor(gy - feet, w);
    ellipse(p, e.x + TILE / 2 + sh.dx, gy + sh.ry, sh.rx, sh.ry, sh.alpha);
  }

  for (const e of sprites) {
    if (e.kind === K.SPEAR) {
      /* The weapon is its own sprite, which is the whole reason a throw does not need its own body
         pose — see the note on POSE in /_rt/hunt.js. */
      p.cell(spearCell(e.frame - 2), e.x - 8, e.y - 4, { flip: e.flip });
      continue;
    }
    const who = whoOf(e.kind);
    if (!who) continue;
    const name = ANIM[e.frame] ?? "idle";
    const a = anim(who, name) ?? anim(who, "idle");
    if (!a) continue;
    const cell = frameCell(who, ANIM[e.frame] && anim(who, ANIM[e.frame]) ? ANIM[e.frame] : "idle",
                           animFrame(a, e.frame, frameNo), e.frame === POSE.LOW);
    /* Sprites are taller than a tile: centre on the collision box and stand them on its feet, or
       the character floats. The box is what the engine simulates; the art is what you see. */
    const ox = e.x + ((TILE - cell.w) >> 1), oy = e.y + boxH(e.kind) - cell.h;
    /* Invulnerability blinks, but it must never make the player DISAPPEAR. Skipping the draw on
       alternate frames is the usual trick and it is a trap here: the gate photographs a random
       frame, so the app's own screenshot — the one in the store, the one the taste pass judges —
       can come back with no character on screen at all. Fade instead of hide. */
    const blink = e.kind === K.PLAYER && st[S.INVULN] > 0 && (frameNo >> 2) % 2 ? 0.4 : 1;
    p.cell(cell, ox, oy, { flip: e.flip, alpha: blink });
  }

  if (hud) {
    /* Everything the readout says about the PLAYER stacks in the top-left; the one thing it says
       about the RUN sits opposite. The score used to be six digits bottom-left, sitting on the
       earth — over the play plane, in the part of the frame that has to stay clear because it is
       where the thing that kills you arrives from. */
    for (let i = 0; i < st[S.HP]; i++) p.cell(tileCell(T.HEART), -1 + i * 14, -3);

    /* THE QUIVER, as a countable thing rather than a number. A finite supply of throws is this
       game's whole tension and "03" does not carry it — a two-digit readout reads as a label, and
       at a glance you cannot tell 3 from 8 without reading. Eight slots are always drawn, because
       eight is what a run starts with: an empty slot is then a visible LOSS rather than an absence,
       and a pickup past eight lengthens the row, so resupply is a visible gain. */
    const ammo = Math.max(0, Math.min(20, st[S.AMMO]));
    for (let i = 0; i < Math.max(8, ammo); i++) {
      const x = 6 + i * 5;
      if (i < ammo) { p.rect(x, 16, 2, 10, W.spear); p.rect(x, 16, 2, 2, W.spearTip); }
      else p.rect(x, 18, 2, 8, W.quiverEmpty);
    }

    /* Right-aligned and UNPADDED. A fixed right edge is what stops the corner jittering as the
       number grows; the leading zeros the old readout padded with were six digits of nothing.
       NOT digits() — that helper TRUNCATES to its width as readily as it pads (`slice(-width)`),
       so asking it for "no padding" with width 1 turns a score of 264 into a 4. */
    const score = String(Math.max(0, Math.floor(st[S.SCORE] || 0)));
    let x = SCRW - 11 - (score.length - 1) * 8;
    for (const ch of score) { p.glyph(ch, x, 5); x += 8; }
  }
}

/* A 3×5 readout. The pack has no font and a 24px glyph would be a fifth of the screen. */
const FONT = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
};
export function glyphRects(ch) {
  const rows = FONT[ch];
  if (!rows) return [];
  const out = [];
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === "1") out.push([x, y]);
  return out;
}
export { SCRW, SCRH };
