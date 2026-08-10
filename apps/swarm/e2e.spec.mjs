// swarm e2e — the canvas is invisible to every gate, so the truth lives in the [data-live] hud's
// dataset mirror: frame/wave/alive prove the reactor runs, shots proves the trigger, and the
// records sheet proves the routing invariant. The gate fixture is the aim-bot forward-run in
// view.js; these tests assert its aftermath, never pixels.

const hud = '[data-swarm] [data-live]';
const num = (h, name) => h.attr(hud, `data-${name}`).then((v) => +v || 0);

async function until(h, fn, ms = 12000, step = 250) {
  for (let i = 0; i < Math.ceil(ms / step); i++) { if (await fn()) return true; await h.wait(step); }
  return fn();
}

export default [
  {
    name: "реактор живий: кадри йдуть, рій на арені, бот уже настріляв",
    async run(h) {
      h.expect(await until(h, async () => (await num(h, "frame")) > 30), "the engine never started stepping");
      const f1 = await num(h, "frame");
      await h.wait(600);
      h.expect((await num(h, "frame")) > f1, "frames stopped advancing — the clock is dead");
      h.expect((await num(h, "alive")) > 0, "no enemies alive at settle — the fixture photographed an empty ring");
      h.expect((await num(h, "kills")) > 0, "the gate bot landed zero kills — the populated screen is a lie");
      h.expect((await num(h, "dead")) === 0, "the fixture left a dead player on screen");
    },
  },
  {
    name: "тригер: тап по кнопці вогню реєструє постріл",
    async run(h) {
      const before = await num(h, "shots");
      await h.tap("[data-fire]");
      h.expect(await until(h, async () => (await num(h, "shots")) > before, 4000), "a tap on the trigger fired nothing");
    },
  },
  {
    name: "клавіатура: пробіл стріляє",
    async run(h) {
      const before = await num(h, "shots");
      // held past a full trigger cooldown (16 frames ≈ 267ms): the previous test just fired,
      // so a short hold can fall entirely inside the recharge and prove nothing
      await h.key("Space", 600);
      h.expect(await until(h, async () => (await num(h, "shots")) > before, 4000), "Space fired nothing");
    },
  },
  {
    name: "рекорди: аркуш відкривається, системний Back закриває (не виходить)",
    async run(h) {
      await h.tap("[data-records]");
      h.expect(await until(h, () => h.count("#records").then((n) => n > 0), 4000), "the records sheet never opened");
      await h.wait(400);
      await h.back();
      h.expect(await until(h, () => h.count("#records").then((n) => n === 0), 4000), "Back did not close the records sheet");
      h.expect((await num(h, "frame")) > 0, "the app died on Back");
    },
  },
  {
    name: "i18n: перемикання локалі змінює підпис хвилі",
    async run(h) {
      await h.tap('[data-tab="me"]');
      await h.wait(400);
      await h.tap('[data-loc="en"]');
      await h.wait(600);
      await h.tap('[data-tab="play"]');
      await h.wait(400);
      h.expect(/wave/i.test(await h.text(hud)), "EN locale did not reach the HUD");
      await h.tap('[data-tab="me"]');
      await h.wait(300);
      await h.tap('[data-loc="uk"]');
      await h.wait(600);
      await h.tap('[data-tab="play"]');
      await h.wait(300);
      h.expect(/хвиля/i.test(await h.text(hud)), "UK locale did not come back");
    },
  },
  {
    name: "звук: перемикач тримає aria-pressed",
    async run(h) {
      const was = (await h.attr("[data-sound]", "aria-pressed")) === "true";
      await h.tap("[data-sound]");
      await h.wait(200);
      h.expect(((await h.attr("[data-sound]", "aria-pressed")) === "true") !== was, "the sound toggle did not flip");
      await h.tap("[data-sound]");
    },
  },
];
