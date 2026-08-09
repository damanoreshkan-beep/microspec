// Offline HERO preview — WebGPU, headless, no browser.
//
//   deno run -A tools/art/hero.mjs iching --out /tmp/hero.png
//   deno run -A tools/art/hero.mjs iching --sheet 3x3 --dur 6 --out /tmp/sheet.png
//   deno run -A tools/art/hero.mjs iching --seed 0.569092 --t 2.2 --w 384 --h 832
//
// WHY THIS EXISTS. The farm's visuals were poor for one structural reason: a 3D scene had no offline path,
// so every iteration cost a push, a CI run, a deploy and a remote screenshot — about ten minutes. Nobody
// designs a picture in two attempts. Deno 2.9 ships WebGPU and this phone has a working adapter, so the
// same WGSL that ships renders HERE in ~1.4s. (That capability existed all along; I had assumed the ban on
// Chromium meant graphics could not be checked locally, which was never what it said.)
//
// THE CONTACT SHEET is the point of the tool, not a mode. A single frame cannot show whether a crack opens
// evenly, whether a bridge grows, or whether an orbit stutters — and those ARE the design. `--sheet 3x3`
// renders nine moments across `--dur` seconds into one grid, which is how animators have always reviewed
// motion and the only way a still-image reader can judge it.
//
// The scene is apps/<id>/hero.wgsl: one fullscreen triangle plus a fragment shader. The environment map is
// apps/<id>/assets/env.hdr — the ORIGINAL CC0 Radiance file, decoded by packages/runtime/hdr.js. No
// intermediate format, no build artefact, nothing to keep in sync.
//
// Bindings every scene gets:
//   @binding(0) uniform U { res: vec2f, time: f32, seed: f32, ink: vec4f }
//   @binding(1) texture_2d<f32>   env    — RGBE; radiance = rgb * exp2(a * 255.0 - 128.0)
//   @binding(2) sampler           envSam

import { encodePNG } from "./png.mjs";
import { decodeHDR, downsampleRGBE } from "../../packages/runtime/hdr.js";

const args = Deno.args;
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const app = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!app) { console.error("usage: hero.mjs <app> [--w N --h N --t SEC --seed F --sheet CxR --dur SEC --out FILE]"); Deno.exit(2); }

// A VARIANT sheet is a different thing from a motion sheet: one instant, many framings. It exists because
// a tool cannot invent an approved composition — so instead of converging on one by feel, render the
// candidates side by side and let a person point at the right one.
//
//   --varyx 0.50,0.64,0.78 --varyy -0.06,0.06     → a 3×2 grid, vary.x across, vary.y down
//
// The two numbers reach the shader as `u.vary.xy`; what they MEAN is the scene's business.
const VARY_X = (flag("varyx", "") || "").split(",").filter(Boolean).map(Number);
const VARY_Y = (flag("varyy", "") || "").split(",").filter(Boolean).map(Number);
const VARIANTS = VARY_X.length > 0 || VARY_Y.length > 0;

const SHEET = flag("sheet", "");
const [COLS, ROWS] = VARIANTS
  ? [Math.max(1, VARY_X.length), Math.max(1, VARY_Y.length)]
  : (SHEET ? SHEET.split("x").map(Number) : [1, 1]);
const CELLS = Math.max(1, COLS * ROWS);
const DUR = Number(flag("dur", 6));
const T0 = Number(flag("t", 1.6));
const SEED = Number(flag("seed", 0.569092));
const OUT = flag("out", `/tmp/hero-${app}${SHEET ? "-sheet" : ""}.png`);
const INK = flag("ink", "0.90,0.89,0.93,1").split(",").map(Number);
// A sheet cell is smaller, so the whole grid stays a sane image; a single frame is the reference device.
const W = Number(flag("w", 384)) | 0;
const H = Number(flag("h", 832)) | 0;

const scenePath = new URL(`../../apps/${app}/hero.wgsl`, import.meta.url);
let scene;
try { scene = await Deno.readTextFile(scenePath); }
catch { console.error(`hero: no shader at apps/${app}/hero.wgsl`); Deno.exit(1); }

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) { console.error("hero: no WebGPU adapter here"); Deno.exit(1); }
const device = await adapter.requestDevice();
device.addEventListener?.("uncapturederror", (e) => console.error("hero: GPU error —", e.error?.message ?? e));

// Only the vertex stage. The scene declares its own uniform struct and bindings so apps/<id>/hero.wgsl is a
// complete shader rather than a fragment that compiles only inside this tool.
const VS = `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}
`;

const module = device.createShaderModule({ code: VS + "\n" + scene });
const info = await module.getCompilationInfo?.();
const errors = (info?.messages ?? []).filter((m) => m.type === "error");
if (errors.length) {
  for (const m of errors) console.error(`hero: apps/${app}/hero.wgsl:${m.lineNum}:${m.linePos} — ${m.message}`);
  Deno.exit(1);
}

const FORMAT = "rgba8unorm";
const pipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: { module, entryPoint: "vs" },
  fragment: { module, entryPoint: "fs", targets: [{ format: FORMAT }] },
  primitive: { topology: "triangle-list" },
});

