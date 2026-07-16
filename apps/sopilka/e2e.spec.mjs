// Сопілка — a blown pipe. The gate cannot HEAR it (no gate can), so these assert the things that are
// checkable: that the instrument is there, that its fingering is the real staircase, and that передування
// re-pitches. The timbre itself is grounded in published fipple-flute acoustics and judged by a human.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-pipe]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "сопілка: трубка + 6 отворів + передування", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-pipe]")) === 1, "немає трубки");
      h.expect((await h.count("[data-hole]")) === 6, "діатонічна сопілка-прима має рівно 6 отворів");
      h.expect((await h.count("[data-over]")) === 1, "немає передування");
    },
  },
  {
    name: "передування перемикає октаву", run: async (h) => {
      await ready(h);
      h.expect((await h.attr("[data-over]", "aria-pressed")) === "false", "передування вже увімкнене");
      await h.click("[data-over]"); await h.wait(150);
      h.expect((await h.attr("[data-over]", "aria-pressed")) === "true", "передування не увімкнулось");
      await h.click("[data-over]"); await h.wait(150);
      h.expect((await h.attr("[data-over]", "aria-pressed")) === "false", "передування не вимкнулось");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Sopilka|Language|Overblow/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Сопілка|Мова|Передування/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="play"]'); await h.wait(120);
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
