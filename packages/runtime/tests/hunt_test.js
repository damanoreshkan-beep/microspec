// microspec runtime — hunt engine unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";

// ── hunt — the ranged engine ──────────────────────────────────────────────────────────────
const HUNT_WASM = new URL("../../../apps/hunt/assets/hunt.wasm", import.meta.url);
// The engine suite exercises the PRODUCT app's wasm. In the public framework tree (the dreamstudio split,
// 2026-08-31) that app is absent — the suite still runs in full in the product repo, whose CI drives these
// same tests through the framework symlink with the farm present.
const HAVE_APP = await Deno.stat(HUNT_WASM).then(() => true).catch(() => false);
const etest = (name, fn) => Deno.test({ name, fn, ignore: !HAVE_APP });
const HUNT_S = { SFX: 10, AMMO: 13, HP: 14, KILLS: 16, COUNT: 17 };
const HUNT_IN = { RIGHT: 2, RUN: 8, SHOOT: 32 };
async function huntEngine() {
  const { instance } = await WebAssembly.instantiate(await Deno.readFile(HUNT_WASM), {});
  const E = instance.exports;
  return { E, st: () => new Int32Array(E.memory.buffer, E.game_state(), HUNT_S.COUNT) };
}

etest("hunt engine · your own spear cannot hurt you", async () => {
  // It could, and it did: the contact check listed the kinds to SKIP rather than the kinds that
  // are a threat, so particles were excluded and the player's own projectile was not. A spear
  // leaves from inside her box and on a sprint travels alongside her, so throwing while running
  // was a way to kill yourself. A skip-list grows a hole every time a kind is added; this asserts
  // the behaviour rather than the list.
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  const hp0 = st()[HUNT_S.HP];
  let hurt = 0, thrown = 0;
  for (let f = 0; f < 240; f++) {
    E.game_step(HUNT_IN.RIGHT | HUNT_IN.RUN | (f % 12 === 0 ? HUNT_IN.SHOOT : 0));
    const s = st();
    if (s[HUNT_S.SFX] & 64) thrown++;
    if (s[HUNT_S.SFX] & 128) hurt++;
  }
  assert(thrown >= 6, `only ${thrown} spears left the hand — the test is not exercising the throw`);
  assertEquals(hurt, 0, "throwing while sprinting hurt the thrower");
  assertEquals(st()[HUNT_S.HP], hp0, "hearts were lost on the calm opening, with nothing to hit her");
});

etest("hunt engine · the quiver is finite and refuses to go negative", async () => {
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  const start = st()[HUNT_S.AMMO];
  assert(start > 0, "the game starts with nothing to throw");
  for (let f = 0; f < 900; f++) E.game_step(HUNT_IN.SHOOT);     // hammer it long past empty
  const s = st();
  assert(s[HUNT_S.AMMO] >= 0, `ammo went negative (${s[HUNT_S.AMMO]})`);
  assert((s[HUNT_S.SFX] & 512) !== 0 || s[HUNT_S.AMMO] === 0,
    "an empty quiver must SAY it is empty — a dead button is indistinguishable from a broken one");
});

etest("hunt engine · the collision box it reports IS the one it stands on", async () => {
  // The renderer stands sprites on game_box(). If that number and the simulation's own idea of the
  // player's feet ever disagree, the character hovers — which is what happened when the sprite was
  // stood on the bottom of a TILE instead: one pixel out in brick, twelve here, and twelve pixels
  // is a character floating. So assert the RELATIONSHIP, not the constant: after landing, the
  // bottom of the reported box must sit exactly on the surface it is resting on.
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  for (let f = 0; f < 90; f++) E.game_step(0);                 // stand still and settle
  const s = st();
  const packed = E.game_box(0);
  const boxH = packed & 0xffff;
  assert(boxH > 0 && boxH < 200, `game_box returned a nonsense height (${boxH})`);
  const py = s[6], feet = py + boxH;
  // find the surface directly under her
  const col = Math.floor((s[4] + s[5]) / 24);
  let ground = -1;
  for (let r = 0; r < 11; r++) if (E.game_tile(col, r) >= 0x10) { ground = r * 24; break; }
  assert(ground >= 0, "she is not standing over any ground — the fixture moved");
  assertEquals(feet, ground, `feet at ${feet} against a surface at ${ground} — the box the renderer is given is not the box she rests on`);
});

// ── the day cycle (worldAt) — the palette is a FUNCTION now, so its laws are testable ─────
import { WORLD, PHASES, CYCLE, worldAt, lerpHex } from "../hunt.js";

