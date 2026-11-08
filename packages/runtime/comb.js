/* @ts-self-types="./comb.d.ts" */
/**
 * # runtime/comb.js — the honeycomb DISPLAY: a set of like things laid from the centre outward, on the GPU
 *
 * "мене задовбав скролл вниз … я хочу соти реальні, продумані. від центру наружу,
 * канвас … рівень канвасу. 60 fps" — and the next day: "ні одной фічі не втратити … більші картки, кластери,
 * слогани апок, зумування … якість преміум 4к". A page that scrolls down is a document; a set of apps or songs is
 * not a document, it is a FIELD. This module lays that field as a honeycomb that grows from the centre — ring
 * after ring, the first item in the middle, the next around it, every GROUP a contiguous territory — on one
 * full-screen canvas with no element per cell: the lattice, the camera, the inertia, the snap, the pinch and every
 * touch live in `comb.wasm` (a machine on {@link MachineStage}, ABI 1), the pixels in `comb.frag`, and this file is
 * the glue neither of them can be — it rasterises each item's form into ONE icon atlas and its name and line into
 * ONE text atlas at the density the screen asks for, hands them to the stage as `cam` and `tex2`, feeds the theme's
 * colours and the groups to the machine's memory, and turns the machine's HUD (the tap, the cell under the lens, the
 * cell the lens SETTLED on) back into calls on the app — and the app's own current item back into the lens.
 *
 * ![The comb: items → atlases (cam, tex2) + colours (buf) → the machine lays, moves, zooms, snaps → the shader draws](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-comb.svg)
 *
 * ## Import
 * ```js
 * import { Comb, MARK } from "/_rt/comb.js";                                       // an app's page
 * import { spiral, atlasPlan, COMB_MAX, LEVELS } from "@microspec/core/runtime/comb.js";   // a Deno test, a product rt/ module
 * ```
 *
 * ## What it exports
 * - {@link Comb} — the display: `{ items, groups, cell, focus, zoom, onOpen, onFocus, onSettle, onReady, top = 0,
 *   bottom = 0, zClass = "z-0" }`. `items` is the ordered set, GROUP-MAJOR, index 0 at the centre:
 *   `{ id, name, subtitle?, icon?, color?, mark?, form?, group? }` — `subtitle` the card's line (a slogan, a first
 *   sentence), `icon` a same-origin picture URL (null = the theme's material fills the form), `color` the halo's and
 *   the lit rim's — a palette name (`"accent"` · `"secondary"` · `"ink"`, resolved from the live theme) or a
 *   `#rrggbb` (default: the accent), `mark` from {@link MARK}, `form` a shape.js name (default `shapeOf(id)`),
 *   `group` an index into `groups` (`{ id, name, color }`, at most 28, colours the same way). `cell(item, i, mode)`
 *   renders ONE cell as DOM: the accessible twin behind the canvas (visually hidden, so a screen reader, the keyboard
 *   and the gate's e2e reach every item) and the visible fallback on the core's `.ms-comb` lattice wherever WebGL2 is
 *   not. `focus` is the app's CURRENT item id: when it changes, the lens eases to that cell (the host → the field);
 *   `onSettle(item, i)` fires when the lens comes to rest on a cell after a finger has moved the field (the field →
 *   the host: fonoteka plays that song); `onFocus(item, i)` follows the lens live; `onOpen(item, i)` is a tap inside
 *   a form. `zoom` asks a level (0 overview · 1 default · 2 cards), the same levels a pinch snaps to.
 * - {@link spiral} — `(n) → [[q, r], …]`, the one-group lattice, the machine's own walk (the JS twin the tests hold it to).
 * - {@link atlasPlan} — `(n, size, aspect, want) → { cols, rows, tileW, tileH, size }` the tile grid for `n` tiles.
 * - {@link MARK}, {@link COMB_MAX} (217 — eight rings), {@link LEVELS} (0.8 · 1 · 1.35), {@link PARAM} (the `set` indices).
 *
 * ## The contract
 * - The lattice is pointy-top hexagonal, stretched 1.3× vertically so a name fits under a form; the pitch is
 *   `clamp(min(W, H) / 4.2, 84, 120)` CSS px × the zoom — the machine decides, the shader obeys. Index 0 sits under
 *   the LENS (between the header, the app's `top`, the dock and the app's `bottom` — an island's `--island-h` is
 *   read too); a lens of +15% grows the centre. One finger drags the world; a release flings it and it settles on
 *   the nearest cell exactly; past the field's edge a rubber band. Two fingers zoom about their midpoint; on release
 *   the zoom eases to the nearest level — at the cards level the rows unfold so every cell shows its line.
 * - Groups are territories: a group's first cell anchors at the first free site of the spiral, its others take the
 *   nearest free site to that anchor; every cell's hexagon is tinted with its group's colour, faintly, so the
 *   borders between groups read; at the overview the group's name lies across its territory.
 * - Colours come from the THEME, never from here: `--app-accent`, `--color-secondary`, `--color-base-content`,
 *   `--color-base-200` are resolved to sRGB on every theme change and written to the machine's palette, and a form
 *   with no picture takes the theme's material (`--ds-fill`). Text is set in the page's font.
 * - Two atlases: icons at the source's own 256 px (512 for a small set), so the form at the centre is never
 *   magnified; names and lines on a separate atlas sized by the screen (`0.9 × pitch × 1.15 × dpr`, 4096² where the
 *   GPU allows) with mipmaps, so the type is crisp at every zoom. The icon atlas uploads progressively (names
 *   first, at most two more uploads), the text atlas once per locale.
 * - `data-comb` on the wrapper: `gl` or `dom`; `data-comb-focus` the item under the lens, `data-comb-group` its
 *   group's id, `data-comb-zoom` the level, `data-comb-ready` once the machine runs.
 *
 * ## Why
 * Every set of like things in the farm wanted the same thing — the comb — and a CSS lattice could only ever be a
 * grid wearing a costume: it scrolls, it reflows, it has no centre and no zoom. Here the comb is a display in its
 * own right, written once; an app brings items, groups and a cell, and gets the field — with nothing it had lost.
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
/** The zoom levels a pinch snaps to: overview · default · cards. */
export const LEVELS = Object.freeze([0.8, 1, 1.35]);
/** The machine's `set(i, v)` indices; a cell's colour is `colour + i` (0xRRGGBB), its mark `mark + i`, its group `group + i`; a group's colour `groupColour + g`. */
export const PARAM = Object.freeze({ count: 0, top: 1, bottom: 2, width: 3, height: 4, still: 5, iconCols: 6, iconTile: 7, textCols: 8, textTileW: 9, textTileH: 10, pulse: 11, iconAtlas: 12, textAtlas: 13, zoom: 14, goal: 15, colour: 16, mark: 256, group: 512, groupColour: 768 });
/** A cell's mark bits: a dot for new/updated, `lit` for the one that plays. */
export const MARK = Object.freeze({ none: 0, new: 1, updated: 2, lit: 4 });
const PAL = { accent: 28, accent2: 29, ink: 30, ground: 31 };
const GROUPS_MAX = 28;

