/* hunt — the simulation half of apps/hunt.
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
 * Forked from tools/wasm/brick/game.c, which keeps every fix already paid for: the ground probe
 * one pixel BELOW the box, the spawn floor read from the spawn column, difficulty derived from the
 * generated track rather than the player, and floor division for tile arithmetic.
 *
 * What is new here is a RANGED game: thrown spears with swept collision, a finite quiver, hearts
 * instead of a single life, and pickups for both.
 *
 * Build: tools/wasm/hunt/build.sh    License: MIT (all of it is ours)
 */
#include <stdint.h>

#define FP        8
#define TILE      24
#define SCRW      384
#define SCRH      264
#define ROWS      11
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
#define T_SPEAR    0x05           /* ammo on the ground */
#define T_HEART    0x06
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
#define K_DEBRIS   4              /* shards (no collision) */
#define K_SPEAR    5              /* the thrown spear — the whole point of this game */
#define K_HERO     6              /* a swordsman: faster, takes two hits */

/* ── input bits (mirrored in packages/runtime/dpad.js) ─────────────────────────────── */
#define IN_LEFT   1
#define IN_RIGHT  2
#define IN_JUMP   4
#define IN_RUN    8
#define IN_DOWN   16
#define IN_SHOOT  32

/* ── sfx bits: what happened THIS frame. The engine never makes a sound; it reports. ── */
#define SFX_JUMP   1
#define SFX_COIN   2
#define SFX_STOMP  4
#define SFX_BRICK  8
#define SFX_BUMP   16
#define SFX_DEATH  32
#define SFX_SHOOT  64
#define SFX_HURT   128
#define SFX_PICK   256
#define SFX_EMPTY  512            /* the quiver is empty — silence would read as a dead button */

/* ── physics, 8.8 px/frame @60Hz ───────────────────────────────────────────────────────
   Two gravities are the whole feel: holding the button rises slowly, releasing it drops
   fast, and that difference is what makes the jump controllable rather than ballistic. */
#define ACC_WALK   21             /* 0.0547 px/f²  */
#define MAX_WALK   600            /* 1.5625 px/f   */
#define MAX_RUN    984            /* 2.5625 px/f   */
#define FRICTION   20             /* 0.0508 px/f²  */
#define SKID       59             /* 0.1523 px/f²  — turning against your own momentum */
#define JUMP_V     (-1536)        /* -4.0 px/f     */
#define GRAV_HOLD  45             /* 0.1172 px/f²  */
#define GRAV_FALL  168            /* 0.4375 px/f²  */
#define MAX_FALL   1728           /* 4.5 px/f      */
#define BOUNCE_V   (-931)         /* the hop after a stomp */
#define WALKER_V   108             /* 0.28 px/f     */
#define HERO_V     150
/* The spear. 6 px/frame is deliberately BELOW the tunnelling threshold for a 20px enemy box
   (a projectile misses when |dx| exceeds target width + its own), but the sweep below does not
   rely on that — it is the belt to the braces, because the generator is free to place narrower
   things later and a projectile that silently passes through a target is unfalsifiable by eye. */
#define SPEAR_V    1536           /* 6.0 px/f */
#define SPEAR_DROP 6              /* a little arc: a flat projectile reads as a laser */
#define SPEAR_LIFE 150            /* frames before it falls out of the world */
#define SHOOT_CD   16             /* frames between throws */
#define START_AMMO 8
#define MAX_AMMO   20
#define START_HP   3
#define MAX_HP     5
#define INVULN     70             /* frames of mercy after a hit */
#define KNOCK_V    (-700)

#define PW 16                     /* player box — narrower than the art, as a hitbox should be */
#define PH 36
#define EW 20                     /* enemy box */
#define EH 36

typedef struct {
  int32_t x, y, vx, vy;
  uint8_t kind, dir, alive, onground;
  int16_t timer;
} Ent;

/* ── state (all static: nothing here ever allocates) ───────────────────────────────── */
/* state block indices — engine.js reads these by name */
enum { S_FRAME, S_SCORE, S_COINS, S_DIST, S_CAMX, S_PX, S_PY, S_PSTATE,
       S_PDIR, S_DEAD, S_SFX, S_DLN, S_GROUND, S_AMMO, S_HP, S_INVULN, S_KILLS, S_COUNT };

