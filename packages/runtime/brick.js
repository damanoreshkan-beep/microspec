// brick — the pure half of the handheld: geometry, the light model, the LCD material.
//
// The engine (apps/brick/assets/brick.wasm) simulates and knows nothing about pixels; the
// renderer (apps/brick/render.js) draws and owns no numbers. Everything both of them agree
// on lives here, unit-tested in runtime_test.js, so a constant can never drift between the
// C side, the renderer, the input module and the e2e.
//
// Runtime-internal imports must be RELATIVE — this file has none, and wants none.

/* ── geometry ─────────────────────────────────────────────────────────────────────────
   The internal buffer is NES-sized. It is scaled up by CSS, never rendered at device
   resolution: on the reference phone the LCD is ~200×180 CSS px at DPR 3.5 = 700×630
   physical, and rasterising 700×630 to then draw 16-px tiles into it would cost 7× the
   fill for a blurrier picture. Render small, scale with `image-rendering: pixelated`. */
export const TILE = 18;              // the vendored CC0 art is 18px (apps/brick/assets/NOTICE.md)
export const SCRW = 288;
export const SCRH = 270;
export const ROWS = 15;
export const COLS = SCRW / TILE;          // 16 columns on screen

/* ── the ABI, in one place ───────────────────────────────────────────────────────────
   Mirrored in tools/wasm/brick/game.c. Two copies of a bitmask is one bitmask and one
   bug, so if you add a bit, add it in both and add a test below. */
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
export const SPRITE = 0x100;              // display-list ids at or above this are sprites

/* ── the light ────────────────────────────────────────────────────────────────────────
   ONE light for the whole app, and it is the farm's. theme.css puts `--nm-dark` at +d,+d
   and `--nm-light` at −d,−d, i.e. the source is upper-left at 45°. The console is the page
   extruded under that light; the LCD is a recess in the console; and the tiles inside the
   game carry the same bevel at pixel scale. That is what makes the game read as part of
   the object rather than as a picture pasted onto it. */
export const LIGHT = Object.freeze({ x: -1, y: -1 });

/* ── the LCD material ─────────────────────────────────────────────────────────────────
   A passive-matrix LCD has no colours — it has a backplate and a polariser, and a segment
   is only ever more or less opaque. So the game's whole palette is five DENSITIES of one
   ink, which is why the volume below is physical rather than painted: a lit face is a
   THINNER segment and a shaded face a DENSER one, exactly as a real panel would show it. */
export const LCD = Object.freeze({
  plate: "#b4bc96",                       // reflective olive backplate
  ink: "#23281c",
  grid: 0.05,                             // unlit segment lattice, always faintly visible
  sheen: 0.05,                            // polariser, a diagonal wash
});

/* ── the picture must be OPAQUE ───────────────────────────────────────────────────────
   The whole game is drawn in five densities of one ink, and the first cut set the top of
   that ramp at 0.86 with a 0.12 ghost of the previous frame composited over every one of
   them. The arithmetic nobody did: a fully driven segment let 14% of the plate through,
   the ghost added a second translucent copy of the scene one frame behind, and the grid
   and the sheen put two more veils on top. Four transparent layers is not an LCD, it is a
   photograph of an LCD taken through a window — the ground read as see-through, the hills
   showed through the ground and the player was a suggestion.

   So: the ramp TOPS OUT OPAQUE. A driven segment is a driven segment; a real passive-matrix
   panel at full contrast does not show you its backplate. The intermediate steps were also
   too close together to separate a sprite from the tile behind it, so the ramp is spread —
   the gap between "terrain" (2) and "the thing standing on it" (4) is now 0.55 rather than
   0.28. The persistence is gone entirely rather than reduced: a smear behind a moving
   character is exactly the artefact that reads as transparency, and it never bought
   anything a 60 Hz display needed.

   0 is bare plate, 4 is a fully driven segment. Anything drawn in the game picks a level,
   then the light model shifts it per face. */
export const INK = Object.freeze([0, 0.2, 0.45, 0.72, 1]);

/* ── a driven segment REPLACES the plate; it never stacks with what is behind it ───────
   The other half of the same bug, and the bigger half. The renderer composited every cell
   onto whatever was already in the buffer, so a terrain tile at 45% density let the
   parallax hill behind it through, the player let the ground through, and the frame read
   as a stack of transparencies rather than as a picture — which is exactly the complaint.

   It was also wrong about the thing it claims to model. A passive-matrix panel is ONE
   layer of segments over ONE backplate: there is no "behind a segment", and two shapes
   that overlap do not add up, the front one is simply what is driven there. So a level
   resolves to an OPAQUE colour — the plate mixed with ink at that density — and the
   density hierarchy (backdrop 1 · terrain 1–3 · objects 2–4 · the actor 2–4) survives
   untouched, because it was always a hierarchy of VALUE and never one of see-through.

   Partial alpha stays available and means the one thing it should: a mark that genuinely
   darkens what is under it, i.e. the ground shadow. */
