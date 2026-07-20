// The pendulum swings on a rAF loop; the two pole words crossfade and the pair turns over every few
// breaths. Manual prev/next always changes the pair immediately. No emoji — the only imagery is the
// drawn SVG pendulum.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-stage]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "маятник: сцена, дві протилежності, кнопка", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-stage]")) === 1, "немає сцени маятника");
      h.expect((await h.count("[data-bob]")) === 1, "немає тягарця");
      h.expect((await h.count("[data-pole]")) === 2, "має бути дві протилежності");
      h.expect((await h.count("#play")) === 1, "немає кнопки старт/пауза");
      h.expect((await h.text("[data-pole-a]")).trim().length > 0, "порожня ліва протилежність");
      h.expect((await h.text("[data-pole-b]")).trim().length > 0, "порожня права протилежність");
    },
  },
  {
    name: "наступна пара змінює протилежності", run: async (h) => {
      await ready(h);
      const a0 = (await h.text("[data-pole-a]")).trim(), b0 = (await h.text("[data-pole-b]")).trim();
      await h.click("[data-next]"); await h.wait(150);
      h.expect((await h.text("[data-pole-a]")).trim() !== a0 || (await h.text("[data-pole-b]")).trim() !== b0, "пара не змінилась");
      await h.click("[data-prev]"); await h.wait(150);
      h.expect((await h.text("[data-pole-a]")).trim() === a0, "prev не повернув пару");
    },
  },
  {
    name: "пауза перемикає стан", run: async (h) => {
      await ready(h);
      const a0 = await h.attr("#play", "aria-label");
      await h.click("#play"); await h.wait(150);
      h.expect(a0 !== (await h.attr("#play", "aria-label")), "пауза не перемкнула стан");
      await h.click("#play"); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Swing|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Гойдання|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="swing"]'); await h.wait(120);
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
