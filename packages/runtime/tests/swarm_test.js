// microspec runtime — swarm reactor + math tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { S, SFX, packInput, decodeEntry, wrapT, project, lockOn, betterRun, radarPoint } from "../swarm.js";

const WASM = new URL("../../../apps/swarm/assets/swarm.wasm", import.meta.url);
// The engine suite exercises the PRODUCT app's wasm — absent in the public framework tree (the dreamstudio
// split); the product repo's CI runs it in full. The math suite below needs no app and always runs.
const HAVE_APP = await Deno.stat(WASM).then(() => true).catch(() => false);
const etest = (name, fn) => Deno.test({ name, fn, ignore: !HAVE_APP });

async function engine() {
  const { instance } = await WebAssembly.instantiate(await Deno.readFile(WASM), {});
  const E = instance.exports;
  return {
    E,
    st: () => new Int32Array(E.memory.buffer, E.game_state(), S.COUNT),
    dl: () => new Int16Array(E.memory.buffer, E.game_dl(), E.game_dl_count() * 4),
    n: () => E.game_dl_count(),
  };
}

/* one scripted-bot frame: aim with the JS lockOn mirror, fire on a free trigger. This is the
   cross-check that keeps swarm.js and game.c's hit formulas from drifting: if either side
   changes alone, the bot goes blind and the solvability assertions below collapse. */
function botStep(g) {
  const st = g.st(), dl = g.dl(), n = g.n();
  let az = st[S.NAZ] >= 0 ? st[S.NAZ] : 0, el = 0;
  for (let i = 0; i < n; i++) {
    const e = decodeEntry(dl, i);
    if (e.distCm === st[S.NDIST]) { az = e.azT; el = e.elT; break; }
  }
  g.E.game_step(packInput(az, Math.round(el / 10), st[S.COOLDOWN] === 0));
}

etest("swarm engine · deterministic: same seed, same 300 frames, same state", async () => {
  const a = await engine(), b = await engine();
  a.E.game_init(0xB0DA); b.E.game_init(0xB0DA);
  for (let f = 0; f < 300; f++) {
    const input = packInput((f * 7) % 3600, (f % 40) - 20, f % 5 === 0);
    a.E.game_step(input); b.E.game_step(input);
  }
  assertEquals([...a.st()], [...b.st()], "two engines with one seed and one input tape diverged");
  assertEquals([...a.dl()], [...b.dl()], "display lists diverged");
});

etest("swarm engine · the ring attacks from every quadrant — turning is the game", async () => {
  // Not a distribution nicety: with a 60° FOV, a swarm that clusters in one quadrant is a
  // shooting gallery you never turn for. The spawn spread is even-with-jitter by construction;
  // assert the construction holds across seeds.
  for (const seed of [1, 0xB33F, 0xA17C7]) {
    const g = await engine();
    g.E.game_init(seed);
    const quadrants = new Set();
    for (let f = 0; f < 900; f++) {
      g.E.game_step(packInput(0, 0, 0));
      const dl = g.dl(), n = g.n();
      for (let i = 0; i < n; i++) quadrants.add(Math.floor((decodeEntry(dl, i).azT % 3600) / 900));
    }
    assertEquals(quadrants.size, 4, `seed ${seed}: enemies only ever appeared in quadrants ${[...quadrants]}`);
  }
});

etest("swarm engine · a perfect aim survives two waves — the game is winnable", async () => {
  const g = await engine();
  g.E.game_init(0xB0DA);
  let f = 0;
  while (g.st()[S.WAVE] < 3 && !g.st()[S.DEAD] && f < 20000) { botStep(g); f++; }
  const st = g.st();
  assertEquals(st[S.DEAD], 0, `the bot died on wave ${st[S.WAVE]} — unwinnable, or the JS aim mirror drifted from the wasm`);
  assert(st[S.WAVE] >= 3, `only reached wave ${st[S.WAVE]} in ${f} frames`);
  assert(st[S.KILLS] >= 8, `wave 3 with only ${st[S.KILLS]} kills — contact attrition is clearing waves, not the player`);
  assert(st[S.SCORE] > 0, "kills scored nothing");
});

etest("swarm engine · ignoring the swarm is fatal — the threat is real", async () => {
  const g = await engine();
  g.E.game_init(0xB0DA);
  let f = 0;
  while (!g.st()[S.DEAD] && f < 8000) { g.E.game_step(0); f++; }
  assertEquals(g.st()[S.DEAD], 1, "8000 idle frames and still alive — the swarm never lands a sting");
  assert(g.st()[S.HP] === 0, "dead with hearts remaining");
});

