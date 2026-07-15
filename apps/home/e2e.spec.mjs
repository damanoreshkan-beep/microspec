// The store home is a custom tool app: a searchable icon grid, a history-backed per-app description screen,
// and NEW badges (IndexedDB). apps.json is a local import → tiles render immediately.
const ready = async (h) => { for (let i = 0; i < 12; i++) { if ((await h.count("[data-app]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "стор: сітка застосунків + пошук + NEW-бейджі", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-app]")) >= 10, "замало плиток застосунків");
      h.expect((await h.count(".input")) === 1, "немає поля пошуку");
      h.expect(/НОВЕ|NEW/.test(await h.text('[data-app="rave"]')) || (await h.count(".badge-primary")) > 0, "немає NEW-бейджів на невідкритих");
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
    name: "тап по застосунку → екран опису, Back закриває", run: async (h) => {
      await ready(h);
      await h.click('[data-app="rave"]'); await h.wait(250);
      h.expect((await h.count("#open-app")) === 1, "не відкрився екран опису з кнопкою Відкрити");
      h.expect(/техно|techno/i.test(await h.bodyText()), "немає опису застосунку");
      await h.back(); await h.wait(250);
      h.expect((await h.count("#open-app")) === 0, "Back не закрив екран опису");
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
