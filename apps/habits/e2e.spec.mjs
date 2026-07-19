// Habits — a local-first stateful app (IndexedDB). Headless Chromium HAS IndexedDB, so we drive real CRUD
// via the UI. Tests share one page + DB, so they build on each other: add → check-in → detail → delete.
const addHabit = async (h, name) => {
  const opener = (await h.count("#empty-add")) ? "#empty-add" : "#add-habit";
  await h.click(opener); await h.wait(200);
  await h.type("#h-name", name); await h.wait(120);
  await h.click("#h-save"); await h.wait(300);
};

export default [
  {
    name: "порожній стан → додавання звички створює картку", run: async (h) => {
      for (let i = 0; i < 10 && (await h.count("[data-habit]")) === 0 && (await h.count("#empty-add")) === 0; i++) await h.wait(200);
      await addHabit(h, "Читати");
      h.expect((await h.count("[data-habit]")) >= 1, "звичка не зʼявилась");
      h.expect(/Читати/.test(await h.bodyText()), "немає назви звички");
    },
  },
  {
    name: "чек-ін сьогодні піднімає серію", run: async (h) => {
      await h.click("[data-today]"); await h.wait(250);
      h.expect((await h.attr("[data-today]", "aria-pressed")) === "true", "кнопка сьогодні не активувалась");
      h.expect(/поспіль|Серія|день|дн\./.test(await h.bodyText()), "серія не оновилась");
    },
  },
  {
    name: "деталі: heatmap + статистика, Back закриває", run: async (h) => {
      await h.click("[data-open]"); await h.wait(250);
      h.expect((await h.count("#d-back")) === 1, "деталі не відкрились");
      h.expect(/Рекорд|Останні 13/.test(await h.bodyText()), "немає статистики/heatmap");
      await h.back(); await h.wait(250);
      h.expect((await h.count("#d-back")) === 0, "Back не закрив деталі");
    },
  },
  {
    name: "додавання другої звички з вибором іконки/кольору", run: async (h) => {
      const before = await h.count("[data-habit]");
      await h.click("#add-habit"); await h.wait(200);
      await h.type("#h-name", "Спорт"); await h.wait(100);
      await h.click('#h-icons button:nth-child(2)'); await h.wait(80);
      await h.click("#h-save"); await h.wait(300);
      h.expect((await h.count("[data-habit]")) === before + 1, "друга звичка не додалась");
    },
  },
  {
    // High-consequence delete (habit + its whole history) → a danger-confirm, and it's history-backed:
    // #d-del opens the sheet but deletes NOTHING until confirmed; Back cancels it and the habit survives.
    name: "видалення звички: конфірм, Back скасовує, підтвердження видаляє", run: async (h) => {
      const before = await h.count("[data-habit]");
      await h.click("[data-open]"); await h.wait(200);
      await h.click("#d-del"); await h.wait(200);
      h.expect((await h.prop("#confirm", "open")) === true, "конфірм не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#confirm", "open")) !== true, "Back не закрив конфірм");
      h.expect((await h.count("#d-back")) === 1, "деталі закрились — конфірм не мав їх чіпати");
      h.expect((await h.count("[data-habit]")) === before, "звичку видалено попри скасування");
      await h.click("#d-del"); await h.wait(200);
      await h.click("#confirm-go"); await h.wait(300);
      h.expect((await h.count("[data-habit]")) === before - 1, "підтверджене видалення не спрацювало");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Today|Language|Dark theme/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Сьогодні|Мова|Темна тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="today"]'); await h.wait(120);
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
