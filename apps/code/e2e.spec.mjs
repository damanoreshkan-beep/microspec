// The gate/mock seeds a fixed code (seed 7) with three guesses already played + a half-filled current
// guess, so the board renders populated and the play loop is deterministic.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-row]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "дошка: зіграні рядки + палітра + перевірка", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-row]")) >= 3, "немає зіграних рядків");
      h.expect((await h.count("[data-peg]")) === 6, "немає палітри з 6 кольорів");
      h.expect((await h.count("[data-check]")) === 1, "немає кнопки перевірки");
    },
  },
  {
    name: "правила: «?» → екран, Back закриває (історія-backed)", run: async (h) => {
      await ready(h);
      await h.tap("[data-help]"); await h.wait(200);
      h.expect((await h.count("[data-rules]")) > 0, "екран правил не відкрився");
      await h.back(); await h.wait(250);
      h.expect((await h.count("[data-rules]")) === 0, "Back не закрив правила");
    },
  },
  {
    name: "хід: заповнити код → перевірка → новий рядок", run: async (h) => {
      await ready(h);
      const before = await h.count("[data-row]");
      for (let i = 0; i < 4; i++) { await h.tap('[data-peg="0"]'); await h.wait(60); }
      await h.tap("[data-check]"); await h.wait(300);
      h.expect((await h.count("[data-row]")) === before + 1, "рядок не додався після перевірки");
    },
  },
  {
    name: "кінець гри: оверлей історія-backed (Back закриває, не виходить)", run: async (h) => {
      await ready(h);
      for (let r = 0; r < 9; r++) {
        if ((await h.count("[data-newgame]")) > 0) break;
        for (let i = 0; i < 4; i++) { await h.tap('[data-peg="0"]'); await h.wait(40); }
        await h.tap("[data-check]"); await h.wait(200);
      }
      h.expect((await h.count("[data-newgame]")) > 0, "оверлей кінця гри не з'явився");
      await h.back(); await h.wait(250);
      h.expect((await h.count("[data-newgame]")) === 0, "Back не закрив оверлей");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Play|Language|Check|left/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Гра|Мова|Перевірити|Залишилось/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="play"]'); await h.wait(120);
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