static uint8_t  map[ROWS][COLS];
static Ent      ents[MAXENT];
static int16_t  dl[MAXDL * 4];
static int32_t  dln;
static int32_t  st[S_COUNT];      /* sized FROM the enum: st[16] against 17 indices was a real
                                     out-of-bounds write, and only -Wall caught it */
static uint32_t rng;
static int32_t  camx, cam_far;    /* cam_far is the furthest the camera has ever reached */
static int32_t  gen_col;          /* next absolute column to generate */
static int32_t  seg_left, seg_type, seg_dir, ground_row, safe_left, pending_gap;
static int32_t  score, coins, best_col, frame_no, sfx;
static int32_t  ammo, hp, invuln, shoot_cd, kills;
static uint32_t last_in;          /* this frame's input, for the skid pose */
static uint8_t  dead;


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
#define GROUND_MIN  5
#define GROUND_MAX  9

enum { SEG_FLAT, SEG_GAP, SEG_STAIR, SEG_PIPE, SEG_BRICKS, SEG_COINS, SEG_LEDGE, SEG_SUPPLY };

/* Difficulty belongs to the TRACK, not to the player: it ramps with the column being
   generated, so the same seed always produces the same level and the solvability test can
   walk it without simulating anyone. Reading the player's progress here made the generator
   untestable — the scan never advanced it, so it only ever measured the gentlest track. */
static int32_t difficulty(void) {          /* 0 … 256 */
  int32_t d = gen_col;
  if (d > 1200) d = 1200;
  return d * 256 / 1200;
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
  if (safe_left > 0) { seg_type = SEG_FLAT; seg_left = safe_left; safe_left = 0; return; }
  if (pending_gap > 0) {                               /* the runway is behind us: dig it */
    seg_type = SEG_GAP; seg_left = pending_gap; pending_gap = 0;
    safe_left = 5;                                     /* landing room is not optional */
    return;
  }
  int32_t roll = rnd(100);
  if (roll < 22 + d / 16) {
    /* Announce the gap and lay a runway first. Without it a gap can follow a stair or a
       pipe immediately, leaving only a standing jump — 4.00 tiles against the 5.38 a
       moving player has, which is the difference between a hazard and a dead end. */
    pending_gap = 2 + rnd(1 + d * (MAX_GAP - 2) / 256);
    if (pending_gap > MAX_GAP) pending_gap = MAX_GAP;
    seg_type = SEG_FLAT; seg_left = GAP_RUNWAY;
  } else if (roll < 36) {
    seg_type = SEG_STAIR; seg_left = 2 + rnd(3); seg_dir = (xr() & 1) ? -1 : 1;
  } else if (roll < 48) {
    seg_type = SEG_PIPE;  seg_left = 1;  safe_left = 3;
  } else if (roll < 62) {
    seg_type = SEG_BRICKS; seg_left = 4 + rnd(5);
  } else if (roll < 74) {
    seg_type = SEG_COINS; seg_left = 4 + rnd(4);
  } else if (roll < 80) {
    seg_type = SEG_LEDGE; seg_left = 4 + rnd(4);
  } else if (roll < 90) {
    seg_type = SEG_SUPPLY; seg_left = 2;
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

    case SEG_STAIR:
      /* One direction for the whole segment — rolling it per column makes noise, not stairs.
         And one row per step: a two-row step is a wall you cannot see the top of. */
      ground_row += seg_dir;
      if (ground_row < GROUND_MIN) { ground_row = GROUND_MIN; seg_dir = 1; }
      if (ground_row > GROUND_MAX) { ground_row = GROUND_MAX; seg_dir = -1; }
      col_ground(c, ground_row);
      break;

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
      tile_set(c, ground_row - 2 - rnd(2), T_COIN);
      break;

    case SEG_SUPPLY:
      /* Ammo and hearts are not decoration: an endless run with a finite quiver is only fair if
         the track keeps handing you more, and the rate is what makes the game either tense or
         trivial. Hearts are deliberately rarer than spears. */
      col_ground(c, ground_row);
      if (seg_left == 1) tile_set(c, ground_row - 2, rnd(100) < 22 ? T_HEART : T_SPEAR);
      break;

    case SEG_LEDGE:
      col_ground(c, ground_row);
      if (seg_left > 0) tile_set(c, ground_row - 4, T_STONE);
      if (seg_left > 0 && (xr() & 3) == 0) tile_set(c, ground_row - 5, T_COIN);
      break;

    default:
      col_ground(c, ground_row);
      col_decor(c, ground_row);
      break;
  }

  /* Enemies stand on flat ground only, never in the landing zone after a gap, and never
     in the first eight columns — a run that kills you before you have touched the pad is
     not difficulty, it is a bug the player cannot tell from one. */
  if (seg_type != SEG_GAP && safe_left == 0 && c > 8 && rnd(100) < 4 + d / 24) {
    int kind = K_WALKER;
    if (d > 100 && (xr() & 3) == 0) kind = K_HOPPER;
    else if (d > 60 && (xr() & 7) == 0) kind = K_HERO;
    Ent *e = spawn(kind, c * TILE + 1, ground_row * TILE - EH);
    if (e) { e->dir = 0; e->vx = kind == K_HERO ? -HERO_V : -WALKER_V; e->timer = kind == K_HERO ? 1 : 0; }
  }
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
      {
        uint8_t t = tile_at(c, r);
        if (t == T_COIN) { tile_set(c, r, T_EMPTY); coins++; score += 200; sfx |= SFX_COIN; }
        else if (t == T_SPEAR) {
          tile_set(c, r, T_EMPTY);
          ammo += 3; if (ammo > MAX_AMMO) ammo = MAX_AMMO;
          score += 50; sfx |= SFX_PICK;
        } else if (t == T_HEART) {
          tile_set(c, r, T_EMPTY);
          /* A heart at full health is not wasted — it is worth points, or picking one up while
             full would feel like the game ignoring you. */
          if (hp < MAX_HP) { hp++; } else score += 300;
          sfx |= SFX_PICK;
        }
      }
}

