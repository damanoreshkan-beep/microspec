// Offline frame preview — one real frame of a game, as a PNG, with no browser.
//
//   deno run -A tools/art/frame.mjs hunt --out /tmp/hunt.png
//   deno run -A tools/art/frame.mjs hunt --frames 150 --scale 3 --seed 0xA17C --out x.png
//
// The `/_rt/…` specifiers the app files use need an import map, so the tool RE-EXECS itself with
// tools/art/frame.importmap.json when it notices the map is not active. If you would rather be
// explicit, this is the invocation it runs for you:
//
//   deno run -A --import-map=tools/art/frame.importmap.json tools/art/frame.mjs hunt --out x.png
//
// WHY this exists at all: the eye test is a required gate, and the only honest preview is one that
// draws through the code that ships. apps/<id>/render.js owns the pass ORDER and draws against a
// `painter`; apps/<id>/engine.js supplies the Canvas2D one. This file supplies the second painter
// the abstraction was written for — the same method surface, writing into a plain RGBA buffer —
// so the picture below and the picture in the browser come off the same renderFrame().
//
// Nothing in apps/ or packages/ is touched. The wasm is instantiated the way loadEngine() does it,
// with Deno.readFile in place of fetch, because loadEngine is a browser function and copying seven
// lines is cheaper than making the shipping host care about a build tool.

import { encodePNG } from "./png.mjs";

const HERE = new URL(".", import.meta.url);
const MAP = new URL("./frame.importmap.json", HERE);

/* ── the import map, without making the caller remember it ────────────────────────────────
   `import.meta.resolve` answers with file:///_rt/… when no map is in play — a path that exists
   nowhere. Re-exec rather than fail: a preview tool that only runs when you remember a flag is a
   preview tool nobody runs. */
if (!import.meta.resolve("/_rt/hunt.js").includes("/packages/runtime/")) {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", `--import-map=${MAP.href}`, new URL(import.meta.url).pathname, ...Deno.args],
    stdout: "inherit", stderr: "inherit",
  });
  Deno.exit((await cmd.output()).code);
}

/* ── an RGBA buffer that composites like a canvas ─────────────────────────────────────────
   Canvas2D rounds fill geometry (fillRect takes device pixels but snaps nothing itself — the
   painters in engine.js do the rounding, and they round the same way here) and composites
   source-over: dst = dst*(1-a) + src*a. The buffer is always opaque, because both games mount
   its canvas with { alpha: false }. */
function surface(W, H) {
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;      // opaque, like an alpha:false canvas

  const px = (o, r, g, b, a) => {
    if (a <= 0) return;
    if (a >= 1) { buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; return; }
    buf[o] = buf[o] * (1 - a) + r * a;
    buf[o + 1] = buf[o + 1] * (1 - a) + g * a;
    buf[o + 2] = buf[o + 2] * (1 - a) + b * a;
  };
  // The rounding is engine.js's, verbatim: Math.round on the origin, Math.max(1, Math.round()) on
  // the extent — a sub-pixel rect still paints one pixel rather than vanishing.
  const rect = (x, y, w, h, [r, g, b], a = 1) => {
    const x0 = Math.round(x), y0 = Math.round(y);
    const x1 = x0 + Math.max(1, Math.round(w)), y1 = y0 + Math.max(1, Math.round(h));
    for (let yy = Math.max(0, y0); yy < Math.min(H, y1); yy++)
      for (let xx = Math.max(0, x0); xx < Math.min(W, x1); xx++) px((yy * W + xx) * 4, r, g, b, a);
  };
  return { buf, W, H, px, rect };
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* A cell flipped in X. The browser bakes the flipped variant into its own canvas by reading
   `cell.px[y*w + (w-1-x)]`; reversing the rows once produces the identical index buffer, so the
   shared blitter stays the only blitter. Cells are cached objects upstream, so this cache hits. */
const flipped = new WeakMap();
function flipCell(cell) {
  let f = flipped.get(cell);
  if (f) return f;
  const px = new cell.px.constructor(cell.px.length);
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) px[y * cell.w + x] = cell.px[y * cell.w + (cell.w - 1 - x)];
  f = { px, w: cell.w, h: cell.h };
  flipped.set(cell, f);
  return f;
}

