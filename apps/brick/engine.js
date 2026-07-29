// brick — the host: load the wasm, keep the clock honest, paint the canvas, make the noises.
//
// The engine is a zero-import reactor, so instantiating it is one line and there is no glue file
// to load. Everything time-shaped lives here, because a fixed timestep is the only way a jump
// arc stays the same height on a 60, 90 and 120 Hz display.

import { SCRW, SCRH, INK, LCD, S, SFX, clampLevel } from "/_rt/brick.js";
import { renderFrame, glyphRects } from "./render.js";
import { TRANSPARENT } from "./atlas.js";
import { createEngine } from "/_rt/audio.js";

export const WASM_URL = new URL("./assets/brick.wasm", import.meta.url).href;
export const GATE_SEED = 0xB21C;

/* ── the wasm ─────────────────────────────────────────────────────────────────────────── */
export async function loadEngine(url = WASM_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`brick.wasm ${res.status}`);
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
  const E = instance.exports;
  return {
    init: (seed) => E.game_init(seed >>> 0),
    step: (mask) => E.game_step(mask >>> 0),
    state: () => new Int32Array(E.memory.buffer, E.game_state(), S.COUNT),
    list: () => ({ dl: new Int16Array(E.memory.buffer, E.game_dl(), E.game_dl_count() * 4), n: E.game_dl_count() }),
  };
}

/* ── the painter ──────────────────────────────────────────────────────────────────────────
   Cells are pre-rendered once into their own little canvases, so a frame is ~90 drawImage calls
   rather than 78 000 per-pixel writes. The FLIPPED and SILHOUETTE variants are baked too: a
   per-frame ctx.scale(-1,1) costs a state change on every sprite, and the contact shadow is the
   same silhouette every time. */
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function bake(cell, { flip = false, level = null, lcd = LCD } = {}) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, cell.w); c.height = Math.max(1, cell.h);
  if (!cell.w) return c;
  const g = c.getContext("2d");
  /* The browser-free preflight mounts this against a stub canvas whose 2D context answers to the
     method names and returns nothing useful. Baking is an optimisation, not the app, so a context
     that cannot bake yields a blank tile instead of throwing the whole view away on mount. */
  const img = g?.createImageData?.(cell.w, cell.h);
  if (!img?.data || !g.putImageData) return c;
  const ink = hex(lcd.ink);
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      const v = cell.px[y * cell.w + (flip ? cell.w - 1 - x : x)];
      if (v === TRANSPARENT) continue;
      const o = (y * cell.w + x) * 4;
      img.data[o] = ink[0]; img.data[o + 1] = ink[1]; img.data[o + 2] = ink[2];
      img.data[o + 3] = Math.round(INK[clampLevel(level == null ? v : level)] * 255);
    }
  g.putImageData(img, 0, 0);
  return c;
}

export function canvasPainter(ctx, lcd = LCD) {
  const ink = lcd.ink;
  const cache = new Map();
  const baked = (cell, flip, level) => {
    let byCell = cache.get(cell);
    if (!byCell) { byCell = new Map(); cache.set(cell, byCell); }
    const k = `${flip ? 1 : 0}:${level ?? "x"}`;
    let c = byCell.get(k);
    if (!c) { c = bake(cell, { flip, level }); byCell.set(k, c); }
    return c;
  };

  // the previous frame, for the passive-matrix persistence
  const prev = document.createElement("canvas");
  prev.width = SCRW; prev.height = SCRH;
  const pg = prev.getContext("2d");

  /* The lattice and the polariser are the two passes that need a pattern and a gradient, and the
     browser-free preflight runs against a stub canvas that has neither. They are the *finish* on
     the display, not its content, so a context that cannot make them simply goes without —
     rather than the whole view throwing on mount, which is what the first cut did. */
  const lat = document.createElement("canvas");
  lat.width = 1; lat.height = 2;
  const lg = lat.getContext("2d");
  if (lg?.fillRect) { lg.fillStyle = ink; lg.fillRect(0, 0, 1, 1); }
  const pattern = ctx.createPattern ? ctx.createPattern(lat, "repeat") : null;

  let sheenGrad = null;
  const grad = ctx.createLinearGradient?.(0, 0, SCRW, SCRH);
  if (grad?.addColorStop) {
    grad.addColorStop(0, `rgba(255,255,255,${lcd.sheen * 2})`);
    grad.addColorStop(0.55, "rgba(255,255,255,0)");
    sheenGrad = grad;
  }

  return {
    keep() { pg.clearRect(0, 0, SCRW, SCRH); pg.drawImage(ctx.canvas, 0, 0); },
    plate() { ctx.globalAlpha = 1; ctx.fillStyle = lcd.plate; ctx.fillRect(0, 0, SCRW, SCRH); },
    ghost(a) { ctx.globalAlpha = a; ctx.drawImage(prev, 0, 0); ctx.globalAlpha = 1; },
    rect(x, y, w, h, level, alpha = 1) {
      ctx.globalAlpha = INK[clampLevel(level)] * alpha;
      ctx.fillStyle = ink;
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      ctx.globalAlpha = 1;
    },
    cell(cell, ox, oy, { level = null, alpha = 1, flip = false } = {}) {
      if (!cell.w) return;
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.drawImage(baked(cell, flip, level), Math.round(ox), Math.round(oy));
      if (alpha !== 1) ctx.globalAlpha = 1;
    },
    glyph(ch, ox, oy) {
      ctx.fillStyle = ink; ctx.globalAlpha = INK[4];
      for (const [x, y] of glyphRects(ch)) ctx.fillRect(ox + x * 2, oy + y * 2, 2, 2);
      ctx.globalAlpha = 1;
    },
    grid(a) { if (!pattern) return; ctx.globalAlpha = a; ctx.fillStyle = pattern; ctx.fillRect(0, 0, SCRW, SCRH); ctx.globalAlpha = 1; },
    sheen() { if (!sheenGrad) return; ctx.fillStyle = sheenGrad; ctx.fillRect(0, 0, SCRW, SCRH); },
  };
}

