/* @ts-self-types="./hero.d.ts" */
/**
 * # runtime/hero.js — the hero stage: one WebGPU renderer, one shader per app
 *
 * An app supplies `apps/<id>/hero.wgsl` and nothing else. Everything mechanical — adapter, device, canvas
 * configuration, the fullscreen triangle, the 64-byte uniform block, resize, reduced-motion, teardown — lives
 * here exactly once. The first version of this file was copied into an app directory, which is how a farm ends
 * up with eight subtly different renderers and a bug fixed in one of them. The SAME shader is what
 * `tools/art/hero.mjs` renders offline, so a frame judged locally at 384x832 is what ships: the eye test stops
 * being a deployment. NO FALLBACK, deliberately (owner's call): a device without WebGPU gets the island over
 * a plain background — the stage is atmosphere, and every meaning it carries is also in the DOM, which is the
 * only thing axe and the e2e gate can see anyway. Where the stage has to be seen without WebGPU, {@link GlStage}
 * in `glstage.js` carries the same contract on WebGL2.
 *
 * ![The hero stage: hero.wgsl, the 64-byte uniform block, the app's channels and the runtime's](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-hero.svg)
 *
 * ## Import
 * ```js
 * import { HeroStage } from "/_rt/hero.js";                    // an app's page: the import map resolves /_rt/
 * import { HeroStage } from "@microspec/core/runtime/hero.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link HeroStage} — the component: `{ shader, seed = 0, ink, vary }` renders a `fixed inset-0 z-0` canvas
 *   (`data-stage`, `aria-hidden`) and drives the app's `hero.wgsl` fragment entry `fs` every frame.
 *
 * ## In practice
 * ```js
 * import { HeroStage } from "/_rt/hero.js";                                   // apps/tarot/view.js
 *
 * // The seed is the shader's business: here the first drawn card, 0..1. Changing it never rebuilds the pipeline.
 * html`<${HeroStage} shader=${new URL("hero.wgsl", import.meta.url)} seed=${((drawn[0]?.card ?? 0) + 1) / 79} />`;
 * ```
 * The app's WGSL supplies the fragment entry `fs` (the runtime prepends the vertex entry `vs`) and binds the
 * uniform block at group 0, binding 0: `res: vec2f · time: f32 · seed: f32 · ink: vec4f · vary: vec4f · env: vec4f`.
 * A 48-byte struct that stops at `vary` still binds against the 64-byte buffer; WGSL only requires the declared
 * struct to FIT.
 *
 * ## How it fits
 * Imports `htm/preact`, `preact/hooks` and `gate` from `./gate.js` — relatively, because `/_rt/` 404s under
 * `/microspec/`. `render.js` lazily imports it for a tab that declares `tab.stage` (the dashboard family's
 * atmosphere), so the ~60 apps without a stage never fetch it; 3 farm apps reach it that way (mirage, persona,
 * weather) and 2 import {@link HeroStage} directly (iching, tarot), while 74 precache `/_rt/hero.js` in their
 * generated service worker. `tools/art/hero.mjs` renders the same `hero.wgsl` offline with a byte-identical
 * uniform block.
 *
 * ## Invariants and pitfalls
 * - Gate-guarded: under the verify gate the effect returns before touching the GPU — headless has no GPU, no
 *   network, nothing to draw. Without `navigator.gpu` it returns too; a failed init only warns.
 * - `ink` and `vary` are the APP's channels, `env` is the RUNTIME's, and the split is deliberate: `env.x` is how
 *   light the theme is (0 dark, 1 light), read from `data-theme` on the document and eased over ~250 ms so a
 *   toggle cross-fades instead of cutting. A stage cannot derive that itself — the view does not re-render on a
 *   toggle, and every scene would grow its own MutationObserver and drift.
 * - `ink` and `vary` may be FUNCTIONS, read fresh every frame: that is how an app animates the stage (a flare, a
 *   pulse) without re-rendering its whole view sixty times a second. A wrong-length `ink` falls back to
 *   `[0.9, 0.89, 0.93, 1]`, a wrong-length `vary` to zeros.
 * - `layout: "auto"` derives the bind group from what the WGSL declares, so a field shader that reads no texture
 *   must not be handed one — that is a validation error, not harmless extra baggage.
 * - The canvas is sized from `getBoundingClientRect` through a ResizeObserver, DPR capped at 2 — 3.5 native on a
 *   modern phone is wasted fill rate for a full-screen field.
 * - `prefers-reduced-motion: reduce` freezes `time` at 2 and snaps `env.x`: the scene still renders, it holds still.
 * - Teardown cancels the frame, disconnects the observer and destroys the device; a device that arrives after
 *   unmount is dropped by the `dead` flag.
 * @module
 */
