const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "стрічка DOU + банер бронювання", run: async (h) => {
      await load(h);
      h.expect((await h.count(".card")) > 3, "немає карток вакансій");
      h.expect(/бронюванн/i.test(await h.bodyText()), "немає згадки бронювання (банер)");
    },
  },
  {
    name: "картка веде на jobs.dou.ua", run: async (h) => {
      await load(h);
      h.expect(/jobs\.dou\.ua/.test(await h.attr(".card", "href")), "поганий href");
      h.expect(/Детальніше/.test(await h.bodyText()), "немає афордансу");
    },
  },
  {
    name: "фільтр: категорія + бронь-тогл + досвід", run: async (h) => {
      await h.click("#filter-btn"); await h.wait(200);
      h.expect((await h.prop("#sheet", "open")) === true, "шторка не відкрилась");
      h.expect((await h.count("#f-category")) === 1, "немає селекта категорії");
      h.expect((await h.count("#f-fbron")) === 1, "немає тоглу бронь");
      h.expect((await h.count("#f-exp")) === 1, "немає сегмента досвіду");
      await h.click("#f-apply"); await h.wait(150);
    },
  },
  {
    name: "пошук звужує до 0 і відновлює", run: async (h) => {
      await load(h);
      const base = await h.count(".card");
      await h.type("#filter", "zzzz-нема"); await h.wait(250);
      h.expect((await h.count(".card")) === 0, "очікував 0");
      await h.type("#filter", ""); await h.wait(250);
      h.expect((await h.count(".card")) === base, "не відновилось");
    },
  },
  {
    name: "збереження → тост + вкладка «Збережені»", run: async (h) => {
      await load(h);
      await h.click("[data-fav]"); await h.wait(200);
      h.expect(/Збережено|Saved/.test(await h.text("[data-toast]")), "немає тосту");
      await h.click('[data-tab="saved"]'); await h.wait(200);
      h.expect((await h.count(".card")) >= 1, "у «Збережені» порожньо");
      await h.click('[data-tab="feed"]'); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Feed|Saved|Deferment/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Стрічка|Збережені|Бронюванн/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="feed"]'); await h.wait(120);
    },
  },
];
