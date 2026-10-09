/* @ts-self-types="./shape.d.ts" */
/**
 * # runtime/shape.js — free forms instead of boxes, and the morph between them
 *
 * Every surface in the farm was a rounded rectangle until this module. The forms here are the 35 Material 3
 * Expressive shapes (cookies, clovers, suns, a flower, a puffy cloud …) from Google's AndroidX graphics-shapes
 * geometry, vendored as `./shapes.vendor.js`, and the corner-matched Morph that turns one into another. What
 * lives here is what an app should not decide on its own: WHICH forms are the farm's organic set, how a thing
 * (a song, a station, a person) gets the same form on every phone, how a unit-box path is laid onto a box of
 * pixels, and how a morph runs — on a strong ease-in-out, interruptible without a jump, and instant under
 * reduced motion or in the gate.
 *
 * Every path is SVG path data in a 0..1 box, so it drops into `<svg viewBox="0 0 1 1"><path d>` as is, and
 * into `clip-path: path()` once `scalePath` has laid it onto the element's pixels.
 *
 * ## Import
 * ```js
 * import { shapeOf, pathOf, scalePath, morphTo } from "/_rt/shape.js";                    // an app's page: the import map resolves /_rt/
 * import { shapeOf, pathOf, scalePath, morphTo } from "@microspec/core/runtime/shape.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link ORGANIC} — the farm's organic set: 13 soft, closed forms that read as an object, never as a sign.
 * - {@link NAMES} — all 35 Material shape names, in the Material chart order.
 * - {@link shapeOf} — `shapeOf(seed, set = ORGANIC)`: the same form for the same seed on every device (FNV-1a).
 * - {@link pathOf} — `pathOf(name)`: the unit-box SVG path of a named shape; cached; throws on an unknown name.
 * - {@link scalePath} — `scalePath(d, w, h = w)`: a unit-box path laid onto a `w × h` pixel box (for `clip-path: path()`).
 * - {@link morpher} — `morpher(from, to)`: a `(t) => d` sampler between two named shapes, `t` in 0..1.
 * - {@link EASE_IN_OUT} — the `--ease-in-out` curve of runtime.css as a function: on-screen movement and morphs.
 * - {@link morphTo} — `morphTo(from, to, { ms, onFrame, onDone })`: runs the morph on rAF and returns a cancel; instant when still.
 * - {@link shaper} — `shaper(start, onFrame)`: `{ to(name), stop(), current }` — a form told where to go, chaining morphs without a jump.
 *
 * ## In practice
 * ```js
 * import { shapeOf, scalePath, shaper } from "/_rt/shape.js";
 *
 * // a song's own form, the same on every phone; the clip follows the box, the rim is the same path in an SVG
 * const lay = (d) => { core.style.clipPath = `path("${scalePath(d, w)}")`; rim.setAttribute("d", d); };
 * const form = shaper(shapeOf(song.id), lay);   // drawn at once
 * // the next song: the form flows into the next one — once, ~320ms, never a loop; a tap mid-flight only
 * // retargets, the running morph lands first
 * form.to(shapeOf(next.id));
 * ```
 *
 * ## How it fits
 * Imports the vendored geometry (`./shapes.vendor.js`) and `./gate.js`. Pure apart from `morphTo`'s
 * requestAnimationFrame, which stops by itself when the morph lands — there is no loop to forget. The first
 * consumer is the product's fonoteka (a song's form, its play button). Unit tests:
 * `packages/runtime/tests/shape_test.js`.
 *
 * ## Invariants and pitfalls
 * - A morph is ONE-SHOT motion (state indication: "a different thing is here now"). Never run it in a loop and
 *   never on a value that changes many times a second — that is paint every frame, the battery's worst case.
 * - A morph can only START from a whole shape, so a new target that arrives mid-flight must not cancel the
 *   running one (the next would start from the old target — a visible jump). Chain instead: let it land
 *   (`onDone`), then morph from where it landed to the LATEST target — at most one duration of lag, never a
 *   teleport. Skipped intermediate targets are fine: only the latest one matters.
 * - `clip-path: path()` takes PIXELS, not a unit box — always `scalePath` to the element's measured size.
 * - The organic set excludes the spiky (Burst, Boom), the pixel, the pictogram (Heart, Arrow, Ghost-ish) and the
 *   plain (Square, Circle) forms on purpose: a song's form is a material object, not an icon.
 * @module
 */
import { MaterialShapes, Morph, morphToPath, roundedPolygonToPath, cubicBezier } from "./shapes.vendor.js";
import { gate } from "./gate.js";

/** All 35 Material shape names, in the Material chart order. */
export const NAMES = Object.freeze([...MaterialShapes.names]);

/** The farm's organic set: soft closed forms that read as an object, never as a sign (see the module doc). */
export const ORGANIC = Object.freeze([
  "Cookie4Sided", "Cookie6Sided", "Cookie7Sided", "Cookie9Sided", "Cookie12Sided",
  "Clover4Leaf", "Clover8Leaf", "Sunny", "VerySunny", "SoftBurst", "Flower", "Puffy", "PuffyDiamond",
]);

