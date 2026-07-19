const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-reel]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "стрічка рендериться повноекранними слайдами", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-reel]")) >= 3, "немає слайдів стрічки");
      h.expect((await h.count("video")) === 1, "активний слайд не має одного відео-елемента");
    },
  },
  {
    name: "джерело → шит відкривається, Back закриває", run: async (h) => {
      await ready(h);
      await h.tap("#source"); await h.wait(300);
      h.expect((await h.count("#src-input")) === 1, "шит джерела не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#src-input")) === 0, "Back не закрив шит джерела");
    },
  },
  {
    name: "звук перемикається", run: async (h) => {
      await ready(h);
      const before = await h.prop("#mute", "ariaLabel");
      await h.tap("#mute"); await h.wait(200);
      h.expect((await h.prop("#mute", "ariaLabel")) !== before, "кнопка звуку не змінила стан");
    },
  },
];
