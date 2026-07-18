// The gate has no camera; the Chromium gate paints a deterministic seeded composition on the canvas and
// seeds the motion meter, so the shot and these checks see a populated screen. Audio/download not exercised.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-live]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "полотно: meter + керування + canvas", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) === 1, "немає meter-руху");
      h.expect((await h.count("canvas")) >= 1, "немає полотна");
      h.expect((await h.count("[data-save]")) === 1, "немає Зберегти");
      h.expect((await h.count("[data-clear]")) === 1, "немає Очистити");
    },
  },
  {
    name: "ghost тогл", run: async (h) => {
      await ready(h);
      await h.tap("[data-ghost]"); await h.wait(150);
      h.expect((await h.count("[data-ghost].btn-ghost")) === 1, "ghost не перемкнувся");
    },
  },
  {
    name: "дозволи: профіль → екран, Back закриває (історія-backed)", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(200);
      h.expect((await h.count("#perms-back")) > 0, "екран дозволів не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.count("#perms-back")) === 0, "Back не закрив дозволи");
      await h.click('[data-tab="paint"]'); await h.wait(120);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Paint|Language|Flux|Save/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Малюй|Мова|Потік|Зберегти/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="paint"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
