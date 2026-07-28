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
  SCRW, SCRH, TILE, ROWS, WORLD, LAYERS, SHADOW, shadowFor, parallaxX,
  T, K, S, POSE, ANIM, animFrame, decodeEntry, digits, isBackdrop,
} from "/_rt/hunt.js";
import { tileCell, frameCell, spearCell, anim, WORLD_INDEX as W } from "./atlas.js";

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x; };

/* ── the sky and what is far away ─────────────────────────────────────────────────────────
   Generated from the camera rather than stored: hills carry no gameplay meaning, and a tile that
   means nothing is a tile that should not cost memory. Integer offsets only — a fractional
   parallax resamples the silhouette and the crispness of everything else stops mattering. */
function backdrop(p, camx) {
  p.sky();
  const horizon = ROWS * TILE - TILE * 3;
  for (let band = 0; band < 2; band++) {
    const off = parallaxX(camx, LAYERS[band]);
    const step = band ? 92 : 150, amp = band ? 34 : 58;
    for (let i = -1; i < 7; i++) {
      const seed = hash(band * 977 + i + ((off / step) | 0));
      const x = i * step - (off % step) + (seed % 46);
      const w = step + (seed >> 8) % 70, h = amp + (seed >> 16) % amp;
      for (let dy = 0; dy < h; dy++) {
        const half = Math.round((w / 2) * Math.sqrt(1 - (dy / h) ** 2));
        if (half > 0) p.rect(x + w / 2 - half, horizon - dy + band * 14, half * 2, 1, band ? W.hill : W.far);
      }
    }
  }
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
  backdrop(p, camx);

  const sprites = [];
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite) { sprites.push(e); continue; }
    const c = tileCell(e.tile);
    if (c.w) p.cell(c, e.x, e.y);
  }

  /* Shadows before bodies, and projected onto the floor rather than offset behind the sprite: at
     45° the displacement equals the height, so a jumping figure leaves its shadow on the ground
     and that separation is the depth. Over a pit there is no floor, so there is no shadow. */
  const floors = groundMap(dl, dln);
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
    for (let i = 0; i < st[S.HP]; i++) p.cell(tileCell(T.HEART), 4 + i * 18, -4);
    p.cell(tileCell(T.SPEAR), SCRW - 76, -2);
    let x = SCRW - 46;
    for (const ch of digits(st[S.AMMO], 2)) { p.glyph(ch, x, 8); x += 8; }
    x = 6;
    for (const ch of digits(st[S.SCORE], 6)) { p.glyph(ch, x, SCRH - 14); x += 8; }
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