const DQ = [1, 0, -1, -1, 0, 1], DR = [0, 1, 1, 0, -1, -1];
/**
 * The axial coordinates of the first `n` cells of ONE group, the way the machine lays them: the centre, then every
 * ring clockwise from its top-left cell.
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

/**
 * A tile grid for `n` tiles of aspect `aspect` (height / width) in a square atlas: as many columns as the square
 * root asks, widened until the rows fit; a tile is never wider than `want` (the screen's need) nor than the atlas allows.
 * @param n how many tiles
 * @param size the atlas side in device px
 * @param aspect tile height / width
 * @param want the widest tile wanted
 * @returns `{ cols, rows, tileW, tileH, size }`
 */
export function atlasPlan(n, size = 2048, aspect = 1.047, want = 512) {
  const count = Math.max(1, Math.min(256, n | 0));
  let cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  for (;;) {
    const tileW = Math.max(1, Math.min(want, Math.floor(size / cols))), tileH = Math.floor(tileW * aspect), rows = Math.ceil(count / cols);
    if (rows * tileH <= size || cols >= count) return { cols, rows, tileW, tileH, size };
    cols++;
  }
}

/** `#rrggbb` → the packed integer the machine's tables take. */
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
let swatch = null;
function cssRgb(value, fallback) {
  try {
    if (!swatch) { const c = document.createElement("canvas"); c.width = c.height = 1; swatch = c.getContext("2d", { willReadFrequently: true }); }
    if (!swatch) return fallback;
    swatch.clearRect(0, 0, 1, 1);
    swatch.fillStyle = "#000"; swatch.fillStyle = value;
    if (swatch.fillStyle === "#000000" && !/^#?0{3,6}$|black/i.test(value)) return fallback;
    swatch.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data;
    return a ? (r << 16) | (g << 8) | b : fallback;
  } catch { return fallback; }
}
function themePalette() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const v = (n) => (root ? getComputedStyle(root).getPropertyValue(n).trim() : "");
  const light = root?.getAttribute("data-theme")?.endsWith("-light");
  return {
    accent: cssRgb(v("--app-accent") || "#F2B84B", 0xf2b84b),
    accent2: cssRgb(v("--color-secondary") || v("--app-accent-2") || "#5CE4DC", 0x5ce4dc),
    ink: cssRgb(v("--color-base-content") || (light ? "#111" : "#F2EEE6"), light ? 0x111111 : 0xf2eee6),
    ground: cssRgb(v("--color-base-200") || (light ? "#F6F4EE" : "#000"), light ? 0xf6f4ee : 0x000000),
    fill: (() => { const m = /url\(["']?([^"')]+)["']?\)/.exec(v("--ds-fill") || v("--ds-scatter") || ""); return m ? m[1] : ""; })(),
  };
}
let maxTexCache = 0;
function maxTex() {
  if (maxTexCache) return maxTexCache;
  try { const gl = document.createElement("canvas").getContext("webgl2"); maxTexCache = gl ? Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0) : 2048; gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { maxTexCache = 2048; }
  return maxTexCache || 2048;
}
const pitchOf = (w, h) => Math.max(84, Math.min(120, Math.min(w, h) / 4.2));

