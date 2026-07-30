/* brick — the simulation half of apps/brick.
 *
 * A NES-era side-scrolling platformer: run/skid momentum, variable-height jump, stomps,
 * ? blocks, breakable bricks, coins, pipes, and an endless procedurally generated track.
 *
 * It is a ZERO-IMPORT reactor. No libc I/O, no clock, no Math.random, no malloc: the host
 * hands in the frame's input, the engine hands back a display list and a state block, and
 * everything else lives in exported linear memory. Nothing here knows what a pixel looks
 * like — the light, the bevels, the shadows and the LCD are the renderer's business.
 *
 * All positions are 8.8 fixed point in world pixels. One step is exactly 1/60 s: a variable
 * dt would make the jump arc depend on the display's refresh rate, so the accumulator lives
 * in JS (apps/brick/engine.js) and this function is called a whole number of times per frame.
 *
 * Build: tools/wasm/brick/build.sh    License: MIT (all of it is ours)
 */
#include <stdint.h>

#define FP        8
#define TILE      18
#define SCRW      288
#define SCRH      270
#define ROWS      15
#define COLS      128              /* ring of tile columns — 8 screens, power of two */
#define COLMASK   (COLS - 1)
#define MAXENT    32
#define MAXDL     512
#define VIEWCOLS  (SCRW / TILE + 2)

/* ── tiles ─────────────────────────────────────────────────────────────────────────────
   Below 0x10 nothing collides; at 0x10 and above everything does. One comparison, and the
   generator can never accidentally author a solid decoration. */
#define T_EMPTY    0x00
#define T_COIN     0x01
#define T_BUSH     0x02
#define T_HILL     0x03
#define T_CLOUD    0x04
#define T_SOLID    0x10
#define T_GROUND   0x10           /* grass-topped ground */
#define T_DIRT     0x11           /* the fill under it */
#define T_BRICK    0x12
#define T_QUESTION 0x13
#define T_USED     0x14
#define T_PIPE_TOP 0x15           /* the vendored pipe art is ONE column wide */
#define T_PIPE_BOD 0x16
#define T_STONE    0x19

/* ── entity kinds ──────────────────────────────────────────────────────────────────── */
#define K_PLAYER   0
#define K_WALKER   1              /* patrols, dies to a stomp */
#define K_HOPPER   2              /* the same, but it jumps */
#define K_POP      3              /* coin popping out of a struck block (no collision) */
#define K_DEBRIS   4              /* brick shards (no collision) */

/* ── input bits (mirrored in packages/runtime/dpad.js) ─────────────────────────────── */
#define IN_LEFT   1
#define IN_RIGHT  2
#define IN_JUMP   4
#define IN_RUN    8
#define IN_DOWN   16

/* ── sfx bits: what happened THIS frame. The engine never makes a sound; it reports. ── */
#define SFX_JUMP   1
#define SFX_COIN   2
#define SFX_STOMP  4
#define SFX_BRICK  8
#define SFX_BUMP   16
#define SFX_DEATH  32

/* ── physics, 8.8 px/frame @60Hz ───────────────────────────────────────────────────────
   Two gravities are the whole feel: holding the button rises slowly, releasing it drops
   fast, and that difference is what makes the jump controllable rather than ballistic.

   Every annotation below was WRONG and is now recomputed from the constant beside it. The
   whole block was scaled by 18/16 when the vendored art moved the tile from 16px to 18px —
   450 is 400 × 1.125, 1296 is 1152 × 1.125, and so on down the list — but the comments kept
   the pre-scale numbers, so each one described a value that no longer existed. In TILES per
   frame nothing changed, which is exactly why nobody noticed: the feel was preserved and only
   the documentation rotted. Divide by 256 to check any of them. */
#define ACC_WALK   16             /* 0.0625 px/f²  */
#define MAX_WALK   450            /* 1.7578 px/f   */
#define MAX_RUN    738            /* 2.8828 px/f   */
#define FRICTION   15             /* 0.0586 px/f²  */
#define SKID       44             /* 0.1719 px/f²  — turning against your own momentum */
#define JUMP_V     (-1152)        /* -4.5 px/f     */
#define GRAV_HOLD  34             /* 0.1328 px/f²  */
#define GRAV_FALL  126            /* 0.4922 px/f²  */
#define MAX_FALL   1296           /* 5.0625 px/f   */
#define BOUNCE_V   (-698)         /* -2.727 px/f   — the hop after a stomp */
#define WALKER_V   81             /* 0.3164 px/f   */
#define HOP_V      (-1250)        /* -4.883 px/f   — a hopper's leap; see step_enemy() */
#define HOP_MIN    40             /* frames a landed hopper waits before the next one */

