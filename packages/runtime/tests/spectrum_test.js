// microspec runtime — spectrum unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope, advanceTerrain, Parallax, seedFrame, sampleBand, idle, fib, galaxyDisc, frameFit } from "../spectrum.js";

Deno.test("spectrum logBandEdges: monotonic, in-range, correct length", () => {
  const e = logBandEdges(28, 32, 16000, 44100, 2048);
  assertEquals(e.length, 29);
  const bins = 2048 / 2;
  for (let i = 0; i < e.length; i++) { assert(e[i] >= 1 && e[i] <= bins - 1, `edge ${i} in range`); if (i) assert(e[i] >= e[i - 1], "non-decreasing"); }
  assert(e[e.length - 1] > e[0], "spans a real range");
});

Deno.test("spectrum bandLevels: full-scale → ~1, silence → 0, always ≥1 bin", () => {
  const edges = logBandEdges(28, 32, 16000, 44100, 2048);
  const hot = new Uint8Array(1024).fill(255), cold = new Uint8Array(1024);
  const lh = bandLevels(hot, edges); assert(lh.every((v) => Math.abs(v - 1) < 1e-6), "all bands ≈1");
  const lc = bandLevels(cold, edges); assert(lc.every((v) => v === 0), "all bands 0");
  assertEquals(lh.length, 28);
});

Deno.test("spectrum splitBands: energy localises to the right band", () => {
  const sr = 44100, fftSize = 2048, hzPerBin = sr / fftSize;
  const only = (f0, f1) => { const u = new Uint8Array(1024); for (let i = Math.round(f0 / hzPerBin); i <= Math.round(f1 / hzPerBin); i++) u[i] = 255; return u; };
  const b = splitBands(only(20, 150), sr, fftSize); assert(b.bass > 0.9 && b.mid < 0.05 && b.treble < 0.05, "bass isolated");
  const tr = splitBands(only(2000, 16000), sr, fftSize); assert(tr.treble > 0.9 && tr.bass < 0.05, "treble isolated");
});

Deno.test("spectrum spectralCentroid: bass → warm hue, treble → cool hue", () => {
  const sr = 44100, fftSize = 2048, hzPerBin = sr / fftSize;
  const only = (f) => { const u = new Uint8Array(1024); u[Math.round(f / hzPerBin)] = 255; return u; };
  const lo = spectralCentroid(only(80), sr, fftSize), hi = spectralCentroid(only(6000), sr, fftSize);
  assert(lo.hue > hi.hue, "lower centroid → higher (warmer) hue");
  assert(lo.hue <= 280 && hi.hue >= 190, "hue stays inside the signal-palette band");
});

Deno.test("spectrum Envelope: attack faster than release", () => {
  const up = Envelope(0.6, 0.12, 1), tgt = [1];
  up.update(tgt); const afterAttack = up.v[0];
  const down = Envelope(0.6, 0.12, 1); down.v[0] = 1; down.update([0]); const afterRelease = 1 - down.v[0];
  assert(afterAttack > afterRelease, "rises faster than it falls");
  assert(afterAttack > 0 && afterAttack < 1, "eases, not a jump");
});

Deno.test("spectrum advanceTerrain: front row injected, rows recede", () => {
  const rows = 4, cols = 3, grid = new Float32Array(rows * cols);
  advanceTerrain(grid, rows, cols, [1, 1, 1]);
  assert(grid[0] > 0.9, "front row got the level");
  assert(grid[cols] === 0, "second row still empty after one step");
  advanceTerrain(grid, rows, cols, [0, 0, 0]);
  assert(grid[cols] > 0 && grid[cols] < 1, "previous front receded with decay");
});

Deno.test("spectrum Parallax: clamps, low-passes, and reduced-motion zeroes", () => {
  const p = Parallax({ alpha: 1, maxDeg: 20, gain: 1 });
  p.update(40, 40); assert(Math.abs(p.x - 1) < 1e-6 && Math.abs(p.y - 1) < 1e-6, "beyond maxDeg clamps to 1");
  const s = Parallax({ alpha: 0.1 }); s.update(20, 20); assert(s.x > 0 && s.x < 0.5, "EMA eases in, no jump");
  const r = Parallax({ alpha: 1, reduced: true }); r.update(20, 20); assert(r.x === 0 && r.y === 0, "reduced-motion → centred");
  const n = Parallax({ alpha: 1 }); n.update(null, null); assert(n.x === 0, "null readings → centred");
});

Deno.test("spectrum seedFrame: deterministic, in-range, bass-heavy", () => {
  const a = seedFrame(1024, 0), b = seedFrame(1024, 0);
  assertEquals([...a], [...b], "deterministic for a fixed phase");
  assert(a.every((v) => v >= 0 && v <= 255), "bytes in range");
  const front = a.slice(0, 40).reduce((s, v) => s + v, 0), back = a.slice(-40).reduce((s, v) => s + v, 0);
  assert(front > back, "low frequencies carry more energy");
});

