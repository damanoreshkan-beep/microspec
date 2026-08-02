// dovkola — a live list of the signals around you. On localhost stream.js synthesizes a moving feed (no
// HackRF in CI), so the gate reviews a populated, alive list. Plain `list` app: search + sort are systemic;
// tapping a card opens a `detail.view` body (radar map / FM RadioText / reading history), Back-closable.
const seed = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-row]")) > 5) break; await h.wait(300); } };

export default [
  {
    name: "живий потік наповнює список сигналів", run: async (h) => {
      await seed(h);
      h.expect((await h.count("[data-row]")) > 5, "замало сигналів у списку");
      const t = await h.bodyText();
      h.expect(/MHz|GHz/.test(t), "немає частот на картках");
      h.expect(/Промінь|Xiaomi|Toyota|вежа/i.test(t), "немає названих сигналів");
    },
  },
  {
    name: "сортування count/strength/recent перемикається", run: async (h) => {
      await seed(h);
      h.expect((await h.count("#sort [data-sort]")) === 3, "немає 3 варіантів сортування");
      await h.click('[data-sort="strength"]'); await h.wait(200);
      h.expect((await h.attr('[data-sort="strength"]', "aria-pressed")) === "true", "сорт за силою не активувався");
      await h.click('[data-sort="recent"]'); await h.wait(200);
      h.expect((await h.attr('[data-sort="recent"]', "aria-pressed")) === "true", "сорт за свіжістю не активувався");
    },
  },
  {
    name: "пошук звужує і відновлює", run: async (h) => {
      await seed(h);
      const base = await h.count("[data-row]");
      await h.type("#filter", "xiaomi"); await h.wait(300);
      h.expect((await h.count("[data-row]")) < base && (await h.count("[data-row]")) >= 1, "пошук не звузив");
      h.expect(/Xiaomi/i.test(await h.bodyText()), "не знайшов Xiaomi");
      await h.type("#filter", "zzz-нема"); await h.wait(300);
      h.expect(/тихо|Nothing/i.test(await h.bodyText()), "немає empty-стану пошуку");
      await h.type("#filter", ""); await h.wait(300);
      h.expect((await h.count("[data-row]")) === base, "список не відновився");
    },
  },
  {
    name: "тап сигналу → живе тіло деталі, Back закриває", run: async (h) => {
      await seed(h);
      await h.click("[data-row]"); await h.wait(250);
      h.expect((await h.count("[data-live]")) >= 1, "деталь без живого тіла");
      await h.back(); await h.wait(200);
      h.expect((await h.count("[data-live]")) === 0, "Back не закрив деталь");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Live|Language|Profile/.test(await h.bodyText()), "не перемкнулось на EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Наживо|Мова|Профіль/.test(await h.bodyText()), "не повернулось на UA");
      await h.click('[data-tab="live"]'); await h.wait(150);
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