const WORLD_KEYS = Object.keys(WORLD).filter((k) => typeof WORLD[k] === "string");
const luma = (h) =>
  0.2126 * parseInt(h.slice(1, 3), 16) + 0.7152 * parseInt(h.slice(3, 5), 16) + 0.0722 * parseInt(h.slice(5, 7), 16);

Deno.test("hunt day · every keyframe carries the FULL world key set", () => {
  // A key missing from one phase would lerp against undefined and flash the fallback mid-run —
  // the failure would be a one-frame colour pop nobody can reproduce. Parity is the contract.
  for (const ph of PHASES) {
    const missing = WORLD_KEYS.filter((k) => !(k in ph.colors));
    assertEquals(missing, [], `a keyframe at t=${ph.at} is missing: ${missing.join(", ")}`);
    const extra = Object.keys(ph.colors).filter((k) => !WORLD_KEYS.includes(k));
    assertEquals(extra, [], `a keyframe at t=${ph.at} carries unknown keys: ${extra.join(", ")}`);
  }
});

Deno.test("hunt day · depth is a value: every band darker than the sky, stepping down as it nears", () => {
  // The law the night palette documented in prose, now enforced for all five hours: a backdrop
  // band brighter than the sky behind it reads as GLOWING, and two bands at one value collapse
  // into one distance.
  for (const ph of PHASES) {
    const skyBot = luma(ph.sky[1]);
    const bands = ["ridge", "canopyFar", "canopyMid", "canopy"].map((k) => luma(ph.colors[k]));
    for (let i = 0; i < bands.length; i++) {
      assert(bands[i] < skyBot, `t=${ph.at}: band ${i} (${bands[i].toFixed(0)}) is not darker than the horizon sky (${skyBot.toFixed(0)})`);
      if (i > 0) assert(bands[i] < bands[i - 1] + 0.01, `t=${ph.at}: band ${i} does not step down from band ${i - 1}`);
    }
  }
});

Deno.test("hunt day · the hour turns without a visible seam", () => {
  // 4 columns is the render quantum (mirrored in apps/hunt/render.js); a per-channel jump past
  // ~16 between adjacent quanta is a palette POP on screen. Includes the wrap: a long run's
  // second dawn must arrive smoothly.
  const step = 4;
  for (let d = 0; d <= CYCLE; d += step) {
    const a = worldAt(d), b = worldAt(d + step);
    for (const k of WORLD_KEYS) {
      const A = a.colors[k], B = b.colors[k];
      for (let c = 0; c < 3; c++) {
        const dv = Math.abs(parseInt(A.slice(1 + c * 2, 3 + c * 2), 16) - parseInt(B.slice(1 + c * 2, 3 + c * 2), 16));
        assert(dv <= 16, `${k} jumps ${dv} at dist ${d}→${d + step}`);
      }
    }
  }
  assertEquals(worldAt(CYCLE).colors.grass, worldAt(0).colors.grass, "the cycle does not close");
});

Deno.test("hunt day · the orb stays in the upper-left third and inside the frame", () => {
  // The farm's lamp is upper-left at 45°; an orb wandering right of centre would light the world
  // from a place no surface shading agrees with.
  for (let d = 0; d < CYCLE; d += 12) {
    const { orb } = worldAt(d);
    assert(orb.x - orb.r >= 0 && orb.x + orb.r <= 192, `orb x=${orb.x} r=${orb.r} leaves the upper-left half at dist ${d}`);
    assert(orb.y - orb.r >= 10 && orb.y + orb.r <= 132, `orb y=${orb.y} outside the sky band at dist ${d}`);
    assert(orb.alpha >= 0 && orb.alpha <= 1, "orb alpha out of range");
  }
});

Deno.test("hunt day · ambient factors stay in [0,1] and noon owns no stars", () => {
  for (let d = 0; d < CYCLE; d += 10) {
    const w = worldAt(d);
    for (const f of [w.stars, w.fireflies, w.motes, w.rimA]) assert(f >= 0 && f <= 1, `factor ${f} out of range at ${d}`);
  }
  assert(worldAt(CYCLE * 0.3).stars < 0.02, "stars survive into midday");
  assert(worldAt(CYCLE * 0.88).stars > 0.8, "night without stars");
});

Deno.test("hunt day · lerpHex is exact at the ends and midway", () => {
  assertEquals(lerpHex("#000000", "#ffffff", 0), "#000000");
  assertEquals(lerpHex("#000000", "#ffffff", 1), "#ffffff");
  assertEquals(lerpHex("#000000", "#fe0000", 0.5), "#7f0000");
});
