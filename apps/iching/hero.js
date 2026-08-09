// apps/iching/hero.js — the hero stage in the browser: WebGPU, no fallback.
//
// The same hero.wgsl that tools/art/hero.mjs renders offline runs here. That is the whole point of the
// arrangement: what I judge locally at 384×832 is byte-for-byte what ships, so the eye test stops being a
// deployment and the shader has exactly one implementation.
//
// NO FALLBACK, deliberately (owner's call): this farm targets current phones, and carrying a second
// renderer would double the work across the farm while making the worse version the yardstick. A device
// without WebGPU simply gets the island over a plain background — the app still works, it is just not lit.
//
// Under the gate there is no GPU and no fetch, so init is skipped and the canvas stays empty. The screen's
// meaning lives in the island (hexagram, name, odds, controls), which is what preflight and axe measure.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { gate } from "/_rt/gate.js";

const DPR_CAP = 2;   // 3.5 native on this phone is wasted fill rate for a full-screen field

/**
 * @param seed  0..1 — the cast, packed as six base-4 digits (line value 6..9 → digit 0..3), bottom first.
 *              The shader unpacks it, so a new cast changes the figure with no geometry upload.
 */
export function HeroStage({ seed }) {
  const ref = useRef();
  const state = useRef({ raf: 0, dead: false, device: null, uni: null, ctx: null }).current;

  useEffect(() => {
    if (gate) return;                                   // headless: no GPU, no network, nothing to draw
    const canvas = ref.current;
    if (!canvas || !navigator.gpu) return;

    (async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter || state.dead) return;
        const device = await adapter.requestDevice();
        if (state.dead) return;
        state.device = device;

        const base = new URL("./", import.meta.url);
        const wgsl = await fetch(new URL("hero.wgsl", base)).then((r) => r.text());
        if (state.dead) return;

        const ctx = canvas.getContext("webgpu");
        const format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format, alphaMode: "opaque" });
        state.ctx = ctx;

        const VS = `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}`;
        const module = device.createShaderModule({ code: VS + "\n" + wgsl });
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module, entryPoint: "vs" },
          fragment: { module, entryPoint: "fs", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });

        // No environment map. The field shader lights itself, which is why the 6.5 MB env.hdr could go —
        // and `layout: "auto"` derives the bind group from what the WGSL declares, so an unused texture
        // entry here would be a validation error rather than dead weight.
        const uniBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bind = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniBuf } }],
        });
        state.uni = new Float32Array(12);

        const size = () => {
          const r = canvas.getBoundingClientRect();
          const dpr = Math.min(DPR_CAP, devicePixelRatio || 1);
          canvas.width = Math.max(1, Math.round(r.width * dpr));
          canvas.height = Math.max(1, Math.round(r.height * dpr));
        };
        size();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
        ro?.observe(canvas);

        // prefers-reduced-motion stops the drift; the scene still renders, it just holds still.
        const still = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        const t0 = performance.now();

        const frame = () => {
          if (state.dead) return;
          const t = still ? 2.0 : (performance.now() - t0) / 1000;
          state.uni.set([canvas.width, canvas.height, t, state.seed ?? 0], 0);
          state.uni.set([0.9, 0.89, 0.93, 1], 4);
          state.uni.set([0, 0, 0, 0], 8);
          device.queue.writeBuffer(uniBuf, 0, state.uni);

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
        state.cleanupRo = () => ro?.disconnect();
      } catch (e) {
        // A dead GPU must not take the app with it — the island carries the meaning either way.
        console.warn("hero: WebGPU init failed —", e?.message ?? e);
      }
    })();

    return () => {
      state.dead = true;
      cancelAnimationFrame(state.raf);
      state.cleanupRo?.();
      try { state.device?.destroy?.(); } catch { /* already gone */ }
      state.device = null;
    };
  }, []);

  // The seed reaches the render loop through the ref, so a new cast does not tear down the GPU context.
  state.seed = seed ?? 0;

  return html`<canvas ref=${ref} data-stage data-live aria-hidden="true"
    class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}

/** Pack six line values (6..9, bottom first) into the 0..1 seed the shader unpacks. */
export const packSeed = (lines) => {
  let n = 0;
  for (let i = 5; i >= 0; i--) n = n * 4 + ((lines[i] ?? 7) - 6);
  return n / 4096;
};
