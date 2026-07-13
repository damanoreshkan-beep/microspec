// Live Bitcoin tx flow (Blockchain.com WebSocket). On localhost the stream is synthetic (a raw WS from a
// CI IP is nondeterministic), so the gate reviews a real, moving feed. list + detail + stream; search +
// sort are systemic.
const seed = async (h) => { for (let i = 0; i < 24; i++) { if (/BTC/.test(await h.bodyText())) break; await h.wait(300); } };

export default [
  {
    name: "живий потік транзакцій + суми/комісія", run: async (h) => {
      await seed(h);
      h.expect((await h.count(".card")) > 3, "замало транзакцій");
      const t = await h.bodyText();
      h.expect(/[\d.]+\s*BTC/i.test(t), "немає сум у BTC");
      h.expect(/sat\/vB/i.test(t), "немає комісії sat/vB"); // badge CSS uppercases → match case-insensitively
      h.expect(/щойно|тому/.test(t), "немає відносного часу");
    },
  },
  {
    name: "дрілдаун: максимум інфи по транзакції, Back закриває", run: async (h) => {
      await seed(h);
      await h.click(".aw-tap"); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 1, "деталі не відкрились");
      const t = await h.bodyText();
      h.expect(/Хеш|Hash/.test(t) && /Комісія|Fee/.test(t), "немає ключових полів");
      h.expect(/Найбільший отримувач|Top recipient/.test(t), "немає адрес");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив деталі");
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
      const base = await h.count(".card");
      await h.type("#filter", "zzz-нема-адреси"); await h.wait(300);
      h.expect((await h.count(".card")) === 0, "пошук не звузив");
      h.expect(/Нічого не знайдено|Nothing/.test(await h.bodyText()), "немає empty-стану");
      await h.type("#filter", ""); await h.wait(400);
      h.expect((await h.count(".card")) > 0, "не відновилось");
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