/* Throw. The spear leaves from the hand, not from the feet, and it inherits a little of the
   thrower's speed — a spear thrown while sprinting that travels at the same speed as one thrown
   standing still reads as if the world were on rails. */
static void throw_spear(Ent *p) {
  if (shoot_cd > 0) return;
  if (ammo <= 0) { sfx |= SFX_EMPTY; shoot_cd = 8; return; }
  Ent *s = spawn(K_SPEAR, (p->x >> FP) + (p->dir ? -18 : PW + 2), (p->y >> FP) + PH / 3);
  if (!s) return;                                   /* pool full: no shot, and no ammo spent */
  s->dir = p->dir;
  s->vx = (p->dir ? -SPEAR_V : SPEAR_V) + p->vx / 3;
  s->vy = -SPEAR_DROP * 8;
  s->timer = SPEAR_LIFE;
  ammo--; shoot_cd = SHOOT_CD; sfx |= SFX_SHOOT;
}

/* Swept collision along the spear's own path. Checking overlap only at the END of a step is how a
   fast projectile passes through a target between two frames; the standard fix is to test the
   segment it travelled, and at 6 px/frame against a 20px box that costs a handful of samples. */
static int spear_hits(Ent *s, int32_t x0, int32_t y0) {
  int32_t x1 = s->x >> FP, y1 = s->y >> FP;
  int32_t steps = (x1 - x0 > 0 ? x1 - x0 : x0 - x1) / 6 + 1;
  for (int32_t k = 0; k <= steps; k++) {
    int32_t px = x0 + (x1 - x0) * k / steps, py = y0 + (y1 - y0) * k / steps;
    if (solid_px(px, py)) return -1;                /* it stuck in the scenery */
    for (int i = 1; i < MAXENT; i++) {
      Ent *e = &ents[i];
      if (!e->alive || (e->kind != K_WALKER && e->kind != K_HOPPER && e->kind != K_HERO)) continue;
      int32_t ex = e->x >> FP, ey = e->y >> FP;
      if (px >= ex && px < ex + EW && py >= ey && py < ey + EH) return i;
    }
  }
  return 0;
}

static void die(void) {
  if (dead) return;
  dead = 1; sfx |= SFX_DEATH;
  ents[0].vy = -1000; ents[0].vx = 0;
}

/* One hit is not one death any more. A heart, a moment of mercy and a shove backwards — without
   the invulnerability window a player standing inside an enemy loses every heart in three frames
   and never learns what hit them. */
static void hurt(int32_t from_dir) {
  if (dead || invuln > 0) return;
  hp--;
  invuln = INVULN;
  ents[0].vy = KNOCK_V;
  ents[0].vx = from_dir ? 400 : -400;
  sfx |= SFX_HURT;
  if (hp <= 0) die();
}

