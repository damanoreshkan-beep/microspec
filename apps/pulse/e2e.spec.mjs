// Live view over Wikimedia EventStreams. On localhost the view feeds a synthetic stream (the real SSE is
// nondeterministic / may be blocked from CI), so the gate reviews a real, populated live screen.
const seed = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-feed] .card")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "живий потік наповнює стрічку + лічильник", run: async (h) => {
      await seed(h);
      h.expect((await h.count("[data-feed] .card")) > 3, "стрічка порожня");
      h.expect(/^\d[\d\s]*$/.test((await h.text("#rate")).trim()), "лічильник не число");
      h.expect(/наживо|live/i.test(await h.bodyText()), "немає статусу наживо");
    },
  },
  {
    name: "тумблер «лише люди» перемикається і стрічка живе далі", run: async (h) => {
      await seed(h);
      h.expect((await h.count("#humans-only")) === 1, "немає тумблера");
      await h.click("#humans-only"); await h.wait(200);
      h.expect((await h.prop("#humans-only", "checked")) === true, "тумблер не увімкнувся");
      await h.wait(1200); // stream refills after the filter clears the view
      h.expect((await h.count("[data-feed] .card")) > 0, "стрічка не відновилась");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Live|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Наживо|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="live"]'); await h.wait(150);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-install")) === 1, "немає кнопки встановлення");
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
