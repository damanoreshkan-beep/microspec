// Sub-GHz remote cloner for a HackRF over WebUSB. Headless has no device, so the view runs in demo mode (gate):
// it seeds connected + a saved-signal list. Real record/transmit need the
// device, so these cases exercise the UI surface: freq selector, saved list, delete-with-undo,
// the record island, the settings sheet (history-backed Back), i18n, and the PWA modal.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("#record")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "клонер: частоти, кнопка запису, список сигналів", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-freq]")) === 3, "немає трьох частот");
      h.expect((await h.count("#record")) === 1, "немає кнопки запису");
      h.expect((await h.count("[data-saved]")) >= 3, "немає списку сигналів");
      h.expect((await h.count("[data-transmit]")) === 3, "передавати можна всі сигнали");
    },
  },
  {
    name: "перемикання частоти", run: async (h) => {
      await ready(h);
      await h.tap('[data-freq="315000000"]'); await h.wait(200);
      h.expect((await h.attr('[data-freq="315000000"]', "aria-pressed")) === "true", "315 не обралась");
      await h.tap('[data-freq="433920000"]'); await h.wait(150);
    },
  },
  {
    name: "видалення сигналу (undo-safe)", run: async (h) => {
      await ready(h);
      const n0 = await h.count("[data-saved]");
      await h.tap("[data-del]"); await h.wait(250);
      h.expect((await h.count("[data-saved]")) === n0 - 1, "видалення не спрацювало");
    },
  },
  {
    name: "налаштування: sheet із потужністю TX, Back закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-settings]"); await h.wait(200);
      h.expect((await h.prop("#rfsheet", "open")) === true, "sheet не відкрився");
      h.expect((await h.count('#rfsheet input[type=range]')) === 1, "немає повзунка потужності");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#rfsheet", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="clone"]'); await h.wait(200);
      h.expect(/Send|Record|Clone/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Передати|Запис|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="clone"]'); await h.wait(120);
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
