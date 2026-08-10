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
  moonMid: "#a8b3c0",                     // the limb — a 16px sphere with ONE boundary is a pac-man
  moonDim: "#8e99a6",                     // the far side, still lit by the sky it sits in
  star: "#7f90a4",
  /* Everything below the crust line, drawn before the tiles. A pit is a MISSING tile, so whatever
     the backdrop left there is what the player falls into — and what it left was the sky gradient,
     a bright column reading as a hole cut out of the picture rather than as a drop. */
  abyss: "#080b10",
  /* Moonlit, not daylit. These were a daytime green (#4a6b3a / #6d9150) and in a night frame the
     crust came out as the second brightest thing after the moon — a saturated band along the very
     bottom edge, pulling the eye down and away from the play plane. Scotopic vision desaturates
     hard toward blue, so moonlit vegetation reads as a cool near-grey that only admits it is green
     where a highlight catches it. Enough hue survives to say grass; not enough to compete. */
  grass: "#38492f",
  grassLit: "#4e6440",
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
  /* Appended AFTER the original set on purpose: atlas.js derives palette indices from key order,
     and inserting a key above this line would renumber every baked cell in the farm's caches. */
  cloud: "#222c3b",                       // night clouds: barely there, a held breath
  cloudLit: "#2c3849",
  fly: "#ffd27a",                         // a firefly — never appears at noon
  mote: "#f2efe4",                        // daylight dust
});

/* ── the day, driven by distance ──────────────────────────────────────────────────────────
   One cycle is 480 columns: dawn at the start of a run, night arriving with the hard part
   (difficulty saturates at column 300), and a second dawn for the runs that earn it. Each
   keyframe carries the FULL WORLD key set — a key missing from one phase would flash the night
   value mid-lerp, so the parity is unit-tested rather than trusted.

   The night keyframe IS the original WORLD, verbatim. It was crafted; its mistake was being the
   only weather. */
export const CYCLE = 480;

const DAWN = {
  at: 0.0, stars: 0.25, fireflies: 0, motes: 0.3,
  orb: { kind: 1, x: 64, y: 82, r: 11 },                  // kind 1 = sun, 0 = moon
  orbTones: ["#ffd9a0", "#f0a860", "#c9825a"],
  rim: "#e8b58a", rimA: 0.5,
  sky: ["#494466", "#d99a72"],
  colors: {
    ridge: "#595070", canopyFar: "#474160", canopyMid: "#36334c", canopy: "#262536",
    canopyLit: "#6b5a52", bark: "#33291f", barkLit: "#4d3c2b",
    moon: "#ffd9a0", moonMid: "#f0a860", moonDim: "#c9825a", star: "#8d93ad",
    abyss: "#12131c", grass: "#45543a", grassLit: "#6d7a4c",
    earth: "#5c4936", earthMid: "#4e3d2c", earthDark: "#3c2f22", earthDeep: "#281f16",
    grit: "#5a4f40", gritLit: "#6f6250", stone: "#55555f", stoneLit: "#6a6a75",
    wood: "#6a4c2e", gold: "#e0ac38", goldLit: "#f7d97e", goldDark: "#946b22",
    heart: "#cf4550", spear: "#c07a40", spearTip: "#ecdfe0", quiverEmpty: "#454a5c",
    cloud: "#8a5e6b", cloudLit: "#e8a184", fly: "#ffd27a", mote: "#f2efe4",
  },
};

const DAY = {
  at: 0.16, stars: 0, fireflies: 0, motes: 1,
  orb: { kind: 1, x: 100, y: 40, r: 9 },
  orbTones: ["#f9efd6", "#f2d78a", "#e0b45e"],
  rim: "#ffffff", rimA: 0,                                 // noon needs no rescue light
  sky: ["#7fa9c6", "#d8e6ee"],
  colors: {
    ridge: "#6c8ba1", canopyFar: "#54776a", canopyMid: "#3f5f4d", canopy: "#2a4634",
    canopyLit: "#5d8b54", bark: "#4a3826", barkLit: "#6b5233",
    moon: "#f9efd6", moonMid: "#f2d78a", moonDim: "#e0b45e", star: "#d8e6ee",
    abyss: "#1a2318", grass: "#4a6b3a", grassLit: "#6d9150",
    earth: "#6b543c", earthMid: "#5d4934", earthDark: "#493a29", earthDeep: "#33291d",
    grit: "#6b5f4c", gritLit: "#857463", stone: "#6e7278", stoneLit: "#8b9097",
    wood: "#7a5836", gold: "#e8b83e", goldLit: "#ffe38f", goldDark: "#a3762a",
    heart: "#d84a56", spear: "#c98548", spearTip: "#f0f2f7", quiverEmpty: "#4d5765",
    cloud: "#e9f0f5", cloudLit: "#fbfdfe", fly: "#ffd27a", mote: "#f2efe4",
  },
};

