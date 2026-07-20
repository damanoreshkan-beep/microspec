// Three tabs over one shared engine (module scope). Beat = the simple player; Pads = the 16x16 matrix; Saved =
// IndexedDB beats. Audio may be absent in the gate, but every UI toggles state. Light voices → no throttle.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-style]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "плеєр: стилі, транспорт, фільтр, візуалізатор", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-style]")) === 8, "немає 8 стилів");
      h.expect((await h.count("#play")) === 1, "немає програвання");
      h.expect((await h.count("[data-filter]")) === 1, "немає фільтра");
      h.expect((await h.count("[data-viz] > div")) === 16, "візуалізатор не 16 кроків");
    },
  },
  {
    name: "транспорт перемикається", run: async (h) => {
      await ready(h);
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не почав грати");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не зупинився");
    },
  },
  {
    name: "матриця подів: 16x16, редагування, збереження", run: async (h) => {
      await h.click('[data-tab="pads"]'); await h.wait(200);
      h.expect((await h.count("[data-cell]")) === 256, "матриця не 16x16");
      const cell = '[data-cell="tom-6"]';
      const before = await h.attr(cell, "aria-pressed");
      await h.tap(cell); await h.wait(120);
      h.expect((await h.attr(cell, "aria-pressed")) !== before, "пад не перемкнувся");
      await h.tap("#save"); await h.wait(250);
      await h.click('[data-tab="saved"]'); await h.wait(300);
      h.expect((await h.count("[data-saved]")) >= 1, "збережений біт не зʼявився");
    },
  },
  {
    name: "видалення з undo", run: async (h) => {
      await h.click('[data-tab="saved"]'); await h.wait(250);
      const n = await h.count("[data-saved]");
      if (n > 0) { await h.tap("[data-saved] [data-del]"); await h.wait(300); h.expect((await h.count("[data-saved]")) === n - 1, "не видалилось"); }
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="beat"]'); await h.wait(160);
      h.expect(/Techno|Acid|Filter/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="beat"]'); await h.wait(120);
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
