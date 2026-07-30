// The gate seeds a fixed track (GATE_SEED) and pre-advances ~140 frames before the first paint, so
// every check below — a11y, overflow, the screenshots, the taste pass — measures a POPULATED screen
// with terrain, blocks and a character on it, rather than an empty one nobody will ever see.
//
// Nothing here asserts pixels. The engine mirrors its state into data-* attributes on the screen
// element and that is the contract: a canvas is opaque to every gate this farm has.

const ready = async (h) => {
  for (let i = 0; i < 30; i++) {
    if (+(await h.attr("[data-live-screen]", "data-frame")) > 0) return true;
    await h.wait(300);
  }
  return false;
};
const frame = async (h) => +(await h.attr("[data-live-screen]", "data-frame"));
const dist = async (h) => +(await h.attr("[data-live-screen]", "data-dist"));

export default [
  {
    name: "рушій: wasm завантажився і кадри йдуть", run: async (h) => {
      h.expect(await ready(h), "гра не почала рахувати кадри — wasm не завантажився?");
      h.expect((await h.count("[data-err]")) === 0, "рушій повідомив про помилку завантаження");
      const a = await frame(h);
      await h.wait(700);
      h.expect((await frame(h)) > a, "кадри не рухаються — ігровий цикл стоїть");
    },
  },
  {
    name: "консоль: хрестовина, A/B і старт на місці", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-pad]")) === 4, "хрестовина не має чотирьох напрямків");
      h.expect((await h.count('[data-key="a"]')) === 1, "немає клавіші A");
      h.expect((await h.count('[data-key="b"]')) === 1, "немає клавіші B");
      h.expect((await h.count('[data-key="start"]')) === 1, "немає клавіші START");
    },
  },
  {
    name: "ввід: утримання ВПРАВО просуває гравця", run: async (h) => {
      await ready(h);
      const before = await dist(h);
      // The pad reads the pointer's position, so a real tap is a press and a release: hold it by
      // dispatching the down without the up, then let the game run.
      await h.prop("body", "clientWidth");
      await h.tap('[data-pad="padRight"]');
      await h.wait(900);
      h.expect((await dist(h)) >= before, "дистанція зменшилась — камера поїхала назад?");
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
    name: "старт: перезапуск лишає гру живою", run: async (h) => {
      await ready(h);
      await h.tap('[data-key="start"]');
      await h.wait(600);
      h.expect((await h.count("[data-err]")) === 0, "після рестарту рушій впав");
      const a = await frame(h);
      await h.wait(600);
      h.expect((await frame(h)) > a, "після рестарту кадри стали");
    },
  },
  {
    name: "локаль: перемикання не ламає екран", run: async (h) => {
      await ready(h);
      // the locale switch lives on the profile tab, so this also exercises leaving and re-entering
      // the game — the one path where a rAF loop that forgot to stop shows up as a double clock.
      await h.tap('[data-tab="me"]'); await h.wait(300);
      await h.tap('[data-loc="en"]'); await h.wait(300);
      await h.tap('[data-tab="play"]'); await h.wait(500);
      h.expect(/jump/i.test(await h.attr('[data-key="a"]', "aria-label")), "клавіша A не переклалась на en");
      const a = await frame(h); await h.wait(600);
      h.expect((await frame(h)) > a, "після повернення на вкладку гра не йде");
      await h.tap('[data-tab="me"]'); await h.wait(250);
      await h.tap('[data-loc="uk"]'); await h.wait(250);
      await h.tap('[data-tab="play"]'); await h.wait(400);
      h.expect((await h.count("[data-live-screen]")) === 1, "екран зник після зміни локалі");
    },
  },
  {
    name: "клавіатура: стрілки ведуть гравця, клавіші світяться", run: async (h) => {
      await ready(h);
      const before = await dist(h);
      await h.keys(["ArrowRight", "ShiftLeft"], 900);            // run right, both keys at once
      h.expect((await dist(h)) > before, "гравець не рушив від стрілки — клавіатура не доходить до маски");
      // The on-screen key must SHOW the press: it is the only feedback a keyboard player gets.
      // Assert while it is still HELD — the first version of this checked after the release.
      await h.keyDown("ArrowLeft");
      await h.wait(150);
      const lit = await h.hasClass('[data-pad="padLeft"]', "sf-pressed");
      await h.keyUp("ArrowLeft");
      await h.wait(150);
      h.expect(lit, "клавіша на екрані не підсвітилась під час натиску з клавіатури");
      h.expect(!(await h.hasClass('[data-pad="padLeft"]', "sf-pressed")), "клавіша лишилась підсвіченою після відпускання");
    },
  },
  {
    name: "клавіатура і палець не стирають одне одного", run: async (h) => {
      await ready(h);
      // The mask had two writers once: a pointer event recomputed it from scratch and wiped a held
      // key. Hold a direction on the keyboard, tap the pad, and the run must continue.
      // Measure the MASK, not the distance. The mask had two writers once — a pointer event
      // recomputed it from scratch and wiped a held key — and the question is only ever "is RIGHT
      // still set". Distance was a proxy for that, and one the terrain can veto: she can be alive,
      // still holding right, and simply pressed against a two-tile step.
      const RIGHT = 2;
      await h.keyDown("ArrowRight");
      await h.wait(120);
      h.expect((+(await h.attr("[data-live-screen]", "data-mask")) & RIGHT) !== 0, "клавіатура не дійшла до маски");
      await h.tap('[data-key="a"]');      // a pointer event lands while the key is still down
      await h.wait(200);
      const held = +(await h.attr("[data-live-screen]", "data-mask"));
      await h.keyUp("ArrowRight");
      h.expect((held & RIGHT) !== 0, "дотик стер утримувану клавішу — маска знову має двох власників");
    },
  },
  {
    name: "камера: можна повернутись назад", run: async (h) => {
      await ready(h);
      // WALK, and not for long: a 1.2s run with no jumps reaches the first gap and dies, and a dead
      // player moves no camera — the first version of this test was measuring a corpse.
      await h.key("ArrowRight", 700);
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "0", "забіг обірвався до виміру камери");
      const far = +(await h.attr("[data-live-screen]", "data-camx"));
      h.expect(far > 0, "камера не рушила вперед");
      await h.key("ArrowLeft", 900);                             // now walk back
      const back = +(await h.attr("[data-live-screen]", "data-camx"));
      h.expect(back < far, "камера не відкотилась — пропущену монету не повернути");
      h.expect(back >= 0, "камера пішла за початок світу");
    },
  },
  {
    /* THE screen test. The owner's complaint about this app was one sentence — the game is too
       small — and the two causes were invisible to every gate the farm had: a shell catalogue that
       wrote the aperture as 55% of the body width (nine silhouettes have to differ SOMEWHERE), and
       a body that shrink-wrapped its own contents so two thirds of a 390×844 phone was empty page.
       Neither overflows, neither fails a11y, and both photograph as "a console, a bit small".

       So the claim is measured, in the units it is made in: the body against the view, and the
       picture against the body. Fractions rather than pixels — a pixel budget would be a constant
       written beside a thing it describes, which is the bug with the delay fuse. */
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
       Both halves are asserted, deliberately — a fix that restored the geometry by dropping
       touch-action would let a thumb on the pad scroll the page instead, which is the same bug
       wearing the other hat. */
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