Deno.test("spectrum sampleBand: maps 0..1 across bands, clamps out-of-range", () => {
  const lv = [0.1, 0.2, 0.3, 0.4];
  assertEquals(sampleBand(lv, 0), 0.1, "frac 0 → first band");
  assertEquals(sampleBand(lv, 1), 0.4, "frac 1 → last band");
  assertEquals(sampleBand(lv, -5), 0.1, "clamps below");
  assertEquals(sampleBand(lv, 5), 0.4, "clamps above");
  assertEquals(sampleBand([], 0.5), 0, "empty → 0");
});

Deno.test("spectrum idle: bounded breath around the floor, non-flat", () => {
  for (let p = 0; p < 20; p += 0.3) { const v = idle(p, 0.85, 0.15); assert(v >= 0.7 - 1e-9 && v <= 1 + 1e-9, "in [floor-amp, floor+amp]"); }
  assert(Math.abs(idle(Math.PI / 4, 0.85, 0.15) - 1) < 1e-9, "peaks at floor+amp");
  assert(idle(0) !== idle(1), "actually animates (not constant)");
});

Deno.test("spectrum fib: unit-length, evenly spanning the sphere, no pole clumping", () => {
  const n = 64;
  for (let i = 0; i < n; i++) { const [x, y, z] = fib(i, n); assert(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9, "on the unit sphere"); }
  assert(fib(0, n)[1] > 0.9 && fib(n - 1, n)[1] < -0.9, "spans top to bottom");
  const mid = fib(Math.floor(n / 2), n)[1]; assert(Math.abs(mid) < 0.1, "middle index sits near the equator (even spacing)");
});

Deno.test("spectrum galaxyDisc: right length, inside the radius, thin disc, deterministic per rng", () => {
  const seq = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5, 0.5, 0.15, 0.85]; let k = 0;
  const rng = () => seq[k++ % seq.length];
  const g = galaxyDisc(4, { radius: 5, branches: 4, spin: 1, randomness: 0.4, power: 3, thin: 0.5 }, rng);
  assertEquals(g.length, 12, "n*3 floats");
  for (let i = 0; i < 4; i++) { const r = Math.hypot(g[i * 3], g[i * 3 + 2]); assert(r <= 5 * (1 + 0.4) + 1e-6, "within radius + jitter"); assert(Math.abs(g[i * 3 + 1]) <= 5 * 0.4 * 0.5 + 1e-6, "y squashed to a thin disc"); }
  k = 0; const g2 = galaxyDisc(4, { radius: 5, branches: 4 }, () => seq[k++ % seq.length]);
  assertEquals([...g], [...g2], "deterministic for a fixed rng");
});

Deno.test("spectrum frameFit: the binding axis wins, and a portrait viewport pushes the camera back", () => {
  const fov = 50, halfW = 3.5, halfH = 3.5;
  const square = frameFit(halfW, halfH, fov, 1, { margin: 1 });
  const ty = Math.tan((fov * Math.PI) / 180 / 2);
  assert(Math.abs(square.dist - halfH / ty) < 1e-9, "square viewport: the vertical field decides");
  const portrait = frameFit(halfW, halfH, fov, 390 / 844, { margin: 1 });
  assert(portrait.dist > square.dist * 2, "portrait: the horizontal field binds and pulls the camera way back");
  // the whole point — at the fitted distance the subject fits BOTH axes, which is what the authored
  // constants did not: a 6.8-unit ring inside a 3.8-unit-wide frustum was sliced off at both rims.
  const a = 390 / 844, halfFrameH = portrait.dist * ty, halfFrameW = halfFrameH * a;
  assert(halfFrameW >= halfW - 1e-9 && halfFrameH >= halfH - 1e-9, "subject inside the frustum on both axes");
  // the counter-intuitive half, and the reason the gallery looked broken: on a PORTRAIT screen a wide-but-
  // short subject (a galaxy disc seen from above) needs MORE distance than a tall narrow one of the same
  // area — width is the scarce axis here, so framing by "how big is it" rather than by both fields is what
  // put six of ten scenes off the side of the screen.
  const disc = frameFit(6.6, 4, 55, a, { margin: 1 }), tall = frameFit(4, 6.6, 55, a, { margin: 1 });
  assert(disc.dist > tall.dist, "portrait: width binds, so the wide subject is the far one");
  assert(frameFit(6.6, 4, 55, 16 / 9, { margin: 1 }).dist < frameFit(4, 6.6, 55, 16 / 9, { margin: 1 }).dist, "landscape: it flips");
  assert(frameFit(3, 3, fov, a, { margin: 1.2 }).dist > frameFit(3, 3, fov, a, { margin: 1 }).dist, "margin adds air");
  assertEquals(frameFit(3, 3, fov, a).drop, 0, "no lift asked for, no drop");
  const lifted = frameFit(3, 3, fov, a, { lift: 0.1 });
  assert(Math.abs(lifted.drop - 0.1 * 2 * lifted.dist * ty) < 1e-9, "drop is a fraction of the FRAME height at that distance");
});
