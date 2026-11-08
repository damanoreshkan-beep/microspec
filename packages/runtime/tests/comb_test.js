import { assert, assertEquals } from "jsr:@std/assert@1";
import { loadMachine } from "../machine.js";
import { proveMachine } from "../../../tools/wasm.mjs";
import { atlasPlan, COMB_MAX, LEVELS, rgbOf, spiral } from "../comb.js";
import { pkgRoot } from "../pkgroot.js";

const bytes = await Deno.readFile(new URL("packages/runtime/comb.wasm", pkgRoot(import.meta.url, 3)));
const ROWH = 0.8660254 * 1.85, POS = 0x1500, AX = 0x1C00, SITE = 0x400, CELL = 0xC80, CELL2 = 0x1000, GCOL = 0x1380, GCEN = 0x1400, HUD = 0x100;
const boot = async (n, w = 384, h = 832, groups = null) => {
  const api = await loadMachine(bytes, { w, h, seed: 1 });
  api.exports.set(0, n); api.exports.set(1, 56); api.exports.set(2, 68);
  if (groups) groups.forEach((g, i) => api.exports.set(512 + i, g));
  api.exports.step(16, 16);
  const f32 = () => new Float32Array(api.memory.buffer), i32 = () => new Int32Array(api.memory.buffer), u8 = () => new Uint8Array(api.memory.buffer);
  const axial = (i) => [i32()[AX / 4 + 2 * i], i32()[AX / 4 + 2 * i + 1]];
  return { api, x: api.exports, f32, i32, u8, axial, hud: (k) => i32()[HUD / 4 + k], out: (k) => f32()[k] };
};
const hexDist = ([q1, r1], [q2, r2]) => Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(q1 + r1 - q2 - r2));

Deno.test("comb.wasm validates, speaks ABI 1 and survives the proof run", async () => {
  assertEquals(await proveMachine(bytes), []);
  assert(bytes.length < 8192, "a hand-written machine stays small");
});

Deno.test("one group: the lattice is the spiral — every position and site-map entry match the JS twin, for 1, 7, 95 and 217 cells", async () => {
  for (const n of [1, 7, 95, 217]) {
    const { x, f32, u8, out } = await boot(n);
    const P = out(7), ax = spiral(n);
    assertEquals(ax.length, n);
    for (let i = 0; i < n; i++) {
      const [q, r] = ax[i];
      assert(Math.abs(f32()[POS / 4 + 2 * i] - P * (q + r / 2)) < 1e-3, `x of ${i}`);
      assert(Math.abs(f32()[POS / 4 + 2 * i + 1] - P * ROWH * r) < 1e-3, `y of ${i}`);
      const a = SITE + ((r + 8) * 32 + (q + 8)) * 4;
      assertEquals([u8()[a], u8()[a + 3]], [i, 255], `site of ${i}`);
    }
    let occupied = 0; for (let i = 0; i < 17 * 32; i++) if (u8()[SITE + i * 4 + 3] === 255) occupied++;
    assertEquals(occupied, n, "no stale site survives a relayout");
    x.set(0, 3); x.step(16, 32);
    occupied = 0; for (let i = 0; i < 17 * 32; i++) if (u8()[SITE + i * 4 + 3] === 255) occupied++;
    assertEquals(occupied, 3);
  }
});

Deno.test("spiral: the first ring runs clockwise from the top-left cell; the count caps at eight rings", () => {
  assertEquals(spiral(7), [[0, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]]);
  assertEquals(spiral(999).length, COMB_MAX);
  assertEquals(spiral(0), []);
});

