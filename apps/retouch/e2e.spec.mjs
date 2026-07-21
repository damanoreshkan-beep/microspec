// The gate has no camera and no network and must never spend credits, so the view seeds a local mesh-gradient
// "photo" as the source and, on edit, a differently-seeded one as the result — the whole loop (source →
// instruction → edit → result → keep/revert/save) is exercised without a single API call.
const settle = async (h, sel, n = 1) => { for (let i = 0; i < 20; i++) { if ((await h.count(sel)) >= n) break; await h.wait(200); } };

export default [
  {
    name: "editor: seeded source + instruction + edit", run: async (h) => {
      await settle(h, "[data-result]");
      h.expect((await h.count("[data-result]")) === 1, "немає зображення для редагування");
      h.expect((await h.count("#prompt")) === 1, "немає поля інструкції");
      h.expect((await h.count("[data-edit]")) === 1, "немає кнопки редагування");
    },
  },
  {
    name: "кнопка «Випадкова ідея» заповнює поле (гейт: без мережі)", run: async (h) => {
      await settle(h, "[data-dream]");
      h.expect((await h.count("[data-dream]")) === 1, "немає кнопки автоідеї");
      await h.type("#prompt", "");
      await h.wait(80);
      await h.click("[data-dream]"); await h.wait(150);
      h.expect((await h.prop("#prompt", "value")).trim().length > 0, "автоідея не заповнила поле");
    },
  },
  {
    name: "порожня інструкція не запускає редагування", run: async (h) => {
      await settle(h, "[data-edit]");
      await h.type("#prompt", "");
      await h.wait(120);
      h.expect((await h.count("[data-edit][disabled]")) === 1 || (await h.count("[data-edit]:disabled")) === 1, "кнопка не задизейблена на порожній інструкції");
    },
  },
  {
    name: "edit re-creates the image → done actions (no API in the gate)", run: async (h) => {
      await settle(h, "[data-edit]");
      const before = await h.attr("[data-result]", "src");
      await h.type("#prompt", "make it a snowy night, cinematic");
      await h.click("[data-edit]"); await h.wait(300);
      let after = before, ok = false;
      for (let i = 0; i < 14; i++) { after = await h.attr("[data-result]", "src"); if (after && after !== before) { ok = true; break; } await h.wait(200); }
      h.expect(ok, "нове зображення не з'явилось");
      h.expect((await h.count("[data-save]")) === 1, "немає кнопки збереження");
      h.expect((await h.count("[data-keep]")) === 1, "немає кнопки «далі»");
      h.expect((await h.count("[data-revert]")) === 1, "немає кнопки «оригінал»");
    },
  },
  {
    name: "«далі по цьому» повертає у стан редагування (ітеративно)", run: async (h) => {
      await settle(h, "[data-keep]");
      await h.click("[data-keep]"); await h.wait(200);
      h.expect((await h.count("#prompt")) === 1, "після «далі» немає поля інструкції");
      h.expect((await h.count("[data-edit]")) === 1, "після «далі» немає кнопки редагування");
      h.expect((await h.count("[data-save]")) === 0, "кнопка збереження мала зникнути");
    },
  },
  {
    name: "вибір джерела: завантаження · камера", run: async (h) => {
      await settle(h, "[data-edit]");
      await h.click("[data-new]"); await h.wait(200);
      h.expect((await h.count("[data-source]")) === 1, "немає екрана вибору джерела");
      h.expect((await h.count("[data-src-upload]")) === 1, "немає джерела «завантажити»");
      h.expect((await h.count("[data-src-camera]")) === 1, "немає джерела «камера»");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Edit|Language|Retouch/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Онови|Мова|Я/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="edit"]'); await h.wait(120);
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
