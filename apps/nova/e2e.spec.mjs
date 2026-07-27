// nova — headless gate assertions. Under the gate /_rt/auth.js seeds a mock GitHub session and the view seeds
// a deterministic developer fixture (MOCK_DEVS), so the gate reviews the REAL signed-in feed with no network
// and no OAuth popup. Read-only checks run before the star mutations so the order is robust whether or not
// the harness reloads between tests (the supported set is module-level, so it accumulates within one page).
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-dev]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "стрічка недооцінених девів рендериться з посиланнями на GitHub", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-dev]")) >= 3, "стрічка порожня — фікстура не відрендерилась");
      h.expect((await h.count("a[href*='github.com']")) > 0, "немає посилань на GitHub-репозиторії");
      h.expect(/Under the radar|Поза увагою|Solo|самотужки|Real project|Справжній/.test(await h.text("main")), "немає чипів-причин (аналіз)");
    },
  },
  {
    name: "підтримка: аркуш зі спонсорськими посиланнями, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-dev] [data-support]"); await h.wait(500);
      // The shell is the kit's Sheet now, so the assertion is the dialog's STATE (open), not a class or a
      // back-button the kit doesn't draw.
      h.expect((await h.prop("#support-sheet", "open")) === true, "аркуш підтримки не відкрився");
      h.expect((await h.count("[data-fund][href*='sponsors']")) >= 1, "немає посилання на GitHub Sponsors");
      await h.back(); await h.wait(400);
      h.expect((await h.prop("#support-sheet", "open")) !== true, "Back не закрив аркуш підтримки");
    },
  },
  {
    name: "зірка прибирає дева зі стрічки й додає його в таб «Зірки»", run: async (h) => {
      await ready(h);
      const before = await h.count("[data-dev]");
      h.expect(before >= 3, `стрічка замала: ${before}`);
      await h.click("[data-dev] [data-star]"); await h.wait(500);
      h.expect((await h.count("[data-dev]")) === before - 1, "зірка не прибрала дева з головної стрічки");
      await h.click('[data-tab="lifted"]'); await h.wait(300);
      h.expect((await h.count("[data-lifted]")) >= 1, "підтриманий дев не зʼявився в табі «Зірки»");
      h.expect((await h.count("[data-lifted] a[href*='github.com']")) >= 1, "у списку «Зірки» немає посилання на GitHub");
      await h.click('[data-tab="discover"]'); await h.wait(200);
    },
  },
  {
    name: "фінал: зіркове поле з підтриманими девами з табу «Зірки», Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-dev] [data-star]"); await h.wait(500);   // ensure ≥1 lifted this session
      await h.click('[data-tab="lifted"]'); await h.wait(300);
      h.expect((await h.count("#reveal")) === 1, "немає кнопки фіналу в табі «Зірки»");
      await h.click("#reveal"); await h.wait(600);
      h.expect((await h.count("[data-live]")) === 1, "фінал не відкрився");
      h.expect((await h.count("canvas[data-render='2d']")) === 1, "немає canvas зіркового поля");
      h.expect((await h.count("[data-live] img")) >= 1, "у фіналі не виведено підтриманих людей");
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-live]")) === 0, "Back не закрив фінал");
      await h.click('[data-tab="discover"]'); await h.wait(200);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Discover|Lifted|Language|Install/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Пошук|Зірки|Мова|Встанови/.test(await h.bodyText()), "не UA");
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
