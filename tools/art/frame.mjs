import { encodePNG } from "./png.mjs";

const HERE = new URL(".", import.meta.url);
const MAP = new URL("./frame.importmap.json", HERE);

if (!/\/(packages\/runtime|rt)\//.test(import.meta.resolve("/_rt/ui.js"))) {
  let mapHref = MAP.href;
  const rtDir = await Deno.stat(`${Deno.cwd()}/rt/index.js`).then(() => `${Deno.cwd()}/rt/`).catch(() => null);
  if (rtDir) {
    const m = JSON.parse(await Deno.readTextFile(MAP));
    m.imports["/_rt/"] = `file://${rtDir}`;
    const tmp = await Deno.makeTempFile({ suffix: ".importmap.json" });
    await Deno.writeTextFile(tmp, JSON.stringify(m));
    mapHref = `file://${tmp}`;
  }
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", `--import-map=${mapHref}`, new URL(import.meta.url).pathname, ...Deno.args],
    stdout: "inherit", stderr: "inherit",
  });
  Deno.exit((await cmd.output()).code);
}

function surface(W, H) {
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;

  const px = (o, r, g, b, a) => {
    if (a <= 0) return;
    if (a >= 1) { buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; return; }
    buf[o] = buf[o] * (1 - a) + r * a;
    buf[o + 1] = buf[o + 1] * (1 - a) + g * a;
    buf[o + 2] = buf[o + 2] * (1 - a) + b * a;
  };
  const rect = (x, y, w, h, [r, g, b], a = 1) => {
    const x0 = Math.round(x), y0 = Math.round(y);
    const x1 = x0 + Math.max(1, Math.round(w)), y1 = y0 + Math.max(1, Math.round(h));
    for (let yy = Math.max(0, y0); yy < Math.min(H, y1); yy++)
      for (let xx = Math.max(0, x0); xx < Math.min(W, x1); xx++) px((yy * W + xx) * 4, r, g, b, a);
  };
  return { buf, W, H, px, rect };
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

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

function huntPainter(s, rt, PAL, glyphRects, WORLD_INDEX) {
  const { SCRH, WORLD } = rt;
  const TRANSPARENT = 255;
  let sky0 = hex(WORLD.sky[0]), sky1 = hex(WORLD.sky[1]);
  const glyphInk = hex("#f0f0f5");

  return {
    keep() {},
    setWorld(colors) {
      for (const [k, idx] of Object.entries(WORLD_INDEX)) if (colors[k]) PAL[idx] = hex(colors[k]);
    },
    sky(top, bot) {
      if (top) sky0 = hex(top);
      if (bot) sky1 = hex(bot);
      for (let y = 0; y < s.H; y++) {
        const t = Math.min(1, (y + 0.5) / SCRH);
        const c = [0, 1, 2].map((i) => Math.round(sky0[i] + (sky1[i] - sky0[i]) * t));
        for (let x = 0; x < s.W; x++) s.px((y * s.W + x) * 4, c[0], c[1], c[2], 1);
      }
    },
    rect(x, y, w, h, idx, alpha = 1) { s.rect(x, y, w, h, PAL[idx] || [255, 0, 255], alpha); },
    shadow(x, y, w, h, alpha) { s.rect(x, y, w, h, [0, 0, 0], alpha); },
    cell(cell, ox, oy, { flip = false, alpha = 1, rim = null } = {}) {
      if (!cell.w) return;
      const src = flip ? flipCell(cell) : cell, x0 = Math.round(ox), y0 = Math.round(oy);
      const R = rim ? hex(rim.hex) : null;
      const at = (x, y) => (x < 0 || y < 0 || x >= cell.w || y >= cell.h) ? TRANSPARENT : src.px[y * cell.w + x];
      for (let y = 0; y < cell.h; y++) {
        const py = y0 + y;
        if (py < 0 || py >= s.H) continue;
        for (let x = 0; x < cell.w; x++) {
          const v = src.px[y * cell.w + x];
          if (v === TRANSPARENT) continue;
          const pxx = x0 + x;
          if (pxx < 0 || pxx >= s.W) continue;
          let c = PAL[v] || [255, 0, 255];
          if (R && (at(x, y - 1) === TRANSPARENT || at(x - 1, y) === TRANSPARENT)) {
            const a = rim.a;
            c = [c[0] + (R[0] - c[0]) * a, c[1] + (R[1] - c[1]) * a, c[2] + (R[2] - c[2]) * a];
          }
          s.px((py * s.W + pxx) * 4, c[0], c[1], c[2], alpha);
        }
      }
    },
    glyph(ch, ox, oy) { for (const [x, y] of glyphRects(ch)) s.rect(ox + x * 2, oy + y * 2, 2, 2, glyphInk, 1); },
  };
}

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
        track: (i) => rt.IN.RIGHT | ((i % 60) < 16 ? rt.IN.JUMP : 0) | ((i % 30) === 0 ? rt.IN.SHOOT : 0),
        p: huntPainter(s, rt, atlas.FULL.map(hex), render.glyphRects, atlas.WORLD_INDEX),
        draw: (p, dl, n, st, dist) => {
          let stc = st;
          if (dist != null) { stc = Int32Array.from(st); stc[rt.S.DIST] = dist; }
          render.renderFrame(p, dl, n, stc, { box: E.box });
        },
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

function args(argv) {
  const o = { app: null, out: null, scale: 3, frames: null, seed: null, dist: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") o.out = argv[++i];
    else if (a === "--scale") o.scale = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--frames") o.frames = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--seed") o.seed = Number(argv[++i]) >>> 0;
    else if (a === "--dist") o.dist = Math.max(0, parseInt(argv[++i], 10) || 0);
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

const frame = () => { const { dl, n } = E.list(); draw(p, dl, n, E.state(), opt.dist); };
for (let i = 0; i < N; i++) E.step(track(i));
frame();

const up = upscale(s.buf, s.W, s.H, opt.scale);
await Deno.writeFile(out, await encodePNG(up.buf, up.W, up.H));

const seen = new Set();
for (let o = 0; o < s.buf.length; o += 4) seen.add((s.buf[o] << 16) | (s.buf[o + 1] << 8) | s.buf[o + 2]);
console.log(`${opt.app}: ${s.W}×${s.H} ×${opt.scale} → ${up.W}×${up.H}  seed 0x${seed.toString(16).toUpperCase()}  ${N} steps  ${seen.size} distinct colours  → ${out}`);
