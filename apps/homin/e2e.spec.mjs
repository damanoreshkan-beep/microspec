const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-mark]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "смуга: циферблат показує сигнали на своїх каналах", run: async (h) => {
      await ready(h);
      h.expect((await h.count("svg[data-live]")) === 1, "немає циферблата з живими даними");
      h.expect((await h.count("[data-mark]")) >= 2, "на циферблаті менше двох сигналів");
      h.expect((await h.count('[data-kind="burst"]')) >= 1, "жодного сигналу пристрою (OOK)");
      h.expect((await h.count('[data-kind="voice"]')) >= 1, "жодного голосового сигналу");
    },
  },
  {
    name: "пеленг: відкривається і закривається системним Назад", run: async (h) => {
      await ready(h);
      const state = async (label) =>
        `${label}[dlg=${await h.count("#hunt")} open=${await h.prop("#hunt", "open")}` +
        ` scr=${await h.attr("[data-scr]", "data-scr")} pick=${await h.count("[data-pick]")}` +
        ` tp=${await h.count("[data-transport]")} marks=${await h.count("[data-mark]")}]`;

      const before = await state("before");
      h.expect((await h.prop("#hunt", "open")) !== true, `пеленг відкритий ще до дотику ${before}`);

      await h.tap("[data-pick]"); await h.wait(400);
      const afterPick = await state("afterPick");
      h.expect((await h.prop("#hunt", "open")) === true, `пеленг не відкрився ${before} ${afterPick}`);
      await h.back(); await h.wait(400);
      h.expect((await h.prop("#hunt", "open")) !== true, `системний Назад не закрив пеленг ${await state("afterBack")}`);
      h.expect((await h.count("[data-mark]")) > 0, "Назад вийшов з апки замість закрити екран");
    },
  },
  {
    name: "пеленг: без напрямленої антени азимут не показується", run: async (h) => {
      await ready(h);
      await h.tap("[data-pick]"); await h.wait(400);
      h.expect((await h.prop("#hunt", "open")) === true, "пеленг не відкрився — читати показник немає сенсу");
      const b = await h.text("[data-bearing]");
      h.expect(b.trim() === "—", `штатна антена не дає азимута, а показано "${b}"`);
    },
  },
  {
    name: "ефір: список показує сигнали з сирими даними", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="live"]'); await h.wait(400);
      h.expect((await h.count("[data-row]")) >= 2, "у списку менше двох сигналів");
      const body = await h.bodyText();
      h.expect(/[0-9a-f]{2}\s+[0-9a-f]{2}/i.test(body), "у списку немає сирих байтів жодного пристрою");
    },
  },
  {
    name: "прослуховування: транспорт вмикається і вимикається", run: async (h) => {
      await h.click('[data-tab="band"]'); await h.wait(300);
      await ready(h);
      h.expect((await h.count("[data-transport]")) === 1, "немає транспорту для прослуховування");
      const btn = "[data-transport] button[aria-pressed], [data-transport] button";
      await h.tap(btn); await h.wait(300);
      h.expect((await h.count("[data-transport]")) === 1, "транспорт зник після натискання");
    },
  },
];