// microspec runtime — the hero stage: one WebGPU renderer, one shader per app.
//
// An app supplies `apps/<id>/hero.wgsl` and nothing else. Everything mechanical — adapter, device, canvas
// configuration, the fullscreen triangle, the uniform block, resize, reduced-motion, teardown — lives here
// exactly once. The first version of this file was copied into an app directory, which is how a farm ends
// up with eight subtly different renderers and a bug fixed in one of them.
//
// The SAME shader is what tools/art/hero.mjs renders offline, so a frame judged locally at 384×832 is what
// ships. That is the whole point of the arrangement: the eye test stops being a deployment.
//
// NO FALLBACK, deliberately (owner's call): a device without WebGPU gets the island over a plain
// background. The app still works — the stage is atmosphere, and every meaning it carries is also in the
// DOM, which is the only thing axe and the e2e gate can see anyway.
//
// Uniform block (64 bytes, matching tools/art/hero.mjs byte for byte):
//   res: vec2f · time: f32 · seed: f32 · ink: vec4f · vary: vec4f · env: vec4f
//
// `ink` and `vary` are the APP's channels; `env` is the RUNTIME's, and the split is deliberate. env.x is
// how light the current theme is (0 dark, 1 light), eased over ~250ms so a theme toggle cross-fades the
// scene instead of cutting. A stage cannot derive that itself: the view does not re-render on a toggle, so
// every scene would grow its own MutationObserver and they would drift. A 48-byte struct still binds
// against the larger buffer (WGSL only requires the declared struct to FIT), so iching and tarot are
// untouched — verified by rendering both through tools/art/hero.mjs after the change.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { gate } from "./gate.js";   // runtime modules import RELATIVELY — /_rt/ 404s under /microspec/

const DPR_CAP = 2;   // 3.5 native on a modern phone is wasted fill rate for a full-screen field

const VS = `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}`;

/** 0 = dark theme, 1 = light. Same idiom as globe.js — the palette follows the document, not a prop. */
const themeLight = () =>
  (typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light")) ? 1 : 0;

/**
 * @param shader  URL of the app's hero.wgsl — pass `new URL("hero.wgsl", import.meta.url)` from the view
 * @param seed    0..1, meaning is the shader's business; changing it does NOT rebuild the pipeline
 * @param ink     optional vec4 tint handed to the shader — a value, or a function read fresh every frame
 * @param vary    optional vec4 of scene parameters — same contract as `ink`. This is how a stage becomes
 *                DATA-driven (weather's sky reads the real cloud cover here) rather than decorative.
 */
export function HeroStage({ shader, seed = 0, ink, vary }) {
  const ref = useRef();
  const state = useRef({ raf: 0, dead: false, device: null, light: themeLight() }).current;
  state.seed = seed;
  state.ink = ink;
  state.vary = vary;

  useEffect(() => {
    if (gate) return;                                  // headless: no GPU, no network, nothing to draw
    const canvas = ref.current;
    if (!canvas || !navigator.gpu) return;

    (async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter || state.dead) return;
        const device = await adapter.requestDevice();
        if (state.dead) return;
        state.device = device;

        const wgsl = await fetch(shader).then((r) => r.text());
        if (state.dead) return;

        const ctx = canvas.getContext("webgpu");
        const format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format, alphaMode: "opaque" });

        const module = device.createShaderModule({ code: VS + "\n" + wgsl });
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module, entryPoint: "vs" },
          fragment: { module, entryPoint: "fs", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });

        // `layout: "auto"` derives the bind group from what the WGSL declares, so a field shader that reads
        // no texture must not be handed one — that is a validation error, not harmless extra baggage.
        const uniBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bind = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniBuf } }],
        });
        const uni = new Float32Array(16);

        const size = () => {
          const r = canvas.getBoundingClientRect();
          const dpr = Math.min(DPR_CAP, devicePixelRatio || 1);
          canvas.width = Math.max(1, Math.round(r.width * dpr));
          canvas.height = Math.max(1, Math.round(r.height * dpr));
        };
        size();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
        ro?.observe(canvas);

        // Reduced motion freezes the clock at a chosen frame — the scene still renders, it just holds still.
        const still = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        const t0 = performance.now();

        const frame = () => {
          if (state.dead) return;
          const now = performance.now();
          uni.set([canvas.width, canvas.height, still ? 2 : (now - t0) / 1000, state.seed ?? 0], 0);
          // `ink`/`vary` may be FUNCTIONS, read fresh every frame. That is how an app animates the stage (a
          // flare, a pulse) without re-rendering its whole view sixty times a second to move a background.
          const ink = typeof state.ink === "function" ? state.ink() : state.ink;
          const vary = typeof state.vary === "function" ? state.vary() : state.vary;
          uni.set(ink?.length === 4 ? ink : [0.9, 0.89, 0.93, 1], 4);
          uni.set(vary?.length === 4 ? vary : [0, 0, 0, 0], 8);
          // Ease toward the document's theme rather than snapping: a hard cut on toggle is a flash the size
          // of the screen. ~250ms at 60fps; `still` skips the easing so a frozen frame is exact.
          const target = themeLight();
          state.light = still ? target : state.light + (target - state.light) * 0.13;
          uni.set([state.light, 0, 0, 0], 12);
          device.queue.writeBuffer(uniBuf, 0, uni);

          const enc = device.createCommandEncoder();
          const pass = enc.beginRenderPass({
            colorAttachments: [{
              view: ctx.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store",
            }],
          });
          pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end();
          device.queue.submit([enc.finish()]);
          state.raf = requestAnimationFrame(frame);
        };
        frame();
        state.cleanup = () => ro?.disconnect();
      } catch (e) {
        // A dead GPU must not take the app with it — the island carries the meaning either way.
        console.warn("hero: WebGPU init failed —", e?.message ?? e);
      }
    })();

    return () => {
      state.dead = true;
      cancelAnimationFrame(state.raf);
      state.cleanup?.();
      try { state.device?.destroy?.(); } catch { /* already gone */ }
      state.device = null;
    };
  }, []);

  return html`<canvas ref=${ref} data-stage aria-hidden="true"
    class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}
