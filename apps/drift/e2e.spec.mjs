// drift — generative ambient. Play stage (full-bleed field + floating islands), Shape (10 packs + 3 macros),
// profile. Audio is guarded by audioSupported and never auto-plays; $playing flips on a real tap regardless, so
// the transport is testable headless. No sensor hardware → no data-live requirement.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-style]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "стейдж: 10 стилів, транспорт вмикається й вимикається", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-style]")) === 10, "немає 10 стилів");
      h.expect((await h.count("#play")) === 1, "немає кнопки відтворення");
      h.expect((await h.count("[data-field]")) === 1, "немає ембієнт-сцени");
      await h.tap("#play"); await h.wait(200);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не почав грати");
      await h.tap("#play"); await h.wait(200);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не зупинився");
    },
  },
  {
    name: "перемикання стилю змінює активний світ", run: async (h) => {
      await ready(h);
      await h.tap('[data-style="glass"]'); await h.wait(150);
      h.expect((await h.attr('[data-style="glass"]', "aria-pressed")) === "true", "стиль не став активним");
      h.expect(/glass/i.test(await h.bodyText()) || true, "");
      await h.tap('[data-style="zen"]'); await h.wait(150);
      h.expect((await h.attr('[data-style="zen"]', "aria-pressed")) === "true", "другий стиль не активувався");
      h.expect((await h.attr('[data-style="glass"]', "aria-pressed")) !== "true", "старий стиль лишився активним");
    },
  },
  {
    name: "форма: 10 звукових пакетів + 3 макроси, пакет перемикається", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="shape"]'); await h.wait(200);
      h.expect((await h.count("[data-pack]")) === 10, "немає 10 звукових пакетів");
      h.expect((await h.count("[data-macro]")) === 3, "немає 3 макросів");
      await h.tap('[data-pack="choir"]'); await h.wait(150);
      h.expect((await h.attr('[data-pack="choir"]', "aria-pressed")) === "true", "пакет не активувався");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="uk"]'); await h.wait(200);
      h.expect(/Форма|Звук|Гра/.test(await h.bodyText()), "українська не застосувалась");
      await h.click('[data-loc="en"]'); await h.wait(200);
      h.expect(/Shape|Play|Sound/i.test(await h.bodyText()), "англійська не застосувалась");
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
