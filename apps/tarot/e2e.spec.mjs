// The gate seeds a fixed date (2027-07-23) so the card of the day is reproducible, and non-daily spreads
// use a deterministic seed per (spread, shuffle-count) so draws are stable yet shuffle still changes them.
// Card art is the vendored public-domain RWS scans — no emoji anywhere.
export default [
  {
    name: "card of the day renders: 9 spreads, one card + meaning", run: async (h) => {
      h.expect((await h.count("[data-spread]")) === 9, "має бути 9 розкладів");
      h.expect((await h.prop('[data-spread="daily"]', "ariaPressed")) === "true", "'карта дня' не активна за замовчуванням");
      h.expect((await h.count("[data-card]")) === 1, "карта дня — рівно одна карта");
      h.expect((await h.count("[data-reading] img, [data-card] img")) >= 1, "немає зображення карти");
      h.expect((await h.text("[data-reading]")).trim().length > 30, "порожнє значення карти");
    },
  },
  {
    name: "spread switch changes the layout (3 → 10 cards)", run: async (h) => {
      await h.click('[data-spread="ppf"]'); await h.wait(150);
      h.expect((await h.count("[data-card]")) === 3, "минуле/тепер/майбутнє = 3 карти");
      await h.click('[data-spread="celtic"]'); await h.wait(150);
      h.expect((await h.count("[data-card]")) === 10, "кельтський хрест = 10 карт");
      await h.click('[data-spread="pyramid"]'); await h.wait(150);
      h.expect((await h.count("[data-card]")) === 6, "піраміда душі = 6 карт");
      await h.click('[data-spread="daily"]'); await h.wait(120);
    },
  },
  {
    name: "shuffle re-draws", run: async (h) => {
      await h.click('[data-spread="ppf"]'); await h.wait(150);
      const before = await h.text("[data-reading]");
      await h.click("[data-shuffle]"); await h.wait(150);
      h.expect((await h.text("[data-reading]")) !== before, "перетасування не змінило розклад");
      await h.click('[data-spread="daily"]'); await h.wait(120);
    },
  },
  {
    name: "card detail: аркуш історія-backed (Back закриває)", run: async (h) => {
      await h.click("[data-card]"); await h.wait(200);
      h.expect((await h.prop("#cardsheet", "open")) === true, "аркуш карти не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#cardsheet", "open")) !== true, "Back не закрив аркуш карти");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Spreads|Choose a spread/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Розклади|Обери розклад/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="read"]'); await h.wait(120);
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