Deno.test("groups: every group is one contiguous territory, the first group holds the centre, no site is shared, centroids land inside their group", async () => {
  const sizes = [6, 2, 12, 9, 15, 8, 5, 11, 7, 6, 9, 5];
  const groups = sizes.flatMap((n, g) => Array(n).fill(g));
  const n = groups.length;
  const { x, u8, axial, out, f32, i32 } = await boot(n, 384, 832, groups);
  assertEquals(i32()[HUD / 4 + 5], n);
  assertEquals(axial(0), [0, 0], "the lead sits in the centre");
  const seen = new Set();
  for (let i = 0; i < n; i++) { const k = axial(i).join(","); assert(!seen.has(k), `site ${k} shared`); seen.add(k); assertEquals(u8()[CELL2 + 4 * i], groups[i]); }
  for (let g = 0; g < sizes.length; g++) {
    const cells = groups.map((gg, i) => (gg === g ? i : -1)).filter((i) => i >= 0);
    const reach = new Set([cells[0]]); let grew = true;
    while (grew) { grew = false; for (const a of cells) if (!reach.has(a)) for (const b of reach) if (hexDist(axial(a), axial(b)) === 1) { reach.add(a); grew = true; break; } }
    assertEquals(reach.size, cells.length, `group ${g} is split`);
    const P = out(7), xs = cells.map((i) => f32()[POS / 4 + 2 * i]), ys = cells.map((i) => f32()[POS / 4 + 2 * i + 1]);
    const cx = (u8()[GCEN + 4 * g] | (u8()[GCEN + 4 * g + 1] << 8)) - 32768, cy = (u8()[GCEN + 4 * g + 2] | (u8()[GCEN + 4 * g + 3] << 8)) - 32768;
    assert(cx >= Math.min(...xs) - 1 && cx <= Math.max(...xs) + 1 && cy >= Math.min(...ys) - 1 && cy <= Math.max(...ys) + 1, `centroid of ${g} (${cx},${cy}) outside`);
    assert(P > 0);
  }
  assert(Math.max(...groups.map((_, i) => hexDist(axial(i), [0, 0]))) <= 7);
  x.set(768 + 2, rgbOf("#5CE4DC")); x.step(16, 32);
  assertEquals([...u8().slice(GCOL + 8, GCOL + 11)], [0x5c, 0xe4, 0xdc]);
  assertEquals(i32()[HUD / 4 + 12], 0);
});

Deno.test("the pitch answers the viewport: 84 on a watch, 120 on a desk, min(W,H)/4.2 between; the count clamps", async () => {
  const { x, out, hud } = await boot(95, 320, 568);
  assertEquals(out(7), 84);
  x.set(3, 1280); x.set(4, 900); x.step(16, 32);
  assertEquals(out(7), 120);
  x.set(3, 384); x.set(4, 832); x.step(16, 48);
  assert(Math.abs(out(7) - 384 / 4.2) < 0.01);
  for (let k = 0; k < 80; k++) x.step(16, 64 + 16 * k);
  assert(Math.abs(out(2) - 192) < 0.05 && Math.abs(out(3) - (56 + (832 - 56 - 68) / 2)) < 0.05, `the lens sits between the header and the dock: ${out(2)}, ${out(3)}`);
  x.set(0, 999); x.step(16, 64);
  assertEquals(hud(5), COMB_MAX);
});

Deno.test("colours and marks land in the cell table; the byte region is dirty once after a change, then quiet", async () => {
  const { x, u8 } = await boot(9);
  assertEquals(x.step(16, 32), 0, "quiet after boot");
  x.set(16 + 3, rgbOf("#5CE4DC")); x.set(256 + 3, 2);
  assertEquals(x.step(16, 48), 1);
  assertEquals([...u8().slice(CELL + 12, CELL + 16)], [0x5c, 0xe4, 0xdc, 2]);
  assertEquals(x.step(16, 64), 0);
  assertEquals(rgbOf("not a colour"), 0x8a8a8a);
});