/* Grace, in frames, on both sides of the ground. 6 frames is 100 ms, the figure every platformer
   that feels fair has converged on: long enough that a human miss reads as a hit, short enough
   that nobody can name it. They are a PAIR — edge-triggering the jump without a buffer only
   moves the lost input from one end of the arc to the other. */
#define COYOTE_F   6
#define JBUF_F     7              /* one more than COYOTE_F, and MEASURED, not symmetry for its
                                     own sake: `onground` is only recomputed at the END of a step,
                                     so the earliest a buffered press can be honoured is the frame
                                     AFTER touchdown. At 6 the player-visible window came out 5
                                     frames (83ms); 7 makes it the 6 frames the coyote side gives. */

#define PW 14                     /* player box */
#define PH 17
#define EW 16                     /* walker box */
#define EH 16

typedef struct {
  int32_t x, y, vx, vy;
  uint8_t kind, dir, alive, onground;
  int16_t timer;
} Ent;

/* ── state (all static: nothing here ever allocates) ───────────────────────────────── */
static uint8_t  map[ROWS][COLS];
static Ent      ents[MAXENT];
static int16_t  dl[MAXDL * 4];
static int32_t  dln;
static int32_t  st[16];           /* the exported state block — see game_state() */
static uint32_t rng;
static int32_t  camx, cam_far;    /* cam_far is the furthest the camera has ever reached */
static int32_t  gen_col;          /* next absolute column to generate */
static int32_t  seg_left, seg_type, seg_dir, ground_row, safe_left, pending_gap;
static int32_t  score, coins, best_col, frame_no, sfx;
static uint32_t last_in;          /* this frame's input, for the skid pose */
static uint32_t prev_in;          /* LAST frame's input, so a press can be told from a hold */
static int32_t  coyote, jbuf;     /* the two grace counters — see step_player() */
static uint8_t  dead;

/* state block indices — engine.js reads these by name */
enum { S_FRAME, S_SCORE, S_COINS, S_DIST, S_CAMX, S_PX, S_PY, S_PSTATE,
       S_PDIR, S_DEAD, S_SFX, S_DLN, S_GROUND, S_COUNT };

/* ── xorshift32: the only randomness, and it is entirely ours ──────────────────────── */
static uint32_t xr(void) { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return rng; }
static int32_t  rnd(int32_t n) { return n <= 0 ? 0 : (int32_t)(xr() % (uint32_t)n); }

/* ── map access ───────────────────────────────────────────────────────────────────────
   A column outside the generated window can only be reached by a bug, and reading stale
   ring data would look like a haunted level rather than a crash — so out of range reads
   as empty above the floor and as wall to the left. */
static uint8_t tile_at(int32_t c, int32_t r) {
  if (r < 0 || r >= ROWS) return T_EMPTY;
  if (c < 0) return T_STONE;
  return map[r][c & COLMASK];
}
static void tile_set(int32_t c, int32_t r, uint8_t v) {
  if (r < 0 || r >= ROWS || c < 0) return;
  map[r][c & COLMASK] = v;
}
/* Tile arithmetic. TILE is no longer a power of two — the vendored CC0 art is 18px — so this
   cannot be a shift. A shift FLOORS while C division truncates toward zero, and they differ
   exactly where the player touches the left edge of the world, so floor it explicitly. */
static int32_t tcol(int32_t px) { return px >= 0 ? px / TILE : -(((-px) + TILE - 1) / TILE); }
static int32_t tsnap(int32_t px) { return tcol(px) * TILE; }
static int solid_px(int32_t px, int32_t py) { return tile_at(tcol(px), tcol(py)) >= T_SOLID; }

/* ── entities ─────────────────────────────────────────────────────────────────────── */
static Ent *spawn(uint8_t kind, int32_t px, int32_t py) {
  for (int i = 1; i < MAXENT; i++) {
    if (!ents[i].alive) {
      Ent *e = &ents[i];
      e->kind = kind; e->x = px << FP; e->y = py << FP;
      e->vx = 0; e->vy = 0; e->dir = 1; e->alive = 1; e->onground = 0; e->timer = 0;
      return e;
    }
  }
  return 0;
}

/* ── the generator ─────────────────────────────────────────────────────────────────────
   Segments, not tiles: the track is a sequence of intents (flat, gap, stairs, pipe…) and
   each one writes its own columns. Difficulty ramps with distance, but a gap is ALWAYS
   clamped to MAX_GAP and always followed by flat landing room — an endless generator that
   can author an unjumpable gap is an unwinnable game, and no rendering gate would see it.
   MAX_GAP is validated against the engine's MEASURED jump reach in runtime_test.js. */