/* ── hunt: the same abstraction, in colour ────────────────────────────────────────────────
   A cell here is a table of palette indices rather than one ink at N densities, so the blitter is
   local — apps/hunt/atlas.js has no paint() to borrow. */
function huntPainter(s, rt, PAL, glyphRects) {
  const { SCRH, WORLD } = rt;
  const TRANSPARENT = 255;
  const sky0 = hex(WORLD.sky[0]), sky1 = hex(WORLD.sky[1]);
  const glyphInk = hex("#f0f0f5");

  return {
    keep() {},                                   // no persistence pass: hunt is not an LCD
    sky() {
      for (let y = 0; y < s.H; y++) {
        const t = Math.min(1, (y + 0.5) / SCRH);
        const c = [0, 1, 2].map((i) => Math.round(sky0[i] + (sky1[i] - sky0[i]) * t));
        for (let x = 0; x < s.W; x++) s.px((y * s.W + x) * 4, c[0], c[1], c[2], 1);
      }
    },
    rect(x, y, w, h, idx) { s.rect(x, y, w, h, PAL[idx] || [255, 0, 255], 1); },
    shadow(x, y, w, h, alpha) { s.rect(x, y, w, h, [0, 0, 0], alpha); },
    cell(cell, ox, oy, { flip = false, alpha = 1 } = {}) {
      if (!cell.w) return;
      const src = flip ? flipCell(cell) : cell, x0 = Math.round(ox), y0 = Math.round(oy);
      for (let y = 0; y < cell.h; y++) {
        const py = y0 + y;
        if (py < 0 || py >= s.H) continue;
        for (let x = 0; x < cell.w; x++) {
          const v = src.px[y * cell.w + x];
          if (v === TRANSPARENT) continue;
          const pxx = x0 + x;
          if (pxx < 0 || pxx >= s.W) continue;
          const c = PAL[v] || [255, 0, 255];
          s.px((py * s.W + pxx) * 4, c[0], c[1], c[2], alpha);
        }
      }
    },
    glyph(ch, ox, oy) { for (const [x, y] of glyphRects(ch)) s.rect(ox + x * 2, oy + y * 2, 2, 2, glyphInk, 1); },
  };
}

/* ── the engines ──────────────────────────────────────────────────────────────────────────
   loadEngine() in apps/<id>/engine.js, with Deno.readFile for fetch. The export surface and the
   view onto wasm memory are copied deliberately: this is the one place a divergence would be
   invisible, so it is kept short enough to diff by eye. */
async function loadEngine(wasmPath, S, withBox) {
  const { instance } = await WebAssembly.instantiate(await Deno.readFile(wasmPath), {});
  const E = instance.exports;
  return {
    init: (seed) => E.game_init(seed >>> 0),
    step: (mask) => E.game_step(mask >>> 0),
    state: () => new Int32Array(E.memory.buffer, E.game_state(), S.COUNT),
    list: () => ({ dl: new Int16Array(E.memory.buffer, E.game_dl(), E.game_dl_count() * 4), n: E.game_dl_count() }),
    box: withBox ? (kind) => { const v = E.game_box(kind | 0); return { w: (v >> 16) & 0xffff, h: v & 0xffff }; } : null,
  };
}

/* ── the apps ─────────────────────────────────────────────────────────────────────────────
   `track` is the gate's input track, copied from each view.js. It has to be the SAME track: the
   screenshots, the a11y sweep and the taste pass all photograph the frame it produces, and a
   preview of a different frame is a preview of a different game. */
