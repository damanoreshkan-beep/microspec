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
      h.expect((await h.prop("#hunt", "open")) !== true, "пеленг відкритий ще до дотику");
      await h.tap("[data-pick]");
      await h.wait(400);
      h.expect((await h.prop("#hunt", "open")) === true, "пеленг не відкрився");
      await h.back();
      await h.wait(400);
      h.expect((await h.prop("#hunt", "open")) !== true, "системний Назад не закрив пеленг");
      h.expect((await h.count("[data-mark]")) > 0, "Назад вийшов з апки замість закрити екран");
    },
  },
  {
    name: "пеленг: без напрямленої антени азимут не показується", run: async (h) => {
      await ready(h);
      await h.tap("[data-pick]");
      await h.wait(400);
      h.expect((await h.prop("#hunt", "open")) === true, "пеленг не відкрився — читати показник немає сенсу");
      const b = await h.text("[data-bearing]");
      h.expect(b.trim() === "—", `штатна антена не дає азимута, а показано "${b}"`);
    },
  },
];