const GOLD = {
  at: 0.5, stars: 0, fireflies: 0.15, motes: 0.5,
  orb: { kind: 1, x: 70, y: 72, r: 11 },
  orbTones: ["#ffedbe", "#f5c26a", "#d99a4a"],
  rim: "#ffd98a", rimA: 0.55,
  sky: ["#5c6a88", "#e8b06a"],
  colors: {
    ridge: "#6b6478", canopyFar: "#5e5a50", canopyMid: "#4a4638", canopy: "#333526",
    canopyLit: "#8a7a3e", bark: "#443521", barkLit: "#66512f",
    moon: "#ffedbe", moonMid: "#f5c26a", moonDim: "#d99a4a", star: "#c9b8a0",
    abyss: "#171a14", grass: "#566038", grassLit: "#8a8a4a",
    earth: "#6b5238", earthMid: "#5c4530", earthDark: "#473624", earthDeep: "#302518",
    grit: "#6b5c44", gritLit: "#837152", stone: "#6d6a62", stoneLit: "#868377",
    wood: "#75552f", gold: "#eebd44", goldLit: "#ffe896", goldDark: "#a3782a",
    heart: "#d8505a", spear: "#cd8746", spearTip: "#f5ecdc", quiverEmpty: "#4c5158",
    cloud: "#d9a06a", cloudLit: "#f5cf96", fly: "#ffd27a", mote: "#f2efe4",
  },
};

const DUSK = {
  at: 0.66, stars: 0.45, fireflies: 0.6, motes: 0,
  orb: { kind: 0, x: 92, y: 56, r: 8 },
  orbTones: ["#d9cfd6", "#b3a8ba", "#948a9e"],
  rim: "#a29ac2", rimA: 0.45,
  sky: ["#2c2b47", "#8a5a78"],
  colors: {
    ridge: "#3a3652", canopyFar: "#2e2b45", canopyMid: "#232238", canopy: "#17172a",
    canopyLit: "#3d3448", bark: "#241d18", barkLit: "#3a2f22",
    moon: "#d9cfd6", moonMid: "#b3a8ba", moonDim: "#948a9e", star: "#8d93ad",
    abyss: "#0c0d16", grass: "#3d4633", grassLit: "#576246",
    earth: "#52422f", earthMid: "#463829", earthDark: "#372c20", earthDeep: "#262015",
    grit: "#52483a", gritLit: "#665a48", stone: "#4c4c58", stoneLit: "#5e5e6b",
    wood: "#61442b", gold: "#d8a534", goldLit: "#f2d47a", goldDark: "#8a6420",
    heart: "#c8434f", spear: "#bd7a3e", spearTip: "#dfd9e6", quiverEmpty: "#414659",
    cloud: "#4a3a58", cloudLit: "#6b4d6e", fly: "#ffd27a", mote: "#f2efe4",
  },
};

const NIGHT = {
  at: 0.82, stars: 1, fireflies: 1, motes: 0,
  orb: { kind: 0, x: 88, y: 46, r: 8 },
  orbTones: [WORLD.moon, WORLD.moonMid, WORLD.moonDim],
  rim: "#b9c6d8", rimA: 0.5,
  sky: [WORLD.sky[0], WORLD.sky[1]],
  colors: Object.fromEntries(
    Object.keys(WORLD).filter((k) => typeof WORLD[k] === "string").map((k) => [k, WORLD[k]]),
  ),
};

export const PHASES = Object.freeze([DAWN, DAY, GOLD, DUSK, NIGHT]);

const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export function lerpHex(a, b, t) {
  const A = hx(a), B = hx(b);
  return "#" + hex2(A[0] + (B[0] - A[0]) * t) + hex2(A[1] + (B[1] - A[1]) * t) + hex2(A[2] + (B[2] - A[2]) * t);
}
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The world at a distance: every colour and ambient number, interpolated between phase
 * keyframes with a smoothstep. Distance wraps at CYCLE, so a long run sees a second dawn.
 * Pure — the same function feeds the browser, the gate and the offline preview.
 */
export function worldAt(dist) {
  const t = (((dist / CYCLE) % 1) + 1) % 1;
  let i = PHASES.length - 1;
  for (let k = 0; k < PHASES.length; k++) if (PHASES[k].at <= t) i = k;
  const a = PHASES[i], b = PHASES[(i + 1) % PHASES.length];
  const span = (b.at > a.at ? b.at : b.at + 1) - a.at;
  let u = span > 0 ? (t - a.at) / span : 0;
  u = u * u * (3 - 2 * u);
  const colors = {};
  for (const k of Object.keys(a.colors)) colors[k] = lerpHex(a.colors[k], b.colors[k], u);
  return {
    colors,
    sky: [lerpHex(a.sky[0], b.sky[0], u), lerpHex(a.sky[1], b.sky[1], u)],
    stars: lerp(a.stars, b.stars, u),
    fireflies: lerp(a.fireflies, b.fireflies, u),
    motes: lerp(a.motes, b.motes, u),
    /* The orb never crossfades kinds mid-air: it keeps the NEARER keyframe's body and lerps
       position/size, so the sun sets as a sun and the moon rises as a moon. */
    orb: {
      kind: (u < 0.5 ? a : b).orb.kind,
      x: Math.round(lerp(a.orb.x, b.orb.x, u)),
      y: Math.round(lerp(a.orb.y, b.orb.y, u)),
      r: Math.round(lerp(a.orb.r, b.orb.r, u)),
      tones: [0, 1, 2].map((j) => lerpHex(a.orbTones[j], b.orbTones[j], u)),
      /* fade through a kind switch so a sun never pops into a moon */
      alpha: a.orb.kind === b.orb.kind ? 1 : Math.abs(u - 0.5) * 2,
    },
    rim: lerpHex(a.rim, b.rim, u),
    rimA: lerp(a.rimA, b.rimA, u),
  };
}

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
