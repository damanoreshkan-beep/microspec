// nova — headless gate assertions. Under the gate /_rt/auth.js seeds a mock GitHub session and the view seeds
// a deterministic developer fixture (MOCK_DEVS), so the gate reviews the REAL signed-in feed with no network
// and no OAuth popup. The live OAuth + GitHub Search path is exercised on-device.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-dev]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "стрічка недооцінених девів рендериться з посиланнями на GitHub", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-dev]")) >= 3, "стрічка порожня — фікстура не відрендерилась");
      h.expect((await h.count("a[href*='github.com']")) > 0, "немає посилань на GitHub-репозиторії");
      // the "analyze" surface: each card explains WHY the developer is underrated
      h.expect(/Under the radar|Поза увагою|Solo|самотужки|Real project|Справжній/.test(await h.text("main")), "немає чипів-причин (аналіз)");
    },
  },
  {
    name: "зірка — свідома дія, що перемикає стан і лічильник", run: async (h) => {
      await ready(h);
      const btn = "[data-dev] [data-star]";
      h.expect((await h.attr(btn, "aria-pressed")) === "false", "перша картка вже позначена — стан не з нуля");
      await h.click(btn); await h.wait(500);
      h.expect((await h.attr(btn, "aria-pressed")) === "true", "клік по «Зірці» не перемкнув стан");
      h.expect(/1\s+(lifted|піднято)/.test(await h.bodyText()), "лічильник підтриманих не оновився");
    },
  },
  {
    name: "підтримка: аркуш зі спонсорськими посиланнями, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-dev] [data-support]"); await h.wait(500);
      h.expect((await h.count("#support-back")) === 1, "аркуш підтримки не відкрився");
      // the mock funding for the first developer carries a GitHub Sponsors link — the real charity channel
      h.expect((await h.count("[data-fund][href*='sponsors']")) >= 1, "немає посилання на GitHub Sponsors");
      await h.back(); await h.wait(400);
      h.expect((await h.count("#support-back")) === 0, "Back не закрив аркуш підтримки");
    },
  },
  {
    name: "фінал: зіркове поле з підтриманими девами, Back закриває", run: async (h) => {
      await ready(h);
      // reveal is disabled until at least one developer is lifted. Star the SECOND card (idempotently, so a
      // shared-page test run can't toggle it back off) → there is always ≥1 lifted regardless of prior tests.
      const b = "[data-dev]:nth-of-type(2) [data-star]";
      if ((await h.attr(b, "aria-pressed")) !== "true") { await h.click(b); await h.wait(500); }
      h.expect((await h.prop("#reveal", "disabled")) !== true, "«Фінал» лишився неактивним після зірки");
      await h.click("#reveal"); await h.wait(600);
      h.expect((await h.count("[data-live]")) === 1, "фінал не відкрився");
      h.expect((await h.count("canvas[data-render='2d']")) === 1, "немає canvas зіркового поля");
      h.expect((await h.count("[data-live] img")) >= 1, "у фіналі не виведено підтриманих людей");
      h.expect(/\d/.test(await h.text("[data-live]")), "фінал без лічильника підтриманих");
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-live]")) === 0, "Back не закрив фінал");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Discover|Language|Install/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Пошук|Мова|Встанови/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="discover"]'); await h.wait(200);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click("#p-install"); await h.wait(200);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