const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex2 = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0");

/** The RGB a level resolves to on a given panel. Pure, so both painters can agree on it. */
export function segmentRGB(level, plate = LCD.plate, ink = LCD.ink) {
  const a = INK[clampLevel(level)];
  const p = chan(plate), k = chan(ink);
  return [0, 1, 2].map((i) => p[i] + (k[i] - p[i]) * a);
}
/** The same, as a CSS colour — what a Canvas2D `fillStyle` wants. */
export function segment(level, plate = LCD.plate, ink = LCD.ink) {
  return "#" + segmentRGB(level, plate, ink).map(hex2).join("");
}

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

/* ── the shadow, projected rather than offset ─────────────────────────────────────────────
   The first cut took the sprite's own silhouette and moved it (+2,+2). That is a sticker: the
   offset never changes, so it says nothing about how far the thing is from anything, it survives
   over a pit where there is no surface to fall on, and a jumping character carries it along like
   a cape. Depth is not a constant.

   The real thing is a projection, and at a 45° light it is the simplest projection there is: a
   point `h` pixels above the ground lands on the ground `h` pixels along the light — tan 45° = 1.
   So the displacement IS the height, and the shadow stays on the floor while the character leaves
   it. That separation is the whole cue; everything else is just making it read at 18px.

   Size and weight fall off with height because a directional source is not a point one in practice
   — the penumbra widens and the core fades. Kept deliberately shallow (never below FLOOR) so the
   shadow is always a mark and never a smudge. */
export const SHADOW = Object.freeze({
  alpha: 0.34,      // directly under the feet
  reach: 54,        // px of height at which it has faded to FLOOR
  floor: 0.06,      // it never disappears entirely; a lost shadow reads as a bug, not as height
  flat: 0.34,       // ellipse ry/rx — a footprint on the ground plane, not a disc facing us
  wide: 0.40,       // rx as a fraction of the sprite's width, at contact
});

/**
 * Where a sprite's ground shadow goes and how heavy it is.
 * @param h      pixels between the sprite's feet and the ground below it (0 = standing)
 * @param w      sprite width in px
 * @returns {{dx, rx, ry, alpha}} — dx is along the light, i.e. to the RIGHT as it rises
 */
export function shadowFor(h, w) {
  const t = Math.max(0, Math.min(1, h / SHADOW.reach));
  const rx = Math.max(1, Math.round((w * SHADOW.wide) * (1 - 0.45 * t)));
  return {
    dx: Math.round(Math.max(0, h)),                       // tan 45° = 1: the offset IS the height
    rx,
    ry: Math.max(1, Math.round(rx * SHADOW.flat)),
    alpha: SHADOW.alpha + (SHADOW.floor - SHADOW.alpha) * t,
  };
}

/**
 * Parallax: how far a background layer has moved for a given camera position. Depth 0 is
 * infinitely far (never moves), 1 is the play plane. The result is INTEGER — a fractional
 * offset resamples the layer and turns crisp pixel art into porridge.
 */
export function parallaxX(camx, depth) {
  return Math.round(camx * depth) | 0;
}
export const LAYERS = Object.freeze([0.15, 0.35, 0.6]);

/* ── display list ─────────────────────────────────────────────────────────────────────
   Four int16 per entry: id, x, y, attr. The renderer walks this instead of reading a
   framebuffer out of wasm — 576 bytes on a populated frame against 245 760, and, far more
   importantly, it leaves every question of LOOK on this side of the boundary. */
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

/* ── HUD ──────────────────────────────────────────────────────────────────────────────
   A brick game shows leading zeros, because the segments exist whether they are driven or
   not — the unlit ones are part of the object. Fixed width also means the readout never
   reflows, which at this size is the difference between a display and a jitter. */
export function digits(value, width) {
  const n = Math.max(0, Math.floor(value || 0));
  const s = String(n);
  return s.length >= width ? s.slice(-width) : "0".repeat(width - s.length) + s;
}

/* ── run bookkeeping ──────────────────────────────────────────────────────────────────
   A run is over when the engine says so; the record is the host's business, and "is this a
   record" must be answered on the value that was just achieved, never on the live one. */
export function betterRun(prev, run) {
  if (!run) return prev ?? null;
  if (!prev) return { ...run };
  return run.dist > prev.dist ? { ...run } : prev;
}
