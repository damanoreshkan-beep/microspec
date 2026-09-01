/* @ts-self-types="./glstage.d.ts" */
/**
 * # runtime/glstage.js — hero.js's twin on WebGL2, for a stage that has to be seen where WebGPU is not
 *
 * A full-screen fragment-shader stage on `getContext("webgl2")`, carrying the same uniform contract as
 * {@link HeroStage} (`res`, `time`, `seed`, `ink`, `vary`, `env`) plus an optional palette texture, so an app can
 * hand the same numbers to either renderer. It buys the farm a field that renders on an iPad on iOS 16, on
 * Firefox on Android and in CI's headless Chromium — which HAS WebGL, so the verify shot shows the real field
 * instead of a plain background. The lesson behind it: guard by PROBE, never by gate. Init runs wherever the
 * context answers; preflight's canvas stub answers null and the effect ends there; under a dead GL the element
 * stays an empty canvas and every meaning the stage carries is also in the DOM, which is the only thing axe
 * and the e2e can see anyway.
 *
 * ![The GL stage: fragment shader, uniforms, the palette texture and the probe guard](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-glstage.svg)
 *
 * ## Import
 * ```js
 * import { GlStage, hasWebGL2 } from "/_rt/glstage.js";                    // an app's page: the import map resolves /_rt/
 * import { GlStage, hasWebGL2 } from "@microspec/core/runtime/glstage.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link GlStage} — the component: `{ shader, seed = 0, ink, vary, tex, texReady, zClass = "-z-10" }` renders a
 *   `fixed inset-0` canvas (`data-stage`, `aria-hidden`) and drives the app's GLSL ES 3.00 fragment shader every frame.
 * - {@link hasWebGL2} — the probe: true when this document can hand out a WebGL2 context, false wherever
 *   `getContext` throws or answers null.
 *
 * ## In practice
 * ```js
 * import { GlStage } from "/_rt/glstage.js";                                // apps/tide/view.js
 *
 * // `ink` and `vary` are functions: GlStage reads them fresh every frame, so the view never re-renders
 * // to move the field. `tex` is the station's logo — a PALETTE for the shader, downsampled to 64 px.
 * html`<${GlStage} shader=${new URL("tide.frag", import.meta.url)} seed=${seedFor(station)} zClass="z-0"
 *   ink=${inkFor} vary=${bands} tex=${station.logo || null} texReady=${(r) => { env.readyTo = r; }} />`;
 * ```
 * The shader declares `out vec4 o` and the uniforms `res: vec2 · time: float · seed: float · ink: vec4 ·
 * vary: vec4 · env: vec4`, plus `tex: sampler2D` and `texAspect: vec2` when it samples the palette.
 *
 * ## How it fits
 * Imports `htm/preact`, `preact/hooks` and `gate` from `./gate.js` (the gate does not skip the stage — it only
 * lowers the DPR to 1 and halves the frame rate, because headless Chromium draws WebGL in software). Nothing in
 * the runtime imports it; 4 farm apps do — tide, persona, mirage, hoard — each with its own `.frag` beside the
 * view. {@link HeroStage} in `hero.js` is the WebGPU sibling with the identical uniform block.
 *
 * ## Invariants and pitfalls
 * - Probe-guarded, never gate-guarded: there is deliberately no `if (gate) return` — the `getContext("webgl2")`
 *   answer is the guard, so CI renders the real field and preflight (linkedom, no GL) skips it.
 * - The canvas is measured against the VIEWPORT (`innerWidth`/`innerHeight`), never against itself: before the
 *   stylesheet lands a canvas's clientWidth is its intrinsic 300, and preflight fails a stage that bakes that in.
 * - `ink` and `vary` are the app's channels; `env.x` is the runtime's — how light the theme is, read from
 *   `data-theme` on the document and eased (~250 ms) so a toggle cross-fades. A wrong-length `ink` falls back to
 *   `[0.9, 0.89, 0.93, 1]`, a wrong-length `vary` to zeros.
 * - `tex` is downsampled to at most 64 px before upload, on purpose: a stage borrows a palette from a portrait,
 *   it does not project the picture. A 1x1 neutral texture is bound from the first frame so a shader that samples
 *   `tex` never reads an unbound unit; a URL that will not read (no CORS, 404) leaves that neutral palette.
 * - `texReady` is called with 0 when a load starts and 1 when the texture is bound — the app fades the field in
 *   through its own `vary` channel. Changing `tex` swaps the texture without rebuilding the program.
 * - Under the gate: DPR 1 and every other frame skipped (a full-screen fbm field at DPR 2 in SwiftShader starved a
 *   fixture stream from 0.7 s to 30 s). Elsewhere DPR is capped at 2. A hidden tab draws nothing.
 * - `prefers-reduced-motion: reduce` freezes `time` at 2 and snaps `env.x` instead of easing it.
 * - The canvas reports itself: `data-haswebgl` yes/no, `data-render="webgl"` once a frame drew, `data-tex="yes"`
 *   once the palette is bound, `data-err` with the first 120 chars of a compile/link failure.
 * @module
 */
