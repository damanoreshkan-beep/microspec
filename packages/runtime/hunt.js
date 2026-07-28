
export const TILE = 24;
export const SCRW = 384;                  
export const SCRH = 264;                  
export const ROWS = 11;
export const COLS = SCRW / TILE;

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

export const LIGHT = Object.freeze({ x: -1, y: -1 });
export const WORLD = Object.freeze({
  sky: ["#1b2430", "#2c3a49"],            
  hill: "#22303c",
  far: "#1d2833",
  grass: "#4a6b3a",
  grassLit: "#6d9150",
  earth: "#4a3b2c",
  earthDark: "#33291e",
  stone: "#4d4f57",
  stoneLit: "#6a6d78",
  wood: "#5a3f28",
  gold: "#d8a534",
  heart: "#c8434f",
  spear: "#b9743a",
  spearTip: "#d9dbe4",
});


export const lit = (ramp, i) => (ramp[i] ? ramp[i][0] : i);
export const shade = (ramp, i) => (ramp[i] ? ramp[i][1] : i);


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


export const POSE = { STAND: 0, WALK_A: 1, WALK_B: 2, AIR: 3, DEAD: 4, SKID: 5, LOW: 6 };
export const ANIM = {
  [POSE.STAND]: "idle", [POSE.WALK_A]: "run", [POSE.WALK_B]: "run",
  [POSE.AIR]: "jump", [POSE.DEAD]: "dead", [POSE.SKID]: "run",
  
  [POSE.LOW]: "fall",
};

/** Which animation frame to show, given the engine's pose and the frame counter. */
export function animFrame(anim, pose, frameNo) {
  if (!anim) return 0;
  if (pose === POSE.DEAD) return anim.n - 1;          
  if (pose === POSE.AIR) return Math.min(anim.n - 1, 1);
  if (pose === POSE.LOW) return anim.n - 1;            
  if (pose === POSE.STAND) return (frameNo >> 3) % anim.n;
  return (frameNo >> 2) % anim.n;
}


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