/* MEASURED off this engine (tools/wasm/brick/README.md · apps/brick/RESEARCH.md §1.3):
   a jump from a standstill reaches 4.00 tiles, and two tiles of run-up already saturate it
   at 5.38 walking / 8.81 running. Crossing N empty columns costs N+1 tiles of travel, so a
   3-wide gap needs 4.00 and the walking player has 5.38 — a full tile of margin, and the
   run button turns it into a stroll. Every gap gets a runway so the standing-jump case can
   never arise. runtime_test.js re-measures all of this against the shipped binary. */
#define MAX_GAP     3
#define GAP_RUNWAY  3
#define CAM_BACK   (SCRW * 2)      /* how far the camera may retreat */
#define GROUND_MIN  8
#define GROUND_HIGH 5              /* the ceiling the floor may climb to once d > 128 */
#define GROUND_MAX  13
#define DIFF_FULL   6000           /* columns to full difficulty — see difficulty() */
#define HAZARD_FULL 1200           /* …and the shorter clock the HAZARDS were tuned on */

enum { SEG_FLAT, SEG_GAP, SEG_STAIR, SEG_PIPE, SEG_BRICKS, SEG_COINS, SEG_LEDGE };

/* Difficulty belongs to the TRACK, not to the player: it ramps with the column being
   generated, so the same seed always produces the same level and the solvability test can
   walk it without simulating anyone. Reading the player's progress here made the generator
   untestable — the scan never advanced it, so it only ever measured the gentlest track.
   It used to top out after 1200 columns — 125 seconds — and every dial that reads it has been
   pinned ever since, so there are two clocks now and which one a dial reads is a real decision.

   difficulty() is the SHAPE of the track: what a segment is, how tall a stair steps, how high
   the floor may climb. 6000 columns of ramp gives it somewhere to keep growing.
   hazard_d() is the SHORT clock, and it is the OLD one, unchanged. The enemy rate, the hopper
   unlock and the gap WIDTH were all tuned against 1200 columns, and putting them on the long
   ramp measured as a straight nerf rather than a rebalance: 3-wide gaps moved from column 1200
   out to column 6000 and enemies per screen fell by two thirds over the first four minutes. A
   ramp that is slower everywhere is not a harder game, it is a longer boring one. */
static int32_t difficulty(void) {          /* 0 … 256, over DIFF_FULL columns */
  int32_t d = gen_col;
  if (d > DIFF_FULL) d = DIFF_FULL;
  return d * 256 / DIFF_FULL;
}
static int32_t hazard_d(void) {            /* 0 … 256, over HAZARD_FULL columns */
  int32_t d = gen_col;
  if (d > HAZARD_FULL) d = HAZARD_FULL;
  return d * 256 / HAZARD_FULL;
}

static void col_clear(int32_t c) {
  for (int r = 0; r < ROWS; r++) tile_set(c, r, T_EMPTY);
}

static void col_ground(int32_t c, int32_t top) {
  tile_set(c, top, T_GROUND);
  for (int r = top + 1; r < ROWS; r++) tile_set(c, r, T_DIRT);
}

static void col_decor(int32_t c, int32_t top) {
  int32_t k = xr() & 31;
  if (k == 0) tile_set(c, top - 1, T_BUSH);
  else if (k == 1) tile_set(c, 2 + (int32_t)(xr() & 1), T_CLOUD);
  else if (k == 2 && top >= GROUND_MIN + 2) tile_set(c, top - 1, T_HILL);
}

static void seg_pick(void) {
  int32_t d = difficulty();
  /* Hand out the safe run WITHOUT clearing the counter. Clearing it here — which is what this
     line used to do — meant the enemy test in gen_one(), which reads `safe_left == 0`, was true
     for every single one of the columns this branch exists to protect. Measured off the shipped
     binary over 30 seeds × 6000 columns: 50.27% of gaps had an enemy inside the five landing
     columns and 13.40% put one on the landing tile itself. gen_one() spends it, one per column. */
  if (safe_left > 0) { seg_type = SEG_FLAT; seg_left = safe_left; return; }
  if (pending_gap > 0) {                               /* the runway is behind us: dig it */
    seg_type = SEG_GAP; seg_left = pending_gap; pending_gap = 0;
    safe_left = 5;                                     /* landing room is not optional */
    return;
  }
  int32_t roll = rnd(100);
  /* The bands are RELATIVE to the top of the gap band, and that is the whole point. They used to
     be absolute (22+d/16, 36, 48, 62, 74, 84), so as the gap band grew upward it ate the STAIR
     band above it: at d=224 — column 1050 on the old ramp — `22 + d/16` reached 36 and a stair
     became arithmetically impossible. Measured off the shipped binary, 30 seeds, pipes excluded:
     0.59 terrain steps per screen at column 0-300, 0.43, 0.17, then 0.00 from 1100 onward, for
     ever. The track went permanently flat, which is to say the game got EASIER the longer you
     survived it. Anchored this way the ramp eats the FLAT remainder at the bottom instead —
     at full difficulty there is no plain flat segment left, and every other band is untouched. */
  int32_t gapHi = 22 + d / 16;                       /* 22% at the start, 38% at full difficulty */
  if (roll < gapHi) {
    /* Announce the gap and lay a runway first. Without it a gap can follow a stair or a
       pipe immediately, leaving only a standing jump — 4.00 tiles against the 5.38 a
       moving player has, which is the difference between a hazard and a dead end. */
    pending_gap = 2 + rnd(1 + hazard_d() * (MAX_GAP - 2) / 256);
    if (pending_gap > MAX_GAP) pending_gap = MAX_GAP;
    seg_type = SEG_FLAT; seg_left = GAP_RUNWAY;
  } else if (roll < gapHi + 14) {
    seg_type = SEG_STAIR; seg_left = 2 + rnd(3); seg_dir = (xr() & 1) ? -1 : 1;
  } else if (roll < gapHi + 26) {
    seg_type = SEG_PIPE;  seg_left = 1;  safe_left = 3;
  } else if (roll < gapHi + 40) {
    seg_type = SEG_BRICKS; seg_left = 4 + rnd(5);
  } else if (roll < gapHi + 52) {
    seg_type = SEG_COINS; seg_left = 4 + rnd(4);
  } else if (roll < gapHi + 62) {
    seg_type = SEG_LEDGE; seg_left = 4 + rnd(4);
  } else {
    seg_type = SEG_FLAT;  seg_left = 4 + rnd(6);
  }
}

