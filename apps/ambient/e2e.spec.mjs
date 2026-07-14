const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-layer]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "мікшер: 6 шарів + пауза + таймер рендеряться", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-layer]")) === 6, "немає 6 шарів звуку");
      h.expect((await h.count("#pause")) === 1, "немає кнопки пауза/плей");
      h.expect((await h.prop("#pause", "disabled")) === true, "пауза активна без звуків (нічого не грає)");
      h.expect((await h.count("[data-timer]")) === 3, "немає чипів таймера сну");
    },
  },
  {
    name: "тап по шару вмикає його + зʼявляється гучність", run: async (h) => {
      await ready(h);
      h.expect((await h.count('[data-layer="rain"] input[type="range"]')) === 0, "повзунок є до вмикання");
      await h.click('[data-layer="rain"] button'); await h.wait(200);
      h.expect((await h.attr('[data-layer="rain"] button', "aria-pressed")) === "true", "шар не увімкнувся");
      h.expect((await h.attr('[data-layer="rain"]', "class")).includes("border-primary"), "шар не підсвітився");
      h.expect((await h.count('[data-layer="rain"] input[type="range"]')) === 1, "немає повзунка гучності");
    },
  },
  {
    name: "пауза активна коли грає і перемикає стан", run: async (h) => {
      await ready(h);
      await h.click('[data-layer="ocean"] button'); await h.wait(200);
      h.expect((await h.prop("#pause", "disabled")) !== true, "пауза не активувалась при звуку");
      const a0 = await h.attr("#pause", "aria-label");
      await h.click("#pause"); await h.wait(150);
      h.expect(a0 !== (await h.attr("#pause", "aria-label")), "пауза не перемкнула стан");
      await h.click("#pause"); await h.wait(150);
    },
  },
  {
    name: "таймер сну обирається і знімається", run: async (h) => {
      await ready(h);
      await h.click('[data-timer="30"]'); await h.wait(150);
      h.expect((await h.attr('[data-timer="30"]', "class")).includes("border-primary"), "таймер не обрався");
      await h.click('[data-timer="30"]'); await h.wait(150);
      h.expect(!(await h.attr('[data-timer="30"]', "class")).includes("border-primary"), "таймер не знявся");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Mixer|Language|Sleep/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мікшер|Мова|сну/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="mix"]'); await h.wait(120);
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
