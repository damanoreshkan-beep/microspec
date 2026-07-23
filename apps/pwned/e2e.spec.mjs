// The gate seeds "password" → a canned breached result (no live API), so the shot shows a populated verdict.
// Covered: the split hash renders (prefix visible), the verdict shows, show/hide toggle flips the input type,
// the check button yields a verdict, i18n, PWA install.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-pw]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "перевірка: хеш + розріз + вердикт", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-pw]")) === 1, "немає поля пароля");
      h.expect((await h.count("[data-hash]")) === 1, "немає показу хеша");
      h.expect(/5BAA6/i.test(await h.bodyText()), "хеш не показує 5-символьний префікс");
      h.expect((await h.count('[data-verdict][data-pwned="true"]')) === 1, "немає вердикту про компрометацію");
    },
  },
  {
    name: "показати / сховати пароль", run: async (h) => {
      await ready(h);
      h.expect((await h.attr("[data-pw]", "type")) === "password", "поле не приховане за замовчуванням");
      await h.tap("[data-reveal]"); await h.wait(150);
      h.expect((await h.attr("[data-pw]", "type")) === "text", "показ пароля не спрацював");
      await h.tap("[data-reveal]"); await h.wait(120);
      h.expect((await h.attr("[data-pw]", "type")) === "password", "сховати назад не спрацювало");
    },
  },
  {
    name: "кнопка перевірки дає вердикт", run: async (h) => {
      await ready(h);
      await h.tap("[data-check]"); await h.wait(400);
      h.expect((await h.count("[data-verdict]")) === 1, "вердикт не зʼявився після перевірки");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="check"]'); await h.wait(160);
      h.expect(/Compromised|Check for breaches/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="check"]'); await h.wait(120);
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
