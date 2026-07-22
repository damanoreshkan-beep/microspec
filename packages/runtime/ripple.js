
export const RIPPLE_DEFAULTS = { speed: 4.6, width: 0.95, wavelength: 1.7, life: 1.6, spread: 0.13, max: 14 };

export function ring(u, width, k) {
  return Math.cos(k * u) * Math.exp(-(u * u) / (width * width));
}

export function RippleField(opts = {}) {
  const o = { ...RIPPLE_DEFAULTS, ...opts };
  const k = (2 * Math.PI) / o.wavelength;
  let src = [];
  const decayAt = (age) => Math.exp(-age / o.life);
  return {
    get k() { return k; },
    active() { return src.length; },

    strike(x, y, { amp = 1, hue = 260, t = 0 } = {}) {
      src.push({ x, y, amp, hue, t0: t });
      if (src.length > o.max) src.shift();           
      return src.length;
    },

    sample(x, y, t) {
      let h = 0, hueW = 0, hueA = 0;
      for (let i = 0; i < src.length; i++) {
        const s = src[i], age = t - s.t0;
        if (age < 0) continue;
        const env = s.amp * decayAt(age);
        if (env < 0.004) continue;                   
        const front = o.speed * age;
        const dx = x - s.x, dy = y - s.y, d = Math.sqrt(dx * dx + dy * dy);
        const contrib = (env / (1 + o.spread * front)) * ring(d - front, o.width, k);
        h += contrib;
        const a = Math.abs(contrib); hueW += a * s.hue; hueA += a;
      }
      return { h, hue: hueA > 1e-6 ? hueW / hueA : 260 };
    },
    height(x, y, t) { return this.sample(x, y, t).h; },

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

    energy(t) {
      let e = 0;
      for (let i = 0; i < src.length; i++) { const age = t - src[i].t0; if (age >= 0) e += src[i].amp * decayAt(age); }
      return e;
    },
    hue(t) {
      let w = 0, a = 0;
      for (let i = 0; i < src.length; i++) { const age = t - src[i].t0; if (age < 0) continue; const e = src[i].amp * decayAt(age); w += e * src[i].hue; a += e; }
      return a > 1e-6 ? w / a : 260;
    },

    prune(t, eps = 0.01) {
      const before = src.length;
      src = src.filter((s) => { const age = t - s.t0; return age < 0 || decayAt(age) >= eps; });
      return before - src.length;
    },
    clear() { src = []; },
  };
}
