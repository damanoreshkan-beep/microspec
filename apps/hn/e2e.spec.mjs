// Poll on [data-fav] (real result cards), not .card — the loading Skeleton also renders .card divs.
const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "стрічка HN завантажується з бейджами", run: async (h) => {
      await load(h);
      h.expect((await h.count(".card")) > 3, "немає карток");
      h.expect((await h.count('iconify-icon[icon="lucide:arrow-up"]')) >= 3, "немає бейджів очок");
    },
  },
  {
    name: "картка веде на url + афорданс «Відкрити»", run: async (h) => {
      await load(h);
      h.expect(/^https?:/.test(await h.attr(".card", "href")), "поганий href");
      const t = await h.bodyText();
      h.expect(/сьогодні|вчора|тому|today|ago/.test(t), "немає відносного часу");
      h.expect(/Відкрити/.test(t), "немає афордансу");
    },
  },
  {
    name: "пошук звужує до 0 і відновлює", run: async (h) => {
      await load(h);
      const base = await h.count(".card");
      await h.type("#filter", "zzzz-нема-такого"); await h.wait(250);
      h.expect((await h.count(".card")) === 0, "очікував 0");
      h.expect(/Нічого не знайдено/.test(await h.bodyText()), "немає empty-стану");
      await h.type("#filter", ""); await h.wait(250);
      h.expect((await h.count(".card")) === base, "не відновилось");
    },
  },
  {
    name: "збереження: bookmark → тост + вкладка «Збережені»", run: async (h) => {
      await load(h);
      await h.click("[data-fav]"); await h.wait(200);
      h.expect(/Збережено|Saved/.test(await h.text("[data-toast]")), "немає тосту");
      await h.click('[data-tab="saved"]'); await h.wait(200);
      h.expect((await h.attr('[data-tab="saved"]', "aria-current")) === "page", "вкладка не активна");
      h.expect((await h.count(".card")) >= 1, "у «Збережені» порожньо");
      await h.click('[data-tab="feed"]'); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA міняє текст", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Front page|Saved|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Головна|Збережені|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="feed"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-install")) === 1, "немає кнопки встановлення");
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
