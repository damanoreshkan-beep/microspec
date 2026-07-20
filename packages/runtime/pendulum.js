// pendulum — the pure oscillation math for the Маятник (Pendulum) app: a contemplative dowsing pendulum
// that swings between the two poles of a duality, one full swing per breath. Depth lives here (like
// astro.js / groove.js); the app view is a thin rAF renderer over these deterministic, unit-tested fns.

// phase(elapsedMs, periodMs) → [0,1): position within the current breath cycle. Guards a zero period.
export function phase(elapsedMs, periodMs) {
  if (!(periodMs > 0)) return 0;
  const p = (elapsedMs % periodMs) / periodMs;
  return p < 0 ? p + 1 : p;
}

// swing(ph) → s ∈ [-1,1], simple-harmonic. s = +1 at phase 0 (pole A extreme, the settled top of the
// in-breath), s = -1 at phase 0.5 (pole B extreme), back to +1 at phase 1. Slowest at the poles (the
// natural breath-turn), fastest crossing centre — exactly a pendulum's motion.
export const swing = (ph) => Math.cos(2 * Math.PI * ph);

// state(elapsedMs, periodMs, ampDeg) → everything one render frame needs:
//   s        the swing value [-1,1]
//   angle    the arm angle in degrees, ampDeg·s (right, +, is pole A)
//   weightA  pole-A emphasis [0,1] = (s+1)/2; weightB = 1-weightA (a smooth crossfade)
//   active   0 while the bob favours pole A (s ≥ 0), else 1
//   breath   completed breath cycles = floor(elapsed/period)
export function state(elapsedMs, periodMs, ampDeg = 30) {
  const ph = phase(elapsedMs, periodMs);
  const s = swing(ph);
  const weightA = (s + 1) / 2;
  return {
    ph,
    s,
    angle: ampDeg * s,
    weightA,
    weightB: 1 - weightA,
    active: s >= 0 ? 0 : 1,
    breath: periodMs > 0 ? Math.floor(elapsedMs / periodMs) : 0,
  };
}
