// swarm — the reactor. A 360° ring of hostiles converging on a player who can only turn and shoot.
//
// The simulation knows NOTHING about screens, cameras or FOV: positions are world angles
// (azimuth/elevation in tenths of a degree) and a distance in cm. JS projects them against the
// phone's real heading. The hit test lives here and is mirrored (formula, not constants) in
// packages/runtime/swarm.js `lockOn` — the bot unit test aims with the JS copy and this file
// confirms the kills, which is what keeps the two from drifting apart.
//
// Contract (mirrored in packages/runtime/swarm.js and apps/swarm/engine.js):
//   game_init(seed)  game_step(input)  game_state() -> int32[15]  game_dl()/game_dl_count()
//   input u32: bits 0-11 aim azimuth in tenths (0..3599) · bits 12-18 aim elevation deg + 64 ·
//              bit 19 fire
//   dl entry 4×int16: [0x100+kind, azT, elT, attr] · attr = distQ(cm/2, bits 0-10) |
//              pose<<11 (2 bits) | flash<<13

#include <stdint.h>

#define MAXE 24
#define SPAWN_CM 2400
#define CONTACT_CM 130
#define WARN_CM 400
#define COOLDOWN 16
#define ASSIST_T 25          /* flat aim assist, tenths of a degree */
#define INVULN 45
#define HP_MAX 3
#define COMBO_WIN 120
#define COMBO_MAX 9
#define WAVE_BREAK 90
#define STAGGER 45

enum { K_DRONE = 0, K_DARTER = 1, K_TANK = 2, KINDS = 3 };
/* per kind: collision radius cm, hp, base speed cm/frame, score value, azimuth-drift amplitude */
static const int32_t E_R[KINDS]   = { 35, 28, 55 };
static const int32_t E_HP[KINDS]  = { 1, 1, 3 };
static const int32_t E_V[KINDS]   = { 2, 3, 1 };
static const int32_t E_VAL[KINDS] = { 10, 15, 30 };
static const int32_t E_AMP[KINDS] = { 2, 6, 1 };

enum { SFX_SHOOT = 1, SFX_HIT = 2, SFX_KILL = 4, SFX_HURT = 8, SFX_WAVE = 16, SFX_DEATH = 32, SFX_WARN = 64 };
enum { S_FRAME, S_SCORE, S_WAVE, S_HP, S_ALIVE, S_DEAD, S_SFX, S_COMBO, S_KILLS,
       S_COOLDOWN, S_SHOTS, S_NAZ, S_NDIST, S_INVULN, S_SPAWNLEFT, S_COUNT };

typedef struct {
  int32_t alive, kind, hp;
  int32_t az, el, dist;      /* tenths of a degree · tenths · cm */
  int32_t phase, flash, warned;
} Ent;

static Ent ents[MAXE];
static int32_t st[S_COUNT];
static int16_t dl[MAXE * 4];
static int32_t dln;
static uint32_t rng;
static int32_t wave_n, spawn_left, spawn_timer, break_t, combo_t, cooldown, invuln, dead;

static uint32_t rnd(void) { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return rng; }

/* triangle wave, period 512, range -128..127 — drift needs periodic wobble, not sine purity */
static int32_t tri(int32_t a) { a &= 511; return a < 256 ? a - 128 : 383 - a; }

static int32_t wrapT(int32_t d) { return ((d % 3600) + 5400) % 3600 - 1800; }

static int32_t wave_count(int32_t w) { int32_t c = 3 + w; return c > 14 ? 14 : c; }

static int32_t pick_kind(int32_t w) {
  uint32_t r = rnd();
  if (w >= 3 && (r % 5) == 0) return K_TANK;
  if (w >= 2 && (r % 3) == 0) return K_DARTER;
  return K_DRONE;
}

static void spawn_one(void) {
  int32_t count = wave_count(wave_n);
  int32_t idx = count - spawn_left;
  for (int32_t i = 0; i < MAXE; i++) {
    if (ents[i].alive) continue;
    Ent *e = &ents[i];
    e->alive = 1;
    e->kind = pick_kind(wave_n);
    e->hp = E_HP[e->kind];
    /* even spread + jitter: the ring must attack from every quadrant or turning is pointless */
    e->az = (idx * (3600 / count) + (int32_t)(rnd() % 600)) % 3600;
    e->el = -50 + (int32_t)(rnd() % 250);
    e->dist = SPAWN_CM;
    e->phase = (int32_t)(rnd() % 512);
    e->flash = 0;
    e->warned = 0;
    break;
  }
  spawn_left--;
}

static void setup_wave(void) {
  spawn_left = wave_count(wave_n);
  spawn_timer = 0;
  int32_t burst = spawn_left < 3 ? spawn_left : 3;
  for (int32_t i = 0; i < burst; i++) spawn_one();
}

__attribute__((export_name("game_init")))
void game_init(uint32_t seed) {
  rng = seed ? seed : 0x9E3779B9u;
  for (int32_t i = 0; i < MAXE; i++) ents[i].alive = 0;
  for (int32_t i = 0; i < S_COUNT; i++) st[i] = 0;
  wave_n = 1; break_t = 0; combo_t = 0; cooldown = 0; invuln = 0; dead = 0; dln = 0;
  st[S_HP] = HP_MAX; st[S_WAVE] = 1; st[S_NAZ] = -1;
  setup_wave();
}

