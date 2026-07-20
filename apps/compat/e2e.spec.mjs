// The gate seeds two fixed birth dates (1990-07-15 · 1992-03-22) so the synastry is reproducible; the
// planet positions are the real astronomy-engine ephemeris, the scores are the pure /_rt/synastry maths.
// Sign glyphs are the hand-drawn SVGs — no emoji anywhere.
export default [
  {
    name: "сумісність: дві дати → порахований результат 0..100", run: async (h) => {
      h.expect((await h.count('input[type="date"]')) === 2, "мають бути дві дати народження");
      h.expect((await h.count("[data-result]")) === 1, "немає порахованого результату");
      const n = parseInt((await h.text("[data-overall]")).trim(), 10);
      h.expect(Number.isFinite(n) && n >= 0 && n <= 100, "оцінка сумісності поза межами 0..100");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Compatibility|Match|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Сумісність|Пара|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="match"]'); await h.wait(120);
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
