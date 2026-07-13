// The store home is itself a microapp (list/grid family). Data is a local import (apps.json), so tiles
// render immediately; we still poll a couple times to be safe.
const load = async (h) => { for (let i = 0; i < 8; i++) { if ((await h.count(".grid a")) > 0) break; await h.wait(150); } };

export default [
  {
    name: "сітка застосунків рендериться плитками", run: async (h) => {
      await load(h);
      h.expect((await h.count(".grid a")) >= 6, "замало плиток у сітці");
      h.expect(/^\.\//.test(await h.attr(".grid a", "href")), "плитка не веде на застосунок");
    },
  },
  {
    name: "пошук звужує до 0 і відновлює", run: async (h) => {
      await load(h);
      const base = await h.count(".grid a");
      await h.type("#filter", "zzzz-нема-такого"); await h.wait(250);
      h.expect((await h.count(".grid a")) === 0, "очікував 0 плиток");
      h.expect(/Нічого не знайдено/.test(await h.bodyText()), "немає empty-стану");
      await h.type("#filter", ""); await h.wait(250);
      h.expect((await h.count(".grid a")) === base, "не відновилось");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Apps|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Застосунки|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="apps"]'); await h.wait(120);
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
