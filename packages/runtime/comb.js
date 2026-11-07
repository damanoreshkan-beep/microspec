/* @ts-self-types="./comb.d.ts" */
/**
 * # runtime/comb.js — the honeycomb DISPLAY: a set of like things laid from the centre outward, on the GPU
 *
 * "мене задовбав скролл вниз … я хочу соти реальні, продумані. від центру наружу,
 * канвас … рівень канвасу. 60 fps." A page that scrolls down is a document; a set of apps or songs is not a
 * document, it is a field. This module lays that field as a honeycomb that grows from the centre — ring after
 * ring, the first item in the middle, the next six around it — on one full-screen canvas, with no element per
 * cell: the lattice, the camera, the inertia, the snap and every touch live in `comb.wasm` (a machine on
 * {@link MachineStage}, ABI 1), the pixels in `comb.frag`, and this file is the glue neither of them can be — it
 * rasterises each item's form and name into ONE atlas, hands it to the stage as the `cam` picture, and turns the
 * machine's HUD (which cell was tapped, which sits under the lens) back into calls on the app.
 *
 * ![The comb: items → atlas (cam) + colours (buf) → the machine lays, moves, snaps → the shader draws](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-comb.svg)
 *
 * ## Import
 * ```js
 * import { Comb } from "/_rt/comb.js";                               // an app's page
 * import { spiral, atlasPlan, COMB_MAX } from "@microspec/core/runtime/comb.js";   // a Deno test, a product rt/ module
 * ```
 *
 * ## What it exports
 * - {@link Comb} — the display: `{ items, cell, onOpen, onFocus, top = 0, bottom = 0, zClass = "z-0" }`. `items` is the
 *   ordered set, index 0 at the centre, then clockwise rings: `{ id, name, icon?, color?, mark?, form? }` — `icon` a
 *   same-origin picture URL (null = the item's colour fills its form), `color` a `#rrggbb` the halo and the lit rim
 *   take, `mark` from {@link MARK} (`new` an amber dot, `updated` a cyan one, `lit` a glowing rim — the song that
 *   plays), `form` one of shape.js's names (default `shapeOf(id)`). `cell(item, i)` renders ONE cell as DOM: it is the
 *   accessible twin behind the canvas (visually hidden, so a screen reader, the keyboard and the gate's e2e reach
 *   every item), and it is the visible fallback — the core's `.ms-comb` lattice — wherever WebGL2 is not. `onOpen(item,
 *   i)` fires on a tap inside a form, `onFocus(item, i)` when the cell under the lens changes. `top`/`bottom` are extra
 *   CSS px the app's own chrome takes (an island, a strip); the header and the dock are read from `--hdr-h`/`--dock-h`.
 *   `onReady(api)` hands the machine's api up, for a value the app drives every frame without a render — fonoteka
 *   sets `PARAM.pulse` (0..1, the song's bass envelope at the audio clock) and the lit cell breathes with it.
 * - {@link spiral} — `(n) → [[q, r], …]` the axial coordinates of the first `n` cells, the machine's own walk (the JS
 *   twin the tests hold it to).
 * - {@link atlasPlan} — `(n, size = 2048) → { cols, rows, tileW, tileH, size }` the tile grid that holds `n` items.
 * - {@link MARK}, {@link COMB_MAX} (217 — eight rings), {@link PARAM} (the machine's `set` indices).
 *
 * ## The contract
 * - The lattice is pointy-top hexagonal, stretched 1.3× vertically so a name fits under a form; the pitch is
 *   `clamp(min(W, H) / 4.2, 84, 120)` CSS px — the machine decides, the shader obeys. Index 0 sits under the LENS
 *   (the point between the header and the dock); a lens of +15% grows the centre, so what is dragged to the middle
 *   comes forward. One finger drags the world; a release flings it and it settles on the nearest cell exactly; past
 *   the comb's edge a rubber band pulls it back. A tap inside a form is `onOpen`; a moved finger is never a tap.
 * - The atlas is drawn in this document, from the items' pictures: 2048² max, one tile an item, the form clipped by
 *   its organic path with a black ground (the art is made on black), the name set in the page's font, white, two lines
 *   at most. It uploads progressively (a new ImageBitmap every ~200 ms while pictures land), so the names and forms
 *   appear within the first frames and the art fills in.
 * - `data-comb` on the wrapper reports `gl` (the stage runs) or `dom` (the fallback lattice); `data-comb-focus` the
 *   focused item's id. The twin's buttons carry whatever `cell` gives them.
 * - Reduced motion and the gate make the arrival instant (`still`); nothing moves at rest.
 *
 * ## Why
 * Every set of like things in the farm wanted the same thing — the comb — and a CSS lattice could only ever be a
 * grid wearing a costume: it scrolls, it reflows, it has no centre. Here the comb is a display in its own right,
 * written once; an app brings items and a cell, and gets the field.
 *
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { MachineStage } from "./machine.js";
import { hasWebGL2 } from "./glstage.js";
import { pathOf, shapeOf } from "./shape.js";
import { gate } from "./gate.js";

/** Eight rings — 1 + 6 + 12 + … + 48 cells; the machine's site map is 17 × 17. */
export const COMB_MAX = 217;
/** The machine's `set(i, v)` indices for its parameters; a cell's colour is `16 + i` (packed 0xRRGGBB), its mark `256 + i`. */
export const PARAM = Object.freeze({ count: 0, top: 1, bottom: 2, width: 3, height: 4, still: 5, cols: 6, rows: 7, tileW: 8, tileH: 9, atlas: 10, pulse: 11, colour: 16, mark: 256 });
/** A cell's mark bits: a dot for new/updated, `lit` for the one that plays. */
export const MARK = Object.freeze({ none: 0, new: 1, updated: 2, lit: 4 });

