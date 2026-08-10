
import { SCRW, SCRH, WORLD, S, SFX } from "/_rt/hunt.js";
import { renderFrame, glyphRects } from "./render.js";
import { FULL, TRANSPARENT, WORLD_INDEX } from "./atlas.js";
import { createEngine } from "/_rt/audio.js";

export const WASM_URL = new URL("./assets/hunt.wasm", import.meta.url).href;
export const GATE_SEED = 0xA17C;

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = FULL.map(rgb);

export async function loadEngine(url = WASM_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hunt.wasm ${res.status}`);
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
  const E = instance.exports;
  return {
    init: (seed) => E.game_init(seed >>> 0),
    step: (mask) => E.game_step(mask >>> 0),
    state: () => new Int32Array(E.memory.buffer, E.game_state(), S.COUNT),
    list: () => ({ dl: new Int16Array(E.memory.buffer, E.game_dl(), E.game_dl_count() * 4), n: E.game_dl_count() }),
    
    box: (kind) => { const v = E.game_box(kind | 0); return { w: (v >> 16) & 0xffff, h: v & 0xffff }; },
  };
}


function bake(cell, flip, rim) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, cell.w); c.height = Math.max(1, cell.h);
  if (!cell.w) return c;
  const g = c.getContext("2d");
  const img = g?.createImageData?.(cell.w, cell.h);
  
  
  if (!img?.data || !g.putImageData) return c;
  const R = rim ? rgb(rim.hex) : null;
  const src = (x, y) => (x < 0 || y < 0 || x >= cell.w || y >= cell.h)
    ? TRANSPARENT : cell.px[y * cell.w + (flip ? cell.w - 1 - x : x)];
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      const v = src(x, y);
      if (v === TRANSPARENT) continue;
      let p = PAL[v] || [255, 0, 255];
      if (R && (src(x, y - 1) === TRANSPARENT || src(x - 1, y) === TRANSPARENT)) {
        const a = rim.a;
        p = [p[0] + (R[0] - p[0]) * a, p[1] + (R[1] - p[1]) * a, p[2] + (R[2] - p[2]) * a];
      }
      const o = (y * cell.w + x) * 4;
      img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

export function canvasPainter(ctx) {
  
  let cache = new Map(), gen = null;
  const baked = (cell, flip, rim) => {
    let m = cache.get(cell);
    if (!m) { m = new Map(); cache.set(cell, m); }
    const k = (flip ? 1 : 0) + (rim ? `|${rim.hex}${rim.a}` : "");
    let c = m.get(k);
    if (!c) { c = bake(cell, flip, rim); m.set(k, c); }
    return c;
  };
  let sky = null, skyKey = "";

  return {
    setWorld(colors, genKey) {
      if (genKey === gen) return;
      gen = genKey;
      for (const [k, idx] of Object.entries(WORLD_INDEX)) if (colors[k]) PAL[idx] = rgb(colors[k]);
      cache = new Map();
    },
    sky(top = WORLD.sky[0], bot = WORLD.sky[1]) {
      const key = top + bot;
      if (key !== skyKey) {
        skyKey = key;
        const grad = ctx.createLinearGradient?.(0, 0, 0, SCRH);
        if (grad?.addColorStop) { grad.addColorStop(0, top); grad.addColorStop(1, bot); sky = grad; }
        else sky = bot;
      }
      ctx.fillStyle = sky || bot;
      ctx.fillRect(0, 0, SCRW, SCRH);
    },
    rect(x, y, w, h, idx, alpha = 1) {
      const p = PAL[idx] || [255, 0, 255];
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      if (alpha !== 1) ctx.globalAlpha = 1;
    },
    shadow(x, y, w, h, alpha) {
      ctx.globalAlpha = alpha; ctx.fillStyle = "#000";
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      ctx.globalAlpha = 1;
    },
    cell(cell, ox, oy, { flip = false, alpha = 1, rim = null } = {}) {
      if (!cell.w) return;
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.drawImage(baked(cell, flip, rim), Math.round(ox), Math.round(oy));
      if (alpha !== 1) ctx.globalAlpha = 1;
    },
    glyph(ch, ox, oy) {
      ctx.fillStyle = "#f0f0f5";
      for (const [x, y] of glyphRects(ch)) ctx.fillRect(ox + x * 2, oy + y * 2, 2, 2);
    },
  };
}


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
      if (n === MAX_CATCHUP) acc = 0;
      return n;
    },
  };
}


export function makeSound() {
  let eng = null, on = true;
  const ensure = () => {
    if (!eng) { try { eng = createEngine({ master: 0.5 }); } catch { eng = null; } }
    if (eng) eng.resume?.();
    return eng;
  };
  const tone = (freq, dur, type = "triangle", gain = 0.16, slide = 0) => {
    if (!eng || !on) return;
    const { ctx, master } = eng, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (dur, gain, freq) => {
    if (!eng || !on) return;
    const { ctx, master, buffers } = eng, t = ctx.currentTime;
    if (!buffers?.white) return;
    const s = ctx.createBufferSource(); s.buffer = buffers.white;
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  };
  return {
    arm: ensure,
    get enabled() { return on; },
    set enabled(v) { on = v; },
    play(bits) {
      if (!on || !eng) return;
      if (bits & SFX.SHOOT) noise(0.09, 0.16, 2600);                       
      if (bits & SFX.EMPTY) tone(180, 0.06, "square", 0.07);               
      if (bits & SFX.STOMP) { noise(0.12, 0.2, 900); tone(160, 0.14, "square", 0.1, -60); }
      if (bits & SFX.PICK) { tone(880, 0.05, "triangle", 0.13); setTimeout(() => tone(1320, 0.1, "triangle", 0.11), 50); }
      if (bits & SFX.COIN) tone(1046, 0.09, "triangle", 0.1);
      if (bits & SFX.JUMP) tone(300, 0.13, "triangle", 0.12, 260);
      if (bits & SFX.HURT) { tone(220, 0.18, "sawtooth", 0.15, -110); noise(0.1, 0.12, 500); }
      if (bits & SFX.DEATH) { tone(392, 0.14, "triangle", 0.16); setTimeout(() => tone(196, 0.5, "triangle", 0.16, -90), 150); }
      if (bits & SFX.BUMP) tone(140, 0.05, "square", 0.07);
    },
  };
}