static void gen_one(void) {
  int32_t c = gen_col, d = difficulty();
  col_clear(c);
  if (seg_left <= 0) seg_pick();
  seg_left--;

  switch (seg_type) {
    case SEG_GAP:
      break;                                            /* nothing at all — that is the gap */

    case SEG_STAIR: {
      /* One direction for the whole segment — rolling it per column makes noise, not stairs.
         Late on the step doubles, and it is deliberately a wall rather than a slope: 2 rows is
         36px against a MEASURED 74px of rise, so it must be jumped but can always be jumped —
         runtime_test.js asserts exactly that, tallestStep × TILE <= the rise it measured off
         this binary. The floor is also allowed higher (GROUND_HIGH) once past the halfway
         mark, which is what turns a stair from scenery into a route with an above and below. */
      int32_t gmin = (d > 128) ? GROUND_HIGH : GROUND_MIN;
      ground_row += seg_dir * ((d > 180) ? 2 : 1);
      if (ground_row < gmin) { ground_row = gmin; seg_dir = 1; }
      if (ground_row > GROUND_MAX) { ground_row = GROUND_MAX; seg_dir = -1; }
      col_ground(c, ground_row);
      break;
    }

    case SEG_PIPE:
      /* One column, two or three tiles tall: rim on top, body below. The vendored art is a
         single-width pipe, so a two-column pipe would just be two pipes touching. */
      col_ground(c, ground_row);
      tile_set(c, ground_row - 1, T_PIPE_BOD);
      tile_set(c, ground_row - 2, T_PIPE_TOP);
      break;

    case SEG_BRICKS: {
      col_ground(c, ground_row);
      int32_t r = ground_row - 4;
      int32_t k = rnd(10);
      if (k < 6) tile_set(c, r, T_BRICK);
      else if (k < 8) tile_set(c, r, T_QUESTION);
      break;
    }

    case SEG_COINS:
      col_ground(c, ground_row);
      tile_set(c, ground_row - 3 - rnd(2), T_COIN);
      break;

    case SEG_LEDGE:
      /* Three rows up, not four. Four put the stone top 72px above the floor against a MEASURED
         74px of rise: the feet cleared it only in the top 2px of the whole arc — 2.8% of the
         jump — so the platform read as solid to almost every attempt. And the coin it exists to
         serve sat at 90px, which is not reachable from the floor at ALL. At three rows the stone
         is 54px up with 20px of margin, and the coin one row above it is collected by standing
         on the platform: the reward for getting up there, which is what a ledge is for. */
      col_ground(c, ground_row);
      if (seg_left > 0) tile_set(c, ground_row - 3, T_STONE);
      if (seg_left > 0 && (xr() & 3) == 0) tile_set(c, ground_row - 4, T_COIN);
      break;

    default:
      col_ground(c, ground_row);
      col_decor(c, ground_row);
      break;
  }

  /* Enemies stand on flat ground only, never in the landing zone after a gap, and never
     in the first eight columns — a run that kills you before you have touched the pad is
     not difficulty, it is a bug the player cannot tell from one. */
  int32_t ed = hazard_d();
  if (seg_type != SEG_GAP && safe_left == 0 && c > 8 && rnd(100) < 4 + ed / 24) {
    Ent *e = spawn((ed > 140 && (xr() & 3) == 0) ? K_HOPPER : K_WALKER,
                   c * TILE + 1, ground_row * TILE - EH);
    if (e) {
      e->dir = 0; e->vx = -WALKER_V;
      /* Give each hopper its own phase at birth. The hop used to fire on `frame_no & 63`, a
         GLOBAL clock, so every hopper alive left the ground on the same frame — see step_enemy. */
      if (e->kind == K_HOPPER) e->timer = (int16_t)(24 + rnd(48));
    }
  }
  /* Spend the safe run one column at a time, AFTER the enemy roll above has read it. Only the
     flat segment seg_pick() handed out spends it: the gap and the pipe that ARM the counter must
     not, or a 3-wide gap would eat three of the five columns of landing room it just bought. */
  if (seg_type == SEG_FLAT && safe_left > 0) safe_left--;
  gen_col++;
}