function wrap(ctx, text, width, maxLines) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const all = lines.join(" ").length >= String(text || "").trim().length;
  const clip = (s) => { while (s.length > 1 && ctx.measureText(s + "…").width > width) s = s.slice(0, -1); return s + "…"; };
  return lines.slice(0, maxLines).map((l, i) => (ctx.measureText(l).width > width || (i === maxLines - 1 && !all) ? clip(l) : l));
}

const ICON = 0.86, NAME_H = 0.314, NAME_FONT = 0.133, LINE_TOP = 0.33, LINE_H = 0.42, LINE_FONT = 0.105, TEXT_ASPECT = 0.75;
const FONT = "Geist, ui-sans-serif, system-ui, sans-serif", MONO = "'Geist Mono', ui-monospace, monospace";

/**
 * The ICON atlas: every item's picture through its own organic form on a black ground (or the theme's material when
 * it has none), progressively — the forms first, then pictures as they land, at most three uploads.
 * @param items the comb's items
 * @param plan `{ cols, tileW, size }` from {@link atlasPlan} (square tiles)
 * @param publish `(bitmap) => void`
 * @param fill the theme's material URL for a form without a picture, or ""
 * @returns `() => void` stop
 */
export function buildIcons(items, plan, publish, fill = "") {
  let alive = true, pending = 0, timer = 0, mid = 0;
  const cv = document.createElement("canvas");
  cv.width = cv.height = plan.size;
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  const side = ICON * plan.tileW, pad = (plan.tileW - side) / 2;
  const originOf = (i) => [(i % plan.cols) * plan.tileW + pad, Math.floor(i / plan.cols) * plan.tileW + pad];
  const push = async () => { if (!alive) return; try { const bmp = await createImageBitmap(cv); if (alive) publish(bmp); } catch { if (alive) publish(cv); } };
  const later = () => { if (mid || timer) return; timer = setTimeout(() => { timer = 0; mid = 1; push(); }, 700); };
  let material = null;
  const form = (i, it, img) => {
    const [ox, oy] = originOf(i);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(side, side);
    ctx.clip(new Path2D(pathOf(it.form || shapeOf(it.id))));
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1, 1);
    if (img) ctx.drawImage(img, 0, 0, 1, 1);
    else if (material) { const s = Math.max(1 / material.width, 1 / material.height) * 1.25; ctx.drawImage(material, 0.5 - material.width * s / 2, 0.5 - material.height * s / 2, material.width * s, material.height * s); }
    ctx.restore();
  };
  const load = (src) => new Promise((res) => { const im = new Image(); im.decoding = "async"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const start = async () => {
    if (fill) material = await load(fill);
    if (!alive) return;
    items.forEach((it, i) => form(i, it, null));
    push();
    items.forEach((it, i) => {
      if (!it.icon) return;
      pending++;
      load(it.icon).then((img) => { if (!alive) return; if (img) form(i, it, img); if (--pending === 0) push(); else later(); });
    });
  };
  start();
  return () => { alive = false; if (timer) clearTimeout(timer); };
}

/**
 * The TEXT atlas: every item's name (two lines) and line (three), and every group's caption, white on transparent,
 * in the page's font at the density the screen asks for; published once as a blob URL (the stage mipmaps it).
 * @param items the comb's items
 * @param groups the comb's groups
 * @param plan from {@link atlasPlan} with the text aspect
 * @param publish `(url) => void`
 * @returns `() => void` stop
 */
export function buildText(items, groups, plan, publish) {
  let alive = true, url = "";
  const cv = document.createElement("canvas");
  cv.width = cv.height = plan.size;
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const W = plan.tileW, originOf = (i) => [(i % plan.cols) * W, Math.floor(i / plan.cols) * plan.tileH];
  const draw = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#fff";
    items.forEach((it, i) => {
      const [ox, oy] = originOf(i);
      ctx.font = `600 ${NAME_FONT * W}px ${FONT}`;
      wrap(ctx, it.name, W * 0.94, 2).forEach((l, k) => ctx.fillText(l, ox + W / 2, oy + k * NAME_FONT * W * 1.18 + NAME_FONT * W * 0.08));
      if (it.subtitle) {
        ctx.font = `500 ${LINE_FONT * W}px ${FONT}`;
        wrap(ctx, it.subtitle, W * 0.94, 3).forEach((l, k) => ctx.fillText(l, ox + W / 2, oy + LINE_TOP * W + k * LINE_FONT * W * 1.25));
      }
    });
    groups.forEach((g, k) => {
      const [ox, oy] = originOf(items.length + k);
      const word = String(g.name || "").toUpperCase();
      let px = 0.12 * W;
      try { ctx.letterSpacing = `${0.012 * W}px`; } catch { }
      for (;;) { ctx.font = `600 ${px}px ${MONO}`; if (ctx.measureText(word).width <= W * 0.9 || px < 0.05 * W) break; px *= 0.92; }
      ctx.fillText(word, ox + W / 2, oy + NAME_H * W * 0.5 - px * 0.55);
      try { ctx.letterSpacing = "0px"; } catch { }
    });
    cv.toBlob((b) => { if (!alive || !b) return; url = URL.createObjectURL(b); publish(url); }, "image/png");
  };
  const ready = typeof document !== "undefined" && document.fonts?.load
    ? Promise.race([Promise.all([document.fonts.load(`600 16px Geist`), document.fonts.load(`600 16px 'Geist Mono'`)]), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();
  ready.then(draw, draw);
  return () => { alive = false; if (url) setTimeout(() => URL.revokeObjectURL(url), 5000); };
}

const WASM = () => new URL("../_rt/comb.wasm", document.baseURI);
const FRAG = () => new URL("../_rt/comb.frag", document.baseURI);
const stillNow = () => gate || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
const iconCols = (n) => (n <= 16 ? 4 : n <= 64 ? 8 : 16);

/**
 * The honeycomb display: the items from the centre outward on the GPU, their accessible twin behind it, the core's
 * CSS lattice where WebGL2 is not.
 * @param props see the module note
 * @returns the stage, the twin (or the fallback lattice)
 */
export function Comb({ items = [], groups = [], cell, focus, zoom, onOpen, onFocus, onSettle, onReady: onApi, top = 0, bottom = 0, zClass = "z-0" }) {
  const gl = useMemo(() => (typeof document !== "undefined" ? hasWebGL2() : false), []);
  const [mode, setMode] = useState(gl ? "gl" : "dom");
  const [focusId, setFocusId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [level, setLevel] = useState(1);
  const [size, setSize] = useState(() => [globalThis.innerWidth || 384, globalThis.innerHeight || 832]);
  const m = useRef({ api: null, icons: null, text: "", stopIcons: null, stopText: null, focusSeq: 0, tapSeq: 0, settleSeq: 0, goal: -1, sent: new Map(), items, groups, onOpen, onFocus, onSettle }).current;
  m.items = items; m.groups = groups; m.onOpen = onOpen; m.onFocus = onFocus; m.onSettle = onSettle;
  const dpr = typeof devicePixelRatio === "number" ? Math.min(4, devicePixelRatio) : 2;
  const texMax = useMemo(() => (mode === "gl" ? maxTex() : 2048), [mode]);
  const want = Math.ceil(0.9 * pitchOf(size[0], size[1]) * LEVELS[2] * dpr);
  const iconPlan = useMemo(() => { const cols = iconCols(items.length), tileW = Math.min(512, Math.floor(texMax / cols)); return { cols, rows: Math.max(1, Math.ceil(items.length / cols)), tileW, tileH: tileW, size: cols * tileW }; }, [items.length, texMax]);
  const textPlan = useMemo(() => atlasPlan(items.length + groups.length, Math.min(4096, texMax), TEXT_ASPECT, want), [items.length, groups.length, texMax, want]);
  const renderCell = cell || ((it, i) => html`<button key=${it.id} data-cell=${it.id} aria-label=${it.name} onClick=${() => onOpen?.(it, i)}>${it.name}</button>`);

  useEffect(() => {
    if (mode !== "gl") return;
    const onResize = () => setSize([globalThis.innerWidth || 384, globalThis.innerHeight || 832]);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, [mode]);

  const [pal, setPal] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (mode !== "gl") return;
    const read = () => { setPal(themePalette()); setTick((n) => n + 1); };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-material", "style"] });
    return () => mo.disconnect();
  }, [mode]);
  const colourOf = (c, fallback) => (c === "accent" ? pal?.accent : c === "secondary" ? pal?.accent2 : c === "ink" ? pal?.ink : c ? rgbOf(c) : fallback) ?? fallback;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const api = m.api; if (!api || !pal) return;
    try { api.exports.set(PARAM.groupColour + PAL.accent, pal.accent); api.exports.set(PARAM.groupColour + PAL.accent2, pal.accent2); api.exports.set(PARAM.groupColour + PAL.ink, pal.ink); api.exports.set(PARAM.groupColour + PAL.ground, pal.ground); } catch { }
  }, [pal, ready]);

  useEffect(() => {
    const api = m.api; if (!api || !pal) return;
    items.forEach((it, i) => {
      const colour = colourOf(it.color, pal.accent);
      const key = `${colour}|${it.mark | 0}|${it.group | 0}`;
      if (m.sent.get(i) === key) return;
      m.sent.set(i, key);
      try { api.exports.set(PARAM.colour + i, colour); api.exports.set(PARAM.mark + i, it.mark | 0); api.exports.set(PARAM.group + i, Math.min(GROUPS_MAX - 1, it.group | 0)); } catch { }
    });
    groups.slice(0, GROUPS_MAX).forEach((g, k) => {
      const colour = colourOf(g.color, pal.accent);
      const key = `g${colour}`;
      if (m.sent.get(`g${k}`) === key) return;
      m.sent.set(`g${k}`, key);
      try { api.exports.set(PARAM.groupColour + k, colour); } catch { }
    });
  }, [items, groups, pal, ready]);

  const iconKey = items.map((it) => `${it.id}|${it.icon || ""}|${it.form || ""}`).join("\n") + `|${iconPlan.tileW}|${pal?.fill || ""}`;
  useEffect(() => {
    if (mode !== "gl" || !ready || !pal) return;
    m.stopIcons?.();
    m.stopIcons = buildIcons(items, iconPlan, (bmp) => { m.icons = bmp; }, pal.fill);
    return () => { m.stopIcons?.(); m.stopIcons = null; };
  }, [iconKey, mode, ready, !!pal]);
  const textKey = items.map((it) => `${it.id}|${it.name}|${it.subtitle || ""}`).join("\n") + "\n" + groups.map((g) => g.name).join("|") + `|${textPlan.tileW}`;
  useEffect(() => {
    if (mode !== "gl" || !ready) return;
    m.stopText?.();
    m.stopText = buildText(items, groups, textPlan, (url) => setText(url));
    return () => { m.stopText?.(); m.stopText = null; };
  }, [textKey, mode, ready]);
  const [text, setText] = useState("");

  useEffect(() => {
    const api = m.api; if (!api || focus == null) return;
    const idx = items.findIndex((it) => it.id === focus);
    if (idx < 0 || idx === m.lastFocus) return;
    m.goal = idx;
    try { api.exports.set(PARAM.goal, idx); } catch { }
  }, [focus, ready, items.length]);
  useEffect(() => { const api = m.api; if (!api || zoom == null) return; try { api.exports.set(PARAM.zoom, zoom | 0); } catch { } }, [zoom, ready]);

  const onReady = (api) => { m.api = api; setReady(true); onApi?.(api); };
  const onState = (s) => { if (s === "failed" || s === "none") setMode("dom"); };
  const onHud = (hud) => {
    if (hud[3] !== m.tapSeq) { m.tapSeq = hud[3]; const it = m.items[hud[2]]; if (it) m.onOpen?.(it, hud[2]); }
    if (hud[1] !== m.focusSeq) {
      m.focusSeq = hud[1]; m.lastFocus = hud[0];
      const it = m.items[hud[0]];
      setFocusId(it ? String(it.id) : "");
      const g = hud[12] >= 0 ? m.groups[hud[12]] : null; setGroupId(g ? String(g.id) : "");
      if (it) m.onFocus?.(it, hud[0]);
    }
    if (hud[8] !== m.settleSeq) { m.settleSeq = hud[8]; const it = m.items[hud[7]]; if (it) m.onSettle?.(it, hud[7]); }
    const lv = hud[13] < 900 ? 0 : hud[13] < 1175 ? 1 : 2; if (lv !== level) setLevel(lv);
  };
  if (mode === "dom") {
    return html`<div data-comb="dom" class="ms-comb"><div class="ms-comb-cells ms-comb-lg">${items.map((it, i) => renderCell(it, i, "dom"))}</div></div>`;
  }
  const params = [items.length, top + cssPx("--hdr-h") + cssPx("--ms-safe-top"), bottom + cssPx("--dock-h") + cssPx("--island-h"), size[0], size[1], stillNow() ? 1 : 0,
    iconPlan.cols, iconPlan.tileW, textPlan.cols, textPlan.tileW, textPlan.tileH, 0, iconPlan.size, textPlan.size];
  return html`<div data-comb="gl" data-comb-ready=${ready ? "1" : null} data-comb-focus=${focusId || null} data-comb-group=${groupId || null} data-comb-zoom=${level} class="contents">
    <${MachineStage} wasm=${WASM()} shader=${FRAG()} seed=${0.37} cells=${1} params=${params} cam=${() => m.icons} tex2=${text || null} onReady=${onReady} onState=${onState} onHud=${onHud} hudHz=${60} zClass=${zClass} />
    <div data-comb-twin class="sr-only">${items.map((it, i) => renderCell(it, i, "gl"))}</div>
  </div>`;
}