etest("swarm engine · firing away from everything kills nothing", async () => {
  const g = await engine();
  g.E.game_init(0xB0DA);
  for (let f = 0; f < 600; f++) {
    const st = g.st();
    const away = st[S.NAZ] >= 0 ? (st[S.NAZ] + 1800) % 3600 : 900;
    g.E.game_step(packInput(away, -60, st[S.COOLDOWN] === 0));
  }
  const st = g.st();
  assertEquals(st[S.KILLS], 0, "kills landed with the crosshair 180° from every enemy — the tolerance is a lie");
  assert(st[S.SHOTS] > 20, `only ${st[S.SHOTS]} shots left the trigger — the test never actually fired`);
});

etest("swarm engine · the trigger has a cooldown and says so", async () => {
  const g = await engine();
  g.E.game_init(0xB0DA);
  g.E.game_step(packInput(0, 0, 1));
  const after1 = g.st()[S.SHOTS];
  g.E.game_step(packInput(0, 0, 1));
  assertEquals(after1, 1, "the first trigger pull did not fire");
  assertEquals(g.st()[S.SHOTS], 1, "two frames, two shots — the cooldown is not being applied");
  assert(g.st()[S.COOLDOWN] > 0, "fired with no cooldown reported");
});

etest("swarm engine · a cleared wave gives a breath, then a bigger ring and a heart back", async () => {
  const g = await engine();
  g.E.game_init(0xB0DA);
  let f = 0, sawBreak = false;
  while (g.st()[S.WAVE] < 2 && f < 20000) {
    botStep(g); f++;
    if (g.st()[S.ALIVE] === 0 && g.st()[S.SPAWNLEFT] === 0 && !g.st()[S.DEAD]) sawBreak = true;
  }
  assert(g.st()[S.WAVE] === 2, "never reached wave 2");
  assert(sawBreak, "wave 2 arrived with no empty-ring breath between waves");
  assertEquals(g.st()[S.HP], 3, "the wave-clear heart did not come back (or a sting slipped through the bot)");
});

Deno.test("swarm math · wrapT takes the short way round", () => {
  assertEquals(wrapT(3590 - 10), -20);
  assertEquals(wrapT(10 - 3590), 20);
  assertEquals(wrapT(1800), -1800);
  assertEquals(wrapT(0), 0);
});

Deno.test("swarm math · input packing round-trips through the wasm's unpacking", () => {
  // mirror of game.c: az = input & 0xFFF (mod 3600), el = ((input>>12)&0x7F)-64, fire = bit 19
  for (const [az, el, fire] of [[0, 0, 0], [3599, 63, 1], [1800, -64, 1], [7200 + 90, 5, 0]]) {
    const p = packInput(az, el, fire);
    assertEquals((p & 0xfff) % 3600, ((az % 3600) + 3600) % 3600);
    assertEquals(((p >> 12) & 0x7f) - 64, Math.max(-64, Math.min(63, el)));
    assertEquals((p >> 19) & 1, fire ? 1 : 0);
  }
});

Deno.test("swarm math · projection centres what you face and mirrors the wrap", () => {
  const w = 384, h = 700;
  assertEquals(project(2100, 0, 2100, 0, w, h).x, w / 2);
  // 5° right of heading is 5° right of centre, at w/600 px per tenth
  assertEquals(project(2150, 0, 2100, 0, w, h).x, w / 2 + 50 * (w / 600));
  // the seam: 359° seen from 1° is 2° LEFT, never 358° right
  assert(project(3590, 0, 10, 0, w, h).x < w / 2, "the 0/360 seam projected the long way round");
  // up is up
  assert(project(0, 100, 0, 0, w, h).y < h / 2);
});

Deno.test("swarm math · lockOn picks the nearest covered target, and only a covered one", () => {
  // entries: kind, azT, elT, attr(distQ | pose<<11 | flash<<13)
  const mk = (kind, azT, elT, distCm) => [0x100 + kind, azT, elT, (distCm >> 1) & 0x7ff];
  const dl = Int16Array.from([
    ...mk(0, 100, 0, 800),     // covered at aim 100 (tol ≈ 25+25)
    ...mk(0, 100, 0, 400),     // covered and NEARER — must win
    ...mk(0, 900, 0, 200),     // far off-axis: never
  ]);
  assertEquals(lockOn(dl, 3, 100, 0), 1, "did not prefer the nearer covered target");
  assertEquals(lockOn(dl, 3, 2700, 0), -1, "locked with the crosshair on empty sky");
});

Deno.test("swarm math · radar puts ahead up and behind down", () => {
  const ahead = radarPoint(2100, 2100, 1200, 40);
  assert(Math.abs(ahead.x) < 1e-9 && ahead.y < 0, "ahead is not up");
  const behind = radarPoint(300, 2100, 1200, 40);
  assert(behind.y > 0, "behind is not down");
});

Deno.test("swarm math · betterRun ranks wave, then score, then kills", () => {
  const a = { wave: 3, score: 100, kills: 5 }, b = { wave: 2, score: 900, kills: 9 };
  assertEquals(betterRun(a, b), a);
  assertEquals(betterRun(null, b), b);
  assertEquals(betterRun({ wave: 3, score: 200, kills: 1 }, a).score, 200);
});