static void gen_ahead(void) {
  int32_t need = tcol(camx) + VIEWCOLS + 4;
  while (gen_col < need) gen_one();
}

/* ── the player ───────────────────────────────────────────────────────────────────── */
static void hit_block(int32_t c, int32_t r) {
  uint8_t t = tile_at(c, r);
  if (t == T_QUESTION) {
    tile_set(c, r, T_USED);
    Ent *p = spawn(K_POP, c * TILE + 4, r * TILE - 8);
    if (p) { p->vy = -900; p->timer = 26; }
    coins++; score += 200; sfx |= SFX_COIN;
  } else if (t == T_BRICK) {
    tile_set(c, r, T_EMPTY);
    for (int i = 0; i < 4; i++) {
      Ent *p = spawn(K_DEBRIS, c * TILE + (i & 1) * 8, r * TILE + (i >> 1) * 8);
      if (p) { p->vx = (i & 1) ? 180 : -180; p->vy = -700 - (i >> 1) * 160; p->timer = 40; }
    }
    score += 50; sfx |= SFX_BRICK;
  } else {
    sfx |= SFX_BUMP;
  }
}

static void collect_coins(Ent *p) {
  int32_t x0 = tcol(p->x >> FP), x1 = tcol((p->x >> FP) + PW - 1);
  int32_t y0 = tcol(p->y >> FP), y1 = tcol((p->y >> FP) + PH - 1);
  for (int32_t c = x0; c <= x1; c++)
    for (int32_t r = y0; r <= y1; r++)
      if (tile_at(c, r) == T_COIN) {
        tile_set(c, r, T_EMPTY);
        coins++; score += 200; sfx |= SFX_COIN;
      }
}

static void die(void) {
  if (dead) return;
  dead = 1; sfx |= SFX_DEATH;
  ents[0].vy = -1000; ents[0].vx = 0;
}