// microspec runtime — the GL stage: hero.js's twin on WebGL2, for a stage that has to be seen where WebGPU
// is not (an iPad on iOS 16, Firefox on Android, CI's headless Chromium — which HAS WebGL, so the verify
// shot shows the real field). Same contract as HeroStage so an app can carry the same numbers to either:
//
//   uniforms  res: vec2 · time: f32 · seed: f32 · ink: vec4 · vary: vec4 · env: vec4   (+ tex: sampler2D)
//
// `ink`/`vary` are the APP's channels (a value or a function read fresh every frame); `env.x` is the
// RUNTIME's — how light the theme is, eased over ~250ms so a toggle cross-fades. `tex` is an optional
// CORS-readable image URL: it is downsampled to at most TEX_MAX px before upload, deliberately — a stage
// borrows a PALETTE from a portrait, it does not project the picture — and swapping it cross-fades through
// `vary`-style easing on the shader's side (the app reads `ready` from the `texReady` channel below).
//
// PROBE-guarded, never gate-guarded: init runs wherever `getContext("webgl2")` answers, so CI's Chromium
// renders it and preflight (linkedom, no GL) skips it. Under a dead GL the element stays an empty canvas
// and every meaning the stage carries is also in the DOM — the only thing axe and the e2e can see anyway.
//
// The canvas is measured against the VIEWPORT (it is `fixed inset-0`), never against itself: before the
// stylesheet lands a canvas's clientWidth is its intrinsic 300, and preflight fails a stage that bakes that in.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { gate } from "./gate.js";

const DPR_CAP = 2;
// Headless Chromium draws WebGL in SOFTWARE (SwiftShader): a full-screen fbm field at DPR 2 is ~1.3M fragments a
// frame and starves the page's own timers (a fixture stream that should take 0.7 s took 30). The gate renders at
// DPR 1 — the shot is still the real field, at a quarter of the fill — and skips every other frame.
const GATE_DPR = 1;
const TEX_MAX = 64;

const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

