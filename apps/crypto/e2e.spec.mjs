// Live crypto ticker (Binance WebSocket). On localhost the stream is synthetic (Binance geo-blocks CI
// IPs), so the gate reviews a real, moving market. It's a plain list app — search + sort are systemic.
const seed = async (h) => { for (let i = 0; i < 24; i++) { if (/BTC/.test(await h.bodyText())) break; await h.wait(300); } };

export default [
  {
    name: "живий ринок наповнює список + ціни/зміни", run: async (h) => {
      await seed(h);
      h.expect((await h.count(".card")) > 5, "замало рядків");
      const t = await h.bodyText();
      h.expect(/\$[\d.,]+/.test(t), "немає цін");
      h.expect(/[+-]?\d+(\.\d+)?%/.test(t), "немає 24г змін");
    },
  },
  {
    name: "сортування (сегмент-контрол) перемикається", run: async (h) => {
      await seed(h);
      h.expect((await h.count("#sort [data-sort]")) === 3, "немає 3 варіантів сортування");
      await h.click('[data-sort="chg"]'); await h.wait(200);
      h.expect((await h.attr('[data-sort="chg"]', "aria-pressed")) === "true", "сорт не активувався");
      await h.click('[data-sort="base"]'); await h.wait(200);
      h.expect((await h.attr('[data-sort="base"]', "aria-pressed")) === "true", "абетка не активувалась");
    },
  },
  {
    name: "пошук монети звужує і відновлює", run: async (h) => {
      await seed(h);
      const base = await h.count(".card");
      await h.type("#filter", "solana"); await h.wait(300);
      h.expect((await h.count(".card")) < base && (await h.count(".card")) >= 1, "пошук не звузив");
      h.expect(/Solana|SOL/.test(await h.bodyText()), "не знайшов Solana");
      await h.type("#filter", "zzz-нема"); await h.wait(300);
      h.expect(/Нічого не знайдено|Nothing/.test(await h.bodyText()), "немає empty-стану");
      await h.type("#filter", ""); await h.wait(300);
      h.expect((await h.count(".card")) === base, "не відновилось");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Market|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Ринок|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="market"]'); await h.wait(150);
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
