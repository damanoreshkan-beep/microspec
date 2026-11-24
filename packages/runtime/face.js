/* @ts-self-types="./face.d.ts" */
/**
 * # runtime/face.js — one face in a camera frame: how near, eyes, gaze and expression
 *
 * The face reader of the kit. `faceTracker` loads MediaPipe Face Landmarker (Apache-2.0) the first time an app
 * asks for it — the bundle and its WebAssembly from jsDelivr, the float16 model from Google's model bucket,
 * both cached by the farm's service worker for the next launch — and returns a tracker whose `read(frame, t)`
 * turns one video frame into a plain READING: how big the face is in the frame (the nearness signal), its box,
 * each eye's openness, where the eyes look and the strongest expression. Everything after the network is pure:
 * `readingOf` maps the landmarker's raw result to that reading, and `eyesOf` / `gazeOf` / `exprOf` /
 * `scaleOf` / `boxOf` are the maths, unit-tested on hand-built inputs without a browser.
 *
 * ## Import
 * ```js
 * import { faceTracker } from "/_rt/face.js";                         // an app's page: the import map resolves /_rt/
 * import { readingOf, gazeOf } from "@microspec/core/runtime/face.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link faceTracker} — `await faceTracker()` → `{ read(src, t), close() }`; GPU first, CPU when the GPU
 *   delegate refuses. `read` returns a reading or `null` when no face is in the frame.
 * - {@link readingOf} — the landmarker's result + the frame's size → `{ scale, box, eyes, gaze, expr, shapes }`.
 * - {@link shapesOf} — a blendshape category list → `{ name: score }`.
 * - {@link eyesOf} — openness of each eye 0..1 and a `state`: "open" | "closed" | "winkL" | "winkR".
 * - {@link gazeOf} — `{ x, y, dir }`: x right-positive, y up-positive, in the SUBJECT's own frame; `dir` one of
 *   {@link GAZE} ("c" for straight ahead).
 * - {@link exprOf} — the strongest of {@link EXPR} above its floor, or "calm".
 * - {@link scaleOf} — the distance between the outer eye corners as a share of the frame's width: grows as the
 *   face comes nearer, independent of the camera's resolution.
 * - {@link boxOf} — the landmarks' bounding box in 0..1 frame units.
 * - {@link FACE_LIB} / {@link FACE_MODEL} — the pinned sources.
 *
 * ## Invariants
 * - Feed the RAW camera frame. Left and right are the subject's own; a mirrored picture swaps them.
 * - `read` keeps timestamps strictly increasing, as the landmarker's VIDEO mode demands.
 * - Nothing leaves the device: the frame goes into WebAssembly on the page, only the library is downloaded.
 * @module
 */

/** The pinned MediaPipe Tasks Vision package on jsDelivr (bundle + `/wasm`). */
export const FACE_LIB = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3";

/** The pinned float16 Face Landmarker model (478 landmarks + 52 blendshapes). */
export const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Gaze directions `gazeOf` names: centre, the four sides and the four diagonals. */
export const GAZE = ["c", "u", "d", "l", "r", "ul", "ur", "dl", "dr"];

/** Expressions `exprOf` ranks, each with the blendshapes it averages and the floor it must clear. */
export const EXPR = [
  { id: "strain", of: ["browDownLeft", "browDownRight", "eyeSquintLeft", "eyeSquintRight"], min: 0.35 },
  { id: "open", of: ["jawOpen"], min: 0.3 },
  { id: "smile", of: ["mouthSmileLeft", "mouthSmileRight"], min: 0.35 },
  { id: "frown", of: ["mouthFrownLeft", "mouthFrownRight"], min: 0.3 },
  { id: "press", of: ["mouthPressLeft", "mouthPressRight"], min: 0.35 },
  { id: "puff", of: ["cheekPuff"], min: 0.3 },
  { id: "brows", of: ["browInnerUp"], min: 0.4 },
  { id: "pucker", of: ["mouthPucker"], min: 0.45 },
];

const avg = (s, names) => names.reduce((a, n) => a + (s[n] || 0), 0) / names.length;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

/**
 * A blendshape category list → a name → score map.
 * @param cats `[{ categoryName, score }]` as the landmarker returns them
 * @returns `{ [name]: score }`
 */
export function shapesOf(cats) {
  const out = {};
  for (const c of cats || []) if (c && c.categoryName) out[c.categoryName] = c.score;
  return out;
}

/**
 * How open each eye is and what the pair is doing.
 * @param s blendshape scores
 * @param min the blink score at which an eye counts as closed
 * @returns `{ l, r, state }` — openness 0..1 per eye (subject's left / right) and "open" | "closed" | "winkL" | "winkR"
 */
