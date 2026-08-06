export default [
  {
    name: "month: the seeded month is a grid of days, each one a mark", run: async (h) => {
      await h.tap('[data-tab="month"]'); await h.wait(500);
      h.expect((await h.count("[data-month-grid]")) === 1, "сітка місяця не змонтувалась");
      const cells = await h.count("[data-day]");
      h.expect(cells >= 12, `очікував посіяний місяць, знайшов ${cells} днів`);

      const head = await h.text("main");
      h.expect(/\d/.test(head), "у заголовку місяця немає жодного числа");
      h.expect(/km/i.test(head), `немає одиниці відстані: ${head.slice(0, 120)}`);
    },
  },
  {
    name: "month: a day opens its poster and system Back closes it, never exits", run: async (h) => {
      await h.tap('[data-tab="month"]'); await h.wait(400);
      h.expect((await h.count("[data-poster]")) === 0, "деталь дня відкрита ще до дотику");

      await h.tap("[data-day]"); await h.wait(400);
      h.expect((await h.count("[data-poster]")) === 1, "дотик по дню не відкрив плакат");

      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-poster]")) === 0, "Back не закрив деталь дня");
      h.expect((await h.count("[data-month-grid]")) === 1, "Back вийшов із застосунку замість закрити екран");
    },
  },
  {
    name: "today: the recorder shows a live day, not a waiting state", run: async (h) => {
      await h.tap('[data-tab="today"]'); await h.wait(500);
      h.expect((await h.count("[data-live]")) === 1, "немає елемента, який не існує без показань");
      const body = await h.text("[data-live]");
      h.expect(/\d/.test(body), `у зведенні дня немає чисел: ${body.slice(0, 120)}`);

      h.expect((await h.count("[data-rec]")) === 1, "немає кнопки запису");
      const rec = await h.attr("[data-rec]", "data-rec");
      h.expect(rec === "on" || rec === "off", `нерозпізнаний стан запису: ${rec}`);
    },
  },
];
