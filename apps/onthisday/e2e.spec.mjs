const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-otd]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "цей день: дата + категорії + події", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-cat]")) === 5, "немає 5 категорій");
      h.expect((await h.count("[data-otd]")) >= 3, "замало подій");
      h.expect(/Бастил|1789|Плутон/i.test(await h.bodyText()), "немає контенту семплу");
    },
  },
  {
    name: "перемикання категорій оновлює список", run: async (h) => {
      await ready(h);
      await h.click('[data-cat="births"]'); await h.wait(250);
      h.expect((await h.attr('[data-cat="births"]', "aria-pressed")) === "true", "категорія не обралась");
      h.expect(/Бергман|Гатрі|1918/i.test(await h.bodyText()), "список не оновився на народження");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/On This Day|Today|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Цей день|Сьогодні|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="today"]'); await h.wait(120);
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
