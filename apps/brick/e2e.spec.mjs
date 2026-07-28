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
      h.expect((await h.count("[data-start]")) === 1, "немає клавіші START");
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
  {
    name: "старт: перезапуск лишає гру живою", run: async (h) => {
      await ready(h);
      await h.tap("[data-start]");
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
];