Deno.test("the bloom: at rest the lens opens on the focused cell and a finger on a pushed-out neighbour still hits that neighbour; a touch closes it", async () => {
  const { x, out, hud } = await boot(95);
  let t = 16;
  for (let k = 0; k < 90; k++) { t += 16; x.step(16, t); }
  assert(out(31) > 0.97, `bloom opened at rest: ${out(31)}`);
  const P = out(7), Z = out(27) || 1.35, lens = [out(2), out(3)], cam = [out(0), out(1)], bloom = out(31);
  const world = [-P / 2, -P * ROWH * 1], f = [out(22), out(23)];
  const d = [world[0] - f[0], world[1] - f[1]], r = Math.hypot(...d), tt = Math.min(1, r / (3.4 * P));
  const push = 0.7 * P * bloom * (1 - tt * tt * (3 - 2 * tt));
  const shownW = [world[0] + d[0] / r * push, world[1] + d[1] / r * push];
  const shown = [(shownW[0] - cam[0]) * Z + lens[0], (shownW[1] - cam[1]) * Z + lens[1]];
  assert(push > 0.3 * P, `the neighbour is pushed out by ${(push / P).toFixed(2)} P`);
  x.touch(1, 0, shown[0] / 384, shown[1] / 832); t += 16; x.step(16, t);
  assertEquals(hud(10), 1, "the finger on the pushed-out neighbour presses THAT neighbour");
  x.touch(1, 3, 0, 0); for (let k = 0; k < 90; k++) { t += 16; x.step(16, t); }
  const between = [world[0] - d[0] / r * 0.15 * P, world[1] - d[1] / r * 0.15 * P];
  const betweenScreen = [(between[0] - cam[0]) * Z + lens[0], (between[1] - cam[1]) * Z + lens[1]];
  x.touch(2, 0, betweenScreen[0] / 384, betweenScreen[1] / 832); t += 16; x.step(16, t);
  assertEquals(hud(10), -1, "the space the push opened is nobody's");
  x.touch(2, 3, 0, 0); for (let k = 0; k < 90; k++) { t += 16; x.step(16, t); }
  assert(out(31) > 0.97, "the lens opens again at rest");
  x.touch(1, 0, shown[0] / 384, shown[1] / 832); t += 16; x.step(16, t);
  for (let k = 0; k < 20; k++) { t += 16; x.step(16, t); }
  assert(out(31) < 0.1, `a touch closes the lens: ${out(31)}`);
  x.touch(1, 2, shown[0] / 384, shown[1] / 832);
});

Deno.test("a LIT cell (the song that plays) is found every step and its centre published; the step returns", async () => {
  const { x, out, hud, f32 } = await boot(9);
  x.set(256 + 5, 4);
  const t0 = performance.now(); x.step(16, 32); assert(performance.now() - t0 < 50, "step returned at once");
  assertEquals(out(35), 5, "litIdx published");
  assertEquals([out(38), out(39)], [f32()[POS / 4 + 10], f32()[POS / 4 + 11]], "the lit cell's centre published");
  x.set(256 + 5, 0); x.step(16, 48);
  assertEquals(out(35), -1);
  assert(hud(0) >= 0);
});

Deno.test("a drag moves the world against the finger and the focus follows; a release flings and settles exactly on a cell", async () => {
  const { x, out, hud } = await boot(95);
  let t = 16;
  x.touch(1, 0, 0.8, 0.5);
  for (let k = 1; k <= 10; k++) { t += 16; x.step(16, t); x.touch(1, 1, 0.8 - 0.05 * k, 0.5); }
  t += 16; x.step(16, t);
  assert(out(0) > 110 && out(0) < 200, `cam followed the finger (the drag is divided by the zoom): ${out(0)}`);
  assertEquals(hud(9), 1, "down");
  assert(hud(0) > 0, "the focus left the centre while dragging");
  x.touch(1, 2, 0.3, 0.5);
  for (let k = 0; k < 400; k++) { t += 16; x.step(16, t); }
  assert(out(0) > 200, `the fling carried on past the finger: ${out(0)}`);
  assertEquals(hud(11), 0, "settled exactly on a cell centre");
  assert(hud(1) >= 2, "focusSeq counted the changes");
  assertEquals(hud(9), 0);
});

Deno.test("a tap inside a form opens it; between forms nothing; a finger that moved is not a tap", async () => {
  const { x, out, hud } = await boot(95);
  const lx = out(2) / 384, ly = out(3) / 832, P = out(7);
  let t = 32;
  x.touch(2, 0, lx, ly); t += 16; x.step(16, t);
  assertEquals(hud(10), 0, "the centre cell is pressed");
  x.touch(2, 2, lx, ly); t += 16; x.step(16, t);
  assertEquals([hud(2), hud(3)], [0, 1]);
  assertEquals([out(20), out(21)], [0, 0], "the tap's world point is the cell's centre");
  x.touch(3, 0, lx + (P * 0.5) / 384, ly); t += 16; x.step(16, t);
  assertEquals(hud(10), -1);
  x.touch(3, 2, lx + (P * 0.5) / 384, ly); t += 16; x.step(16, t);
  assertEquals(hud(3), 1, "no second tap");
  x.touch(4, 0, lx, ly); t += 16; x.step(16, t); x.touch(4, 1, lx + 0.1, ly); t += 16; x.step(16, t); x.touch(4, 2, lx + 0.1, ly); t += 16; x.step(16, t);
  assertEquals(hud(3), 1, "a moved finger is not a tap");
  for (let k = 0; k < 60; k++) { t += 16; x.step(16, t); }
  assertEquals(hud(2), -1, "the tap's bloom is over");
});

