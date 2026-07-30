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
    name: "екран: гра займає корпус, а корпус — увесь вигляд", run: async (h) => {
      await ready(h);
      /* The ROOM, not the box. #view's clientHeight includes its own padding — and that padding is
         the dock's height, which is space the console can never occupy. Measuring against it made
         a body that was filling 100% of what it had report 88% and fail, which is the denominator
         being wrong rather than the layout. Read the padding and subtract it. */
      const box = await h.prop("#view", "clientHeight");
      const padT = parseFloat(await h.css("#view", "padding-top")) || 0;
      const padB = parseFloat(await h.css("#view", "padding-bottom")) || 0;
      const room = box - padT - padB;
      const bodyH = await h.prop("[data-shell-body]", "clientHeight");
      const bodyW = await h.prop("[data-shell-body]", "clientWidth");
      const cw = await h.prop("canvas", "clientWidth");
      h.expect(room > 0 && bodyW > 0, "нема з чим порівнювати — корпус або вигляд не змірялись");
      h.expect(bodyH >= room * 0.95,
        `корпус ${bodyH}px у доступних ${room}px (вигляд ${box} − падінги ${padT}/${padB}) — консоль стискається до вмісту замість заповнювати екран`);
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
