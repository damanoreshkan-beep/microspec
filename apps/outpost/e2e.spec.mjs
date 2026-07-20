// Audio is unavailable in the headless gate; the whole console renders statically (audioSupported guard), so
// these check the UI wiring — station selection, faders, transport, sleep timer — not the synthesis (that's
// the unit-tested /_rt/scifi.js formulas). Default station is "bridge" so the still is populated.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-station]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "консоль: 6 станцій, 6 фейдерів, пуск", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-station]")) === 6, "немає 6 станцій");
      h.expect((await h.count("[data-fader]")) === 6, "немає 6 фейдерів");
      h.expect((await h.count("#play")) === 1, "немає кнопки пуску");
      h.expect((await h.attr('[data-station="bridge"]', "aria-pressed")) === "true", "місток не активний за замовч.");
    },
  },
  {
    name: "вибір станції", run: async (h) => {
      await ready(h);
      await h.tap('[data-station="cryo"]'); await h.wait(150);
      h.expect((await h.attr('[data-station="cryo"]', "aria-pressed")) === "true", "кріовідсік не обрався");
      h.expect((await h.attr('[data-station="bridge"]', "aria-pressed")) !== "true", "місток не зняв активність");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="gen"]'); await h.wait(180);
      h.expect(/Reactor Core|Ventilation|Deep space/.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      await h.click('[data-tab="gen"]'); await h.wait(180);
      h.expect(/Реакторне ядро|Вентиляція|Далекий космос/.test(await h.bodyText()), "не UA");
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
