// The store is a custom tool app: category chips + sectioned icon grid, a search that flattens across the
// farm, a history-backed per-app description Sheet, and NEW badges (IndexedDB). apps.json imports locally.
const ready = async (h) => { for (let i = 0; i < 12; i++) { if ((await h.count("[data-app]")) > 0) break; await h.wait(200); } };

export default [
  {
    // Цей тест раніше вимагав ПРОТИЛЕЖНОГО — «є NEW-бейджі на невідкритих» — і саме тому дефект прожив
    // так довго: у свіжому браузері невідкриті всі 68, тож бейдж стояв на кожній плитці. Знімок показав
    // стіну однакових ярликів, більших за іконки під ними. Бейдж на всьому не означає нічого, тому
    // контракт тепер зворотний: перший візит задає базову лінію і не позначає нічого.
    name: "стор: сітка + пошук; перший візит не позначає нічого як нове", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-app]")) >= 10, "замало плиток застосунків");
      h.expect((await h.count(".input")) === 1, "немає поля пошуку");
      const badges = await h.count(".badge-primary");
      h.expect(badges === 0, `перший візит позначив ${badges} застосунків як нові — базова лінія не записалась`);
      h.expect(!/НОВЕ|NEW/.test(await h.text('[data-app="rave"]')), "бейдж НОВЕ на першому візиті");
    },
  },
  {
    name: "пошук фільтрує сітку", run: async (h) => {
      await ready(h);
      const base = await h.count("[data-app]");
      await h.type(".input", "рейв"); await h.wait(250);
      const now = await h.count("[data-app]");
      h.expect(now >= 1 && now < base, "пошук не звузив сітку");
      await h.type(".input", ""); await h.wait(250);
      h.expect((await h.count("[data-app]")) === base, "не відновилось після очищення");
    },
  },
  {
    name: "чіпи фільтрують за категорією", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-cat]")) >= 5, "немає чіпів категорій");
      const all = await h.count("[data-app]");
      await h.tap('[data-cat="sound"]'); await h.wait(200);
      const sound = await h.count("[data-app]");
      h.expect(sound >= 1 && sound < all, "чіп не звузив до категорії");
      // стан, не клас: Segmented позначає обраний варіант через aria-pressed
      h.expect((await h.attr('[data-cat="sound"]', "aria-pressed")) === "true", "обрана категорія не має aria-pressed");
      await h.tap('[data-cat="all"]'); await h.wait(150);
      h.expect((await h.count("[data-app]")) === all, "не відновилось на «Усі»");
      h.expect((await h.attr('[data-cat="all"]', "aria-pressed")) === "true", "«Усі» не має aria-pressed");
      h.expect((await h.attr('[data-cat="sound"]', "aria-pressed")) === "false", "стара категорія лишилась позначеною");
    },
  },
  {
    name: "тап по застосунку → шитик опису, Back закриває", run: async (h) => {
      await ready(h);
      await h.click('[data-app="rave"]'); await h.wait(250);
      h.expect((await h.prop("#appsheet", "open")) === true, "не відкрився шитик опису");
      h.expect((await h.count("#open-app")) === 1, "немає кнопки Відкрити в шитику");
      h.expect(/техно|techno/i.test(await h.bodyText()), "немає опису застосунку");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#appsheet", "open")) !== true, "Back не закрив шитик опису");
      h.expect((await h.count("#open-app")) === 0, "вміст шитика лишився в DOM після закриття");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Apps|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Застосунки|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="apps"]'); await h.wait(120);
    },
  },
  {
    // App Store, не сітка (2026-08-31): добірка великих карток зверху, сторінка апки з Open + Install,
    // скріншотом та екранами; категорія → рядки-список.
    name: "стор: добірка карток, сторінка апки з Install і скріном, категорія → рядки", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-featured]")) >= 2, "немає карток добірки");
      await h.click('[data-featured][data-app="tide"]'); await h.wait(300);
      h.expect((await h.prop("#appsheet", "open")) === true, "картка добірки не відкрила сторінку апки");
      h.expect((await h.count("#install-app")) === 1, "немає кнопки Встановити на сторінці апки");
      h.expect((await h.count("#appsheet img[src*='shot-tide']")) === 1, "немає скріншота на сторінці апки");
      h.expect(/v\d/.test(await h.text("#appsheet")), "немає версії на сторінці апки");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#appsheet", "open")) !== true, "Back не закрив сторінку апки");
      await h.tap('[data-cat="sound"]'); await h.wait(200);
      h.expect((await h.count("[data-app] .btn")) >= 3, "категорія не показала рядки з кнопкою Відкрити");
      await h.tap('[data-cat="all"]'); await h.wait(150);
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
