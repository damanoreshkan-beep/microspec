// apps/drift/viz.js — the ambient stage: a full-bleed Canvas2D field of slow-drifting light that breathes with
// the live mix. It reads the SAME signal the pads make — a Uint8Array FFT frame tapped off the engine master
// (bindAudio, set in view.js) — or, when nothing is playing (paused, the headless gate/shoot), a deterministic
// seeded curve, so the stage is never a dead flatline. The perceptual DSP (splitBands) lives in the unit-tested
// /_rt/spectrum.js; this file is the thin painting layer. Canvas2D (not WebGL): cheap, no context-loss risk,
// verifiable from a screenshot — the right tool for a calm ambient wash, per reference_fullscreen_ambient_layer.
//
// The stage paints its OWN dark backdrop so it reads identically in light and dark themes (like rave's stage);
// the islands float above it as RAISED surfaces (the kit's Island is `sf-raised sf-e3` and opaque — the word
// "glass" that used to stand here is from the material this farm replaced, and kit wording is exactly how a
// hand-rolled blur gets copied into the next app). It is aria-hidden — axe judges the islands.

import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { splitBands, seedFrame } from "/_rt/spectrum.js";
import { gate } from "/_rt/gate.js";

const TAU = Math.PI * 2;
const DPR = () => Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// view.js hands us a getter returning the live Uint8Array while playing, else null.
let _get = null;
export function bindAudio(fn) { _get = fn; }

// each blob drifts on its own slow lissajous path; hue is the style hue ± a small spread → colour = meaning.
const BLOBS = [
  { ax: 0.30, ay: 0.26, fx: 0.017, fy: 0.013, ph: 0.0, r: 0.62, dh: -14, band: "bass" },
  { ax: 0.24, ay: 0.30, fx: 0.011, fy: 0.019, ph: 1.7, r: 0.50, dh: 10, band: "mid" },
  { ax: 0.34, ay: 0.22, fx: 0.023, fy: 0.009, ph: 3.1, r: 0.42, dh: 22, band: "treble" },
  { ax: 0.20, ay: 0.28, fx: 0.008, fy: 0.021, ph: 4.6, r: 0.36, dh: -6, band: "mid" },
  { ax: 0.28, ay: 0.20, fx: 0.015, fy: 0.017, ph: 5.9, r: 0.30, dh: 30, band: "treble" },
];

export function Field({ hue = 220 }) {
  const ref = useRef(null);
  const hueRef = useRef(hue);
  hueRef.current = hue;
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    let ctx; try { ctx = cv.getContext("2d"); } catch { ctx = null; }
    if (!ctx || typeof requestAnimationFrame === "undefined") return;
    // capability probe — the preflight (linkedom) canvas is a non-functional stub whose createLinearGradient
    // returns undefined; bail there (static empty stage, aria-hidden) rather than throw every frame.
    try { const g = ctx.createLinearGradient(0, 0, 0, 1); if (!g || typeof g.addColorStop !== "function") return; } catch { return; }
    let raf = 0, w = 0, h = 0, phase = 0;
    const env = { bass: 0.3, mid: 0.25, treble: 0.2 };
    const resize = () => { const d = DPR(); w = cv.clientWidth; h = cv.clientHeight; cv.width = Math.max(1, w * d); cv.height = Math.max(1, h * d); ctx.setTransform(d, 0, 0, d, 0, 0); };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro && ro.observe(cv);

    const frame = () => {
      phase += reduced ? 0.0015 : 0.006;
      const live = _get && !gate ? _get() : null;
      const u8 = live || seedFrame(1024, phase * 0.6);
      const b = splitBands(u8, 44100, 2048);
      // smooth (attack fast, release slow) so the wash glides, never flickers
      for (const k of ["bass", "mid", "treble"]) { const v = Math.min(1, (b[k] || 0)); env[k] += (v - env[k]) * (v > env[k] ? 0.2 : 0.04); }

      const H = hueRef.current;
      // dark backdrop with a faint radial lift toward centre-bottom
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `hsl(${H}, 32%, 5%)`);
      bg.addColorStop(1, `hsl(${(H + 20) % 360}, 40%, 8%)`);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      // additive drifting blobs
      ctx.globalCompositeOperation = "lighter";
      const base = Math.min(w, h);
      for (const bl of BLOBS) {
        const e = env[bl.band];
        const x = w * (0.5 + bl.ax * Math.sin(phase * bl.fx * 60 + bl.ph));
        const y = h * (0.48 + bl.ay * Math.cos(phase * bl.fy * 60 + bl.ph * 1.3));
        const rad = base * bl.r * (0.75 + e * 0.6);
        const light = 26 + e * 34;
        const alpha = 0.10 + e * 0.16;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `hsla(${(H + bl.dh + 360) % 360}, 70%, ${light}%, ${alpha})`);
        g.addColorStop(1, `hsla(${(H + bl.dh + 360) % 360}, 70%, ${light}%, 0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
      // a soft luminous horizon low on the stage
      const hz = ctx.createRadialGradient(w * 0.5, h * 1.02, 0, w * 0.5, h * 1.02, base * 0.9);
      hz.addColorStop(0, `hsla(${H}, 80%, 60%, ${0.10 + env.mid * 0.12})`);
      hz.addColorStop(1, `hsla(${H}, 80%, 60%, 0)`);
      ctx.fillStyle = hz; ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro && ro.disconnect(); };
  }, []);

  return html`<canvas data-field ref=${ref} aria-hidden="true" class="fixed inset-0 z-0 w-full h-full block"></canvas>`;
}
