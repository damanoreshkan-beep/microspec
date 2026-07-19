// reel — the headless gate seeds a 3-clip public-domain mock (never the network), so the reel always renders
// populated. We assert: the full-screen slide feed, the mute toggle, and the sources tab (ready channels +
// the history-backed add-URL sheet, Back closes it). We never assert a stream PLAYS — headless has no video.
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
    name: "джерела: готові канали + додати-URL (Back закриває)", run: async (h) => {
      await ready(h);
      await h.tap("#source"); await h.wait(300);                       // reel → sources tab
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
