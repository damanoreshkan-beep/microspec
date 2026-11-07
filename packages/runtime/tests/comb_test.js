import { assert, assertEquals } from "jsr:@std/assert@1";
import { loadMachine } from "../machine.js";
import { proveMachine } from "../../../tools/wasm.mjs";
import { atlasPlan, COMB_MAX, rgbOf, spiral } from "../comb.js";
import { pkgRoot } from "../pkgroot.js";

const bytes = await Deno.readFile(new URL("packages/runtime/comb.wasm", pkgRoot(import.meta.url, 3)));
const ROWH = 0.8660254 * 1.3, POS = 0x1000, SITE = 0x400, CELL = 0xC80, HUD = 0x100;
const boot = async (n, w = 384, h = 832) => {
  const api = await loadMachine(bytes, { w, h, seed: 1 });
  api.exports.set(0, n); api.exports.set(1, 56); api.exports.set(2, 68);
  api.exports.step(16, 16);
  const f32 = () => new Float32Array(api.memory.buffer), i32 = () => new Int32Array(api.memory.buffer), u8 = () => new Uint8Array(api.memory.buffer);
  return { api, x: api.exports, f32, i32, u8, hud: (k) => i32()[HUD / 4 + k], out: (k) => f32()[k] };
};

Deno.test("comb.wasm validates, speaks ABI 1 and survives the proof run", async () => {
  assertEquals(await proveMachine(bytes), []);
  assert(bytes.length < 4096, "a hand-written machine stays small");
});

Deno.test("the lattice is the spiral: every cell's position and site-map entry match the JS twin, for 1, 7, 95 and 217 cells", async () => {
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
  const last = spiral(COMB_MAX)[COMB_MAX - 1];
  assertEquals(Math.max(Math.abs(last[0]), Math.abs(last[1]), Math.abs(last[0] + last[1])), 8);
});

Deno.test("the pitch answers the viewport: 84 on a watch, 120 on a desk, min(W,H)/4.2 between; the count clamps", async () => {
  const { x, out, hud } = await boot(95, 320, 568);
  assertEquals(out(7), 84);
  x.set(3, 1280); x.set(4, 900); x.step(16, 32);
  assertEquals(out(7), 120);
  x.set(3, 384); x.set(4, 832); x.step(16, 48);
  assert(Math.abs(out(7) - 384 / 4.2) < 0.01);
  assertEquals([out(2), out(3)], [192, 56 + (832 - 56 - 68) / 2], "the lens sits between the header and the dock");
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

Deno.test("a drag moves the world against the finger and the focus follows; a release flings and settles exactly on a cell", async () => {
  const { x, out, hud } = await boot(95);
  let t = 16;
  x.touch(1, 0, 0.8, 0.5);
  for (let k = 1; k <= 10; k++) { t += 16; x.step(16, t); x.touch(1, 1, 0.8 - 0.05 * k, 0.5); }
  t += 16; x.step(16, t);
  assert(out(0) > 150 && out(0) < 200, `cam followed the finger: ${out(0)}`);
  assertEquals(hud(9), 1, "down");
  assert(hud(0) > 0, "the focus left the centre while dragging");
  x.touch(1, 2, 0.3, 0.5);
  for (let k = 0; k < 400; k++) { t += 16; x.step(16, t); }
  const fo = hud(0);
  assert(out(0) > 200, `the fling carried on past the finger: ${out(0)}`);
  assertEquals(hud(11), 0, "settled exactly on a cell centre");
  assert(hud(1) >= 2, "focusSeq counted the changes");
  assertEquals(hud(9), 0);
  assert(fo > 0 && fo < 95);
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

Deno.test("atlasPlan: every count up to the cap fits the atlas, with whole tiles", () => {
  for (let n = 1; n <= COMB_MAX; n++) {
    const p = atlasPlan(n);
    assert(p.cols * p.tileW <= p.size && p.rows * p.tileH <= p.size, `${n} overflows`);
    assert(p.cols * p.rows >= n, `${n} has too few tiles`);
    assert(p.tileW <= 512 && p.tileW >= 100, `${n}: tile ${p.tileW}`);
  }
  assertEquals(atlasPlan(3).tileW, 512);
});