static void step_player(uint32_t in) {
  Ent *p = &ents[0];
  /* The PRESS, not the state of the button. Everything about the jump hangs off this one word. */
  uint32_t edge = in & ~prev_in;
  prev_in = in;
  if (dead) {                          /* the death arc still plays; nothing else moves */
    p->vy += GRAV_FALL; if (p->vy > MAX_FALL) p->vy = MAX_FALL;
    p->y += p->vy;
    return;
  }

  int32_t top = (in & IN_RUN) ? MAX_RUN : MAX_WALK;
  if (in & IN_LEFT) {
    p->vx -= (p->vx > 0) ? SKID : ACC_WALK;
    if (p->vx < -top) p->vx = -top;
    p->dir = 1;
  } else if (in & IN_RIGHT) {
    p->vx += (p->vx < 0) ? SKID : ACC_WALK;
    if (p->vx > top) p->vx = top;
    p->dir = 0;
  } else {                             /* friction only bites on the ground */
    if (p->onground) {
      if (p->vx > FRICTION) p->vx -= FRICTION;
      else if (p->vx < -FRICTION) p->vx += FRICTION;
      else p->vx = 0;
    }
  }

  /* Coyote time, jump buffer, and a jump that fires on the PRESS. All three are one fix.
     The old line was `(in & IN_JUMP) && p->onground` — level-triggered and unforgiving at both
     ends of the arc, and all three failures were measured against the shipped binary:
       · walk off a real ledge and press jump 0-6 frames later → SFX_JUMP fired ZERO times.
         The player is airborne by the time a human reacts to the edge, so the press is void.
       · press and release 1-8 frames before landing → 0px of rise. The input simply vanished:
         it was gone by the frame the feet touched down.
       · hold JUMP for 600 frames standing still → TWELVE take-offs. Holding was a continuous
         auto-hop, and it was not a curiosity: constant RIGHT|RUN|JUMP reached a median of 133
         tiles against 30 for RIGHT|RUN, so the dominant strategy was to jam one button.
     coyote remembers a floor that is no longer there; jbuf remembers a press that has not
     earned one yet; the edge makes a hold worth exactly one jump. Both counters are cleared on
     take-off so neither can pay for a second one. The variable height below is untouched. */
  if (p->onground) coyote = COYOTE_F;
  if (edge & IN_JUMP) jbuf = JBUF_F;
  if (jbuf > 0 && (p->onground || coyote > 0)) {
    p->vy = JUMP_V; p->onground = 0; coyote = 0; jbuf = 0; sfx |= SFX_JUMP;
  }
  if (coyote > 0) coyote--;            /* after the test: the frame you step off still counts */
  if (jbuf > 0) jbuf--;

  /* Variable height: the slow gravity is only for a rising player still holding the key. */
  p->vy += (p->vy < 0 && (in & IN_JUMP)) ? GRAV_HOLD : GRAV_FALL;
  /* Dive. IN_DOWN was defined at the top of this file and read NOWHERE, so the app shipped a
     fourth arm on the d-pad that did nothing at all. A runner's down is not a crouch — there is
     nothing to duck under — it is the fast way back to the floor.
     It goes straight to terminal velocity rather than adding gravity, and that is a measured
     choice, not a shortcut: MAX_FALL is a CORRECTNESS ceiling (5.06 px/f against an 18px tile is
     what keeps the floor probe from tunnelling), so the only thing any dive can ever win back is
     the ~10 frames the fall spends accelerating up to it. Doubling gravity recovered 2 frames of
     a 48-frame drop; going straight to the ceiling recovers 4 — the whole of what is available,
     and it reads as a verb instead of a nudge. Guarded so it cannot cut short a jump you are
     still rising through, and so it does nothing at all on the ground. */
  if ((in & IN_DOWN) && !p->onground && p->vy > 0) p->vy = MAX_FALL;
  if (p->vy > MAX_FALL) p->vy = MAX_FALL;

  /* X first, then Y — resolving both at once turns a corner into a wall. */
  p->x += p->vx;
  int32_t px = p->x >> FP, py = p->y >> FP;
  if (p->vx > 0) {
    int32_t e = px + PW - 1;
    if (solid_px(e, py) || solid_px(e, py + PH / 2) || solid_px(e, py + PH - 1)) {
      p->x = (tsnap(e) - PW) << FP; p->vx = 0;
    }
  } else if (p->vx < 0) {
    if (solid_px(px, py) || solid_px(px, py + PH / 2) || solid_px(px, py + PH - 1)) {
      p->x = ((tcol(px) + 1) * TILE) << FP; p->vx = 0;
    }
  }
  if (p->x < (camx << FP)) { p->x = camx << FP; if (p->vx < 0) p->vx = 0; }

  p->y += p->vy;
  px = p->x >> FP; py = p->y >> FP;
  p->onground = 0;
  if (p->vy >= 0) {
    /* Probe ONE PIXEL BELOW the box, not its own bottom pixel. Resting puts the bottom pixel
       at the last free row, so a check against the box's own edge is true on the landing
       frame and false every frame after it — the player stands on the floor permanently
       airborne, and the jump key does nothing. Cost: every jump in the first build. */
    int32_t b = py + PH;
    if (solid_px(px, b) || solid_px(px + PW - 1, b)) {
      p->y = (tsnap(b) - PH) << FP; p->vy = 0; p->onground = 1;
    }
  } else if (p->vy < 0) {
    if (solid_px(px, py) || solid_px(px + PW - 1, py)) {
      int32_t c = solid_px(px + PW / 2, py) ? tcol(px + PW / 2)
                : solid_px(px, py) ? tcol(px) : tcol(px + PW - 1);
      hit_block(c, tcol(py));
      p->y = ((tcol(py) + 1) * TILE) << FP; p->vy = 0;
    }
  }

  collect_coins(p);
  if ((p->y >> FP) > SCRH + 16) die();
}