static void step_player(uint32_t in) {
  Ent *p = &ents[0];
  if (shoot_cd > 0) shoot_cd--;
  if (invuln > 0) invuln--;
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

  if ((in & IN_JUMP) && p->onground) { p->vy = JUMP_V; p->onground = 0; sfx |= SFX_JUMP; }
  /* Throwing does not interrupt anything: you can throw while running, rising or falling, which is
     the whole reason the weapon is drawn as an overlay rather than as its own body pose. */
  if (in & IN_SHOOT) throw_spear(p);
  /* Variable height: the slow gravity is only for a rising player still holding the key. */
  p->vy += (p->vy < 0 && (in & IN_JUMP)) ? GRAV_HOLD : GRAV_FALL;
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
  if (e->kind == K_SPEAR) {
    int32_t x0 = e->x >> FP, y0 = e->y >> FP;
    e->vy += SPEAR_DROP;                                  /* a shallow arc, not a laser */
    e->x += e->vx; e->y += e->vy;
    int hit = spear_hits(e, x0, y0);
    if (hit > 0) {
      Ent *t = &ents[hit];
      /* The swordsman takes two: one spear staggers him, the second puts him down. Reusing the
         timer field as his remaining health is safe — nothing else reads it for an enemy. */
      if (t->kind == K_HERO && t->timer > 0) { t->timer--; t->vx = -t->vx; }
      else { t->alive = 0; kills++; score += 250; }
      e->alive = 0; sfx |= SFX_STOMP;
      return;
    }
    if (hit < 0) { e->alive = 0; sfx |= SFX_BUMP; return; }   /* stuck in the scenery */
    if (--e->timer <= 0 || (e->y >> FP) > SCRH + 40 || (e->x >> FP) < camx - 60) e->alive = 0;
    return;
  }
  if (e->kind == K_POP || e->kind == K_DEBRIS) {          /* particles: no collision at all */
    e->vy += GRAV_FALL; e->x += e->vx; e->y += e->vy;
    if (--e->timer <= 0) e->alive = 0;
    return;
  }

  e->vy += GRAV_FALL; if (e->vy > MAX_FALL) e->vy = MAX_FALL;
  e->x += e->vx;
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
      if (e->kind == K_HOPPER && (frame_no & 63) < 2) e->vy = -1013;
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
    /* Only the things that can actually hurt you. Listing what to SKIP was the bug: particles were
       excluded and the player's own spear was not, so a thrown spear — which leaves from inside her
       own box, and on a run travels alongside her — counted as a hit on herself. Name the threats
       instead; a list of exceptions grows a hole every time a kind is added. */
    if (!e->alive) continue;
    if (e->kind != K_WALKER && e->kind != K_HOPPER && e->kind != K_HERO) continue;
    int32_t ex = e->x >> FP, ey = e->y >> FP;
    if (px + PW <= ex || ex + EW <= px || py + PH <= ey || ey + EH <= py) continue;
    /* Falling onto the top third is a stomp; anything else is a death. The band matters:
       measured off the boxes, not guessed, or a fast fall clips straight past it. */
    if (p->vy > 0 && py + PH - 1 < ey + EH / 2 + 2 && e->kind != K_HERO) {
      e->alive = 0; kills++; p->vy = BOUNCE_V; score += 100; sfx |= SFX_STOMP;
    } else {
      hurt(ex > px);                       /* shove away from whatever hit you */
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
  camx = 0; cam_far = 0; gen_col = 0; seg_left = 0; seg_type = SEG_FLAT; seg_dir = 1; ground_row = GROUND_MAX - 1;   /* inside the map: a literal 12 survived the drop from 15 rows
                                    to 11 and quietly wrote every ground tile out of range */
  safe_left = 24; pending_gap = 0;                                  /* a calm opening: no gap, no enemy, and long
                                                      enough to measure a full run-up jump on */
  score = 0; coins = 0; best_col = 0; frame_no = 0; sfx = 0; dead = 0; last_in = 0; dln = 0;
  ammo = START_AMMO; hp = START_HP; invuln = 0; shoot_cd = 0; kills = 0;
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
  st[S_AMMO]   = ammo;
  st[S_HP]     = hp;
  st[S_INVULN] = invuln;
  st[S_KILLS]  = kills;
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
