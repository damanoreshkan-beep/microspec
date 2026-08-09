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
// Uniform block (48 bytes, matching tools/art/hero.mjs byte for byte):
//   res: vec2f · time: f32 · seed: f32 · ink: vec4f · vary: vec4f
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { gate } from "/_rt/gate.js";

const DPR_CAP = 2;   // 3.5 native on a modern phone is wasted fill rate for a full-screen field

const VS = `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}`;

/**
 * @param shader  URL of the app's hero.wgsl — pass `new URL("hero.wgsl", import.meta.url)` from the view
 * @param seed    0..1, meaning is the shader's business; changing it does NOT rebuild the pipeline
 * @param ink     optional vec4 tint handed to the shader
 */
export function HeroStage({ shader, seed = 0, ink }) {
  const ref = useRef();
  const state = useRef({ raf: 0, dead: false, device: null }).current;
  state.seed = seed;
  state.ink = ink;

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
        const uniBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bind = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniBuf } }],
        });
        const uni = new Float32Array(12);

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
          uni.set([canvas.width, canvas.height, still ? 2 : (performance.now() - t0) / 1000, state.seed ?? 0], 0);
          // `ink` may be a FUNCTION, read fresh every frame. That is how an app animates the stage (a flare,
          // a pulse) without re-rendering its whole view sixty times a second to move a background.
          const ink = typeof state.ink === "function" ? state.ink() : state.ink;
          uni.set(ink?.length === 4 ? ink : [0.9, 0.89, 0.93, 1], 4);
          uni.set([0, 0, 0, 0], 8);
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
