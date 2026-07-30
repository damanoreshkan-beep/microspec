// hunt — the pure half: geometry, the ABI, and the light model in COLOUR.
//
// Same shape as brick.js and deliberately so; the differences are the interesting part. brick has
// one ink and five densities, so its light model is `level ± 1` and its material is a property of
// the display. hunt has a palette, so:
//
//   · a pixel is an INDEX, and "one step lighter" is a lookup, not arithmetic (RAMP, derived from
//     the palette at import time — see tools/art/hunt-import.mjs);
//   · there is no plate, no ghost, no segment lattice and no polariser. Those were the LCD.
//
// What carries over unchanged is everything that was about LIGHT rather than about ink: one source
// at 45° upper-left, a rim on the faces that meet it, a shade on the faces that turn away, and a
// ground shadow that is a PROJECTION (at 45°, displacement equals height) rather than an offset.
//
// Runtime-internal imports must be RELATIVE — this file has none.

/* ── geometry, measured off the art (32×42 figure → 1.75 tiles) ─────────────────────────── */
export const TILE = 24;
export const SCRW = 384;                  // 16 tiles — 1:1 on a 384px phone, no fractional scale
export const SCRH = 264;                  // 11 rows
export const ROWS = 11;
export const COLS = SCRW / TILE;

/* ── the ABI, mirrored in tools/wasm/hunt/game.c ───────────────────────────────────────── */
export const IN = { LEFT: 1, RIGHT: 2, JUMP: 4, RUN: 8, DOWN: 16, SHOOT: 32 };
export const SFX = { JUMP: 1, COIN: 2, STOMP: 4, BRICK: 8, BUMP: 16, DEATH: 32, SHOOT: 64, HURT: 128, PICK: 256, EMPTY: 512 };
export const S = {
  FRAME: 0, SCORE: 1, COINS: 2, DIST: 3, CAMX: 4, PX: 5, PY: 6, PSTATE: 7,
  PDIR: 8, DEAD: 9, SFX: 10, DLN: 11, GROUND: 12, AMMO: 13, HP: 14, INVULN: 15, KILLS: 16,
  COUNT: 17,
};
export const T = {
  EMPTY: 0x00, COIN: 0x01, BUSH: 0x02, HILL: 0x03, CLOUD: 0x04, SPEAR: 0x05, HEART: 0x06,
  SOLID: 0x10, GROUND: 0x10, DIRT: 0x11, BRICK: 0x12, QUESTION: 0x13, USED: 0x14,
  PIPE_TOP: 0x15, PIPE_BOD: 0x16, STONE: 0x19,
};
export const K = { PLAYER: 0, WALKER: 1, HOPPER: 2, POP: 3, DEBRIS: 4, SPEAR: 5, HERO: 6 };
export const SPRITE = 0x100;

/* ── the light ────────────────────────────────────────────────────────────────────────────
   Still one source, still upper-left at 45°, still the same one that extrudes every surface in
   the farm (theme.css `--nm-dark` at +d,+d and `--nm-light` at −d,−d). The game is lit by the same
   lamp as the page it is drawn on; that was the whole argument in brick and it does not depend on
   the display being monochrome. */
export const LIGHT = Object.freeze({ x: -1, y: -1 });

/* ── the world's own palette ───────────────────────────────────────────────────────────────
   The characters bring 32 colours measured from their own art. The TERRAIN is ours, and it is
   drawn rather than imported — mixing a cartoon tileset under these figures would be a style
   collision, and there is no CC0 tileset at 24px in this style to import anyway. Kept in the same
   register as the characters: deep forest earth, moss, wet stone. */
export const WORLD = Object.freeze({
  sky: ["#1b2430", "#2c3a49"],            // top → horizon
  /* DEPTH IS A VALUE, not only a speed. The four backdrop bands step DOWN in luminance as they come
     forward — ridge 38, far canopy 31, mid canopy 24, near canopy 16 — against a sky that runs 36
     at the top to 56 at the horizon. Two things had to be true and only one of them was obvious:
     the steps must be EVEN, or two bands collapse into one distance; and every band must be DARKER
     than the sky behind it at its own height, or "far away" turns into "glowing". The first cut put
     the range at 47 against a local sky of 45 and it vanished. */
  ridge: "#1d2734",                       // the far range, its detail eaten by haze
  canopyFar: "#18202b",
  canopyMid: "#131a23",
  canopy: "#0d131a",                      // the near treeline: the darkest thing on screen
  canopyLit: "#1c2622",                   // moonlight on a near crown — green enters only up close
  bark: "#171410",
  barkLit: "#282219",
  moon: "#c9d2dc",
  moonDim: "#8e99a6",                     // the terminator: a flat disc reads as a ball bearing
  star: "#7f90a4",
  /* Everything below the crust line, drawn before the tiles. A pit is a MISSING tile, so whatever
     the backdrop left there is what the player falls into — and what it left was the sky gradient,
     a bright column reading as a hole cut out of the picture rather than as a drop. */
  abyss: "#080b10",
  grass: "#4a6b3a",
  grassLit: "#6d9150",
  /* Four soil values, evenly spaced (luma 61 / 53 / 42 / 29). The patch texture reads as WALLPAPER
     the moment two of them are far apart: earth over earthDark was a 19-point jump, which turned
     every 24px tile boundary into a visible seam. Mid exists to keep each step under about 12. */
  earth: "#4a3b2c",
  earthMid: "#403327",
  earthDark: "#33291e",
  earthDeep: "#241c14",                   // the bottom of the frame, where the soil gets heavy
  /* Buried stone is NOT `stone`. The cold grey of a built block against warm night soil reads as a
     foreign object dropped in, and a tile's worth of them reads as cobblestone wallpaper. These sit
     a step off the earth's own hue, which is what a rock in the ground actually looks like. */
  grit: "#4a4135",
  gritLit: "#5e5344",
  /* Ledge rock, pulled DOWN from where it was (#4d4f57 / #6a6d78). Platforms are the brightest mass
     in a night frame and at that value they read as interface chrome laid over the picture rather
     than as something in the world you can stand on. */
  stone: "#43464e",
  stoneLit: "#51555f",
  wood: "#5a3f28",
  gold: "#d8a534",
  goldLit: "#f2d47a",
  goldDark: "#8a6420",
  heart: "#c8434f",
  spear: "#b9743a",
  spearTip: "#d9dbe4",
  quiverEmpty: "#3d4653",                 // a slot with nothing in it — visible, but plainly not a spear
});

