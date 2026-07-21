// The gate has no key and must never spend credits, so the view seeds a local mesh-gradient "image" and
// never calls the proxy. Generate re-seeds it, so the flow (prompt → generate → result → save) is exercised
// end-to-end without a single API call.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-result]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "generator: result image + prompt + generate/save", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-result]")) === 1, "немає згенерованого зображення");
      h.expect((await h.count("#prompt")) === 1, "немає поля опису");
      h.expect((await h.count("[data-go]")) === 1, "немає кнопки генерації");
      h.expect((await h.count("[data-save]")) === 1, "немає кнопки збереження");
    },
  },
  {
    name: "generate re-creates the image (no API in the gate)", run: async (h) => {
      await ready(h);
      const before = await h.attr("[data-result]", "src");
      await h.type("#prompt", "a quiet neon city in the rain");
      await h.click("[data-go]"); await h.wait(400);
      let after = before, ok = false;
      for (let i = 0; i < 12; i++) { after = await h.attr("[data-result]", "src"); if (after && after !== before) { ok = true; break; } await h.wait(200); }
      h.expect(ok, "нове зображення не згенерувалось");
    },
  },
  {
    name: "повзунок якості змінює розмір і естімейт", run: async (h) => {
      await ready(h);
      const sizeHi = await h.text("[data-size]"), estHi = await h.text("[data-estimate]");
      h.expect(/×/.test(sizeHi), "немає читання розміру");
      await h.type("[data-quality]", "0");                                        // drag to draft
      await h.wait(150);
      const sizeLo = await h.text("[data-size]"), estLo = await h.text("[data-estimate]");
      h.expect(sizeLo !== sizeHi, "розмір не змінився від повзунка якості");
      h.expect(estLo !== estHi, "естімейт не змінився від повзунка якості");
    },
  },
  {
    name: "порожній опис не запускає генерацію", run: async (h) => {
      await ready(h);
      await h.type("#prompt", "");
      await h.wait(120);
      h.expect((await h.count("[data-go][disabled]")) === 1 || (await h.count("[data-go]:disabled")) === 1, "кнопка не задизейблена на порожньому описі");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Make|Language|Imagine/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Твори|Мова|Уяви/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="make"]'); await h.wait(120);
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
