// Sigil — the gate forges a seeded intent (DEFAULT_INTENT) so the shot shows a real sigil. Flow covered:
// forge renders a full-bleed 3D stage + attribution; Keep writes to the grimoire (IndexedDB); a grimoire item
// opens a history-backed detail sheet that system Back closes (the routing invariant); i18n + PWA install.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-intent]")) > 0) break; await h.wait(300); } };

export default [
  {
    // regression guard: the whole point of this app is the forged 3D. If the gate has WebGL, the three.js
    // scene MUST build — a silent fall to the 2D path (a throw in makeScene, or the data not reaching the
    // renderer) means the hero feature is invisible on real devices too. This catches exactly that.
    name: "3D: WebGL-шлях активний у гейті", run: async (h) => {
      await ready(h); await h.wait(1500);
      const hw = await h.attr("[data-sigil]", "data-haswebgl");
      const rm = await h.attr("[data-sigil]", "data-render");
      if (hw === "yes") h.expect(rm === "webgl", `WebGL є, але сцена не збудувалась: render=${rm} err=${await h.attr("[data-sigil]", "data-err")}`);
    },
  },
  {
    name: "кузня: сцена + атрибуція + дії", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-intent]")) === 1, "немає поля наміру");
      h.expect((await h.count("[data-sigil]")) >= 1, "немає повноекранної сцени сигіла");
      h.expect((await h.count("[data-forge]")) === 1, "немає кнопки кування");
      h.expect((await h.count("[data-keep]")) === 1, "немає кнопки збереження (сигіл не викувано)");
    },
  },
  {
    name: "збереження → ґримуар", run: async (h) => {
      await ready(h);
      await h.tap("[data-keep]"); await h.wait(300);
      await h.click('[data-tab="grimoire"]'); await h.wait(400);
      h.expect((await h.count("[data-item]")) >= 1, "збережений сигіл не зʼявився у ґримуарі");
    },
  },
  {
    name: "деталь: sheet, Back закриває", run: async (h) => {
      await h.click('[data-tab="grimoire"]'); await h.wait(300);
      await h.tap("[data-item]"); await h.wait(250);
      h.expect((await h.count("[data-detail]")) === 1, "деталь-sheet не відкрився");
      await h.back(); await h.wait(250);
      h.expect((await h.count("[data-detail]")) === 0, "Back не закрив деталь-sheet");
    },
  },
  {
    name: "збереження переживає перезапуск", run: async (h) => {
      await h.click('[data-tab="grimoire"]'); await h.wait(300);
      h.expect((await h.count("[data-item]")) >= 1, "немає збереженого перед перезапуском");
      await h.reload(); await h.wait(300);
      await h.click('[data-tab="grimoire"]'); await h.wait(400);
      h.expect((await h.count("[data-item]")) >= 1, "збереження не пережило перезапуск");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Language|Dark theme/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="forge"]'); await h.wait(150);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
