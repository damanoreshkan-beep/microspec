// The gate/mock uses a static sample (no live fetch), so the globe + telemetry render deterministically.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-over]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "трекер МКС рендериться (глобус + телеметрія)", run: async (h) => {
      await ready(h);
      h.expect((await h.count("canvas")) >= 1, "немає глобуса");
      h.expect((await h.count("[data-over]")) === 1, "немає індикатора «над»");
      h.expect((await h.count("[data-coords]")) === 1, "немає координат");
      h.expect(/423/.test(await h.bodyText()), "немає висоти (км)");
      h.expect(/океаном/i.test(await h.text("[data-over]")), "семпл має бути над океаном");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/ISS|Altitude|Speed|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/МКС|Висота|Швидкість|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="track"]'); await h.wait(120);
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
