// microspec runtime — motion unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { motionCells, motionEnergy, centroidOf } from "../motion.js";

Deno.test("motion motionCells: locates changed cells, normalized, with the new colour", () => {
  const W = 4, H = 4, N = W * H;
  const flat = (c) => { const a = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) { a[i * 4] = c[0]; a[i * 4 + 1] = c[1]; a[i * 4 + 2] = c[2]; a[i * 4 + 3] = 255; } return a; };
  const prev = flat([10, 10, 10]);
  const cur = flat([10, 10, 10]);
  assertEquals(motionCells(prev, cur, W, H), [], "no change → no cells");
  // change pixel index 5 (x=1,y=1) to bright
  cur[5 * 4] = 240; cur[5 * 4 + 1] = 30; cur[5 * 4 + 2] = 30;
  const cells = motionCells(prev, cur, W, H, 24);
  assertEquals(cells.length, 1, "one moved cell");
  assertEquals([cells[0].x, cells[0].y], [0.25, 0.25], "cell 5 → (0.25,0.25)");
  assertEquals([cells[0].r, cells[0].g, cells[0].b], [240, 30, 30], "carries the new colour");
  assert(cells[0].m > 0 && cells[0].m <= 1, "magnitude in range");
  // threshold gates small changes
  const tiny = flat([10, 10, 10]); tiny[5 * 4] = 20; // dl≈3, below 24
  assertEquals(motionCells(prev, tiny, W, H, 24), [], "sub-threshold ignored");
  assertEquals(motionCells(null, cur, W, H), [], "no previous frame → no cells");
});

Deno.test("motion motionEnergy: 0 when still, rises with change, clamped", () => {
  const N = 16, flat = (v) => { const a = new Uint8ClampedArray(N * 4); a.fill(v); for (let i = 0; i < N; i++) a[i * 4 + 3] = 255; return a; };
  assertEquals(motionEnergy(flat(20), flat(20)), 0, "identical → 0");
  assertEquals(motionEnergy(null, flat(20)), 0);
  assert(motionEnergy(flat(0), flat(255)) === 1, "max change clamps to 1");
  const mid = motionEnergy(flat(20), flat(40));
  assert(mid > 0 && mid < 1, "partial change is between");
});

Deno.test("motion centroidOf: magnitude-weighted centre, empty → middle", () => {
  assertEquals(centroidOf([]), { x: 0.5, y: 0.5, m: 0 });
  assertEquals(centroidOf(null), { x: 0.5, y: 0.5, m: 0 });
  // two equal-weight cells → midpoint
  const c = centroidOf([{ x: 0.2, y: 0.4, m: 0.5 }, { x: 0.6, y: 0.8, m: 0.5 }]);
  assert(Math.abs(c.x - 0.4) < 1e-9 && Math.abs(c.y - 0.6) < 1e-9, "midpoint");
  // heavier cell pulls the centre toward it
  const w = centroidOf([{ x: 0, y: 0, m: 0.1 }, { x: 1, y: 1, m: 0.9 }]);
  assert(w.x > 0.8 && w.y > 0.8, "weighted toward the strong cell");
  assert(w.m > 0 && w.m <= 1, "energy in range");
});
