// IPTV — live channel list from iptv-org (CORS *, loads in CI). We never assert video PLAYS (headless has
// no working streams); we assert the browse UI + that the runtime Player opens/closes.
const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-ch]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "канали завантажуються сіткою", run: async (h) => {
      await load(h);
      h.expect((await h.count("[data-ch]")) > 5, "немає плиток каналів");
      h.expect(/канал/i.test(await h.bodyText()) || /channel/i.test(await h.bodyText()), "немає лічильника каналів");
    },
  },
  {
    name: "пошук звужує список", run: async (h) => {
      await load(h);
      const base = await h.count("[data-ch]");
      await h.type("#ch-search", "zzzzнемаєтакого"); await h.wait(300);
      h.expect((await h.count("[data-ch]")) < base, "пошук не звузив");
      await h.type("#ch-search", ""); await h.wait(300);
      h.expect((await h.count("[data-ch]")) >= base, "пошук не відновив");
    },
  },
  {
    name: "канал → плеєр відкривається, Back закриває", run: async (h) => {
      await load(h);
      await h.click("[data-ch]"); await h.wait(400);
      h.expect((await h.count("#player-back")) === 1, "плеєр не відкрився");
      h.expect((await h.count("video")) === 1, "немає відео-елемента");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#player-back")) === 0, "Back не закрив плеєр");
    },
  },
  {
    name: "перемикач країни зі списком локалізованих країн", run: async (h) => {
      await load(h);
      const opts = await h.prop("#country", "textContent");
      h.expect(/Ukraine/.test(opts) && /Germany/.test(opts) && /United States/.test(opts), "немає списку країн");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Live|Language|Country/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Ефір|Мова|Країна/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="watch"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
