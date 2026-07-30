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
      /* STRICTLY greater. `>=` was an assertion that cannot fail: it also holds when the player is
         dead, or wedged against a wall, or when the keyboard never reached the mask at all. An
         inequality that is true in the broken case is not a test. */
      h.expect((await num(h, "dist")) > before, "дистанція не зросла за 0.9с утримання — клавіатура не доходить до маски");
      // assert DURING the hold — after the release there is nothing to see
      await h.keyDown("ArrowLeft");
      await h.wait(150);
      const lit = await h.hasClass('[data-pad="padLeft"]', "sf-pressed");
      await h.keyUp("ArrowLeft");
      h.expect(lit, "екранна клавіша не підсвітилась під час натиску з клавіатури");
    },
  },
  {
    /* The defect this exists for made the game's whole premise unplayable on a desktop, and every
       gate was green. The throw key carried hunt's own SHOOT bit (32); the SHARED keyboard map in
       dpad.js had no binding that could produce that bit, so a keyboard could move, jump, duck and
       run, and could not throw a spear — in a game about throwing spears. The suite tapped the
       on-screen key and watched the quiver go down, which exercises the touch path only. A control
       is not wired until BOTH inputs reach the mask, so both are asserted here. */
    name: "клавіатура: спис кидається з клавіатури, не лише пальцем", run: async (h) => {
      await ready(h);
      const SHOOT = 32;
      const before = await num(h, "ammo");
      h.expect(before > 0, "нічим кидати — сагайдак порожній до початку");
      await h.keyDown("KeyC");
      await h.wait(150);
      h.expect((+(await live(h, "mask")) & SHOOT) !== 0, "клавіша кидка не дійшла до маски — у спільній розкладці немає біта SHOOT");
      await h.keyUp("KeyC");
      await h.wait(400);
      h.expect((await num(h, "ammo")) < before, "сагайдак не зменшився від клавіатури — кидок доступний лише пальцем");
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
      const before = await h.attr('[data-key="sound"]', "aria-pressed");
      await h.tap('[data-key="sound"]');
      await h.wait(200);
      h.expect((await h.attr('[data-key="sound"]', "aria-pressed")) !== before, "перемикач звуку не змінив стан");
    },
  },
  {
    name: "рекорди: аркуш відкривається, Back закриває (історія-backed)", run: async (h) => {
      await ready(h);
      await h.tap('[data-key="records"]');
      await h.wait(350);
      h.expect((await h.count("[data-stat]")) === 3, "аркуш рекордів не показав три показники");
      await h.back();
      await h.wait(350);
      h.expect((await h.count("#records[open]")) === 0, "Back не закрив аркуш рекордів");
    },
  },
  {
    /* THE screen test — the same one brick carries, because it is the same console and the same
       complaint. The aperture used to be 55% of a body that shrink-wrapped its contents, so the
       forest arrived at roughly 115 CSS px wide on a 390px phone and nothing in the gate suite
       could say so: it did not overflow, it did not fail a11y, and it photographed as a console.
       Fractions rather than pixels, so the check keeps meaning at every breakpoint. */
    name: "екран: гра отримує ширину вигляду", run: async (h) => {
      await ready(h);
      /* The claim is about the PICTURE, not about the body — and the first version of this check
         got that wrong in a way that a screenshot exposed and no measurement could. It asserted
         that the console body fills the view, the body duly filled it, and the deployed shot
         showed 300px of dead plastic between the screen and the deck: the canvas is bound by
         WIDTH (the game is roughly square, a phone is not), so a taller body buys the game
         nothing at all and only moves the emptiness inside the device. A gate that agrees with a
         bad screenshot is set too low.
         So: what share of the view's own width does the game actually get. That is the number the
         complaint was about, it is true in both layouts, and it keeps meaning at every
         breakpoint. Fractions, never pixels. */
      const viewW = await h.prop("#view", "clientWidth");
      const padL = parseFloat(await h.css("#view", "padding-left")) || 0;
      const padR = parseFloat(await h.css("#view", "padding-right")) || 0;
      const room = viewW - padL - padR;
      const bodyW = await h.prop("[data-shell-body]", "clientWidth");
      const cw = await h.prop("canvas", "clientWidth");
      h.expect(room > 0 && bodyW > 0, "нема з чим порівнювати — корпус або вигляд не змірялись");
      h.expect(cw >= room * 0.8,
        `полотно ${cw}px у доступних ${room}px (вигляд ${viewW} − падінги ${padL}/${padR}) — гра не отримує ширини екрана`);
      h.expect(cw >= bodyW * 0.78,
        `полотно ${cw}px у корпусі ${bodyW}px — апертура забирає в гри ширину, яку нікому більше не віддає`);
    },
  },
  {
    /* The defect this exists for shipped with every gate green: the console body receives both the
       plate colour (a custom property) and the deck hook's own style, and one silently replaced
       the other. Every class was present, every JS-level difference still worked, and a11y and
       overflow were unaffected. The only proof is the COMPUTED value on the element.

       The plate matters more here than next door: this is the COLOUR game, and for the life of the
       shell catalogue its aperture was painted the monochrome game's yellow-green LCD, because the
       shell owned a tint and handed the same one to both. The plate travels from the GAME now, and
       this asserts it arrived. */
    name: "корпус: колір панелі і touch-action обидва переживають злиття стилів", run: async (h) => {
      await ready(h);
      const tint = await h.css("[data-shell-body]", "--sh-tint");
      h.expect(/^\s*(#|rgb)/.test(tint || ""), `гра не передала свою панель апертурі — --sh-tint = "${tint}"`);
      const body = await h.css("[data-shell-body]", "--sh-body");
      h.expect(/^\s*(#|rgb)/.test(body || ""), `корпус не отримав власного кольору — --sh-body = "${body}"`);
      const touch = await h.css("[data-shell-body]", "touch-action");
      h.expect(touch === "none", `дека втратила touch-action під час злиття стилів — "${touch}"`);
    },
  },
];