// ── environment map ──────────────────────────────────────────────────────────────────────────────
// The single biggest quality lever: metal looks expensive because of what it REFLECTS, so one CC0 HDRI
// replaces a rig of analytic lights. Downsampled because a rough metal's reflection is blurred anyway —
// 256 wide is 256 KB of GPU memory against 2 MB at 1024, and the difference is not visible at r=0.3.
const ENV_W = Number(flag("env", 0)) | 0;   // 0 = full resolution; downsample only if explicitly asked
let env = { width: 1, height: 1, rgbe: new Uint8Array([0, 0, 0, 128]) };
try {
  const raw = await Deno.readFile(new URL(`../../apps/${app}/assets/env.hdr`, import.meta.url));
  const full = decodeHDR(raw);
  env = ENV_W && full.width > ENV_W ? downsampleRGBE(full, ENV_W) : full;
  console.log(`  env: ${full.width}×${full.height} → ${env.width}×${env.height} (${(env.rgbe.length / 1024).toFixed(0)} KB on GPU)`);
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) console.error("hero: env.hdr failed to decode —", e.message);
}

// A MIP CHAIN, not a smaller texture — the distinction I got wrong once already. Shrinking the asset is a
// loss of quality; a prefiltered chain is how roughness physically works. A rough surface must sample a
// BLURRED reflection, and without it a 0.30-roughness bronze renders as a mirror showing individual texels
// as squares — which is exactly what the first image did.
const MIPS = Math.floor(Math.log2(Math.max(env.width, env.height))) + 1;
const envTex = device.createTexture({
  size: [env.width, env.height], format: FORMAT, mipLevelCount: MIPS,
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
// Every level is averaged in LINEAR radiance by downsampleRGBE. Averaging the packed bytes instead would
// mix two different exponents and dim every bright source — the very part that makes metal read as metal.
let lvl = env;
for (let m = 0; m < MIPS; m++) {
  device.queue.writeTexture({ texture: envTex, mipLevel: m }, lvl.rgbe,
    { bytesPerRow: lvl.width * 4, rowsPerImage: lvl.height }, [lvl.width, lvl.height]);
  if (m + 1 < MIPS) lvl = downsampleRGBE(lvl, Math.max(1, lvl.width >> 1));
}
console.log(`  env mips: ${MIPS} levels down to 1×1`);

// Repeat in u: an equirectangular map wraps at the horizon, and clamping leaves a seam behind the subject.
// Trilinear so the shader can ask for a fractional level and get a smooth roughness response.
const envSampler = device.createSampler({
  magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
  addressModeU: "repeat", addressModeV: "clamp-to-edge",
});

// The environment is OPTIONAL, and the shader itself is what decides. `layout: "auto"` derives the bind
// group layout from what the WGSL actually declares, so handing it a texture that no shader stage reads is
// a validation error, not a harmless extra. A field shader (fbm flow) needs no map; a lit-object shader
// does. Detecting it from the source keeps one renderer serving both instead of forking the tool.
const usesEnv = /@binding\(1\)/.test(scene);
const uniBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: usesEnv
    ? [
      { binding: 0, resource: { buffer: uniBuf } },
      { binding: 1, resource: envTex.createView() },
      { binding: 2, resource: envSampler },
    ]
    : [{ binding: 0, resource: { buffer: uniBuf } }],
});

const target = device.createTexture({ size: [W, H], format: FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
const rowPad = Math.ceil((W * 4) / 256) * 256;            // copyTextureToBuffer wants 256-byte rows
const readback = device.createBuffer({ size: rowPad * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

async function renderFrame(time, vx = 0, vy = 0) {
  const uni = new Float32Array(12);
  uni.set([W, H, time, SEED], 0);
  uni.set(INK.length === 4 ? INK : [0.9, 0.89, 0.93, 1], 4);
  uni.set([vx, vy, 0, 0], 8);
  device.queue.writeBuffer(uniBuf, 0, uni);

  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }],
  });
  pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end();
  enc.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: rowPad, rowsPerImage: H }, [W, H]);
  device.queue.submit([enc.finish()]);

  await readback.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(readback.getMappedRange().slice(0));
  readback.unmap();
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) px.set(padded.subarray(y * rowPad, y * rowPad + W * 4), y * W * 4);
  return px;
}

const started = performance.now();
let outPx, outW, outH;

if (CELLS === 1) {
  outPx = await renderFrame(T0, VARY_X[0] ?? 0, VARY_Y[0] ?? 0); outW = W; outH = H;
} else {
  // Contact sheet: `CELLS` moments spread across `DUR` seconds, laid out left→right, top→bottom, with a
  // one-pixel gutter so adjacent cells cannot be mistaken for one continuous image.
  const GUT = 2;
  outW = COLS * W + (COLS - 1) * GUT;
  outH = ROWS * H + (ROWS - 1) * GUT;
  outPx = new Uint8Array(outW * outH * 4).fill(0);
  for (let i = 0; i < CELLS; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    // Variants hold time still and sweep the framing; a motion sheet holds the framing and sweeps time.
    const t = VARIANTS ? T0 : T0 + (DUR * i) / CELLS;
    const vx = VARIANTS ? (VARY_X[col] ?? 0) : 0;
    const vy = VARIANTS ? (VARY_Y[row] ?? 0) : 0;
    if (VARIANTS) console.log("  cell " + col + "," + row + ": vary = " + vx + ", " + vy);
    const cell = await renderFrame(t, vx, vy);
    const cx = col * (W + GUT), cy = row * (H + GUT);
    for (let y = 0; y < H; y++) {
      const dst = ((cy + y) * outW + cx) * 4;
      outPx.set(cell.subarray(y * W * 4, y * W * 4 + W * 4), dst);
    }
  }
}

await Deno.writeFile(OUT, await encodePNG(outPx, outW, outH));
const ms = (performance.now() - started).toFixed(0);
console.log(`✓ ${app} → ${OUT}  ${outW}×${outH}` +
  (CELLS > 1 ? `  ${COLS}×${ROWS} frames over ${DUR}s` : `  t=${T0}s`) +
  `  ${(Deno.statSync(OUT).size / 1024).toFixed(0)} KB  ${ms}ms`);
