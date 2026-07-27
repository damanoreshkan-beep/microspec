// The gate seeds a URL + name (no network in the gate — buildApk is short-circuited), so the identity
// preview renders populated and "Generate" reaches the ready state deterministically.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-forge]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "identity preview + generate reaches ready", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-forge]")) === 1, "немає прев'ю ідентичності");
      h.expect(/anubis\.world/i.test(await h.text("[data-forge]")), "URL не показано у прев'ю");
      await h.tap("[data-generate]"); await h.wait(300);
      h.expect((await h.count("[data-built]")) === 1, "стан 'готово' не досягнуто після генерації");
      h.expect(/adb|Auto Blocker|невідом|unknown/i.test(await h.text("[data-built]")), "немає чесної нотатки про sideload");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Forge|Generate|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Кузня|Згенерувати|Мова/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="forge"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває (історія-backed)", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка встановлення не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
  {
    name: "систем. APK-екран: профіль → екран, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-apk"); await h.wait(200);
      h.expect((await h.count("#apk-back")) > 0, "APK-екран не відкрився");
      h.expect((await h.count("[data-apk]")) === 1, "немає прев'ю self-APK");
      await h.back(); await h.wait(200);
      h.expect((await h.count("#apk-back")) === 0, "Back не закрив APK-екран");
      await h.click('[data-tab="forge"]'); await h.wait(120);
    },
  },
];