static void step_enemy(Ent *e) {
  if (e->kind == K_POP || e->kind == K_DEBRIS) {          /* particles: no collision at all */
    e->vy += GRAV_FALL; e->x += e->vx; e->y += e->vy;
    if (--e->timer <= 0) e->alive = 0;
    return;
  }

  /* A hopper hops on ITS OWN clock. The trigger used to be `frame_no & 63` — a global one — so
     every hopper on screen left the ground on the same frame, once every 1.07s, in unison. And
     the leap was 8.95px: half a tile, 12 frames, 3.8px of ground covered. At running speed an
     enemy is on screen just long enough to hop 1.04 times, so what the player actually saw was
     a walker with a twitch. Now: 40-71 frames apart per entity, a leap that clears the player's
     own 17px box, and three times the ground speed while airborne — the hop IS the threat, and
     a leap that lands where it took off is not one. The reload is derived from the entity's
     position rather than rnd() on purpose: the generator's RNG must never be touched during a
     step, or the track a player runs stops being the track the solvability scan walked. */
  if (e->kind == K_HOPPER && e->onground && --e->timer <= 0) {
    e->vy = HOP_V; e->onground = 0;
    e->timer = (int16_t)(HOP_MIN + ((e->x >> FP) & 31));
  }
  e->vy += GRAV_FALL; if (e->vy > MAX_FALL) e->vy = MAX_FALL;
  e->x += (e->kind == K_HOPPER && !e->onground) ? e->vx * 3 : e->vx;
  int32_t px = e->x >> FP, py = e->y >> FP;
  int32_t lead = e->vx > 0 ? px + EW : px - 1;
  /* Turn at a wall, and turn at a ledge — an endless track that walks its enemies into
     every gap empties itself of enemies within a few screens. */
  if (solid_px(lead, py + EH / 2) || (e->onground && !solid_px(lead, py + EH))) {
    e->vx = -e->vx; e->dir ^= 1;
  }

  e->y += e->vy;
  px = e->x >> FP; py = e->y >> FP;
  e->onground = 0;
  if (e->vy >= 0) {
    int32_t b = py + EH;                    /* one pixel below the box — see step_player */
    if (solid_px(px, b) || solid_px(px + EW - 1, b)) {
      e->y = (tsnap(b) - EH) << FP; e->vy = 0; e->onground = 1;
    }
  }
  if ((e->y >> FP) > SCRH + 32) e->alive = 0;
  if ((e->x >> FP) < camx - 48) e->alive = 0;
}

static void collide_player(void) {
  Ent *p = &ents[0];
  if (dead) return;
  int32_t px = p->x >> FP, py = p->y >> FP;
  for (int i = 1; i < MAXENT; i++) {
    Ent *e = &ents[i];
    if (!e->alive || e->kind == K_POP || e->kind == K_DEBRIS) continue;
    int32_t ex = e->x >> FP, ey = e->y >> FP;
    if (px + PW <= ex || ex + EW <= px || py + PH <= ey || ey + EH <= py) continue;
    /* Falling onto the top third is a stomp; anything else is a death. The band matters:
       measured off the boxes, not guessed, or a fast fall clips straight past it. */
    if (p->vy > 0 && py + PH - 1 < ey + EH / 2 + 2) {
      e->alive = 0; p->vy = BOUNCE_V; score += 100; sfx |= SFX_STOMP;
    } else {
      die();
    }
  }
}

/* ── display list ─────────────────────────────────────────────────────────────────────
   id < 0x100 is a tile, >= 0x100 a sprite. attr: bit0 flip · bits1-3 frame · bits4-6 the
   z-slice count the renderer should extrude it by. The engine says WHAT and WHERE; how
   deep it looks is the renderer's call. */
static void push(int16_t id, int32_t x, int32_t y, int16_t attr) {
  if (dln >= MAXDL) return;
  dl[dln * 4] = id; dl[dln * 4 + 1] = (int16_t)x; dl[dln * 4 + 2] = (int16_t)y;
  dl[dln * 4 + 3] = attr;
  dln++;
}

static void build_dl(void) {
  dln = 0;
  int32_t c0 = tcol(camx);
  for (int32_t c = c0; c < c0 + VIEWCOLS; c++)
    for (int32_t r = 0; r < ROWS; r++) {
      uint8_t t = tile_at(c, r);
      if (t) push((int16_t)t, c * TILE - camx, r * TILE, 0);
    }

  for (int i = 0; i < MAXENT; i++) {
    Ent *e = &ents[i];
    if (!e->alive) continue;
    int32_t x = (e->x >> FP) - camx, y = e->y >> FP;
    if (x < -TILE * 2 || x > SCRW + TILE * 2) continue;
    int16_t frame = 0;
    if (i == 0) {
      int skid = ((last_in & IN_LEFT) && e->vx > 0) || ((last_in & IN_RIGHT) && e->vx < 0);
      /* 0 stand · 1-2 walk · 3 airborne · 4 dead · 5 skid. The renderer's atlas is indexed
         by exactly this, so a pose added here is a pose added there. Skid gets its own
         number rather than borrowing walk-b: sharing them made the character moonwalk. */
      if (dead) frame = 4;
      else if (!e->onground) frame = 3;
      else if (skid) frame = 5;
      else if (e->vx) frame = (int16_t)(((frame_no >> 2) & 1) + 1);
    } else {
      frame = (int16_t)((frame_no >> 3) & 1);
    }
    push((int16_t)(0x100 + e->kind), x, y, (int16_t)(e->dir | (frame << 1)));
  }
}

