// Кіно — the app is a spec + a data adapter and nothing else, so these assertions are really about the
// CONTRACT: `detail.actions[].play` must produce a real in-app player, and the stack it opens on must
// behave. If this app needs a view.js to pass, video isn't in the system.
const ready = async (h) => { await h.waitFor(/\S{6}/, 15000); await h.wait(300); };
// The tap target is the runtime's transparent overlay button, not the .card div — clicking the card
// itself does nothing, which is exactly what the first run of this file proved.
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
    // The drill-down contract: a card opens the detail IN-APP, never throws you to archive.org.
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
    // The whole reason the contract exists: `play` opens the RUNTIME player, with no app code.
    name: "play відкриває плеєр рантайму", run: async (h) => {
      await ready(h);
      await h.click(firstCard); await h.wait(400);
      await h.click("[data-play]"); await h.wait(600);
      h.expect((await h.count("video")) === 1, "кнопка play не змонтувала <video> — контракт не працює");
      h.expect((await h.count("#player-back")) === 1, "плеєр без своєї шапки");
    },
  },
  {
    // Overlays are a STACK, not a set. Back from the player must land on the film you opened it from —
    // dropping the viewer all the way to the list loses the item they were reading, and used to: the
    // runtime closed every overlay at once.
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