// FNV-1a, 32-bit: a seed string → a stable unsigned integer, the same in every engine.
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * The same form for the same seed on every device.
 * @param {string | number} seed a stable id (a song id, a station id)
 * @param {readonly string[]} [set] the forms to pick from — the organic set by default
 * @returns {string} a shape name from `set`
 */
export function shapeOf(seed, set = ORGANIC) { return set[fnv(String(seed)) % set.length]; }

function polygon(name) {
  const p = MaterialShapes.byName(name);
  if (!p) throw new Error(`shape: unknown shape "${name}"`);
  return p;
}

const cache = new Map();
/**
 * The unit-box (0..1) SVG path data of a named shape. Cached — a list of 300 songs builds each form once.
 * @param {string} name one of {@link NAMES}
 * @returns {string} SVG path data
 */
export function pathOf(name) {
  let d = cache.get(name);
  if (!d) { d = roundedPolygonToPath(polygon(name)).toSvgPathData(); cache.set(name, d); }
  return d;
}

/**
 * Lay a unit-box path onto a `w × h` pixel box — what `clip-path: path()` needs, since it takes pixels. The
 * path is absolute coordinates in x,y pairs (M, L, C, Z), so every even number is an x and every odd one a y.
 * @param {string} d unit-box SVG path data
 * @param {number} w box width in px
 * @param {number} [h] box height in px (defaults to `w`)
 * @returns {string} the path in pixels, two decimals
 */
export function scalePath(d, w, h = w) {
  let i = 0;
  return d.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (n) => String(Math.round(Number(n) * (i++ % 2 ? h : w) * 100) / 100));
}

/**
 * A sampler between two named shapes: `(t) => d`, `t` in 0..1 (0 = `from`, 1 = `to`).
 * @param {string} from shape name
 * @param {string} to shape name
 * @returns {(t: number) => string} unit-box SVG path data at progress `t`
 */
export function morpher(from, to) {
  if (from === to) { const d = pathOf(to); return () => d; }
  const m = new Morph(polygon(from), polygon(to));
  return (t) => morphToPath(m, Math.min(1, Math.max(0, t))).toSvgPathData();
}

/** `--ease-in-out` of runtime.css, cubic-bezier(.77, 0, .175, 1), as a function — for on-screen movement and morphs. */
export const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);

const still = () => gate || (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * Run a morph once on requestAnimationFrame, timed by the clock (a 30 fps Low Power Mode stretches nothing).
 * Instant — a single `onFrame(final)` — under reduced motion, in the gate, or with no rAF (a Deno test).
 * @param {string} from shape name
 * @param {string} to shape name
 * @param {{ ms?: number, ease?: (t: number) => number, onFrame: (d: string, t: number) => void, onDone?: () => void }} opts
 *   `ms` defaults to 320 (`--t-move`); `onFrame` gets the unit-box path and the eased progress
 * @returns {() => void} cancel — stops at the current frame; `onDone` is not called
 */
export function morphTo(from, to, { ms = 320, ease = EASE_IN_OUT, onFrame, onDone } = /** @type {any} */ ({})) {
  const at = morpher(from, to);
  if (from === to || still() || typeof requestAnimationFrame === "undefined") { onFrame(at(1), 1); onDone?.(); return () => {}; }
  let raf = 0, t0 = 0;
  const tick = (now) => {
    t0 ||= now;
    const p = Math.min(1, (now - t0) / ms), e = ease(p);
    onFrame(at(e), e);
    if (p < 1) raf = requestAnimationFrame(tick); else onDone?.();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/**
 * A form that can be told where to go: the chain rule of the module doc, done once. `to(name)` while a morph
 * runs only moves the target; when the running morph lands, the next one starts from there to the LATEST
 * target. `stop()` cancels the frame loop (an unmount).
 * @param {string} start the shape it starts as (drawn at once)
 * @param {(d: string, t: number) => void} onFrame lays a unit-box path onto the element(s)
 * @param {{ ms?: number }} [opts]
 * @returns {{ to: (name: string) => void, stop: () => void, readonly current: string }}
 */
export function shaper(start, onFrame, { ms } = {}) {
  let at = start, want = start, busy = false, cancel = null;
  onFrame(pathOf(start), 1);
  // `busy`, not `cancel`, guards the chain: an instant morph (reduced motion, the gate) lands INSIDE the
  // morphTo call, before its return value could be stored — a stored no-op cancel would then block forever.
  const run = () => {
    if (busy || want === at) return;
    busy = true;
    const to = want;
    const c = morphTo(at, to, { ms, onFrame, onDone: () => { at = to; busy = false; cancel = null; run(); } });
    if (busy) cancel = c;
  };
  return {
    to(name) { want = name; run(); },
    stop() { cancel?.(); cancel = null; busy = false; },
    get current() { return at; },
  };
}
