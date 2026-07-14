// Headless has no compass → the gate aims at the highest visible body (deterministic), so the reticle is
// on-target and a body is identified. Astronomy is pure math, renders everywhere.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-sky]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "небо: в'юпорт + reticle + визначене світило", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-sky]")) === 1, "немає в'юпорта неба");
      h.expect((await h.count("[data-body]")) >= 1, "немає світил у в'юпорті");
      h.expect((await h.count("[data-near]")) === 1, "немає визначеного світила");
      h.expect(/Сонце|Місяць|Меркурій|Венера|Марс|Юпітер|Сатурн|Уран|Нептун|Плутон/.test(await h.bodyText()), "немає назви світила");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Sky|Point at the Sky|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Небо|Наведи|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="sky"]'); await h.wait(120);
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
