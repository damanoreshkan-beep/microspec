// Minimal groove player: style chips → play → one filter knob. Audio may be unavailable in the gate, but the
// UI (chips, transport, visualiser, filter) renders and the transport toggles state regardless. Grooves are
// the unit-tested Euclidean patterns (/_rt/groove.js); no grid editing, no saves.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-style]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "плеєр: стилі, візуалізатор, транспорт, фільтр", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-style]")) === 8, "немає 8 стилів");
      h.expect((await h.count("#play")) === 1, "немає кнопки програвання");
      h.expect((await h.count("[data-filter]")) === 1, "немає макро-фільтра");
      h.expect((await h.count("[data-viz] > div")) === 16, "візуалізатор не 16 кроків");
    },
  },
  {
    name: "вибір стилю", run: async (h) => {
      await ready(h);
      await h.tap('[data-style="acid"]'); await h.wait(120);
      h.expect((await h.attr('[data-style="acid"]', "aria-pressed")) === "true", "acid не обрався");
      await h.tap('[data-style="techno"]'); await h.wait(120);
      h.expect((await h.attr('[data-style="techno"]', "aria-pressed")) === "true", "techno не обрався");
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
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="beat"]'); await h.wait(160);
      h.expect(/Techno|Acid|Filter/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      await h.click('[data-tab="me"]'); await h.wait(120);
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