const DQ = [1, 0, -1, -1, 0, 1], DR = [0, 1, 1, 0, -1, -1];
/**
 * The axial coordinates of the first `n` cells, the way the machine lays them: the centre, then every ring clockwise
 * from its top-left cell.
 * @param n how many cells
 * @returns `[[q, r], …]` of length `min(n, COMB_MAX)`
 */
export function spiral(n) {
  const out = [], total = Math.max(0, Math.min(COMB_MAX, n | 0));
  if (total) out.push([0, 0]);
  let k = 1, q = 0, r = -1, side = 0, step = 0;
  while (out.length < total) {
    out.push([q, r]);
    q += DQ[side]; r += DR[side];
    if (++step === k) { step = 0; if (++side === 6) { side = 0; k++; q = 0; r = -k; } }
  }
  return out;
}

const ICON = 0.689, FORM = 0.31, GAP = 0.04, STRIP = 0.314, TILE_H = 1.047, FONT = 0.133, LINE = 1.18;
/**
 * The atlas grid for `n` items: as many columns as the square root asks, widened until the rows fit the size.
 * @param n how many items
 * @param size the atlas side in device px (2048 is safe on every WebGL2 device)
 * @param max the widest tile wanted — a comb of three songs does not need 1024-px tiles
 * @returns `{ cols, rows, tileW, tileH, size }`
 */
export function atlasPlan(n, size = 2048, max = 512) {
  const count = Math.max(1, Math.min(COMB_MAX, n | 0));
  let cols = Math.max(1, Math.ceil(Math.sqrt(count * TILE_H)));
  for (;;) {
    const tileW = Math.min(max, Math.floor(size / cols)), tileH = Math.floor(tileW * TILE_H), rows = Math.ceil(count / cols);
    if (rows * tileH <= size || cols >= count) return { cols, rows, tileW, tileH, size };
    cols++;
  }
}

/** `#rrggbb` → the packed integer the machine's cell table takes. */
export function rgbOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  return m ? parseInt(m[1], 16) : 0x8a8a8a;
}

function cssPx(name) {
  try {
    const root = document.documentElement, v = getComputedStyle(root).getPropertyValue(name).trim();
    if (!v) return 0;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return v.endsWith("rem") ? n * (parseFloat(getComputedStyle(root).fontSize) || 16) : n;
  } catch { return 0; }
}