/** 0 = dark theme, 1 = light — the palette follows the document, not a prop (the view does not re-render on a toggle). */
const themeLight = () =>
  (typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light")) ? 1 : 0;

/**
 * Probe whether this document can hand out a WebGL2 context (false wherever `getContext` throws or answers null).
 * @returns true when a WebGL2 context is available
 */
export const hasWebGL2 = () => {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2")); } catch { return false; }
};

/**
 * @param shader   URL of the app's fragment shader (GLSL ES 3.00; declares `out vec4 o` and the uniforms above)
 * @param seed     0..1, the shader's business
 * @param ink      optional vec4 — a value or a function read every frame
 * @param vary     optional vec4 — same; the app's live parameters (this is how a stage answers real state)
 * @param tex      optional image URL (CORS-readable); `texReady` — a function the stage calls with 0/1 when
 *                 the texture is (not) bound, so the app can fade the field in through its own `vary` channel
 * @param zClass   the stacking class; default sits UNDER in-flow content inside a positioned dialog
 */
export function GlStage({ shader, seed = 0, ink, vary, tex, texReady, zClass = "-z-10" }) {
  const ref = useRef();
  const state = useRef({ raf: 0, dead: false, gl: null, light: themeLight(), texUrl: null }).current;
  state.seed = seed; state.ink = ink; state.vary = vary; state.texReady = texReady;

  useEffect(() => {
    // No gate guard, on purpose (see the header): the probe below is the guard. Preflight's canvas stub
    // answers null to getContext and the effect ends there; CI's Chromium answers a context and draws.
    const canvas = ref.current;
    if (!canvas) return;
    let gl;
    try { gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power" }); } catch { gl = null; }
    canvas.dataset.haswebgl = gl ? "yes" : "no";
    if (!gl) return;
    state.gl = gl;

    (async () => {
      try {
        const fs = await fetch(shader).then((r) => r.text());
        if (state.dead) return;
        const compile = (type, src) => {
          const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
          return sh;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -3, -1, 1, 3, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const U = (n) => gl.getUniformLocation(prog, n);
        const uRes = U("res"), uTime = U("time"), uSeed = U("seed"), uInk = U("ink"), uVary = U("vary"), uEnv = U("env"), uTex = U("tex"), uTexAspect = U("texAspect");
        // A 1×1 neutral texture is bound from the first frame, so a shader that samples `tex` never reads
        // an unbound unit while the portrait is still on the wire.
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        if (uTex) gl.uniform1i(uTex, 0);
        let texAspect = 1;
        state.loadTex = async (url) => {
          state.texReady?.(0);
          if (!url) { texAspect = 1; return; }
          try {
            const img = new Image(); img.crossOrigin = "anonymous"; img.decoding = "async"; img.src = url;
            await img.decode();
            if (state.dead || state.texUrl !== url) return;
            const w = Math.max(1, Math.min(TEX_MAX, img.naturalWidth)), h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
            const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
            cv.getContext("2d").drawImage(img, 0, 0, w, h);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            texAspect = w / h;
            canvas.dataset.tex = "yes";
            state.texReady?.(1);
          } catch { /* a portrait that will not read (no CORS, 404) leaves the neutral palette */ }
        };
        if (state.texUrl) state.loadTex(state.texUrl);

        const size = () => {
          const dpr = gate ? GATE_DPR : Math.min(DPR_CAP, devicePixelRatio || 1);
          const w = Math.max(1, Math.round((globalThis.innerWidth || 1) * dpr)), h = Math.max(1, Math.round((globalThis.innerHeight || 1) * dpr));
          if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
          gl.viewport(0, 0, w, h);
        };
        size();
        addEventListener("resize", size);
        const still = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        const t0 = performance.now();
        const uni = new Float32Array(4);
        let tick = 0;
        const frame = () => {
          if (state.dead) return;
          if (document.hidden || (gate && (tick++ & 1))) { state.raf = requestAnimationFrame(frame); return; }   // hidden tab: no draw; gate: half rate
          const now = performance.now();
          gl.uniform2f(uRes, canvas.width, canvas.height);
          gl.uniform1f(uTime, still ? 2 : (now - t0) / 1000);
          gl.uniform1f(uSeed, state.seed ?? 0);
          const ink = typeof state.ink === "function" ? state.ink() : state.ink;
          const vary = typeof state.vary === "function" ? state.vary() : state.vary;
          uni.set(ink?.length === 4 ? ink : [0.9, 0.89, 0.93, 1]); if (uInk) gl.uniform4fv(uInk, uni);
          uni.set(vary?.length === 4 ? vary : [0, 0, 0, 0]); if (uVary) gl.uniform4fv(uVary, uni);
          const target = themeLight();
          state.light = still ? target : state.light + (target - state.light) * 0.13;
          if (uEnv) gl.uniform4f(uEnv, state.light, 0, 0, 0);
          if (uTexAspect) gl.uniform2f(uTexAspect, texAspect, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          canvas.dataset.render = "webgl";
          state.raf = requestAnimationFrame(frame);
        };
        frame();
        state.cleanup = () => removeEventListener("resize", size);
      } catch (e) {
        canvas.dataset.err = String(e?.message ?? e).slice(0, 120);
        console.warn("glstage: init failed —", e?.message ?? e);
      }
    })();

    return () => {
      state.dead = true;
      cancelAnimationFrame(state.raf);
      state.cleanup?.();
      try { state.gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* gone */ }
      state.gl = null;
    };
  }, []);

  // The texture follows the prop without a rebuild — the same person's field keeps flowing while a new
  // portrait arrives, and a person swap fades through the app's `ready` channel rather than cutting.
  useEffect(() => {
    state.texUrl = tex || null;
    if (state.loadTex) state.loadTex(state.texUrl);
  }, [tex]);

  return html`<canvas ref=${ref} data-stage aria-hidden="true"
    class=${`fixed inset-0 ${zClass} w-full h-full pointer-events-none`}></canvas>`;
}