Deno.test("the field rests at the cards level; a pinch scales it about its midpoint, ends every tap, and eases back to that level", async () => {
  const { x, out, hud, f32 } = await boot(95);
  let t = 16;
  assertEquals(hud(13), Math.round(LEVELS[0] * 1000), "the one level from the first step");
  const row1 = f32()[POS / 4 + 2 * 4 + 1];
  assert(Math.abs(row1 - out(7) * ROWH) < 1e-3, "rows unfolded for the cards at rest");
  const midWorld = () => [(0.5 * 384 - out(2)) / (hud(13) / 1000) + out(0), (0.5 * 832 - out(3)) / (hud(13) / 1000) + out(1)];
  const before = midWorld();
  x.touch(1, 0, 0.4, 0.5); t += 16; x.step(16, t);
  x.touch(2, 0, 0.6, 0.5); t += 16; x.step(16, t);
  assertEquals(hud(14), 1, "pinching");
  for (let k = 1; k <= 8; k++) { x.touch(1, 1, 0.4 - 0.025 * k, 0.5); x.touch(2, 1, 0.6 + 0.025 * k, 0.5); t += 16; x.step(16, t); }
  assert(hud(13) > 1400, `zoom grew: ${hud(13)}`);
  const after = midWorld();
  assert(Math.abs(after[0] - before[0]) < 1 && Math.abs(after[1] - before[1]) < 1, `the world under the midpoint moved: ${before} → ${after}`);
  x.touch(2, 2, 0.8, 0.5); t += 16; x.step(16, t);
  assertEquals(hud(14), 0, "the pinch ended");
  assertEquals(hud(3), 0, "no tap came out of a pinch");
  for (let k = 0; k < 120; k++) { t += 16; x.step(16, t); }
  assertEquals(hud(13), Math.round(LEVELS[0] * 1000), "eased back to the one level");
  assert(Math.abs(f32()[POS / 4 + 2 * 4 + 1] - row1) < 1e-2, "the rows are where they rest");
  x.set(14, 0); for (let k = 0; k < 120; k++) { t += 16; x.step(16, t); }
  assertEquals(hud(13), Math.round(LEVELS[0] * 1000));
  x.touch(1, 0, 152 / 384, 460 / 832); t += 16; x.step(16, t);
  x.touch(2, 0, 232 / 384, 460 / 832); t += 16; x.step(16, t);
  for (let k = 1; k <= 10; k++) { const d = 40 - k * 3; x.touch(1, 1, (192 - d) / 384, 460 / 832); x.touch(2, 1, (192 + d) / 384, 460 / 832); t += 16; x.step(16, t); }
  assertEquals(hud(13), Math.round(LEVELS[0] * 1000), "no smaller zoom exists");
  x.touch(1, 2, 182 / 384, 460 / 832); x.touch(2, 2, 202 / 384, 460 / 832);
  for (let k = 0; k < 60; k++) { t += 16; x.step(16, t); }
  assertEquals(hud(3), 0, "no tap came out of a pinch");
});

Deno.test("a fling past the comb's edge is pulled back: the lens never rests in the void", async () => {
  const { x, hud } = await boot(7);
  let t = 16;
  x.touch(4, 0, 0.5, 0.5);
  for (let k = 1; k <= 6; k++) { t += 16; x.step(16, t); x.touch(4, 1, 0.5, 0.5 + 0.08 * k); }
  x.touch(4, 2, 0.5, 0.98);
  for (let k = 0; k < 600; k++) { t += 16; x.step(16, t); }
  assertEquals(hud(11), 0);
  assert(hud(0) >= 0 && hud(0) < 7);
});

Deno.test("atlasPlan: every count up to the cap fits the atlas, with whole tiles; the tile is never wider than wanted", () => {
  for (let n = 1; n <= COMB_MAX; n++) {
    const p = atlasPlan(n, 4096, 0.75, 455);
    assert(p.cols * p.tileW <= p.size && p.rows * p.tileH <= p.size, `${n} overflows`);
    assert(p.cols * p.rows >= n, `${n} has too few tiles`);
    assert(p.tileW <= 455 && p.tileW >= 100, `${n}: tile ${p.tileW}`);
  }
  assertEquals(atlasPlan(3, 4096, 0.75, 455).tileW, 455);
});
