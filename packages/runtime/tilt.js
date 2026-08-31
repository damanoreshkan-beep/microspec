
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
    const k = Math.min(1, dt / this.tau);                       
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
    if (!moved) return;                                         
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
