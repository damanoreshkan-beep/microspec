// The API is rate-limited (15/hour/IP), so a CI run may occasionally get throttled → error state.
// The gate is tolerant: it verifies the populated feed when data loads, and a clean error state when
// it doesn't (never a false empty). Shell tests (i18n/PWA) don't need data.
const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "стрічка запусків (або коректний стан помилки)", run: async (h) => {
      await load(h);
      const n = await h.count("[data-fav]");
      if (n > 0) {
        h.expect(n > 3, "замало карток");
        h.expect(/за \d|щойно|\d:\d/.test(await h.bodyText()), "немає часу запуску");
        h.expect((await h.count(".card img")) >= 1, "немає зображень");
      } else {
        h.expect(/недоступні|unavailable/i.test(await h.bodyText()), "ні карток, ні помилки");
      }
    },
  },
  {
    name: "тап по картці → деталі, Back закриває", run: async (h) => {
      await load(h);
      if ((await h.count(".aw-tap")) === 0) return; // throttled — no data to drill into
      await h.click(".aw-tap"); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 1, "деталі не відкрились");
      h.expect(/Ракета|Місія|Rocket|Mission/.test(await h.bodyText()), "немає вмісту деталей");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив деталі");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Upcoming|Launches|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Найближчі|запуски|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="up"]'); await h.wait(120);
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
