const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "курси завантажуються (row-картки)", run: async (h) => {
      await load(h);
      h.expect((await h.count(".card")) > 3, "немає карток курсів");
      h.expect(/EUR|GBP|JPY/.test(await h.bodyText()), "немає кодів валют");
    },
  },
  {
    name: "пошук валюти звужує і відновлює", run: async (h) => {
      await load(h);
      const base = await h.count(".card");
      await h.type("#filter", "zzzz"); await h.wait(250);
      h.expect((await h.count(".card")) === 0, "очікував 0");
      await h.type("#filter", ""); await h.wait(250);
      h.expect((await h.count(".card")) === base, "не відновилось");
    },
  },
  {
    name: "конвертер рахує + swap", run: async (h) => {
      await h.click('[data-tab="convert"]'); await h.wait(250);
      h.expect((await h.count("#conv-amount")) === 1, "немає поля суми");
      const res1 = (await h.text("#conv-result")).trim();
      h.expect(res1.length > 0 && /\d/.test(res1), "порожній результат");
      await h.click("#conv-swap"); await h.wait(200);
      const res2 = (await h.text("#conv-result")).trim();
      h.expect(res2 !== res1, "swap не змінив результат");
      await h.click('[data-tab="rates"]'); await h.wait(150);
    },
  },
  {
    name: "quick-суми задають значення", run: async (h) => {
      await h.click('[data-tab="convert"]'); await h.wait(200);
      await h.click(".btn-outline.rounded-full"); await h.wait(150);
      h.expect(/\d/.test(await h.prop("#conv-amount", "value")), "quick не задав суму");
      await h.click('[data-tab="rates"]'); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Rates|Convert|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Курси|Конвертер|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="rates"]'); await h.wait(120);
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
