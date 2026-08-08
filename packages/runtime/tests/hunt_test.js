
import { assert, assertEquals } from "jsr:@std/assert@1";

const HUNT_WASM = new URL("../../../apps/hunt/assets/hunt.wasm", import.meta.url);
const HUNT_S = { SFX: 10, AMMO: 13, HP: 14, KILLS: 16, COUNT: 17 };
const HUNT_IN = { RIGHT: 2, RUN: 8, SHOOT: 32 };
async function huntEngine() {
  const { instance } = await WebAssembly.instantiate(await Deno.readFile(HUNT_WASM), {});
  const E = instance.exports;
  return { E, st: () => new Int32Array(E.memory.buffer, E.game_state(), HUNT_S.COUNT) };
}

Deno.test("hunt engine · your own spear cannot hurt you", async () => {
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

Deno.test("hunt engine · the quiver is finite and refuses to go negative", async () => {
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  const start = st()[HUNT_S.AMMO];
  assert(start > 0, "the game starts with nothing to throw");
  for (let f = 0; f < 900; f++) E.game_step(HUNT_IN.SHOOT);     
  const s = st();
  assert(s[HUNT_S.AMMO] >= 0, `ammo went negative (${s[HUNT_S.AMMO]})`);
  assert((s[HUNT_S.SFX] & 512) !== 0 || s[HUNT_S.AMMO] === 0,
    "an empty quiver must SAY it is empty — a dead button is indistinguishable from a broken one");
});

Deno.test("hunt engine · the collision box it reports IS the one it stands on", async () => {
  const { E, st } = await huntEngine();
  E.game_init(0xA17C);
  for (let f = 0; f < 90; f++) E.game_step(0);                 
  const s = st();
  const packed = E.game_box(0);
  const boxH = packed & 0xffff;
  assert(boxH > 0 && boxH < 200, `game_box returned a nonsense height (${boxH})`);
  const py = s[6], feet = py + boxH;
  const col = Math.floor((s[4] + s[5]) / 24);
  let ground = -1;
  for (let r = 0; r < 11; r++) if (E.game_tile(col, r) >= 0x10) { ground = r * 24; break; }
  assert(ground >= 0, "she is not standing over any ground — the fixture moved");
  assertEquals(feet, ground, `feet at ${feet} against a surface at ${ground} — the box the renderer is given is not the box she rests on`);
});
