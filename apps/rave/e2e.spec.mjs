// Three tabs, one lean engine (module scope). The FX rack + reverb are on the shared master bus (built once),
// voices are light → no throttle. Generator = the unit-tested /_rt/groove.js search. FX settings live in a
// history-backed sheet (system Back closes it).
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-style]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "плеєр: стилі, генератор, транспорт, фільтр", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-style]")) === 8, "немає 8 стилів");
      h.expect((await h.count("#play")) === 1, "немає програвання");
      h.expect((await h.count("#gen")) === 1, "немає генератора");
      h.expect((await h.count("[data-filter]")) === 1, "немає фільтра");
      h.expect((await h.count("[data-viz] > div")) === 16, "візуалізатор не 16 кроків");
    },
  },
  {
    name: "3D спектр: повноекранна сцена + перемикач із 10 варіантів", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає повноекранної сцени спектра");
      h.expect((await h.count("[data-viztick]")) === 10, "перемикач не має 10 варіантів");
      await h.tap('[data-viztick="4"]'); await h.wait(150);
      h.expect((await h.attr('[data-viztick="4"]', "aria-current")) === "true", "варіант спектра не перемкнувся");
      await h.tap('[data-viztick="0"]'); await h.wait(120);                 // restore default scene for later shared-page cases
    },
  },
  {
    name: "генератор пише біт", run: async (h) => {
      await ready(h);
      await h.tap("#gen"); await h.wait(700);   // the write-on sweep is ~420ms
      h.expect((await h.count("[data-viz] > div")) === 16, "візуалізатор зник після генерації");
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
    name: "налаштування переживають перезапуск", run: async (h) => {
      await ready(h);
      await h.tap('[data-style="house"]'); await h.wait(200);              // house = 124 BPM, not the techno/132 default
      h.expect((await h.attr('[data-style="house"]', "aria-pressed")) === "true", "house не обрався");
      await h.reload();
      await ready(h);
      h.expect((await h.attr('[data-style="house"]', "aria-pressed")) === "true", "стиль не зберігся після перезапуску");
      h.expect(/124\s*BPM/i.test(await h.bodyText()), "темп не зберігся після перезапуску");
      await h.tap('[data-style="techno"]'); await h.wait(150);             // restore the default so later shared-page cases start clean
    },
  },
  {
    name: "матриця 22x16: редагування + збереження", run: async (h) => {
      await h.click('[data-tab="pads"]'); await h.wait(200);
      h.expect((await h.count("[data-cell]")) === 22 * 16, "матриця не 22x16");
      const cell = '[data-cell="conga-6"]';
      const before = await h.attr(cell, "aria-pressed");
      await h.tap(cell); await h.wait(120);
      h.expect((await h.attr(cell, "aria-pressed")) !== before, "пад не перемкнувся");
      await h.tap("#save"); await h.wait(250);
      await h.click('[data-tab="saved"]'); await h.wait(300);
      h.expect((await h.count("[data-saved]")) >= 1, "збережений біт не зʼявився");
    },
  },
  {
    name: "налаштування: sheet, Back закриває", run: async (h) => {
      await h.click('[data-tab="pads"]'); await h.wait(200);
      await h.tap("[data-settings]"); await h.wait(200);
      h.expect((await h.prop("#fxsheet", "open")) === true, "sheet не відкрився");
      h.expect((await h.count("[data-fx]")) === 6, "немає 6 FX-повзунків");
      h.expect((await h.count("[data-pack]")) === 11, "немає 10 пакетів + синтез");
      await h.tap('[data-pack="R8"]'); await h.wait(150);
      h.expect((await h.attr('[data-pack="R8"]', "aria-pressed")) === "true", "пакет не обрався");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#fxsheet", "open")) !== true, "Back не закрив sheet");
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
