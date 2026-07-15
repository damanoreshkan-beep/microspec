const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-cell]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "секвенсер: 5×16 = 80 клітин, пресети, транспорт", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-cell]")) === 160, "немає 160 клітин (10 доріжок × 16)");
      h.expect((await h.count("#play")) === 1, "немає кнопки play/stop");
      h.expect((await h.count("[data-preset]")) === 12, "немає 12 пресетів (10 + random + clear)");
    },
  },
  {
    name: "клік по клітині перемикає крок", run: async (h) => {
      await ready(h);
      h.expect((await h.attr('[data-cell="kick-1"]', "aria-pressed")) === "false", "kick-1 мав бути вимкнений");
      await h.click('[data-cell="kick-1"]'); await h.wait(80);
      h.expect((await h.attr('[data-cell="kick-1"]', "aria-pressed")) === "true", "крок не увімкнувся");
    },
  },
  {
    name: "clear очищає, пресет заповнює", run: async (h) => {
      await ready(h);
      await h.click('[data-preset="clear"]'); await h.wait(80);
      h.expect((await h.attr('[data-cell="kick-0"]', "aria-pressed")) === "false", "clear не очистив");
      await h.click('[data-preset="techno"]'); await h.wait(80);
      h.expect((await h.attr('[data-cell="kick-0"]', "aria-pressed")) === "true", "пресет не завантажився");
    },
  },
  {
    name: "play перемикає стан", run: async (h) => {
      await ready(h);
      const a0 = await h.attr("#play", "aria-label");
      await h.click("#play"); await h.wait(120);
      h.expect(a0 !== (await h.attr("#play", "aria-label")), "play не перемкнув стан");
      await h.click("#play"); await h.wait(120);
      h.expect(a0 === (await h.attr("#play", "aria-label")), "stop не повернув стан");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Beat|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Біт|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="beat"]'); await h.wait(120);
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
