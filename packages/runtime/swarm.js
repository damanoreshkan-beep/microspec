// swarm — the pure half: ABI mirror + the projection/aim math the view and the tests share.
// The other half of every formula lives in tools/wasm/swarm/game.c; the bot test in
// tests/swarm_test.js aims with THIS file and the wasm confirms the kills, which is the check
// that keeps the mirror honest. No imports, no DOM — provable in Deno.

/* state slots — mirrored in game.c (enum S_*) */
export const S = {
  FRAME: 0, SCORE: 1, WAVE: 2, HP: 3, ALIVE: 4, DEAD: 5, SFX: 6, COMBO: 7, KILLS: 8,
  COOLDOWN: 9, SHOTS: 10, NAZ: 11, NDIST: 12, INVULN: 13, SPAWNLEFT: 14, COUNT: 15,
};

/* sfx bits — mirrored in game.c (enum SFX_*) */
export const SFX = { SHOOT: 1, HIT: 2, KILL: 4, HURT: 8, WAVE: 16, DEATH: 32, WARN: 64 };

/* per kind (index = kind): collision radius cm — mirrored in game.c E_R; the aim assist too */
export const KIND_R = [35, 28, 55];
export const ASSIST_T = 25;
export const HP_MAX = 3;

/* input: bits 0-11 aim azimuth tenths · bits 12-18 aim elevation deg+64 · bit 19 fire */
export function packInput(azT, elDeg, fire) {
  const az = ((Math.round(azT) % 3600) + 3600) % 3600;
  const el = Math.max(0, Math.min(127, Math.round(elDeg) + 64));
  return (az | (el << 12) | (fire ? 1 << 19 : 0)) >>> 0;
}

/* dl entry i of an Int16Array: [0x100+kind, azT, elT, attr] */
export function decodeEntry(dl, i) {
  const o = i * 4, attr = dl[o + 3] & 0xffff;
  return {
    kind: (dl[o] & 0xff),
    azT: dl[o + 1],
    elT: dl[o + 2],
    distCm: (attr & 0x7ff) * 2,
    pose: (attr >> 11) & 3,
    flash: !!((attr >> 13) & 1),
  };
}

/* shortest signed way round the ring, tenths: wrapT(3590 - 10) === -20 */
export function wrapT(d) { return ((d % 3600) + 5400) % 3600 - 1800; }

/* World angles -> screen. 60° horizontal FOV as a game constant (not the camera's real FOV —
   a mild telephoto keeps aiming forgiving); ONE px-per-tenth scale on both axes so pixels stay
   square, y from the same k. */
export const FOV_T = 600;

export function project(azT, elT, headingT, pitchT, w, h) {
  const k = w / FOV_T;
  return { x: w / 2 + wrapT(azT - headingT) * k, y: h / 2 - (elT - pitchT) * k, k };
}

/* apparent angular RADIUS in tenths — small-angle, same expression the wasm hit test uses */
export function angRadiusT(kind, distCm) {
  return ((KIND_R[kind] ?? 35) * 573) / Math.max(1, distCm);
}

/* the JS mirror of game.c's target selection: nearest entry the crosshair currently covers.
   Returns the index into the display list, or -1. */
export function lockOn(dl, n, aimAzT, aimElT) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const e = decodeEntry(dl, i);
    const tol = angRadiusT(e.kind, e.distCm) + ASSIST_T;
    if (Math.abs(wrapT(e.azT - aimAzT)) <= tol && Math.abs(e.elT - aimElT) <= tol && e.distCm < bestD) {
      best = i; bestD = e.distCm;
    }
  }
  return best;
}

/* radar: relative bearing up-is-ahead, radius by distance share of the spawn ring */
export function radarPoint(azT, headingT, distCm, R) {
  const a = (wrapT(azT - headingT) / 1800) * Math.PI;
  const r = R * Math.min(1, distCm / 2400);
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}

/* a run beats another by wave, then score, then kills — nulls lose to anything */
export function betterRun(a, b) {
  if (!a) return b; if (!b) return a;
  if (a.wave !== b.wave) return a.wave > b.wave ? a : b;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  return a.kills >= b.kills ? a : b;
}
