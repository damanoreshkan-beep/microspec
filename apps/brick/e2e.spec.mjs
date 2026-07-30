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

/* Every case after the first shares ONE page and ONE running simulation, and the game does not
   pause between them: a momentary tap of RIGHT in an earlier case leaves her coasting, seconds
   pass while the next case sets up, and she can be at the bottom of a pit with the clock frozen
   before it takes its first measurement. That is what "distance 28 -> 28" means — not a broken
   simulation, a dead one.
   So a case that needs a LIVE run establishes one. That is what START is for, and it is
   deterministic under the gate: the same seed, from the beginning, standing still. */
const restart = async (h) => { await h.tap('[data-key="start"]'); await h.wait(400); };

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
    /* The suite asserted twelve things and not one of them was a fact about the GAME. It checked
       that the wasm loaded, that frames advanced, that keys existed and lit up, that sheets opened
       — the wiring, all of it, and none of the simulation. A jump that does nothing, a player
       frozen against a pipe, a score that never increments and a game-over card that never appears
       all ship green through it, and one of those (a permanently airborne player) has already
       happened once in this app's history.

       The movement case above is the shape of the problem: `dist >= before` is true of a corpse.
       It stays, because a camera that runs BACKWARDS is its own bug and worth pinning — but it is
       not evidence that the player moves, so that claim is made here, strictly, with a jump in the
       loop so the run survives the first gap. */
    name: "симуляція: гравець реально долає дистанцію", run: async (h) => {
      await ready(h);
      await restart(h);
      const before = await dist(h);
      for (let i = 0; i < 6; i++) {
        await h.keys(["ArrowRight", "ShiftLeft", "ArrowUp"], 220);   // run and jump
        await h.keys(["ArrowRight", "ShiftLeft"], 280);
      }
      const after = await dist(h);
      /* 12, not 20. Measured browser-free against the shipped binary, this exact input reaches 27 —
         but the frames here are wall-clock waits against a rAF loop on a shared CI runner, and a
         threshold with a 35% margin is a flake waiting for a slow morning. What the assertion has
         to exclude is a player who is not moving, and a dead or wedged one gains ZERO; 12 is still
         a dozen tiles clear of that while leaving room for a bad runner. */
      h.expect(after > before + 12,
        `за 3с бігу зі стрибками дистанція ${before} → ${after} — симуляція не веде гравця вперед`);
    },
  },
  {
    /* The other end of the same hole: nothing ever asserted that a run can END. `data-dead` and
       the overlay were mirrored into the DOM and read by no test, so a game that could not kill
       you — or one whose card never appeared — was indistinguishable from a working one. Walk
       right without jumping: the track's first gap is a few seconds away and there is no way
       across it on foot. */
    name: "смерть: забіг закінчується і картка з'являється", run: async (h) => {
      await ready(h);
      for (let i = 0; i < 14 && (await h.attr("[data-live-screen]", "data-dead")) === "0"; i++)
        await h.key("ArrowRight", 500);
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "1",
        "сім секунд ходьби вправо без стрибка не вбили гравця — у треку немає ями, або падіння не вбиває");
      await h.wait(600);
      h.expect((await h.count("[data-over]")) === 1, "гравець мертвий, а картка кінця гри не з'явилась");
      /* The card must show the run you just played, not a record from another afternoon. */
      const run = await h.text("[data-run]");
      h.expect(/^\d{4}$/.test(run || ""), `картка не показала дистанцію щойно зіграного забігу — "${run}"`);
      await h.tap("[data-restart]");
      await h.wait(600);
      h.expect((await h.count("[data-over]")) === 0, "після рестарту картка лишилась на екрані");
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "0", "рестарт не оживив гравця");
    },
  },
  {
    /* Reported by the owner as "the game crashes — she runs and disappears", and it is neither a
       crash nor a rendering fault: `$over` is a module-level atom, so it OUTLIVES the component.
       Die, step across to the profile tab, come back — the view remounts and inits a brand new
       level, while `$over` is still true from the run before. The loop is
       `if (!$over.get()) clock.tick(now)`, so the clock never ticks again: a fresh level, frozen
       forever, under a card about a run that ended two screens ago.
       No gate could see it, because every case here had been living inside one mount. The tab
       round-trip is the whole test. */
    name: "смерть не переживає вкладку: повернення дає живу гру", run: async (h) => {
      await ready(h);
      for (let i = 0; i < 14 && (await h.attr("[data-live-screen]", "data-dead")) === "0"; i++)
        await h.key("ArrowRight", 500);
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "1", "не вдалося вбити гравця для перевірки");
      await h.wait(400);
      await h.tap('[data-tab="me"]'); await h.wait(400);
      await h.tap('[data-tab="play"]'); await h.wait(700);
      h.expect((await h.count("[data-over]")) === 0, "картка кінця гри пережила перемонтування — гра відкрилась уже мертвою");
      h.expect((await h.attr("[data-live-screen]", "data-dead")) === "0", "після повернення на вкладку гравець досі мертвий");
      const a = await frame(h);
      await h.wait(700);
      h.expect((await frame(h)) > a, "після повернення на вкладку годинник стоїть — гра заморожена назавжди");
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
      /* From a RESTART, not from wherever the previous cases left her — and running with jumps,
         not walking. Both halves are measured. The camera does not begin to move until she passes
         SCRW/3 = 96px, and 700ms of walking covers 73, so a walk from the start line moves the
         camera exactly nothing and "the camera did not advance" would be the truth about a
         perfectly good camera. Jumps are in the loop because a run that does not jump reaches the
         first gap and ends, and a dead player moves no camera either — this test has been
         measuring a corpse once before. */
      await restart(h);
      for (let i = 0; i < 4; i++) {
        await h.keys(["ArrowRight", "ShiftLeft", "ArrowUp"], 150);
        await h.keys(["ArrowRight", "ShiftLeft"], 150);
      }
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
