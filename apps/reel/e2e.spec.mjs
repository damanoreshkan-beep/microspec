const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-reel]")) > 0) break; await h.wait(300); } };
const settles = async (h, n) => { for (let i = 0; i < 25; i++) { if ((await h.count("[data-reel]")) === n) return true; await h.wait(200); } return false; };

export default [
  {
    name: "стрічка рендериться; биті чорні постери й дублікати відфільтровано", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "фільтри не звели стрічку до 3 чистих слайдів (дубль/чорний постер лишились)");
      h.expect((await h.count("video")) === 1, "активний слайд не має одного відео-елемента");
      h.expect(!/Broken clip/.test(await h.bodyText()), "битий чорний постер не відфільтрувався");
      h.expect(!/\bdup\b/.test(await h.bodyText()), "дублікат не відфільтрувався");
    },
  },
  {
    name: "джерела: готові канали + додати-URL (Back закриває)", run: async (h) => {
      await ready(h);
      await h.tap("#source"); await h.wait(300);                       
      h.expect((await h.count("[data-src-row]")) >= 3, "немає готових каналів");
      await h.tap("#add-url"); await h.wait(300);
      h.expect((await h.count("#src-input")) === 1, "шит додавання URL не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#src-input")) === 0, "Back не закрив шит");
    },
  },
  {
    name: "перегляд у рамці відкривається і Back закриває", run: async (h) => {
      await ready(h);
      await h.tap("#source"); await h.wait(300);
      await h.tap("#add-url"); await h.wait(300);
      await h.type("#src-input", "example.com"); await h.wait(120);
      await h.tap("#src-browse"); await h.wait(400);
      h.expect((await h.count("[data-frame]")) === 1, "рамка перегляду не відкрилась");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-frame]")) === 0, "Back не закрив рамку");
    },
  },
];
