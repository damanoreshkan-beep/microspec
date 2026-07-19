// The gate seeds a fixed "today" (2027-07-23, Leo season) and default sign, so the reading is reproducible.
// The sign glyph is the hand-drawn /_rt/zodiac.js SVG — no emoji anywhere.
export default [
  {
    name: "reading renders: sign card, day segmented (today), prose, vibes, lucky", run: async (h) => {
      h.expect((await h.count("[data-sign]")) === 1, "немає картки знака");
      h.expect(/Leo|Лев/.test(await h.text("[data-sign]")), "стандартний знак ≠ поточний сонячний (Лев)");
      h.expect((await h.count("[data-day]")) === 3, "має бути 3 дні (вчора/сьогодні/завтра)");
      h.expect((await h.prop('[data-day="today"]', "ariaSelected")) === "true", "'сьогодні' не активне за замовчуванням");
      h.expect((await h.text("[data-reading]")).trim().length > 20, "порожній гороскоп");
      h.expect(/Love|Любов/.test(await h.bodyText()) && /Work|Робота/.test(await h.bodyText()) && /Health|Здоров/.test(await h.bodyText()), "немає шкал любов/робота/здоровʼя");
      h.expect(/Lucky|Щасливе/.test(await h.bodyText()), "немає щасливого числа");
    },
  },
  {
    name: "перемикання дня змінює гороскоп", run: async (h) => {
      const today = await h.text("[data-reading]");
      await h.click('[data-day="tomorrow"]'); await h.wait(150);
      h.expect((await h.prop('[data-day="tomorrow"]', "ariaSelected")) === "true", "'завтра' не стало активним");
      h.expect((await h.text("[data-reading]")) !== today, "гороскоп не змінився при зміні дня");
      await h.click('[data-day="today"]'); await h.wait(120);
    },
  },
  {
    name: "вибір знака: аркуш історія-backed (Back закриває) + вибір оновлює картку", run: async (h) => {
      await h.click("[data-sign]"); await h.wait(200);
      h.expect((await h.prop("#signsheet", "open")) === true, "аркуш вибору знака не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#signsheet", "open")) !== true, "Back не закрив аркуш вибору");
      await h.click("[data-sign]"); await h.wait(200);
      await h.click('[data-signpick="0"]'); await h.wait(200);
      h.expect((await h.prop("#signsheet", "open")) !== true, "вибір знака не закрив аркуш");
      h.expect(/Aries|Овен/.test(await h.text("[data-sign]")), "картка не оновилась на обраний знак");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Today|Yesterday|Mood/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Сьогодні|Вчора|Настрій/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="read"]'); await h.wait(120);
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
