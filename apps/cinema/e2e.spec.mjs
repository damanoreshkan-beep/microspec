const ready = async (h) => { await h.waitFor(/\S{6}/, 15000); await h.wait(300); };
const firstCard = ".aw-tap";

export default [
  {
    name: "Кіно: фільми вантажаться з архіву", run: async (h) => {
      await ready(h);
      h.expect((await h.count("main img")) > 0, "немає постерів — картки без зображення");
      h.expect((await h.count(firstCard)) > 2, "список фільмів порожній");
    },
  },
  {
    name: "картка відкриває деталі, а не викидає з апки", run: async (h) => {
      await ready(h);
      await h.click(firstCard); await h.wait(400);
      h.expect((await h.count("#detail-back")) === 1, "клік по картці не відкрив деталі");
      h.expect((await h.count("[data-play]")) === 1, "у деталях немає кнопки перегляду — dead `play` action");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#detail-back")) === 0, "Back не закрив деталі");
    },
  },
  {
    name: "play відкриває плеєр рантайму", run: async (h) => {
      await ready(h);
      await h.click(firstCard); await h.wait(400);
      await h.click("[data-play]"); await h.wait(600);
      h.expect((await h.count("video")) === 1, "кнопка play не змонтувала <video> — контракт не працює");
      h.expect((await h.count("#player-back")) === 1, "плеєр без своєї шапки");
    },
  },
  {
    name: "Back із плеєра повертає в деталі, а не в список", run: async (h) => {
      await ready(h);
      await h.click(firstCard); await h.wait(400);
      await h.click("[data-play]"); await h.wait(600);
      h.expect((await h.count("video")) === 1, "плеєр не відкрився");
      await h.back(); await h.wait(400);
      h.expect((await h.count("video")) === 0, "Back не закрив плеєр");
      h.expect((await h.count("[data-play]")) === 1, "Back з плеєра викинув аж у список — деталі втрачено");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#detail-back")) === 0, "другий Back не закрив деталі");
    },
  },
  {
    name: "фільтри: мова + епоха, шторка history-backed", run: async (h) => {
      await ready(h);
      await h.click("#filter-btn"); await h.wait(250);
      h.expect((await h.prop("#sheet", "open")) === true, "шторка фільтрів не відкрилась");
      h.expect((await h.count("#f-lang")) === 1, "немає селекта мови");
      h.expect((await h.count("#f-era")) === 1, "немає селекта епохи");
      await h.select("#f-lang", "uk"); await h.wait(200);
      await h.click("#f-apply"); await h.wait(2500);
      const n = await h.count(firstCard);
      h.expect(n > 0 && n < 20, `фільтр мови не звузив вибірку (${n} карток)`);
      await h.click("#filter-btn"); await h.wait(250);
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#sheet", "open")) !== true, "Back не закрив шторку фільтрів");
    },
  },
  {
    name: "пошук фільтрує", run: async (h) => {
      await ready(h);
      const before = await h.count(firstCard);
      await h.type('input[type="search"]', "zzzqqq-нема-такого"); await h.wait(600);
      h.expect((await h.count(firstCard)) < before, "пошук нічого не звузив");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Films|Language|Cinema/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Фільми|Мова|Кіно/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="films"]'); await h.wait(200);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click("#p-install"); await h.wait(200);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
