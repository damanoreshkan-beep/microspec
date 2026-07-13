// Live Bitcoin tx flow (Blockchain.com WebSocket). On localhost the stream is synthetic (a raw WS from a
// CI IP is nondeterministic), so the gate reviews a real, moving feed. Dense table + heat + chart + range
// filter + search + sort — all systemic (declared in spec.json).
const seed = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-row]")) > 3) break; await h.wait(300); } };

export default [
  {
    name: "жива таблиця транзакцій + графік + суми/комісія", run: async (h) => {
      await seed(h);
      h.expect((await h.count("[data-row]")) > 3, "замало рядків");
      h.expect((await h.count("svg")) >= 1, "немає графіка");
      const t = await h.bodyText();
      h.expect(/[\d.]+\s*BTC/i.test(t), "немає сум у BTC");
      h.expect(/sat\/vB/i.test(t), "немає комісії");
      h.expect(/щойно|тому/.test(t), "немає відносного часу");
    },
  },
  {
    name: "дрілдаун з рядка: максимум інфи, Back закриває", run: async (h) => {
      await seed(h);
      await h.click('[data-row="0"]'); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 1, "деталі не відкрились");
      const t = await h.bodyText();
      h.expect(/Хеш|Hash/.test(t) && /Комісія|Fee/.test(t) && /отримувач|recipient/i.test(t), "немає ключових полів");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив деталі");
    },
  },
  {
    name: "фільтр «від–до» за сумою звужує і скидається чипом", run: async (h) => {
      await seed(h);
      await h.click("#filter-btn"); await h.wait(200);
      h.expect((await h.count("#f-amt-from")) === 1, "немає range-поля");
      await h.type("#f-amt-from", "999"); await h.wait(150);
      await h.click("#f-apply"); await h.wait(250);
      h.expect((await h.count("[data-row]")) === 0, "фільтр не звузив (немає переказів > 999 BTC)");
      h.expect(/Нічого не знайдено|Nothing/.test(await h.bodyText()), "немає empty-стану");
      const chip = await h.count(".badge.badge-primary");
      h.expect(chip >= 1, "немає чипа активного фільтра");
      await h.click(".badge.badge-primary"); await h.wait(400);
      h.expect((await h.count("[data-row]")) > 0, "чип не скинув фільтр");
    },
  },
  {
    name: "сортування (сума/час/комісія) перемикається", run: async (h) => {
      await seed(h);
      h.expect((await h.count("#sort [data-sort]")) === 3, "немає 3 варіантів сортування");
      await h.click('[data-sort="fee"]'); await h.wait(200);
      h.expect((await h.attr('[data-sort="fee"]', "aria-pressed")) === "true", "сорт не активувався");
    },
  },
  {
    name: "пошук звужує до 0 і відновлює", run: async (h) => {
      await seed(h);
      const base = await h.count("[data-row]");
      await h.type("#filter", "zzz-нема-адреси"); await h.wait(300);
      h.expect((await h.count("[data-row]")) === 0, "пошук не звузив");
      await h.type("#filter", ""); await h.wait(400);
      h.expect((await h.count("[data-row]")) > 0, "не відновилось");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Flow|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Потік|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="flow"]'); await h.wait(150);
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
