import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { gate } from "./gate.js";   

const DPR_CAP = 2;   

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
    if (gate) return;                                  
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

        const still = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        const t0 = performance.now();

        const frame = () => {
          if (state.dead) return;
          const now = performance.now();
          uni.set([canvas.width, canvas.height, still ? 2 : (now - t0) / 1000, state.seed ?? 0], 0);
          const ink = typeof state.ink === "function" ? state.ink() : state.ink;
          const vary = typeof state.vary === "function" ? state.vary() : state.vary;
          uni.set(ink?.length === 4 ? ink : [0.9, 0.89, 0.93, 1], 4);
          uni.set(vary?.length === 4 ? vary : [0, 0, 0, 0], 8);
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
        console.warn("hero: WebGPU init failed —", e?.message ?? e);
      }
    })();

    return () => {
      state.dead = true;
      cancelAnimationFrame(state.raf);
      state.cleanup?.();
      try { state.device?.destroy?.(); } catch {  }
      state.device = null;
    };
  }, []);

  return html`<canvas ref=${ref} data-stage aria-hidden="true"
    class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>`;
}
