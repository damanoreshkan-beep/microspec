
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
  
  ridge: "#1d2734",                       
  canopyFar: "#18202b",
  canopyMid: "#131a23",
  canopy: "#0d131a",                      
  canopyLit: "#1c2622",                   
  bark: "#171410",
  barkLit: "#282219",
  moon: "#c9d2dc",
  moonMid: "#a8b3c0",                     
  moonDim: "#8e99a6",                     
  star: "#7f90a4",
  abyss: "#080b10",
  grass: "#38492f",
  grassLit: "#4e6440",
  earth: "#4a3b2c",
  earthMid: "#403327",
  earthDark: "#33291e",
  earthDeep: "#241c14",                   
  grit: "#4a4135",
  gritLit: "#5e5344",
  stone: "#43464e",
  stoneLit: "#51555f",
  wood: "#5a3f28",
  gold: "#d8a534",
  goldLit: "#f2d47a",
  goldDark: "#8a6420",
  heart: "#c8434f",
  spear: "#b9743a",
  spearTip: "#d9dbe4",
  quiverEmpty: "#3d4653",                 
  cloud: "#222c3b",                       
  cloudLit: "#2c3849",
  fly: "#ffd27a",                         
  mote: "#f2efe4",                        
});
export const CYCLE = 480;
const DAWN = {
  at: 0.0, stars: 0.25, fireflies: 0, motes: 0.3,
  orb: { kind: 1, x: 64, y: 82, r: 11 },                  
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
  rim: "#ffffff", rimA: 0,                                 
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
    
    orb: {
      kind: (u < 0.5 ? a : b).orb.kind,
      x: Math.round(lerp(a.orb.x, b.orb.x, u)),
      y: Math.round(lerp(a.orb.y, b.orb.y, u)),
      r: Math.round(lerp(a.orb.r, b.orb.r, u)),
      tones: [0, 1, 2].map((j) => lerpHex(a.orbTones[j], b.orbTones[j], u)),
      
      alpha: a.orb.kind === b.orb.kind ? 1 : Math.abs(u - 0.5) * 2,
    },
    rim: lerpHex(a.rim, b.rim, u),
    rimA: lerp(a.rimA, b.rimA, u),
  };
}


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