/* ── the clock ────────────────────────────────────────────────────────────────────────────
   One simulation step is 1/60 s and nothing else. On a 120 Hz display that is one step every
   other frame; on 90 Hz it alternates. The clamp matters more than the loop: coming back from
   a backgrounded tab with a minute of unspent time would otherwise run 3 600 steps in one go
   and teleport the player through the level. */
export const STEP_MS = 1000 / 60;
export const MAX_CATCHUP = 5;

export function makeClock(step) {
  let acc = 0, last = 0;
  return {
    reset() { acc = 0; last = 0; },
    tick(now) {
      if (!last) { last = now; return 0; }
      acc += Math.min(now - last, 250);
      last = now;
      let n = 0;
      while (acc >= STEP_MS && n < MAX_CATCHUP) { step(); acc -= STEP_MS; n++; }
      if (n === MAX_CATCHUP) acc = 0;          // we are behind; drop the debt, never bank it
      return n;
    },
  };
}

/* ── sound ────────────────────────────────────────────────────────────────────────────────
   The engine reports what happened; the noises are made here. /_rt/audio.js already owns the
   context, the master gain and the noise buffers — this is a voice list on top of it, not a
   second audio engine.

   The context is created inside the first pointerdown on the deck and NOTHING is sequenced
   behind `resume()`: a suspended context with no user activation leaves that promise pending
   forever rather than rejecting, and anything awaiting it simply never runs. */
export function makeSound() {
  let eng = null, on = true;
  const ensure = () => {
    if (!eng) { try { eng = createEngine({ master: 0.5 }); } catch { eng = null; } }
    if (eng) eng.resume?.();
    return eng;
  };
  const blip = (freq, dur, type = "square", gain = 0.18, slide = 0) => {
    if (!eng || !on) return;
    const { ctx, master } = eng, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (dur, gain = 0.2) => {
    if (!eng || !on) return;
    const { ctx, master, buffers } = eng, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = buffers?.white ?? null;
    if (!s.buffer) return;
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1600;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  };
  return {
    arm: ensure,
    get enabled() { return on; },
    set enabled(v) { on = v; },
    play(bits) {
      if (!on || !eng) return;
      if (bits & SFX.JUMP) blip(320, 0.16, "square", 0.16, 340);
      if (bits & SFX.COIN) { blip(988, 0.06, "square", 0.14); setTimeout(() => blip(1319, 0.14, "square", 0.12), 55); }
      if (bits & SFX.STOMP) noise(0.1, 0.22);
      if (bits & SFX.BRICK) noise(0.16, 0.26);
      if (bits & SFX.BUMP) blip(180, 0.07, "square", 0.1, -60);
      if (bits & SFX.DEATH) { blip(392, 0.12, "square", 0.16); setTimeout(() => blip(262, 0.4, "square", 0.16, -120), 130); }
    },
  };
}
