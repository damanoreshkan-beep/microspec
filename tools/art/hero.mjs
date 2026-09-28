import { encodePNG } from "./png.mjs";
import { decodeHDR, downsampleRGBE } from "../../packages/runtime/hdr.js";

const args = Deno.args;
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const app = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!app) { console.error("usage: hero.mjs <app> [--w N --h N --t SEC --seed F --sheet CxR --dur SEC --out FILE]"); Deno.exit(2); }

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
const VARY = flag("vary", "0,0,0,0").split(",").map(Number);
const LIGHT = Number(flag("light", 0));
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

const ENV_W = Number(flag("env", 0)) | 0;
let env = { width: 1, height: 1, rgbe: new Uint8Array([0, 0, 0, 128]) };
try {
  const raw = await Deno.readFile(new URL(`../../apps/${app}/assets/env.hdr`, import.meta.url));
  const full = decodeHDR(raw);
  env = ENV_W && full.width > ENV_W ? downsampleRGBE(full, ENV_W) : full;
  console.log(`  env: ${full.width}×${full.height} → ${env.width}×${env.height} (${(env.rgbe.length / 1024).toFixed(0)} KB on GPU)`);
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) console.error("hero: env.hdr failed to decode —", e.message);
}

const MIPS = Math.floor(Math.log2(Math.max(env.width, env.height))) + 1;
const envTex = device.createTexture({
  size: [env.width, env.height], format: FORMAT, mipLevelCount: MIPS,
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
let lvl = env;
for (let m = 0; m < MIPS; m++) {
  device.queue.writeTexture({ texture: envTex, mipLevel: m }, lvl.rgbe,
    { bytesPerRow: lvl.width * 4, rowsPerImage: lvl.height }, [lvl.width, lvl.height]);
  if (m + 1 < MIPS) lvl = downsampleRGBE(lvl, Math.max(1, lvl.width >> 1));
}
console.log(`  env mips: ${MIPS} levels down to 1×1`);

const envSampler = device.createSampler({
  magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
  addressModeU: "repeat", addressModeV: "clamp-to-edge",
});

const usesEnv = /@binding\(1\)/.test(scene);
const uniBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
const rowPad = Math.ceil((W * 4) / 256) * 256;
const readback = device.createBuffer({ size: rowPad * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

async function renderFrame(time, vx, vy) {
  const uni = new Float32Array(16);
  const vary = VARY.length === 4 ? [...VARY] : [0, 0, 0, 0];
  if (vx !== undefined) vary[0] = vx;
  if (vy !== undefined) vary[1] = vy;
  uni.set([W, H, time, SEED], 0);
  uni.set(INK.length === 4 ? INK : [0.9, 0.89, 0.93, 1], 4);
  uni.set(vary, 8);
  uni.set([LIGHT, 0, 0, 0], 12);
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
  outPx = await renderFrame(T0, VARY_X[0], VARY_Y[0]); outW = W; outH = H;
} else {
  const GUT = 2;
  outW = COLS * W + (COLS - 1) * GUT;
  outH = ROWS * H + (ROWS - 1) * GUT;
  outPx = new Uint8Array(outW * outH * 4).fill(0);
  for (let i = 0; i < CELLS; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const t = VARIANTS ? T0 : T0 + (DUR * i) / CELLS;
    const vx = VARIANTS ? VARY_X[col] : undefined;
    const vy = VARIANTS ? VARY_Y[row] : undefined;
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
