// microspec runtime — the DreamStudio tilt engine: device tilt → the position of the LIGHT on the portal's
// rim (docs/research/dreamstudio-style.md). A game engine purely for design, budgeted like a metronome:
// EVENT-driven (zero rAF at rest), one style write per frame at most, compositor-only consumers.
//
// The MATH lives in pure, unit-tested pieces (OneEuro, TiltTracker); startTilt() is the only DOM code.
//
//   deviceorientation (β front-back, γ left-right; α/compass is never used — a heading off alpha is the
//   trap the farm already documented) → rest-pose EMA (where the hand settled, τ≈8s) → 1€ filter
//   (Casiez/Roussel/Vogel, CHI 2012: adaptive low-pass — low cutoff when still, high when moving) →
//   normalise ±30° → dead-band → `--ds-tx`/`--ds-ty` in −1..1 on :root.
//
// Consumers (theme.css) move light layers with transform: translate3d(calc(var(--ds-tx)*Npx), …) — never
// background-position, never filter. A phone on a table costs nothing: the dead-band swallows the jitter
// and no frame is ever scheduled.

// ── the 1€ filter — pure ─────────────────────────────────────────────────────────────────────────────
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
export class OneEuro {
  constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = 0;
  }
  filter(v, dt) {
    if (!(dt > 0)) return this.x ?? v;
    if (this.x === null) { this.x = v; return v; }
    const rawDx = (v - this.x) / dt;
    const aD = alpha(this.dCutoff, dt);
    this.dx = aD * rawDx + (1 - aD) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = alpha(cutoff, dt);
    this.x = a * v + (1 - a) * this.x;
    return this.x;
  }
}

// ── the tracker: rest pose + normalise + dead-band — pure ────────────────────────────────────────────
// RANGE° of tilt away from the rest pose is full travel. The rest pose is a slow EMA (τ seconds), so the
// light re-centres on wherever the hand settles instead of assuming flat-on-a-table.
export class TiltTracker {
  constructor({ range = 30, tau = 8, dead = 0.004, filter } = {}) {
    this.range = range; this.tau = tau; this.dead = dead;
    this.fx = new OneEuro(filter); this.fy = new OneEuro(filter);
    this.restB = null; this.restG = null;
    this.tx = 0; this.ty = 0;
  }
  /** feed one (beta, gamma, dtSeconds) sample → { tx, ty, moved } in −1..1 */
  sample(beta, gamma, dt) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma) || !(dt > 0)) return { tx: this.tx, ty: this.ty, moved: false };
    if (this.restB === null) { this.restB = beta; this.restG = gamma; }
    const k = Math.min(1, dt / this.tau);                       // rest pose drifts toward the hand
    this.restB += (beta - this.restB) * k;
    this.restG += (gamma - this.restG) * k;
    const nx = Math.max(-1, Math.min(1, (gamma - this.restG) / this.range));
    const ny = Math.max(-1, Math.min(1, (beta - this.restB) / this.range));
    const tx = this.fx.filter(nx, dt), ty = this.fy.filter(ny, dt);
    const moved = Math.abs(tx - this.tx) > this.dead || Math.abs(ty - this.ty) > this.dead;
    if (moved) { this.tx = tx; this.ty = ty; }
    return { tx: this.tx, ty: this.ty, moved };
  }
}

// ── the subscriber — the only DOM code ───────────────────────────────────────────────────────────────
// Starts ONLY where it is free: reduced-motion off, the API present, and no permission prompt would be
// needed (iOS's requestPermission is never called for decoration — sensor apps that already asked get the
// motion for free; everyone else gets the statically lit portal). Pauses on hidden. Zero rAF at rest.
let started = false;
export function startTilt() {
  if (started || typeof window === "undefined") return () => {};
  if (typeof DeviceOrientationEvent === "undefined") return () => {};
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  started = true;
  const tracker = new TiltTracker();
  const root = document.documentElement;
  let last = 0, raf = 0, pending = null;
  const write = () => { raf = 0; if (!pending) return; root.style.setProperty("--ds-tx", pending.tx.toFixed(4)); root.style.setProperty("--ds-ty", pending.ty.toFixed(4)); pending = null; };
  const onTilt = (e) => {
    const now = performance.now();
    const dt = last ? (now - last) / 1000 : 0.016;
    last = now;
    const { tx, ty, moved } = tracker.sample(e.beta, e.gamma, Math.min(0.25, dt));
    if (!moved) return;                                         // a phone at rest schedules nothing
    pending = { tx, ty };
    if (!raf) raf = requestAnimationFrame(write);
  };
  const sub = () => addEventListener("deviceorientation", onTilt, { passive: true });
  const unsub = () => { removeEventListener("deviceorientation", onTilt); last = 0; };
  const onVis = () => (document.visibilityState === "hidden" ? unsub() : sub());
  sub();
  document.addEventListener("visibilitychange", onVis);
  return () => { started = false; unsub(); document.removeEventListener("visibilitychange", onVis); if (raf) cancelAnimationFrame(raf); };
}
