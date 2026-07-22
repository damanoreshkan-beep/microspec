// Wishlist — a local-first stateful app (IndexedDB). Headless Chromium HAS IndexedDB, so we drive real CRUD
// through the UI. Tests share one page + DB and build on each other: first list → wish → grant → detail →
// second list → switch → delete-list confirm → i18n → install.
const openAddList = async (h) => {
  const sel = (await h.count("#empty-add-list")) ? "#empty-add-list" : "#add-list";
  await h.click(sel); await h.wait(200);
};
const addList = async (h, name) => {
  await openAddList(h);
  await h.type("#l-name", name); await h.wait(120);
  await h.click("#l-save"); await h.wait(300);
};
const addWish = async (h, name) => {
  const sel = (await h.count("#empty-add-wish")) ? "#empty-add-wish" : "#add-wish";
  await h.click(sel); await h.wait(200);
  await h.type("#w-name", name); await h.wait(120);
  await h.click("#w-save"); await h.wait(300);
};

export default [
  {
    name: "порожній стан → створення першого списку", run: async (h) => {
      for (let i = 0; i < 10 && (await h.count("#empty-add-list")) === 0 && (await h.count("[data-list]")) === 0; i++) await h.wait(200);
      await addList(h, "День народження");
      h.expect((await h.count("[data-list]")) >= 1, "список не зʼявився у перемикачі");
      h.expect(/День народження/.test(await h.bodyText()), "немає назви списку");
    },
  },
  {
    name: "додавання бажання створює картку + оновлює лічильник", run: async (h) => {
      await addWish(h, "Велосипед");
      h.expect((await h.count("[data-wish]")) >= 1, "бажання не зʼявилось");
      h.expect(/Велосипед/.test(await h.bodyText()), "немає назви бажання");
    },
  },
  {
    name: "grant переносить у «Здійснені»", run: async (h) => {
      await h.click("[data-grant]"); await h.wait(250);
      h.expect((await h.attr("[data-grant]", "aria-pressed")) === "true", "grant не активувався");
      h.expect(/Здійснені/.test(await h.bodyText()), "секція «Здійснені» не зʼявилась");
    },
  },
  {
    name: "деталі бажання відкриваються, Back закриває", run: async (h) => {
      await h.click("[data-open]"); await h.wait(250);
      h.expect((await h.count("#d-back")) === 1, "деталі не відкрились");
      h.expect((await h.count("#d-del")) === 1, "немає кнопки видалення в деталях");
      await h.back(); await h.wait(250);
      h.expect((await h.count("#d-back")) === 0, "Back не закрив деталі");
    },
  },
  {
    name: "другий список + перемикання між списками", run: async (h) => {
      const before = await h.count("[data-list]");
      await addList(h, "Для дому");
      h.expect((await h.count("[data-list]")) === before + 1, "другий список не додався");
      // новий список активний і порожній → є заклик додати перше бажання
      h.expect((await h.count("#empty-add-wish")) === 1, "новий список не порожній/не активний");
      await h.click('[data-list]:first-child'); await h.wait(200);
      h.expect(/Велосипед/.test(await h.bodyText()), "перемикання на перший список не показало його бажання");
    },
  },
  {
    name: "редагування списку history-backed: Back закриває аркуш", run: async (h) => {
      await h.click("#edit-list"); await h.wait(200);
      h.expect((await h.count("#l-save")) === 1, "аркуш списку не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.count("#l-save")) === 0, "Back не закрив аркуш списку");
    },
  },
  {
    // Deleting a whole list drops its wishes → a danger-confirm, history-backed: #l-del opens the sheet but
    // deletes NOTHING until confirmed; Back cancels and the list survives.
    name: "видалення списку: конфірм, Back скасовує, підтвердження видаляє", run: async (h) => {
      const before = await h.count("[data-list]");
      await h.click("#edit-list"); await h.wait(200);
      await h.click("#l-del"); await h.wait(200);
      h.expect((await h.prop("#confirm", "open")) === true, "конфірм не відкрився");
      // Back cancels the confirm only — it stacks on top, so the list sheet stays open beneath it.
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#confirm", "open")) !== true, "Back не закрив конфірм");
      h.expect((await h.count("#l-save")) === 1, "Back мав скасувати лише конфірм, не аркуш списку");
      h.expect((await h.count("[data-list]")) === before, "список видалено попри скасування");
      // sheet is still open → delete again directly, then confirm
      await h.click("#l-del"); await h.wait(200);
      await h.click("#confirm-go"); await h.wait(350);
      h.expect((await h.count("[data-list]")) === before - 1, "підтверджене видалення списку не спрацювало");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Lists|Language|Dark theme/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Списки|Мова|Темна тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="lists"]'); await h.wait(120);
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
