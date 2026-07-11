// No API token in CI → the app reaches its error state (by design it throws rather than show a false
// "all clear"). So the gate verifies the SHELL + that it reaches a terminal, non-loading state — the
// populated list is reviewed via ?mock (shot --query "mock=1") and in production once the token is live.
export default [
  {
    name: "доходить до фінального стану (не висне на завантаженні)", run: async (h) => {
      for (let i = 0; i < 16; i++) { if ((await h.count(".skeleton")) === 0) break; await h.wait(400); }
      h.expect((await h.count(".skeleton")) === 0, "застряг на скелетоні");
      h.expect(/Тривог|Alert/i.test(await h.bodyText()), "немає заголовка");
    },
  },
  {
    name: "є пошук і кнопка оновлення", run: async (h) => {
      h.expect((await h.count("#filter")) === 1, "немає пошуку");
      h.expect((await h.count("#refresh")) === 1, "немає кнопки оновлення");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Alerts|Now|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Тривог|Зараз|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="now"]'); await h.wait(120);
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
