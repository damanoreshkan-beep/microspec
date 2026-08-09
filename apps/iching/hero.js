import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { gate } from "/_rt/gate.js";
import { decodeHDR, downsampleRGBE } from "/_rt/hdr.js";

const DPR_CAP = 2;          


/**
 * @param seed  0..1 — the cast, packed as six base-4 digits (line value 6..9 → digit 0..3), bottom first.
 *              The shader unpacks it, so a new cast changes the figure with no geometry upload.
 */
export function HeroStage({ seed }) {
  const ref = useRef();
  const state = useRef({ raf: 0, dead: false, device: null, uni: null, ctx: null }).current;

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

        const base = new URL("./", import.meta.url);
        const [wgsl, hdrBytes] = await Promise.all([
          fetch(new URL("hero.wgsl", base)).then((r) => r.text()),
          fetch(new URL("assets/env.hdr", base)).then((r) => r.arrayBuffer()),
        ]);
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

        let level = decodeHDR(new Uint8Array(hdrBytes));
        const mips = Math.floor(Math.log2(Math.max(level.width, level.height))) + 1;
        const envTex = device.createTexture({
          size: [level.width, level.height], format: "rgba8unorm", mipLevelCount: mips,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        for (let m = 0; m < mips; m++) {
          device.queue.writeTexture({ texture: envTex, mipLevel: m }, level.rgbe,
            { bytesPerRow: level.width * 4, rowsPerImage: level.height }, [level.width, level.height]);
          if (m + 1 < mips) level = downsampleRGBE(level, Math.max(1, level.width >> 1));
        }
        const sampler = device.createSampler({
          magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
          addressModeU: "repeat", addressModeV: "clamp-to-edge",
        });

        const uniBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bind = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniBuf } },
            { binding: 1, resource: envTex.createView() },
            { binding: 2, resource: sampler },
          ],
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
        console.warn("hero: WebGPU init failed —", e?.message ?? e);
      }
    })();

    return () => {
      state.dead = true;
      cancelAnimationFrame(state.raf);
      state.cleanupRo?.();
      try { state.device?.destroy?.(); } catch {  }
      state.device = null;
    };
  }, []);

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