/* ── exports ──────────────────────────────────────────────────────────────────────── */
__attribute__((export_name("game_init")))
void game_init(uint32_t seed) {
  rng = seed ? seed : 0x9E3779B9u;
  for (int i = 0; i < MAXENT; i++) ents[i].alive = 0;
  for (int r = 0; r < ROWS; r++) for (int c = 0; c < COLS; c++) map[r][c] = T_EMPTY;
  camx = 0; cam_far = 0; gen_col = 0; seg_left = 0; seg_type = SEG_FLAT; seg_dir = 1; ground_row = 12;
  safe_left = 24; pending_gap = 0;                                  /* a calm opening: no gap, no enemy, and long
                                                      enough to measure a full run-up jump on */
  score = 0; coins = 0; best_col = 0; frame_no = 0; sfx = 0; dead = 0; dln = 0;
  last_in = 0; prev_in = 0; coyote = 0; jbuf = 0;   /* a fresh run must not inherit a held button */
  gen_ahead();
  /* Stand the player on the ground that is actually THERE, probed from the map, not on the
     generator's `ground_row` — that variable holds the height of the LAST column generated
     (twenty columns ahead), so trusting it spawned the player buried inside the floor, and
     the X resolver then shoved it backwards one tile per frame. Probe the spawn column. */
  Ent *p = &ents[0];
  int32_t sc = 2, sr = 0;
  while (sr < ROWS && tile_at(sc, sr) < T_SOLID) sr++;
  p->kind = K_PLAYER; p->alive = 1; p->dir = 0; p->onground = 1;
  p->x = (sc * TILE) << FP; p->y = ((sr * TILE) - PH) << FP;
  p->vx = 0; p->vy = 0;
  build_dl();
}

__attribute__((export_name("game_step")))
void game_step(uint32_t input) {
  sfx = 0;
  last_in = input;
  frame_no++;
  step_player(input);
  for (int i = 1; i < MAXENT; i++) if (ents[i].alive) step_enemy(&ents[i]);
  collide_player();

  /* The camera may fall BACK, but only two screens. A one-way camera turns every missed coin and
     every unopened block into a permanent loss, which in an endless runner is just a punishment for
     looking around; a camera with no floor at all would ask the ring buffer for columns it has
     already overwritten. Two screens is 32 columns against a 128-column ring, so the window from
     the oldest visible column to the furthest generated one is ~53 — comfortably inside it. */
  int32_t want = (ents[0].x >> FP) - SCRW / 3;
  if (want > camx) camx = want;
  else if (want < camx) {
    int32_t back = cam_far - CAM_BACK;
    camx = want < back ? back : want;
    if (camx < 0) camx = 0;
  }
  if (camx > cam_far) cam_far = camx;
  gen_ahead();

  int32_t col = (ents[0].x >> FP) / TILE;
  if (col > best_col) { best_col = col; score += 1; }

  build_dl();
}

__attribute__((export_name("game_dl")))       uintptr_t game_dl(void)       { return (uintptr_t)dl; }
__attribute__((export_name("game_dl_count"))) int32_t   game_dl_count(void) { return dln; }

__attribute__((export_name("game_state")))
uintptr_t game_state(void) {
  Ent *p = &ents[0];
  st[S_FRAME]  = frame_no;
  st[S_SCORE]  = score;
  st[S_COINS]  = coins;
  st[S_DIST]   = best_col;
  st[S_CAMX]   = camx;
  st[S_PX]     = (p->x >> FP) - camx;
  st[S_PY]     = p->y >> FP;
  st[S_PSTATE] = dead ? 4 : (!p->onground ? 3 : (p->vx ? 1 : 0));
  st[S_PDIR]   = p->dir;
  st[S_DEAD]   = dead;
  st[S_SFX]    = sfx;
  st[S_DLN]    = dln;
  st[S_GROUND] = ground_row;
  return (uintptr_t)st;
}

/* Reach, MEASURED rather than derived: the host drives a full run-up jump and reads how far
   the player actually travelled. runtime_test.js asserts MAX_GAP stays under it. */
__attribute__((export_name("game_max_gap")))  int32_t game_max_gap(void) { return MAX_GAP; }

/* Terrain inspection, for the solvability test only. The generator is the one part of this
   engine whose failure mode is invisible to every rendering gate — an unjumpable gap looks
   exactly like a jumpable one in a screenshot — so runtime_test.js walks the real track and
   measures it. Nothing in the app reads this. */
__attribute__((export_name("game_tile")))
int32_t game_tile(int32_t c, int32_t r) { return tile_at(c, r); }

__attribute__((export_name("game_gen_col")))
int32_t game_gen_col(void) { return gen_col; }

/* Drive generation without simulating a player — the test needs 10 000 columns of track, not
   10 000 columns of gameplay. */
__attribute__((export_name("game_gen_ahead")))
void game_gen_ahead(int32_t upto) { while (gen_col < upto) gen_one(); }
