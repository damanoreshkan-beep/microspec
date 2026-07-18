// The gate has no camera, so the view seeds a decoded string (a link shortener) and runs the real
// urlsafe.js on it — the safe-preview panel renders populated and deterministically: host + verdict + flags.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-live]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "safe preview: host, verdict, flag, actions", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) === 1, "немає прев'ю");
      h.expect(/bit\.ly/.test(await h.text("[data-live]")), "хост не показано над URL");
      h.expect(/Обережно|Caution/i.test(await h.bodyText()), "немає вердикту 'обережно' для скорочувача");
      h.expect(/Скорочене|Shortened/i.test(await h.bodyText()), "немає прапорця про скорочене посилання");
      h.expect((await h.count("[data-open]")) === 1, "немає кнопки Відкрити");
      h.expect((await h.count("[data-copy]")) === 1, "немає кнопки Копіювати");
      h.expect((await h.count("[data-again]")) === 1, "немає кнопки Сканувати ще");
    },
  },
  {
    name: "нічого не відкривається саме — Open лише за наміром", run: async (h) => {
      await ready(h);
      // the whole philosophy: a decoded link is PREVIEWED, never auto-navigated. Open is an explicit control.
      h.expect((await h.count("[data-open]")) === 1, "кнопка Open має бути присутня, але не спрацьовувати сама");
      await h.click("[data-again]"); await h.wait(150);
      h.expect((await h.count("[data-open]")) === 0, "після 'сканувати ще' прев'ю не очистилось");
      h.expect(/—/.test(await h.text("[data-live]")), "порожній стан не показав плейсхолдер");
    },
  },
  {
    name: "дозволи: профіль → екран, Back закриває (історія-backed)", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(200);
      h.expect((await h.count("#perms-back")) > 0, "екран дозволів не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.count("#perms-back")) === 0, "Back не закрив дозволи");
      await h.click('[data-tab="scan"]'); await h.wait(120);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Scan|Language|Scanner/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Скан|Мова|сканер/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="scan"]'); await h.wait(120);
    },
  },
  {
    // The systemic desktop "open on phone": a QR of THIS page. The trigger is desktop-only (hidden lg:) but
    // stays in the DOM, so a JS click opens it even in the mobile gate. History-backed like every overlay.
    name: "desktop self-QR: модалка з QR сторінки, Back закриває", run: async (h) => {
      await h.click("#qr-open"); await h.wait(200);
      h.expect((await h.prop("#qr-invite", "open")) === true, "QR-модалка не відкрилась");
      let has = 0; for (let i = 0; i < 12; i++) { has = await h.count("[data-qr]"); if (has) break; await h.wait(200); }
      h.expect(has === 1, "QR самого себе не згенерувався");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#qr-invite", "open")) !== true, "Back не закрив QR-модалку");
      await h.click("#qr-open"); await h.wait(200);
      await h.click("[data-qr-stay]"); await h.wait(200);
      h.expect((await h.prop("#qr-invite", "open")) !== true, "«залишитись на десктопі» не закрила модалку");
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
