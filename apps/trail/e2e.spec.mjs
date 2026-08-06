// There is no GPS in Chromium and the bridge mock emits ONE fix, so the app seeds a deterministic month
// under the gate. An empty grid photographs exactly like a broken one, and a test against it asserts
// nothing — every check below is against seeded days that a real recorder would have produced.
//
// Each test names its tab first: they share one page, and a test that inherits wherever the previous one
// stopped fails for reasons unrelated to what it checks.
export default [
  {
    name: "month: the seeded month is a grid of days, each one a mark", run: async (h) => {
      await h.tap('[data-tab="month"]'); await h.wait(500);
      h.expect((await h.count("[data-month-grid]")) === 1, "сітка місяця не змонтувалась");
      const cells = await h.count("[data-day]");
      h.expect(cells >= 12, `очікував посіяний місяць, знайшов ${cells} днів`);

      // The header states the month's total. A grid with no number is decoration, not a record.
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

      // The routing invariant: the drill-down is history-backed, so Back unwinds it instead of leaving.
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-poster]")) === 0, "Back не закрив деталь дня");
      h.expect((await h.count("[data-month-grid]")) === 1, "Back вийшов із застосунку замість закрити екран");
    },
  },
  {
    name: "today: the recorder shows a live day, not a waiting state", run: async (h) => {
      await h.tap('[data-tab="today"]'); await h.wait(500);
      // data-live cannot exist without a reading; the gate would otherwise measure an empty screen.
      h.expect((await h.count("[data-live]")) === 1, "немає елемента, який не існує без показань");
      const body = await h.text("[data-live]");
      h.expect(/\d/.test(body), `у зведенні дня немає чисел: ${body.slice(0, 120)}`);

      // The one control states which of the two states it is in, and the gate's bg.status mock says running.
      h.expect((await h.count("[data-rec]")) === 1, "немає кнопки запису");
      const rec = await h.attr("[data-rec]", "data-rec");
      h.expect(rec === "on" || rec === "off", `нерозпізнаний стан запису: ${rec}`);
    },
  },
];