static void build_dl(void) {
  dln = 0;
  int32_t frame = st[S_FRAME];
  for (int32_t i = 0; i < MAXE; i++) {
    Ent *e = &ents[i];
    if (!e->alive) continue;
    int32_t q = e->dist >> 1; if (q > 2047) q = 2047; if (q < 0) q = 0;
    int32_t pose = ((frame >> 3) + e->phase) & 3;
    dl[dln * 4 + 0] = (int16_t)(0x100 + e->kind);
    dl[dln * 4 + 1] = (int16_t)e->az;
    dl[dln * 4 + 2] = (int16_t)e->el;
    dl[dln * 4 + 3] = (int16_t)(q | (pose << 11) | ((e->flash ? 1 : 0) << 13));
    dln++;
  }
}

__attribute__((export_name("game_step")))
void game_step(uint32_t input) {
  int32_t aim_az = (int32_t)(input & 0xFFF) % 3600;
  int32_t aim_el = ((int32_t)((input >> 12) & 0x7F) - 64) * 10;   /* degrees -> tenths */
  int32_t fire = (input >> 19) & 1;
  int32_t sfx = 0;

  st[S_FRAME]++;
  if (cooldown > 0) cooldown--;
  if (invuln > 0) invuln--;
  if (combo_t > 0) { combo_t--; if (combo_t == 0) st[S_COMBO] = 0; }

  /* staggered spawns after the opening burst */
  if (spawn_left > 0) {
    if (++spawn_timer >= STAGGER) { spawn_timer = 0; spawn_one(); }
  }

  /* motion: converge, wobble */
  for (int32_t i = 0; i < MAXE; i++) {
    Ent *e = &ents[i];
    if (!e->alive) continue;
    int32_t v = E_V[e->kind] + wave_n / 3;
    e->dist -= v;
    e->az = ((e->az + (tri(e->phase + st[S_FRAME] * 3) * E_AMP[e->kind]) / 128) % 3600 + 3600) % 3600;
    e->el += tri(e->phase * 7 + st[S_FRAME] * 2) / 96;
    if (e->el < -80) e->el = -80;
    if (e->el > 250) e->el = 250;
    if (e->flash > 0) e->flash--;
    if (!e->warned && e->dist <= WARN_CM) { e->warned = 1; sfx |= SFX_WARN; }
    if (e->dist <= CONTACT_CM) {
      e->alive = 0;                                   /* a sting is a kamikaze */
      if (!dead && invuln == 0) {
        st[S_HP]--; invuln = INVULN; sfx |= SFX_HURT;
        if (st[S_HP] <= 0) { st[S_HP] = 0; dead = 1; sfx |= SFX_DEATH; }
      }
    }
  }

  /* fire: hitscan at the crosshair. Tolerance is the target's angular radius plus a flat assist —
     the same formula lockOn uses in JS: tenths = r_cm * 573 / dist_cm. */
  if (fire && cooldown == 0 && !dead) {
    cooldown = COOLDOWN; st[S_SHOTS]++; sfx |= SFX_SHOOT;
    int32_t best = -1, best_d = 0x7FFFFFFF;
    for (int32_t i = 0; i < MAXE; i++) {
      Ent *e = &ents[i];
      if (!e->alive) continue;
      int32_t tol = (E_R[e->kind] * 573) / (e->dist < 1 ? 1 : e->dist) + ASSIST_T;
      int32_t da = wrapT(e->az - aim_az), de = e->el - aim_el;
      if (da < 0) da = -da; if (de < 0) de = -de;
      if (da <= tol && de <= tol && e->dist < best_d) { best = i; best_d = e->dist; }
    }
    if (best >= 0) {
      Ent *e = &ents[best];
      e->hp--; e->flash = 6; sfx |= SFX_HIT;
      if (e->hp <= 0) {
        e->alive = 0; sfx |= SFX_KILL; st[S_KILLS]++;
        st[S_COMBO] = combo_t > 0 ? (st[S_COMBO] >= COMBO_MAX ? COMBO_MAX : st[S_COMBO] + 1) : 1;
        combo_t = COMBO_WIN;
        st[S_SCORE] += E_VAL[e->kind] * st[S_COMBO];
      }
    }
  }

  /* census + nearest (NAZ keeps its last value through a wave break so a follower camera
     does not snap to -1) */
  int32_t alive = 0, naz = -1, ndist = 0x7FFFFFFF;
  for (int32_t i = 0; i < MAXE; i++) {
    if (!ents[i].alive) continue;
    alive++;
    if (ents[i].dist < ndist) { ndist = ents[i].dist; naz = ents[i].az; }
  }
  st[S_ALIVE] = alive;
  if (naz >= 0) { st[S_NAZ] = naz; st[S_NDIST] = ndist; }

  /* wave clear -> a breath, then the next ring; a heart back as mercy */
  if (!dead && alive == 0 && spawn_left == 0) {
    if (break_t == 0) break_t = WAVE_BREAK;
    else if (--break_t == 0) {
      wave_n++; st[S_WAVE] = wave_n;
      if (st[S_HP] < HP_MAX) st[S_HP]++;
      sfx |= SFX_WAVE;
      setup_wave();
    }
  }

  st[S_DEAD] = dead;
  st[S_SFX] = sfx;
  st[S_COOLDOWN] = cooldown;
  st[S_INVULN] = invuln;
  st[S_SPAWNLEFT] = spawn_left;
  build_dl();
}

__attribute__((export_name("game_state")))
uintptr_t game_state(void) { return (uintptr_t)st; }

__attribute__((export_name("game_dl")))
uintptr_t game_dl(void) { return (uintptr_t)dl; }

__attribute__((export_name("game_dl_count")))
int32_t game_dl_count(void) { return dln; }
