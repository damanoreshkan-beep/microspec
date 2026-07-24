// Ecliptic positions are pure geocentric math (no GPS), so the wheel renders everywhere incl. the gate.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-mark]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "колесо зодіаку рендериться (планети + знаки + дата)", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-mark]")) >= 6, "замало планет на колесі");
      h.expect((await h.count("[data-date]")) === 1, "немає дати транзиту");
      h.expect((await h.count("[data-row]")) >= 6, "немає таблиці планет у знаках");
      h.expect(/Овен|Телець|Близнюки|Рак|Лев|Діва|Терези|Скорпіон|Стрілець|Козоріг|Водолій|Риби/.test(await h.bodyText()), "немає знаків зодіаку");
    },
  },
  {
    name: "скрабер дати змінює транзит", run: async (h) => {
      await ready(h);
      const d0 = await h.text("[data-date]");
      await h.type("#scrub", "150"); await h.wait(200);
      h.expect(d0 !== (await h.text("[data-date]")), "дата не змінилась");
    },
  },
  {
    name: "чипи дати: +1 міс і повернення на «сьогодні»", run: async (h) => {
      await ready(h);
      await h.click('[data-chip="today"]'); await h.wait(150);
      const today = await h.text("[data-date]");
      await h.click('[data-chip="pMonth"]'); await h.wait(200);
      h.expect(today !== (await h.text("[data-date]")), "чип +1 міс не змінив дату");
      h.expect((await h.attr('[data-chip="pMonth"]', "class")).includes("border-primary"), "активний чип не підсвітився");
      await h.click('[data-chip="today"]'); await h.wait(150);
      h.expect(today === (await h.text("[data-date]")), "чип «сьогодні» не повернув на сьогодні");
    },
  },
  {
    name: "матриця управителів: знак вимикає свої планети (Скорпіон → Марс+Плутон)", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="rulers"]'); await h.wait(200);
      h.expect((await h.count("[data-sign]")) === 12, "немає 12 знаків у матриці");
      if ((await h.attr('[data-sign="7"]', "aria-pressed")) !== "true") { await h.click('[data-sign="7"]'); await h.wait(150); }
      await h.click('[data-sign="7"]'); await h.wait(150); // Scorpio OFF → hide Mars + Pluto
      h.expect((await h.attr('[data-sign="7"]', "aria-pressed")) === "false", "Скорпіон не вимкнувся");
      // Mars also rules Aries (0) → the shared ruler makes Aries read off too
      h.expect((await h.attr('[data-sign="0"]', "aria-pressed")) === "false", "спільний управитель Марс не відбився на Овні");
      await h.click('[data-tab="wheel"]'); await h.wait(200);
      h.expect((await h.count('[data-mark="mars"]')) === 0, "Марс не зник з колеса");
      h.expect((await h.count('[data-mark="pluto"]')) === 0, "Плутон не зник з колеса");
      await h.click('[data-tab="rulers"]'); await h.wait(150); await h.click('[data-sign="7"]'); await h.wait(150); // restore
      await h.click('[data-tab="wheel"]'); await h.wait(150);
    },
  },
  {
    name: "системний multi-фільтр планет", run: async (h) => {
      await ready(h);
      h.expect((await h.count("#filter-btn")) === 1, "немає кнопки фільтра");
      await h.click("#filter-btn"); await h.wait(200);
      h.expect((await h.count("#f-bodies [data-val]")) === 10, "немає 10 тіл у фільтрі");
      await h.click('#f-bodies [data-val="pluto"]'); await h.wait(150);
      h.expect((await h.attr('#f-bodies [data-val="pluto"]', "aria-pressed")) === "false", "Плутон не вимкнувся");
      await h.click("#f-apply"); await h.wait(200);
      h.expect(/\/10/.test(await h.bodyText()), "немає чипа активного фільтра");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Wheel|Transits|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Колесо|Транзити|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="wheel"]'); await h.wait(120);
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
  {
    name: "аспекти + AI-трактовка: аркуш історія-backed (Back закриває), рендерить текст", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="wheel"]'); await h.wait(150);
      h.expect((await h.count("[data-interp]")) === 1, "немає кнопки трактовки");
      await h.click("[data-interp]"); await h.wait(200);
      h.expect((await h.prop("#interpsheet", "open")) === true, "аркуш трактовки не відкрився");
      h.expect((await h.text("[data-interp-text]")).trim().length > 40, "порожня трактовка");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#interpsheet", "open")) !== true, "Back не закрив аркуш трактовки");
    },
  },
];