function wrap(ctx, text, width) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else { lines.push(cur); cur = w; if (lines.length === 2) break; }
  }
  if (lines.length < 2 && cur) lines.push(cur);
  if (lines.length > 2) lines.length = 2;
  const clip = (s) => { while (s.length > 1 && ctx.measureText(s + "…").width > width) s = s.slice(0, -1); return s + "…"; };
  return lines.map((l, i) => (ctx.measureText(l).width > width ? clip(l) : (i === 1 && words.length && !lines.join(" ").endsWith(words[words.length - 1]) ? clip(l) : l)));
}

/**
 * Rasterise the items into one atlas canvas: names first (so the field reads at once), then every picture as it
 * lands, publishing a fresh ImageBitmap through `publish` while it grows. Browser only; returns a stop function.
 * @param items the comb's items
 * @param plan from {@link atlasPlan}
 * @param publish `(bitmap) => void` — called with each new picture of the atlas
 * @param font the CSS font family the names are set in
 * @returns `() => void` stop
 */
export function buildAtlas(items, plan, publish, font = "Geist, ui-sans-serif, system-ui, sans-serif") {
  let alive = true, pending = 0, timer = 0;
  const cv = document.createElement("canvas");
  cv.width = cv.height = plan.size;
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const { cols, tileW, tileH } = plan, side = ICON * tileW, gap = (GAP / (2 * FORM)) * side, fontPx = FONT * tileW;
  const originOf = (i) => [(i % cols) * tileW, Math.floor(i / cols) * tileH];
  const push = async () => {
    if (!alive) return;
    try { const bmp = await createImageBitmap(cv); if (alive) publish(bmp); } catch { if (alive) publish(cv); }
  };
  const later = () => { if (!timer) timer = setTimeout(() => { timer = 0; push(); }, 200); };
  const names = () => {
    ctx.font = `600 ${fontPx}px ${font}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#fff";
    items.forEach((it, i) => {
      const [ox, oy] = originOf(i);
      const lines = wrap(ctx, it.name, tileW * 0.94);
      lines.forEach((l, k) => ctx.fillText(l, ox + tileW / 2, oy + side + gap + k * fontPx * LINE + fontPx * 0.09));
    });
  };
  const form = (i, it, img) => {
    const [ox, oy] = originOf(i);
    ctx.save();
    ctx.translate(ox + (tileW - side) / 2, oy);
    ctx.scale(side, side);
    ctx.clip(new Path2D(pathOf(it.form || shapeOf(it.id))));
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1, 1);
    if (img) ctx.drawImage(img, 0, 0, 1, 1);
    else {
      const g = ctx.createRadialGradient(0.5, 0.42, 0.05, 0.5, 0.5, 0.6);
      g.addColorStop(0, `${it.color || "#8a8a8a"}cc`); g.addColorStop(1, `${it.color || "#8a8a8a"}22`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1, 1);
    }
    ctx.restore();
  };
  const pictures = () => {
    items.forEach((it, i) => {
      if (!it.icon) { form(i, it, null); return; }
      pending++;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { if (!alive) return; form(i, it, img); if (--pending === 0) push(); else later(); };
      img.onerror = () => { if (!alive) return; form(i, it, null); if (--pending === 0) push(); else later(); };
      img.src = it.icon;
    });
    if (!pending) push();
  };
  const start = () => { if (!alive) return; names(); push(); pictures(); };
  const ready = typeof document !== "undefined" && document.fonts?.load ? Promise.race([document.fonts.load(`600 16px ${font.split(",")[0]}`), new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve();
  ready.then(start, start);
  return () => { alive = false; if (timer) clearTimeout(timer); };
}

const WASM = () => new URL("../_rt/comb.wasm", document.baseURI);
const FRAG = () => new URL("../_rt/comb.frag", document.baseURI);
const stillNow = () => gate || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * The honeycomb display: the items from the centre outward on the GPU, their accessible twin behind it, the core's
 * CSS lattice where WebGL2 is not.
 * @param props see the module note
 * @returns the stage, the twin (or the fallback lattice)
 */
export function Comb({ items = [], cell, onOpen, onFocus, onReady: onApi, top = 0, bottom = 0, zClass = "z-0" }) {
  const gl = useMemo(() => (typeof document !== "undefined" ? hasWebGL2() : false), []);
  const [mode, setMode] = useState(gl ? "gl" : "dom");
  const [focusId, setFocusId] = useState("");
  const [size, setSize] = useState(() => [globalThis.innerWidth || 384, globalThis.innerHeight || 832]);
  const m = useRef({ api: null, atlas: null, stop: null, focusSeq: 0, tapSeq: 0, sent: new Map(), items, onOpen, onFocus }).current;
  m.items = items; m.onOpen = onOpen; m.onFocus = onFocus;
  const plan = useMemo(() => atlasPlan(items.length), [items.length]);
  const renderCell = cell || ((it, i) => html`<button key=${it.id} data-cell=${it.id} aria-label=${it.name} onClick=${() => onOpen?.(it, i)}>${it.name}</button>`);

  useEffect(() => {
    if (mode !== "gl") return;
    const onResize = () => setSize([globalThis.innerWidth || 384, globalThis.innerHeight || 832]);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, [mode]);

  useEffect(() => {
    const api = m.api;
    if (!api) return;
    items.forEach((it, i) => {
      const key = `${rgbOf(it.color)}|${it.mark | 0}`;
      if (m.sent.get(i) === key) return;
      m.sent.set(i, key);
      try { api.exports.set(PARAM.colour + i, rgbOf(it.color)); api.exports.set(PARAM.mark + i, it.mark | 0); } catch { }
    });
  }, [items, mode]);
  const ids = items.map((it) => `${it.id}|${it.icon || ""}|${it.name}`).join("\n");
  useEffect(() => {
    if (mode !== "gl" || !m.api) return;
    m.stop?.(); m.sent.clear();
    m.stop = buildAtlas(items, plan, (bmp) => { m.atlas = bmp; });
    items.forEach((it, i) => { try { m.api.exports.set(PARAM.colour + i, rgbOf(it.color)); m.api.exports.set(PARAM.mark + i, it.mark | 0); m.sent.set(i, `${rgbOf(it.color)}|${it.mark | 0}`); } catch { } });
    return () => { m.stop?.(); m.stop = null; };
  }, [ids, mode, !!m.api]);

  const [ready, setReady] = useState(false);
  const onReady = (api) => { m.api = api; setReady(true); onApi?.(api); };
  const onState = (s) => { if (s === "failed" || s === "none") setMode("dom"); };
  const onHud = (hud) => {
    if (hud[3] !== m.tapSeq) { m.tapSeq = hud[3]; const it = m.items[hud[2]]; if (it) m.onOpen?.(it, hud[2]); }
    if (hud[1] !== m.focusSeq) { m.focusSeq = hud[1]; const it = m.items[hud[0]]; setFocusId(it ? String(it.id) : ""); if (it) m.onFocus?.(it, hud[0]); }
  };
  if (mode === "dom") {
    return html`<div data-comb="dom" class="ms-comb"><div class="ms-comb-cells ms-comb-lg">${items.map((it, i) => renderCell(it, i, "dom"))}</div></div>`;
  }
  const params = [items.length, top + cssPx("--hdr-h") + cssPx("--ms-safe-top"), bottom + cssPx("--dock-h"), size[0], size[1], stillNow() ? 1 : 0, plan.cols, plan.rows, plan.tileW, plan.tileH, plan.size];
  return html`<div data-comb="gl" data-comb-ready=${ready ? "1" : null} data-comb-focus=${focusId || null} class="contents">
    <${MachineStage} wasm=${WASM()} shader=${FRAG()} seed=${0.37} cells=${1} params=${params} cam=${() => m.atlas} onReady=${onReady} onState=${onState} onHud=${onHud} hudHz=${60} zClass=${zClass} />
    <div data-comb-twin class="sr-only">${items.map((it, i) => renderCell(it, i, "gl"))}</div>
  </div>`;
}
