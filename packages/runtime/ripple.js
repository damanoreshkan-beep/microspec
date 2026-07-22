// microspec runtime — ripple / wave-field math for PERCUSSIVE audio-visuals. NO browser, NO WebGL. A handpan
// is transient, not a continuous spectrum, so its visual is *waves radiating from each strike*, not a bar
// chart: each strike launches an expanding, decaying concentric wave from a point, and the surface
// displacement at any node is the interference SUM of the live strikes. Both the three.js dot-field and its
// Canvas2D fallback consume THIS (farm rule: the maths lives here, unit-tested; WebGL only runs in CI).
//
// Model — a wave packet: a cosine oscillation windowed by a Gaussian so its energy stays localised at a
// moving ring `r = speed·age`, under an exponential temporal decay (the note's ring-out, mirroring the reverb
// tail) and a `1/(1+spread·r)` spatial falloff (the crest thins as it expands). This is the classic
// damped-ripple look of a struck drumhead / a stone in still water. Deterministic (no Math.random) so the
// gate can seed fixed strikes and get an alive, reproducible shot. Refs: Chladni/struck-membrane standing
// waves; Codrops 3D visualizer (instance-driven, never CPU-mutated geometry); apps/handpan/RESEARCH.md.

export const RIPPLE_DEFAULTS = { speed: 4.6, width: 0.95, wavelength: 1.7, life: 1.6, spread: 0.13, max: 14 };

// One wave packet's contribution shape at signed distance-from-front u: an oscillation windowed by a Gaussian
// so energy stays localised at the moving ring (no infinite plane wave). Peaks at u=0 — the crest of the front.
export function ring(u, width, k) {
  return Math.cos(k * u) * Math.exp(-(u * u) / (width * width));
}

// A live field of strikes. Coordinates are in whatever world units the caller uses (the app maps a struck
// tone-field's ring position and the grid nodes into the same space); speed is units/second, t is seconds.
export function RippleField(opts = {}) {
  const o = { ...RIPPLE_DEFAULTS, ...opts };
  const k = (2 * Math.PI) / o.wavelength;
  let src = [];
  const decayAt = (age) => Math.exp(-age / o.life);
  return {
    get k() { return k; },
    active() { return src.length; },

    // register a strike at (x,y); amp scales the crest, hue (200..300, non-wrapping) carries the pitch colour.
    strike(x, y, { amp = 1, hue = 260, t = 0 } = {}) {
      src.push({ x, y, amp, hue, t0: t });
      if (src.length > o.max) src.shift();           // evict the oldest — cap the per-frame cost
      return src.length;
    },

    // height + amplitude-weighted hue at (x,y,t) in ONE pass — the 3D frame calls this once per node.
    sample(x, y, t) {
      let h = 0, hueW = 0, hueA = 0;
      for (let i = 0; i < src.length; i++) {
        const s = src[i], age = t - s.t0;
        if (age < 0) continue;
        const env = s.amp * decayAt(age);
        if (env < 0.004) continue;                   // this strike has rung out — skip
        const front = o.speed * age;
        const dx = x - s.x, dy = y - s.y, d = Math.sqrt(dx * dx + dy * dy);
        const contrib = (env / (1 + o.spread * front)) * ring(d - front, o.width, k);
        h += contrib;
        const a = Math.abs(contrib); hueW += a * s.hue; hueA += a;
      }
      return { h, hue: hueA > 1e-6 ? hueW / hueA : 260 };
    },
    height(x, y, t) { return this.sample(x, y, t).h; },

    // Soft radial HALO at each strike — bright at the struck point, fading over time — the "glow under the
    // finger", distinct from the expanding wavefront ring (a thin ring of fine grains alone reads as noise, not
    // a glow). gr = halo radius (world), gl = halo life (s). Returns a 0..~amp glow scalar at (x,y,t).
    glow(x, y, t, gr = 1.05, gl = 0.85) {
      let g = 0;
      for (let i = 0; i < src.length; i++) {
        const s = src[i], age = t - s.t0; if (age < 0) continue;
        const e = s.amp * Math.exp(-age / gl); if (e < 0.01) continue;
        const dx = x - s.x, dy = y - s.y;
        g += e * Math.exp(-(dx * dx + dy * dy) / (gr * gr));
      }
      return g;
    },

    // total live energy (Σ amp·decay) — drives the global breathing/glow when there's no live audio to tap.
    energy(t) {
      let e = 0;
      for (let i = 0; i < src.length; i++) { const age = t - src[i].t0; if (age >= 0) e += src[i].amp * decayAt(age); }
      return e;
    },
    // energy-weighted mean hue of the live field — the single tint the Canvas2D fallback + glow use.
    hue(t) {
      let w = 0, a = 0;
      for (let i = 0; i < src.length; i++) { const age = t - src[i].t0; if (age < 0) continue; const e = src[i].amp * decayAt(age); w += e * src[i].hue; a += e; }
      return a > 1e-6 ? w / a : 260;
    },

    // drop strikes that have rung out below eps — keep the source list (and the per-node loop) short.
    prune(t, eps = 0.01) {
      const before = src.length;
      src = src.filter((s) => { const age = t - s.t0; return age < 0 || decayAt(age) >= eps; });
      return before - src.length;
    },
    clear() { src = []; },
  };
}
