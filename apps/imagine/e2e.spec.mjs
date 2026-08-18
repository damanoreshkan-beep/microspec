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
    name: "перемикач швидкість/якість перемикається", run: async (h) => {
      await ready(h);
      h.expect(await h.attr("[data-q=fast]", "aria-selected") === "true", "швидкість не активна за замовчуванням");
      await h.click("[data-q='2k']");
      await h.wait(150);
      h.expect(await h.attr("[data-q='2k']", "aria-selected") === "true", "якість не увімкнулась");
      h.expect(await h.attr("[data-q=fast]", "aria-selected") === "false", "швидкість не вимкнулась після вибору якості");
    },
  },
  {
    name: "кнопка «Випадковий опис» заповнює поле (гейт: без мережі)", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-dream]")) === 1, "немає кнопки автоопису");
      await h.type("#prompt", "");
      await h.wait(80);
      await h.click("[data-dream]"); await h.wait(150);
      h.expect((await h.prop("#prompt", "value")).trim().length > 0, "автоопис не заповнив поле");
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
  // ── the edit mode (was apps/retouch, merged in as a second tab) ──────────────────────────────────────
  // Its own e2e file went with the folder, so these carry the coverage over. Same discipline as the
  // generator's: the gate has no camera and no network, so edit.js seeds a local mesh-gradient source and
  // a differently-seeded result — the whole source → instruction → edit → keep/revert flow runs offline.
  {
    // Under the gate edit.js starts at phase "ready" with a seeded source already loaded, so the source
    // CHOOSER (data-source / data-src-*) is deliberately absent — asserting on it was checking a screen
    // this app never shows a gate. What must be true is the working surface: a source on stage, an
    // instruction field, and something to press.
    name: "редактор: готове джерело, інструкція, кнопка редагування", run: async (h) => {
      await h.click('[data-tab="edit"]'); await h.wait(400);
      h.expect((await h.count("[data-result]")) === 1, "немає зображення на сцені редактора");
      h.expect((await h.count("#prompt")) === 1, "немає поля інструкції у вкладці редагування");
      h.expect((await h.count("[data-edit]")) === 1, "немає кнопки редагування");
    },
  },
  {
    // data-save only appears once the edit is DONE, so waiting on data-result proves nothing here — it is
    // already on screen as the source. Wait for the image to actually change.
    name: "редагування змінює зображення і дає збереження (гейт: без мережі)", run: async (h) => {
      await h.click('[data-tab="edit"]'); await h.wait(400);
      const before = await h.attr("[data-result]", "src");
      await h.type("#prompt", "додай сніг");
      await h.click("[data-edit]");
      let after = before, changed = false;
      for (let i = 0; i < 15; i++) {
        after = await h.attr("[data-result]", "src");
        if (after && after !== before) { changed = true; break; }
        await h.wait(250);
      }
      h.expect(changed, "редагування не змінило зображення");
      h.expect((await h.count("[data-save]")) === 1, "немає збереження після завершеного редагування");
    },
  },
  // ── the read mode (image → text) ─────────────────────────────────────────────────────────────────────
  // Under the gate describe.js starts at "done": a seeded source on stage and a fixed description already
  // read, so the words, the tags and the two actions are the surface to assert on; "ask more" returns to the
  // question composer, and reading again (no network) lands back on words.
  {
    name: "читання: фото на сцені, текст, теги, копіювати / спитати ще", run: async (h) => {
      await h.click('[data-tab="read"]'); await h.wait(400);
      h.expect((await h.count("[data-result]")) === 1, "немає зображення на сцені читання");
      h.expect((await h.count("[data-text]")) === 1, "немає прочитаного тексту");
      h.expect((await h.count("[data-tags] .badge")) >= 3, "немає тегів під текстом");
      h.expect((await h.count("[data-copy]")) === 1, "немає кнопки копіювання");
      h.expect((await h.count("[data-ask]")) === 1, "немає кнопки «спитати ще»");
    },
  },
  {
    name: "спитати ще → питання → відповідь (гейт: без мережі)", run: async (h) => {
      await h.click('[data-tab="read"]'); await h.wait(400);
      await h.click("[data-ask]"); await h.wait(200);
      h.expect((await h.count("#question")) === 1, "немає поля питання після «спитати ще»");
      await h.type("#question", "яка пора доби?");
      await h.click("[data-read-go]");
      let ok = false;
      for (let i = 0; i < 15; i++) { if ((await h.count("[data-text]")) === 1) { ok = true; break; } await h.wait(200); }
      h.expect(ok, "відповідь не з'явилась");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="make"]'); await h.wait(150);
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