/* ── the material, in colour ──────────────────────────────────────────────────────────────
   `lit()` and `shade()` replace brick's `level ± 1`. They take the RAMP the importer derived from
   the palette, because "one step brighter" is a question the palette has to answer: entry 7 and
   entry 8 are not neighbouring shades of anything, and doing arithmetic on an index is how a
   highlight on skin turns into a highlight of grass. */
export const lit = (ramp, i) => (ramp[i] ? ramp[i][0] : i);
export const shade = (ramp, i) => (ramp[i] ? ramp[i][1] : i);

/* A contact shadow is not a colour from the palette — it is the ground, darkened. */
export const SHADOW = Object.freeze({ alpha: 0.42, reach: 60, floor: 0.08, flat: 0.34, wide: 0.42 });

/**
 * Where a sprite's ground shadow goes and how heavy it is. Identical maths to brick, and for the
 * identical reason: at a 45° light a point `h` above the ground lands `h` along it, because
 * tan 45° = 1. The displacement IS the height, so a jumping figure leaves its shadow behind and
 * that separation is the whole depth cue.
 */
export function shadowFor(h, w) {
  const t = Math.max(0, Math.min(1, h / SHADOW.reach));
  const rx = Math.max(1, Math.round((w * SHADOW.wide) * (1 - 0.45 * t)));
  return {
    dx: Math.round(Math.max(0, h)),
    rx,
    ry: Math.max(1, Math.round(rx * SHADOW.flat)),
    alpha: SHADOW.alpha + (SHADOW.floor - SHADOW.alpha) * t,
  };
}

export function parallaxX(camx, depth) { return Math.round(camx * depth) | 0; }
export const LAYERS = Object.freeze([0.12, 0.3, 0.55]);

/* ── display list ─────────────────────────────────────────────────────────────────────── */
export function decodeEntry(dl, i) {
  const o = i * 4, id = dl[o], attr = dl[o + 3];
  return {
    id, x: dl[o + 1], y: dl[o + 2],
    tile: id < SPRITE ? id : 0,
    kind: id >= SPRITE ? id - SPRITE : -1,
    isSprite: id >= SPRITE,
    flip: (attr & 1) === 1,
    frame: (attr >> 1) & 7,
  };
}
export const isBackdrop = (t) => t === T.BUSH || t === T.HILL || t === T.CLOUD;
export const isPickup = (t) => t === T.COIN || t === T.SPEAR || t === T.HEART;

/* ── the pose contract ────────────────────────────────────────────────────────────────────
   The engine spends six of its eight frame numbers on locomotion, which is why the WEAPON is a
   separate sprite rather than another set of body poses: a throw while running would otherwise
   need its own frame, and so would a throw while rising, and while falling, and while skidding.
   The body plays locomotion; the spear is drawn over it at the angle it is actually travelling.
   That is the difference between four extra sprites and forty. */
export const POSE = { STAND: 0, WALK_A: 1, WALK_B: 2, AIR: 3, DEAD: 4, SKID: 5, LOW: 6 };
export const ANIM = {
  [POSE.STAND]: "idle", [POSE.WALK_A]: "run", [POSE.WALK_B]: "run",
  [POSE.AIR]: "jump", [POSE.DEAD]: "dead", [POSE.SKID]: "run",
  /* Crouching is a smaller BODY, not a costume — the collision box halves, so the art has to come
     down with it or the hitbox and the picture stop agreeing. The pack has no crouch, so the fall
     pose stands in: gathered legs, low centre. Held on one frame, because a duck is a position. */
  [POSE.LOW]: "fall",
};

/** Which animation frame to show, given the engine's pose and the frame counter. */
export function animFrame(anim, pose, frameNo) {
  if (!anim) return 0;
  if (pose === POSE.DEAD) return anim.n - 1;          // hold the last frame, do not loop a death
  if (pose === POSE.AIR) return Math.min(anim.n - 1, 1);
  if (pose === POSE.LOW) return anim.n - 1;            // a duck is a position, not a loop
  if (pose === POSE.STAND) return (frameNo >> 3) % anim.n;
  return (frameNo >> 2) % anim.n;
}

/* ── HUD ──────────────────────────────────────────────────────────────────────────────── */
export function digits(value, width) {
  const n = Math.max(0, Math.floor(value || 0));
  const s = String(n);
  return s.length >= width ? s.slice(-width) : "0".repeat(width - s.length) + s;
}
export function betterRun(prev, run) {
  if (!run) return prev ?? null;
  if (!prev) return { ...run };
  return run.dist > prev.dist ? { ...run } : prev;
}