const APPS = {
  hunt: {
    frames: 150,
    async build(seedOverride) {
      const rt = await import("/_rt/hunt.js");
      const atlas = await import(new URL("../../apps/hunt/atlas.js", HERE).href);
      const render = await import(new URL("../../apps/hunt/render.js", HERE).href);
      const { GATE_SEED } = await import(new URL("../../apps/hunt/engine.js", HERE).href);
      const E = await loadEngine(new URL("../../apps/hunt/assets/hunt.wasm", HERE).pathname, rt.S, true);
      const s = surface(rt.SCRW, rt.SCRH);
      return {
        E, s, seed: seedOverride ?? GATE_SEED,
        // apps/hunt/view.js: IN.RIGHT | ((i % 60) < 16 ? IN.JUMP : 0) | ((i % 30) === 0 ? IN.SHOOT : 0)
        track: (i) => rt.IN.RIGHT | ((i % 60) < 16 ? rt.IN.JUMP : 0) | ((i % 30) === 0 ? rt.IN.SHOOT : 0),
        p: huntPainter(s, rt, atlas.FULL.map(hex), render.glyphRects),
        draw: (p, dl, n, st) => render.renderFrame(p, dl, n, st, { box: E.box }),
      };
    },
  },
};

/** Nearest neighbour, and only nearest neighbour. The games are pixel art; any filter is a lie. */
function upscale(buf, W, H, k) {
  if (k === 1) return { buf, W, H };
  const out = new Uint8ClampedArray(W * k * H * k * 4);
  for (let y = 0; y < H * k; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < W * k; x++) {
      const so = (sy * W + ((x / k) | 0)) * 4, o = (y * W * k + x) * 4;
      out[o] = buf[so]; out[o + 1] = buf[so + 1]; out[o + 2] = buf[so + 2]; out[o + 3] = buf[so + 3];
    }
  }
  return { buf: out, W: W * k, H: H * k };
}

/* ── cli ──────────────────────────────────────────────────────────────────────────────── */
function args(argv) {
  const o = { app: null, out: null, scale: 3, frames: null, seed: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") o.out = argv[++i];
    else if (a === "--scale") o.scale = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--frames") o.frames = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--seed") o.seed = Number(argv[++i]) >>> 0;       // Number() takes 0x… as written
    else if (!a.startsWith("-") && !o.app) o.app = a;
  }
  return o;
}

const opt = args(Deno.args);
const app = APPS[opt.app];
if (!app) {
  console.error(`usage: deno run -A tools/art/frame.mjs <${Object.keys(APPS).join("|")}> --out file.png [--frames N] [--scale N] [--seed 0xB21C]`);
  Deno.exit(2);
}
const out = opt.out ?? `${opt.app}.png`;
const N = opt.frames ?? app.frames;

const { E, s, p, seed, track, draw } = await app.build(opt.seed);
E.init(seed);

/* One pass draws the whole frame. No persistence pass: a `ghost()` that composited the previous
   frame under every mark once existed here, and it was the loudest single source of the
   see-through look this tool was built to find. */
const frame = () => { const { dl, n } = E.list(); draw(p, dl, n, E.state()); };
for (let i = 0; i < N; i++) E.step(track(i));
frame();

const up = upscale(s.buf, s.W, s.H, opt.scale);
await Deno.writeFile(out, await encodePNG(up.buf, up.W, up.H));

// A preview you cannot check is not evidence. Report what is actually in the buffer.
const seen = new Set();
for (let o = 0; o < s.buf.length; o += 4) seen.add((s.buf[o] << 16) | (s.buf[o + 1] << 8) | s.buf[o + 2]);
console.log(`${opt.app}: ${s.W}×${s.H} ×${opt.scale} → ${up.W}×${up.H}  seed 0x${seed.toString(16).toUpperCase()}  ${N} steps  ${seen.size} distinct colours  → ${out}`);
