// The gate seeds a fixed track and runs it forward ~150 frames before the first paint, with a
// spear already in the air — a game photographed at rest is a photograph of a background, and
// every check below (a11y, overflow, the shots, the taste pass) would then be measuring one.
//
// Nothing here asserts pixels. A canvas is opaque to every gate this farm has, so the engine
// mirrors its state into data-* and that is the contract.

const live = (h, k) => h.attr("[data-live-screen]", "data-" + k);
const num = async (h, k) => +(await live(h, k));
const ready = async (h) => {
  for (let i = 0; i < 30; i++) { if ((await num(h, "frame")) > 0) return true; await h.wait(300); }
  return false;
};

export default [
  {
    name: "рушій: wasm завантажився і кадри йдуть", run: async (h) => {
      h.expect(await ready(h), "гра не почала рахувати кадри — wasm не завантажився?");
      h.expect((await h.count("[data-err]")) === 0, "рушій повідомив про помилку завантаження");
      const a = await num(h, "frame");
      await h.wait(700);
      h.expect((await num(h, "frame")) > a, "кадри не рухаються — ігровий цикл стоїть");
    },
  },
  {
    name: "початковий стан: серця й сагайдак не порожні", run: async (h) => {
      await ready(h);
      h.expect((await num(h, "hp")) > 0, "гра починається без жодного серця");
      h.expect((await num(h, "ammo")) > 0, "гра починається з порожнім сагайдаком — кинути нічим");
    },
  },
  {
    name: "кидок витрачає спис", run: async (h) => {
      await ready(h);
      const before = await num(h, "ammo");
      h.expect(before > 0, "нічим кидати — попередній тест мав це впіймати");
      await h.tap('[data-key="throw"]');
      await h.wait(500);
      h.expect((await num(h, "ammo")) < before, "сагайдак не зменшився — кнопка кидка не доходить до рушія");
    },
  },
  {
    name: "клавіатура: стрілка веде, клавіша світиться", run: async (h) => {
      await ready(h);
      const before = await num(h, "dist");
      await h.keys(["ArrowRight", "ShiftLeft"], 900);
      h.expect((await num(h, "dist")) >= before, "дистанція не росте від клавіатури");
      // assert DURING the hold — after the release there is nothing to see
      await h.keyDown("ArrowLeft");
      await h.wait(150);
      const lit = await h.hasClass('[data-pad="padLeft"]', "sf-pressed");
      await h.keyUp("ArrowLeft");
      h.expect(lit, "екранна клавіша не підсвітилась під час натиску з клавіатури");
    },
  },
  {
    name: "біг залипає подвійним тапом", run: async (h) => {
      await ready(h);
      h.expect((await h.attr('[data-key="run"]', "aria-pressed")) === "false", "біг залип до початку");
      await h.tap('[data-key="run"]'); await h.wait(80);
      await h.tap('[data-key="run"]'); await h.wait(200);
      h.expect((await h.attr('[data-key="run"]', "aria-pressed")) === "true", "подвійний тап не залишив біг затиснутим");
      await h.tap('[data-key="run"]'); await h.wait(200);
      h.expect((await h.attr('[data-key="run"]', "aria-pressed")) === "false", "наступний тап не зняв залипання");
    },
  },
  {
    name: "звук: перемикач тримає стан", run: async (h) => {
      await ready(h);
      const before = await h.attr("[data-sound]", "aria-pressed");
      await h.tap("[data-sound]");
      await h.wait(200);
      h.expect((await h.attr("[data-sound]", "aria-pressed")) !== before, "перемикач звуку не змінив стан");
    },
  },
  {
    name: "рекорди: аркуш відкривається, Back закриває (історія-backed)", run: async (h) => {
      await ready(h);
      await h.tap("#b-records");
      await h.wait(350);
      h.expect((await h.count("[data-stat]")) === 3, "аркуш рекордів не показав три показники");
      await h.back();
      await h.wait(350);
      h.expect((await h.count("#records[open]")) === 0, "Back не закрив аркуш рекордів");
    },
  },
];