export function eyesOf(s, min = 0.5) {
  const bl = s.eyeBlinkLeft || 0, br = s.eyeBlinkRight || 0;
  const cl = bl >= min, cr = br >= min;
  return { l: clamp01(1 - bl), r: clamp01(1 - br), state: cl && cr ? "closed" : cl ? "winkL" : cr ? "winkR" : "open" };
}

/**
 * Where the eyes look, in the subject's own frame.
 * @param s blendshape scores
 * @param min how far off centre an axis must be to name it
 * @returns `{ x, y, dir }` — x > 0 to the subject's right, y > 0 up, `dir` one of GAZE
 */
export function gazeOf(s, min = 0.2) {
  const left = ((s.eyeLookOutLeft || 0) + (s.eyeLookInRight || 0)) / 2;
  const right = ((s.eyeLookInLeft || 0) + (s.eyeLookOutRight || 0)) / 2;
  const up = ((s.eyeLookUpLeft || 0) + (s.eyeLookUpRight || 0)) / 2;
  const down = ((s.eyeLookDownLeft || 0) + (s.eyeLookDownRight || 0)) / 2;
  const x = right - left, y = up - down;
  const v = y >= min ? "u" : y <= -min ? "d" : "", h = x >= min ? "r" : x <= -min ? "l" : "";
  return { x, y, dir: v + h || "c" };
}

/**
 * The strongest expression that clears its floor.
 * @param s blendshape scores
 * @returns `{ id, score }` — an EXPR id, or "calm" with the headroom left under the floors
 */
export function exprOf(s) {
  let best = null, top = 0;
  for (const e of EXPR) {
    const v = avg(s, e.of);
    top = Math.max(top, v / e.min);
    if (v >= e.min && (!best || v / e.min > best.score / best.min)) best = { id: e.id, score: v, min: e.min };
  }
  return best ? { id: best.id, score: best.score } : { id: "calm", score: clamp01(1 - top) };
}

/**
 * The distance between the outer eye corners (landmarks 33 and 263) as a share of the frame's width.
 * @param pts normalized landmarks
 * @param w frame width (px)
 * @param h frame height (px)
 * @returns the share, 0 when the landmarks are missing
 */
export function scaleOf(pts, w, h) {
  const a = pts && pts[33], b = pts && pts[263];
  if (!a || !b || !w || !h) return 0;
  return Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) / w;
}

/**
 * The landmarks' bounding box, clamped to the frame.
 * @param pts normalized landmarks
 * @returns `{ x, y, w, h }` in 0..1 frame units, or null with no points
 */
export function boxOf(pts) {
  if (!pts || !pts.length) return null;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  x0 = clamp01(x0); y0 = clamp01(y0); x1 = clamp01(x1); y1 = clamp01(y1);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * The landmarker's result for one frame → a reading.
 * @param res `{ faceLandmarks, faceBlendshapes }`
 * @param w frame width (px)
 * @param h frame height (px)
 * @returns `{ scale, box, eyes, gaze, expr, shapes }`, or null when no face was found
 */
export function readingOf(res, w, h) {
  const pts = res && res.faceLandmarks && res.faceLandmarks[0];
  if (!pts || !pts.length) return null;
  const shapes = shapesOf(res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories);
  return { scale: scaleOf(pts, w, h), box: boxOf(pts), eyes: eyesOf(shapes), gaze: gazeOf(shapes), expr: exprOf(shapes), shapes };
}

const sizeOf = (src) => ({
  w: src.videoWidth || src.naturalWidth || src.displayWidth || src.width || 0,
  h: src.videoHeight || src.naturalHeight || src.displayHeight || src.height || 0,
});

/**
 * Load the face landmarker and return a tracker over video frames.
 * @param opts `lib` / `model` override the pinned sources; `delegate` "GPU" (default, falls back to CPU) | "CPU"
 * @returns `{ read(src, t), close(), delegate }` — `read` takes a video, image or canvas and a time in ms
 */
export async function faceTracker({ lib = FACE_LIB, model = FACE_MODEL, delegate = "GPU" } = {}) {
  const vision = await import(`${lib}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${lib}/wasm`);
  const make = (d) => vision.FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: model, delegate: d },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  let used = delegate, lm;
  try { lm = await make(delegate); } catch (e) {
    if (delegate === "CPU") throw e;
    used = "CPU";
    lm = await make("CPU");
  }
  let last = -Infinity;
  return {
    delegate: used,
    read(src, t) {
      const { w, h } = sizeOf(src);
      if (!w || !h) return null;
      const ts = t > last ? t : last + 0.001;
      last = ts;
      return readingOf(lm.detectForVideo(src, ts), w, h);
    },
    close() { try { lm.close(); } catch { } },
  };
}
