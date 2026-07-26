// The gate has no network, so grab() seeds a deterministic pin (the shape readPins returns) and the shot
// shows a RESOLVED pin rather than an empty field — the screen this app exists for.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-pin]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "дістає пін і показує пряме посилання", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-pin]")) === 1, "пін не зʼявився");
      h.expect((await h.count("[data-copy]")) === 1, "немає кнопки копіювання прямого посилання");
      const href = await h.attr("[data-download]", "href");
      h.expect(/i\.pinimg\.com\//.test(href), `пряме посилання не на i.pinimg: ${href}`);
    },
  },
  {
    name: "непридатне посилання дає зрозумілу помилку, а не тишу", run: async (h) => {
      await ready(h);
      await h.type("[data-q]", "https://example.com/nope");
      await h.tap("#grab"); await h.wait(400);
      h.expect((await h.count("[data-err]")) === 1, "немає повідомлення про помилку");
    },
  },
  {
    name: "збереження: пін осідає в бібліотеці і знімається звідти", run: async (h) => {
      await ready(h);
      await h.tap("[data-save]"); await h.wait(400);
      h.expect((await h.attr("[data-save]", "aria-pressed")) === "true", "не зберігся");
      await h.click('[data-tab="saved"]'); await h.wait(500);
      h.expect((await h.count("[data-saved] [data-pin]")) === 1, "не зʼявився у збережених");
      await h.tap("[data-saved] [data-save]"); await h.wait(500);
      h.expect((await h.count("[data-saved] [data-pin]")) === 0, "не прибрався");
      await h.click('[data-tab="grab"]'); await h.wait(200);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Grab|Language|Saved/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Дістати|Мова|Збережені/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="grab"]'); await h.wait(120);
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
