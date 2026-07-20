// The pendulum swings on a rAF loop; the pole word lives inside the bob and fades by swing position.
// Tapping the stage turns to the next duality (with a bloom). No pause, no transport bar. Under the gate
// there is no WebGL, so the DOM fallback pendulum renders with the same data-stage / data-bob / data-pole
// hooks. No emoji — the only imagery is the pendulum.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-stage]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "маятник: сцена, тягарець, дві протилежності", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-stage]")) === 1, "немає сцени маятника");
      h.expect((await h.count("[data-bob]")) === 1, "немає тягарця");
      h.expect((await h.count("[data-pole]")) === 2, "мають бути дві протилежності в DOM");
      // Only the pole the pendulum is drawn toward is shown at a time (the other fades to nothing).
      h.expect((await h.text("[data-pole-a]")).trim().length > 0, "видима протилежність порожня");
    },
  },
  {
    name: "тап по сцені змінює пару", run: async (h) => {
      await ready(h);
      const a0 = (await h.text("[data-pole-a]")).trim();
      await h.click("[data-stage]"); await h.wait(200);
      h.expect((await h.text("[data-pole-a]")).trim() !== a0, "тап не змінив пару");
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
