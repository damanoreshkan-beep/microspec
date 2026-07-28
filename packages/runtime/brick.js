
export const TILE = 18;              
export const SCRW = 288;
export const SCRH = 270;
export const ROWS = 15;
export const COLS = SCRW / TILE;          


export const IN = { LEFT: 1, RIGHT: 2, JUMP: 4, RUN: 8, DOWN: 16 };
export const SFX = { JUMP: 1, COIN: 2, STOMP: 4, BRICK: 8, BUMP: 16, DEATH: 32 };
export const S = {
  FRAME: 0, SCORE: 1, COINS: 2, DIST: 3, CAMX: 4, PX: 5, PY: 6,
  PSTATE: 7, PDIR: 8, DEAD: 9, SFX: 10, DLN: 11, GROUND: 12, COUNT: 13,
};
export const T = {
  EMPTY: 0x00, COIN: 0x01, BUSH: 0x02, HILL: 0x03, CLOUD: 0x04,
  SOLID: 0x10, GROUND: 0x10, DIRT: 0x11, BRICK: 0x12, QUESTION: 0x13, USED: 0x14,
  PIPE_TOP: 0x15, PIPE_BOD: 0x16, STONE: 0x19,
};
export const K = { PLAYER: 0, WALKER: 1, HOPPER: 2, POP: 3, DEBRIS: 4 };
export const SPRITE = 0x100;              


export const LIGHT = Object.freeze({ x: -1, y: -1 });


export const LCD = Object.freeze({
  plate: "#b4bc96",                       
  plateLight: "#c3c9a6",                  
  ink: "#23281c",
  grid: 0.09,                             
  ghost: 0.12,                            
  sheen: 0.06,                            
});


export const INK = Object.freeze([0, 0.16, 0.34, 0.58, 0.86]);
/** Clamp a density level into the ramp. */
export const clampLevel = (l) => (l < 0 ? 0 : l > INK.length - 1 ? INK.length - 1 : l | 0);
/**
 * The light model, in LCD terms. A face pointing at the light is driven LESS (it reads as
 * highlight against the plate); a face pointing away is driven MORE. `front` is the flat
 * face and never shifts, which is what keeps a tile's identity readable at 16 px.
 */
export const FACE = Object.freeze({ top: -1, left: -1, front: 0, right: 1, bottom: 1 });
export function lit(level, face = "front") {
  return INK[clampLevel(level + (FACE[face] ?? 0))];
}
/**
 * Z-slice offsets for an extruded object, stacked TOWARD the light so the faces you see are
 * the lit ones. Index 0 is the deepest slice and the last is the top — draw them in order
 * and the silhouette grows up-left, which is the same direction `--nm-light` throws.
 * Reserved for objects that ARE boxes (blocks, pipes, coins); a 16-px enemy stacked this way
 * turns its own outline into noise.
 */
export function sliceOffsets(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ dx: LIGHT.x * i, dy: LIGHT.y * i });
  return out;
}


export const SHADOW = Object.freeze({ dx: 2, dy: 2, alpha: 0.28 });

/**
 * Parallax: how far a background layer has moved for a given camera position. Depth 0 is
 * infinitely far (never moves), 1 is the play plane. The result is INTEGER — a fractional
 * offset resamples the layer and turns crisp pixel art into porridge.
 */
export function parallaxX(camx, depth) {
  return Math.round(camx * depth) | 0;
}
export const LAYERS = Object.freeze([0.15, 0.35, 0.6]);


export function decodeEntry(dl, i) {
  const o = i * 4, id = dl[o], attr = dl[o + 3];
  return {
    id,
    x: dl[o + 1],
    y: dl[o + 2],
    tile: id < SPRITE ? id : 0,
    kind: id >= SPRITE ? id - SPRITE : -1,
    isSprite: id >= SPRITE,
    flip: (attr & 1) === 1,
    frame: (attr >> 1) & 7,
  };
}

/** Is this tile drawn behind everything, with no collision and no shadow? */
export const isBackdrop = (t) => t === T.BUSH || t === T.HILL || t === T.CLOUD;
/** Is this tile a box worth extruding? */
export const isBox = (t) =>
  t === T.BRICK || t === T.QUESTION || t === T.USED || t === T.STONE ||
  t === T.PIPE_TOP || t === T.PIPE_BOD;


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
